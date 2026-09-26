import { Router } from 'express';
import { prisma } from '../db';
import { getConfig, getContentieuxSeuils, getEmetteurRelance } from '../services/configService';
import {
  clientDelaiMoyenHistorique,
  clientEncours,
  clientJoursRetard,
  clientOldestEcheance,
  clientPalier,
  clientRetardInhabituel,
  eligibiliteContentieux,
  PALIERS,
  type ClientWithFactures,
  type FactureLike,
} from '../lib/paliers';
import { generateLetter } from '../lib/letters';
import { Entite, resolveEntiteScope } from '../lib/entites';
import { assertEntiteInScope, requireAccesRecouvrement, requireAuth, requireRole } from '../middleware/auth';
import { fmtDate, fmtFCFA } from '../lib/dates';

export const clientsRouter = Router();
import { tenantScope } from '../middleware/tenant';
import { requireAbonnementActif } from '../middleware/abonnement';

clientsRouter.use(requireAuth, requireAbonnementActif, requireAccesRecouvrement, tenantScope);

function entiteWhere(entiteFilter: Entite | 'ALL') {
  if (entiteFilter === 'ALL') return {};
  return { OR: [{ entite: entiteFilter as any }, { entite: 'COMMUN' as any }] };
}

clientsRouter.get('/kpis', async (req, res, next) => {
  try {
    const entiteFilter = resolveEntiteScope(req.user!, req.query.entite);
    const config = await getConfig();
    const clients = await prisma.client.findMany({ where: entiteWhere(entiteFilter), include: { factures: true } });

    const totalEncours = clients.reduce((s, c) => s + clientEncours(c), 0);
    const enRetard = clients.filter((c) => clientPalier(c, config) >= 1).length;
    const contentieux = clients.filter((c) => clientPalier(c, config) >= 7).reduce((s, c) => s + clientEncours(c), 0);
    const lettresAEnvoyer = clients.filter((c) => clientPalier(c, config) >= 5).length;
    const retardsInhabituels = clients.filter((c) => clientRetardInhabituel(c)).length;

    const ladder: Record<number, number> = {};
    PALIERS.forEach((p) => (ladder[p.id] = 0));
    let dansLesClous = 0;
    let arretService = 0;
    let litige = 0;
    let totalActifs = 0;
    clients.forEach((c) => {
      if (clientEncours(c) > 0) {
        totalActifs++;
        const p = clientPalier(c, config);
        ladder[p]++;
        if (p <= 4) dansLesClous++; // À jour, Avis d'échéance, Relance 1/2/3
        else if (p === 5) arretService++; // Arrêt de service
        else litige++; // Pénalités, Commandement, Contentieux (6-8)
      }
    });
    const repartition = { total: totalActifs, dansLesClous, arretService, litige };

    res.json({ totalEncours, enRetard, contentieux, lettresAEnvoyer, retardsInhabituels, ladder, repartition, config });
  } catch (err) {
    next(err);
  }
});

// Console Recouvrement : KPIs + liste des clients en UNE seule requête.
// Les deux écrans partageaient le même `findMany` (tous les clients + factures)
// exécuté deux fois (un appel `/kpis`, un appel `/`). On fusionne : une passe
// en base, les deux résultats calculés depuis le même tableau en mémoire. Le
// tri et le filtre par palier sont laissés au client (liste déjà chargée), donc
// re-trier n'impose plus d'aller-retour réseau ni de recharger les KPIs.
clientsRouter.get('/console', async (req, res, next) => {
  try {
    const entiteFilter = resolveEntiteScope(req.user!, req.query.entite);
    const config = await getConfig();
    const seuils = await getContentieuxSeuils();
    const where = entiteWhere(entiteFilter);

    // MISE À L'ÉCHELLE (portefeuilles à ~100k+ factures) : on n'ouvre JAMAIS
    // toutes les factures en mémoire. On agrège côté base —
    //  • rollup des IMPAYÉS par client (somme d'encours + échéance la plus
    //    ancienne) via groupBy : quelques milliers de lignes, pas des centaines
    //    de milliers ;
    //  • historique PAYÉ (léger quand le portefeuille est surtout impayé), utile
    //    au seul signal « retard inhabituel » qui a besoin des dates de paiement.
    // groupBy/findMany passent par l'extension tenant → RLS respectée. On
    // n'utilise pas $queryRaw ici (il contournerait la transaction tenant → fuite).
    const [impayeRoll, payes, clients] = await Promise.all([
      prisma.facture.groupBy({
        by: ['clientId'],
        where: { statut: 'impayee', client: where },
        _sum: { montant: true },
        _min: { dateEcheance: true },
        _count: { _all: true },
      }),
      prisma.facture.findMany({
        where: { statut: 'payee', datePaiement: { not: null }, client: where },
        select: { clientId: true, dateEcheance: true, datePaiement: true },
      }),
      prisma.client.findMany({
        where,
        select: {
          id: true, nom: true, entite: true, contact: true, email: true, tel: true, note: true,
          prochaineRelance: true, frequenceFacturation: true, resilie: true, contentieuxExclu: true,
          contacts: { orderBy: { createdAt: 'asc' }, select: { id: true, nom: true, fonction: true, email: true, tel: true } },
          actions: { orderBy: { date: 'desc' }, take: 1, select: { label: true, date: true, palier: true } },
        },
      }),
    ]);

    const impayeParClient = new Map(
      impayeRoll.map((r) => [r.clientId, { encours: r._sum.montant ?? 0, oldest: r._min.dateEcheance, nb: r._count._all }]),
    );
    const payesParClient = new Map<string, { dateEcheance: Date; datePaiement: Date }[]>();
    for (const p of payes) {
      if (!p.datePaiement) continue;
      const item = { dateEcheance: p.dateEcheance, datePaiement: p.datePaiement };
      const arr = payesParClient.get(p.clientId);
      if (arr) arr.push(item);
      else payesParClient.set(p.clientId, [item]);
    }

    // ClientWithFactures MINIMAL par client → donne EXACTEMENT les mêmes résultats
    // que les fonctions existantes : une facture impayée synthétique (montant =
    // encours total, échéance = la plus ancienne) couvre encours/retard/palier ;
    // les factures payées réelles (dates) alimentent le délai moyen historique.
    function toCwf(id: string, freq: ClientWithFactures['frequenceFacturation']): ClientWithFactures {
      const imp = impayeParClient.get(id);
      const factures: FactureLike[] = [];
      if (imp && imp.oldest) factures.push({ montant: imp.encours, dateEcheance: imp.oldest, statut: 'impayee' });
      for (const pf of payesParClient.get(id) ?? []) {
        factures.push({ montant: 0, dateEcheance: pf.dateEcheance, datePaiement: pf.datePaiement, statut: 'payee' });
      }
      return { frequenceFacturation: freq, factures };
    }

    const enriched = clients.map((c) => {
      const cwf = toCwf(c.id, c.frequenceFacturation);
      return { c, cwf, encours: clientEncours(cwf), palier: clientPalier(cwf, config) };
    });

    // ── KPIs ──
    let totalEncours = 0;
    let enRetard = 0;
    let contentieux = 0;
    let lettresAEnvoyer = 0;
    let retardsInhabituels = 0;
    const ladder: Record<number, number> = {};
    PALIERS.forEach((p) => (ladder[p.id] = 0));
    let dansLesClous = 0;
    let arretService = 0;
    let litige = 0;
    let totalActifs = 0;
    for (const { cwf, encours, palier } of enriched) {
      totalEncours += encours;
      if (palier >= 1) enRetard++;
      if (palier >= 7) contentieux += encours;
      if (palier >= 5) lettresAEnvoyer++;
      if (clientRetardInhabituel(cwf)) retardsInhabituels++;
      if (encours > 0) {
        totalActifs++;
        ladder[palier]++;
        if (palier <= 4) dansLesClous++;
        else if (palier === 5) arretService++;
        else litige++;
      }
    }
    const kpis = {
      totalEncours,
      enRetard,
      contentieux,
      lettresAEnvoyer,
      retardsInhabituels,
      ladder,
      repartition: { total: totalActifs, dansLesClous, arretService, litige },
      config,
    };

    // ── Liste (clients avec encours, tri côté client) ──
    const list = enriched
      .filter((e) => e.encours > 0)
      .map(({ c, cwf, encours, palier }) => {
        const oldest = clientOldestEcheance(cwf);
        const derniere = c.actions[0];
        const joursRetard = clientJoursRetard(cwf);
        // Éligibilité contentieux, version CONSERVATRICE compatible avec
        // l'agrégat (on ne charge pas les factures détaillées ici) : on couvre
        // les critères « ≥ 3 impayées » et « client résilié » + les garde-fous
        // (âge/plancher). Le critère « ≥ 2 échéances CONSÉCUTIVES » exige
        // l'ordre des factures : il est vérifié précisément sur la fiche client
        // et au moment de la bascule. Ce drapeau ne fait donc JAMAIS de
        // faux positif — au pire il manque le cas « 2 consécutives seules ».
        const nbImpayees = impayeParClient.get(c.id)?.nb ?? 0;
        const contentieuxEligible =
          !c.contentieuxExclu &&
          (nbImpayees >= 3 || !!c.resilie) &&
          joursRetard >= seuils.ageMinJours &&
          encours >= seuils.montantPlancher;
        return {
          id: c.id,
          nom: c.nom,
          entite: c.entite,
          contact: c.contact,
          email: c.email,
          tel: c.tel,
          note: c.note,
          prochaineRelance: c.prochaineRelance,
          frequenceFacturation: c.frequenceFacturation,
          resilie: c.resilie,
          contentieuxExclu: c.contentieuxExclu,
          contacts: c.contacts.map((ct) => ({ id: ct.id, nom: ct.nom, fonction: ct.fonction, email: ct.email, tel: ct.tel })),
          encours,
          joursRetard,
          palier,
          retardInhabituel: clientRetardInhabituel(cwf),
          contentieuxEligible,
          echeanceLaPlusAncienne: oldest?.dateEcheance ?? null,
          derniereAction: derniere ? { label: derniere.label, date: derniere.date, palier: derniere.palier } : null,
        };
      });

    res.json({ kpis, list });
  } catch (err) {
    next(err);
  }
});

// Récap de la journée (« Le Fantôme du jour ») : compteurs de ce qui s'est
// passé AUJOURD'HUI pour l'organisation. Léger (des count + une somme du jour).
// Dakar = UTC+0, donc le jour UTC est bien le jour local — pas de décalage.
// Pas de gate `reporting` : ce petit récap est visible par tous les comptes.
clientsRouter.get('/journee', async (req, res, next) => {
  try {
    const entiteFilter = resolveEntiteScope(req.user!, req.query.entite);
    const where = entiteWhere(entiteFilter);
    const now = new Date();
    const debutJour = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 0, 0, 0));

    // Bilan de l'année en cours (« Cette année, facturé X / recouvré Y = Z% »).
    // Sommes calculées EN BASE (aggregate) — jamais de chargement de lignes,
    // donc valable même sur un portefeuille à 100k+ factures.
    // Équité vis-à-vis des délais de paiement : le taux se calcule uniquement
    // sur les factures DÉJÀ ÉCHUES (dateEcheance ≤ aujourd'hui). Comme l'échéance
    // intègre déjà le délai contractuel (émission + 30/60 j…), une facture émise
    // récemment, dont l'échéance n'est pas encore arrivée, n'est PAS comptée
    // comme « non recouvrée » — elle n'a tout simplement pas encore eu à être
    // payée. Elle apparaît à part, en « encore à échoir ».
    const debutAnnee = new Date(Date.UTC(now.getUTCFullYear(), 0, 1, 0, 0, 0));
    const debutAnneeProchaine = new Date(Date.UTC(now.getUTCFullYear() + 1, 0, 1, 0, 0, 0));

    const [relances, facturesPayees, factureAnneeAgg, factureEchuAgg, recouvreEchuAgg] = await Promise.all([
      prisma.actionRecouvrement.count({ where: { palier: { gte: 1 }, date: { gte: debutJour }, client: where } }),
      prisma.facture.findMany({
        where: { statut: 'payee', datePaiement: { gte: debutJour, lte: now }, client: where },
        select: { montant: true, clientId: true, numero: true, datePaiement: true, client: { select: { nom: true } } },
      }),
      // Tout ce qui a été facturé cette année (échéance dans l'année civile).
      prisma.facture.aggregate({
        _sum: { montant: true },
        where: { dateEcheance: { gte: debutAnnee, lt: debutAnneeProchaine }, client: where },
      }),
      // … dont la part déjà échue (base de calcul du taux).
      prisma.facture.aggregate({
        _sum: { montant: true },
        where: { dateEcheance: { gte: debutAnnee, lte: now }, client: where },
      }),
      // … et, parmi les échues, ce qui est effectivement recouvré (payé).
      prisma.facture.aggregate({
        _sum: { montant: true },
        where: { dateEcheance: { gte: debutAnnee, lte: now }, statut: 'payee', client: where },
      }),
    ]);

    const factureAnnee = Math.round(factureAnneeAgg._sum.montant ?? 0);
    const factureEchu = Math.round(factureEchuAgg._sum.montant ?? 0);
    const recouvreEchu = Math.round(recouvreEchuAgg._sum.montant ?? 0);
    const aEchoir = Math.max(0, factureAnnee - factureEchu);
    const tauxRecouvrement = factureEchu > 0 ? Math.round((recouvreEchu / factureEchu) * 100) : null;
    const annee = {
      annee: now.getUTCFullYear(),
      factureEchu, // facturé cette année, déjà arrivé à échéance
      recouvre: recouvreEchu, // recouvré parmi ces factures échues
      tauxPct: tauxRecouvrement, // recouvreEchu / factureEchu, en %
      aEchoir, // facturé cette année mais pas encore à échéance (exclu du taux)
    };

    const encaisse = Math.round(facturesPayees.reduce((s, f) => s + f.montant, 0));
    const facturesReglees = facturesPayees.length;

    // Détail des paiements du jour (le plus récent d'abord) — pour que l'agent
    // puisse « sortir » la liste depuis le fantôme et repérer d'un coup d'œil
    // d'où vient le total (ex. distinguer les vrais encaissements des tests).
    // Dakar = UTC+0 : l'heure ISO (HH:MM) est bien l'heure locale.
    const paiements = facturesPayees
      .slice()
      .sort((a, b) => (b.datePaiement?.getTime() ?? 0) - (a.datePaiement?.getTime() ?? 0))
      .map((f) => ({
        client: f.client?.nom ?? '—',
        numero: f.numero,
        montant: Math.round(f.montant),
        heure: f.datePaiement ? f.datePaiement.toISOString().slice(11, 16) : null,
      }));

    // Clients repassés « à jour » : parmi ceux qui ont réglé une facture
    // aujourd'hui, ceux dont l'encours est désormais nul (solde total). Ensemble
    // restreint (uniquement les payeurs du jour), donc peu coûteux.
    const clientIdsPayes = [...new Set(facturesPayees.map((f) => f.clientId))];
    let clientsAJour = 0;
    if (clientIdsPayes.length) {
      const clientsPayeurs = await prisma.client.findMany({ where: { id: { in: clientIdsPayes } }, include: { factures: true } });
      clientsAJour = clientsPayeurs.filter((c) => clientEncours(c) === 0).length;
    }

    // ── Célébrations : mois « bouclés » (100 % recouvré) ou tout proches (≥98 %)
    // Même équité que le bilan annuel : on ne juge un mois que lorsqu'il est
    // ENTIÈREMENT ÉCHU (plus aucune facture à échoir dedans), et le taux porte
    // sur le montant. Passe légère : on n'examine que le mois précédent et le
    // mois courant (le cas fréquent = solder les impayés du mois écoulé). La
    // portée suit la vue de l'utilisateur (une entité s'il est scopé, sinon
    // toute la société) — le front fête au bon niveau sans plomberie en plus.
    const moisLabels = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
    const portee = entiteFilter === 'ALL' ? 'GLOBAL' : String(entiteFilter);
    const moisCourant = { y: now.getUTCFullYear(), m: now.getUTCMonth() };
    const moisPrec = moisCourant.m === 0 ? { y: moisCourant.y - 1, m: 11 } : { y: moisCourant.y, m: moisCourant.m - 1 };
    type Celebration = { cle: string; mois: string; annee: number; taux: number; recouvre: number; parfait: boolean; portee: string };
    const celebrations: Celebration[] = [];
    for (const { y, m } of [moisPrec, moisCourant]) {
      const start = new Date(Date.UTC(y, m, 1));
      const end = new Date(Date.UTC(y, m + 1, 1));
      // Le mois n'est « jugeable » que s'il est entièrement dû : aucune facture
      // de ce mois dont l'échéance est encore à venir.
      if (end > now) {
        const futures = await prisma.facture.count({ where: { dateEcheance: { gte: now, lt: end }, client: where } });
        if (futures > 0) continue;
      }
      const [totAgg, paidAgg] = await Promise.all([
        prisma.facture.aggregate({ _sum: { montant: true }, where: { dateEcheance: { gte: start, lt: end }, client: where } }),
        prisma.facture.aggregate({ _sum: { montant: true }, where: { dateEcheance: { gte: start, lt: end }, statut: 'payee', client: where } }),
      ]);
      const tot = totAgg._sum.montant ?? 0;
      if (tot <= 0) continue; // pas de facturation ce mois → rien à fêter
      const paid = paidAgg._sum.montant ?? 0;
      const taux = (paid / tot) * 100;
      if (taux < 98) continue;
      const parfait = tot - paid < 1; // moins d'1 FCFA restant = bouclé
      celebrations.push({
        cle: `${portee}:${y}-${String(m + 1).padStart(2, '0')}:${parfait ? 'parfait' : 'proche'}`,
        mois: moisLabels[m],
        annee: y,
        taux: Math.round(taux * 10) / 10,
        recouvre: Math.round(paid),
        parfait,
        portee,
      });
    }
    celebrations.reverse(); // le plus récent d'abord (mois courant avant mois précédent)

    res.json({ relances, encaisse, facturesReglees, clientsAJour, paiements, annee, celebrations, date: now.toISOString().slice(0, 10) });
  } catch (err) {
    next(err);
  }
});

clientsRouter.get('/', async (req, res, next) => {
  try {
    const entiteFilter = resolveEntiteScope(req.user!, req.query.entite);
    const palierFilter = req.query.palier !== undefined ? parseInt(req.query.palier as string, 10) : null;
    // `all=true` : renvoie aussi les clients sans encours (soldés, ou
    // rattachés à la plateforme uniquement pour un suivi hors recouvrement,
    // ex: maintenance imprimante côté planning coursiers) -- le tableau
    // Recouvrement ne veut jamais de ce bruit, mais un sélecteur de client
    // pour une tâche planning n'a aucune raison d'exclure un client soldé.
    const includeSansEncours = req.query.all === 'true';
    const sortKey = (req.query.sort as string) || 'joursRetard';
    const sortDir = req.query.dir === 'asc' ? 1 : -1;

    const config = await getConfig();
    const clients = await prisma.client.findMany({
      where: entiteWhere(entiteFilter),
      include: { factures: true, actions: { orderBy: { date: 'desc' }, take: 1 }, contacts: { orderBy: { createdAt: 'asc' } } },
    });

    let list = clients.map((c) => {
      const encours = clientEncours(c);
      const joursRetard = clientJoursRetard(c);
      const palier = clientPalier(c, config);
      const oldest = clientOldestEcheance(c);
      const derniere = c.actions[0];
      return {
        id: c.id,
        nom: c.nom,
        entite: c.entite,
        contact: c.contact,
        email: c.email,
        tel: c.tel,
        note: c.note,
        prochaineRelance: c.prochaineRelance,
        frequenceFacturation: c.frequenceFacturation,
        contacts: c.contacts.map((ct) => ({ id: ct.id, nom: ct.nom, fonction: ct.fonction, email: ct.email, tel: ct.tel })),
        encours,
        joursRetard,
        palier,
        retardInhabituel: clientRetardInhabituel(c),
        echeanceLaPlusAncienne: oldest?.dateEcheance ?? null,
        derniereAction: derniere ? { label: derniere.label, date: derniere.date, palier: derniere.palier } : null,
      };
    });

    list = list.filter((c) => c.encours > 0 || palierFilter === 0 || includeSansEncours);
    if (palierFilter !== null && !Number.isNaN(palierFilter)) {
      list = list.filter((c) => c.palier === palierFilter);
    }
    list.sort((a, b) => {
      let va: number | string, vb: number | string;
      if (sortKey === 'encours') {
        va = a.encours;
        vb = b.encours;
      } else if (sortKey === 'nom') {
        va = a.nom;
        vb = b.nom;
      } else {
        va = a.joursRetard;
        vb = b.joursRetard;
      }
      if (va < vb) return -1 * sortDir;
      if (va > vb) return 1 * sortDir;
      return 0;
    });

    res.json(list);
  } catch (err) {
    next(err);
  }
});

clientsRouter.get('/:id', async (req, res, next) => {
  try {
    const client = await prisma.client.findUnique({
      where: { id: req.params.id },
      include: {
        factures: true,
        contrats: { include: { envois: { orderBy: { date: 'desc' } } } },
        actions: { orderBy: { date: 'desc' } },
        contacts: { orderBy: { createdAt: 'asc' } },
        echeanciers: { orderBy: { createdAt: 'desc' }, include: { tranches: { orderBy: { ordre: 'asc' } } } },
      },
    });
    if (!client) return res.status(404).json({ error: 'Client introuvable' });
    if (!assertEntiteInScope(req, res, client.entite as Entite)) return;

    const config = await getConfig();
    const seuils = await getContentieuxSeuils();
    const emetteur = await getEmetteurRelance();
    res.json({
      ...client,
      encours: clientEncours(client),
      joursRetard: clientJoursRetard(client),
      palier: clientPalier(client, config),
      retardInhabituel: clientRetardInhabituel(client),
      delaiMoyenHistorique: clientDelaiMoyenHistorique(client),
      contentieux: eligibiliteContentieux(client, config, seuils.ageMinJours, seuils.montantPlancher),
      emetteur, // pour signer les messages manuels (mot bienveillant) + lien de paiement
    });
  } catch (err) {
    next(err);
  }
});

// Drapeaux contentieux d'un client : « résilié » (facturation arrêtée) et
// « exclu du contentieux » (décision agent). Alimentent la règle d'éligibilité.
clientsRouter.patch('/:id/contentieux-flags', requireRole('admin', 'manager_entite', 'comptable'), async (req, res, next) => {
  try {
    const existing = await prisma.client.findUnique({ where: { id: req.params.id } });
    if (!existing) return res.status(404).json({ error: 'Client introuvable' });
    if (!assertEntiteInScope(req, res, existing.entite as Entite)) return;
    const b = (req.body ?? {}) as Record<string, unknown>;
    const data: { resilie?: boolean; contentieuxExclu?: boolean } = {};
    if (typeof b.resilie === 'boolean') data.resilie = b.resilie;
    if (typeof b.contentieuxExclu === 'boolean') data.contentieuxExclu = b.contentieuxExclu;
    if (!Object.keys(data).length) return res.status(400).json({ error: 'Aucun drapeau fourni' });
    const maj = await prisma.client.update({ where: { id: req.params.id }, data, select: { id: true, resilie: true, contentieuxExclu: true } });
    res.json(maj);
  } catch (err) {
    next(err);
  }
});

// Signal croisé opérations -> recouvrement (cahier OLU360 — Suivi des
// opérations, §8) : "nombre de problèmes ouverts, dont bloquants, et climat
// du compte", rien de plus -- jamais les scores, l'historique ou le détail
// des problèmes eux-mêmes, pour garder le couplage entre les deux modules
// aussi mince que celui déjà en place dans l'autre sens (voir
// routes/operations.ts:enLitigeSignal). hasOperations=false si ce client n'a
// pas de fiche Opérations -- cas normal, pas une erreur.
clientsRouter.get('/:id/signal-operations', async (req, res, next) => {
  try {
    const client = await prisma.client.findUnique({ where: { id: req.params.id } });
    if (!client) return res.status(404).json({ error: 'Client introuvable' });
    if (!assertEntiteInScope(req, res, client.entite as Entite)) return;

    const co = await prisma.clientOperations.findUnique({
      where: { clientId: client.id },
      include: { problemes: true },
    });
    if (!co) return res.json({ hasOperations: false });

    const ouverts = co.problemes.filter((p) => !p.resoluLe);
    res.json({
      hasOperations: true,
      problemesOuverts: ouverts.length,
      problemesBloquants: ouverts.filter((p) => p.gravite === 'bloquant').length,
      climat: co.climat,
    });
  } catch (err) {
    next(err);
  }
});

clientsRouter.patch('/:id/contact', requireRole('admin', 'manager_entite'), async (req, res, next) => {
  try {
    const existing = await prisma.client.findUnique({ where: { id: req.params.id } });
    if (!existing) return res.status(404).json({ error: 'Client introuvable' });
    if (!assertEntiteInScope(req, res, existing.entite as Entite)) return;

    const { contact, email, tel } = req.body ?? {};
    const client = await prisma.client.update({
      where: { id: req.params.id },
      data: {
        contact: typeof contact === 'string' ? contact.trim() : undefined,
        email: typeof email === 'string' ? email.trim() : undefined,
        tel: typeof tel === 'string' ? tel.trim() : undefined,
      },
    });
    res.json(client);
  } catch (err) {
    next(err);
  }
});

clientsRouter.patch('/:id/note', requireRole('admin', 'manager_entite', 'comptable'), async (req, res, next) => {
  try {
    const existing = await prisma.client.findUnique({ where: { id: req.params.id } });
    if (!existing) return res.status(404).json({ error: 'Client introuvable' });
    if (!assertEntiteInScope(req, res, existing.entite as Entite)) return;

    const note = typeof req.body?.note === 'string' ? req.body.note.trim() : '';
    const client = await prisma.client.update({
      where: { id: req.params.id },
      data: { note: note || null },
    });
    res.json(client);
  } catch (err) {
    next(err);
  }
});

clientsRouter.patch('/:id/prochaine-relance', requireRole('admin', 'manager_entite', 'comptable'), async (req, res, next) => {
  try {
    const existing = await prisma.client.findUnique({ where: { id: req.params.id } });
    if (!existing) return res.status(404).json({ error: 'Client introuvable' });
    if (!assertEntiteInScope(req, res, existing.entite as Entite)) return;

    const raw = req.body?.date;
    let prochaineRelance: Date | null = null;
    if (typeof raw === 'string' && raw.trim()) {
      const parsed = new Date(raw);
      if (Number.isNaN(parsed.getTime())) return res.status(400).json({ error: 'Date invalide' });
      prochaineRelance = parsed;
    }
    const client = await prisma.client.update({
      where: { id: req.params.id },
      data: { prochaineRelance },
    });
    res.json(client);
  } catch (err) {
    next(err);
  }
});

clientsRouter.post('/:id/contacts', requireRole('admin', 'manager_entite'), async (req, res, next) => {
  try {
    const existing = await prisma.client.findUnique({ where: { id: req.params.id } });
    if (!existing) return res.status(404).json({ error: 'Client introuvable' });
    if (!assertEntiteInScope(req, res, existing.entite as Entite)) return;

    const { nom, fonction, email, tel } = req.body ?? {};
    if (!nom || typeof nom !== 'string' || !nom.trim()) {
      return res.status(400).json({ error: 'Le nom du contact est requis' });
    }
    const contact = await prisma.contact.create({
      data: {
        clientId: req.params.id,
        nom: nom.trim(),
        fonction: typeof fonction === 'string' && fonction.trim() ? fonction.trim() : undefined,
        email: typeof email === 'string' && email.trim() ? email.trim() : undefined,
        tel: typeof tel === 'string' && tel.trim() ? tel.trim() : undefined,
      },
    });
    res.status(201).json(contact);
  } catch (err) {
    next(err);
  }
});

const FREQUENCES_VALIDES = ['mensuelle', 'trimestrielle', 'annuelle', 'ponctuelle'];

clientsRouter.patch('/:id/frequence-facturation', requireRole('admin', 'manager_entite'), async (req, res, next) => {
  try {
    const existing = await prisma.client.findUnique({ where: { id: req.params.id } });
    if (!existing) return res.status(404).json({ error: 'Client introuvable' });
    if (!assertEntiteInScope(req, res, existing.entite as Entite)) return;

    const frequence = req.body?.frequenceFacturation;
    if (typeof frequence !== 'string' || !FREQUENCES_VALIDES.includes(frequence)) {
      return res.status(400).json({ error: `Fréquence invalide — attendu : ${FREQUENCES_VALIDES.join(', ')}` });
    }
    const client = await prisma.client.update({
      where: { id: req.params.id },
      data: { frequenceFacturation: frequence as any },
    });
    res.json(client);
  } catch (err) {
    next(err);
  }
});

clientsRouter.patch('/:id/contacts/:contactId', requireRole('admin', 'manager_entite'), async (req, res, next) => {
  try {
    const existing = await prisma.client.findUnique({ where: { id: req.params.id } });
    if (!existing) return res.status(404).json({ error: 'Client introuvable' });
    if (!assertEntiteInScope(req, res, existing.entite as Entite)) return;

    const contact = await prisma.contact.findUnique({ where: { id: req.params.contactId } });
    if (!contact || contact.clientId !== req.params.id) return res.status(404).json({ error: 'Contact introuvable' });

    const { nom, fonction, email, tel } = req.body ?? {};
    const updated = await prisma.contact.update({
      where: { id: req.params.contactId },
      data: {
        nom: typeof nom === 'string' && nom.trim() ? nom.trim() : undefined,
        fonction: typeof fonction === 'string' ? fonction.trim() || null : undefined,
        email: typeof email === 'string' ? email.trim() || null : undefined,
        tel: typeof tel === 'string' ? tel.trim() || null : undefined,
      },
    });
    res.json(updated);
  } catch (err) {
    next(err);
  }
});

clientsRouter.delete('/:id/contacts/:contactId', requireRole('admin', 'manager_entite'), async (req, res, next) => {
  try {
    const existing = await prisma.client.findUnique({ where: { id: req.params.id } });
    if (!existing) return res.status(404).json({ error: 'Client introuvable' });
    if (!assertEntiteInScope(req, res, existing.entite as Entite)) return;

    const contact = await prisma.contact.findUnique({ where: { id: req.params.contactId } });
    if (!contact || contact.clientId !== req.params.id) return res.status(404).json({ error: 'Contact introuvable' });

    await prisma.contact.delete({ where: { id: req.params.contactId } });
    res.status(204).end();
  } catch (err) {
    next(err);
  }
});

clientsRouter.post('/:id/factures', requireRole('admin', 'manager_entite'), async (req, res, next) => {
  try {
    const existing = await prisma.client.findUnique({ where: { id: req.params.id } });
    if (!existing) return res.status(404).json({ error: 'Client introuvable' });
    if (!assertEntiteInScope(req, res, existing.entite as Entite)) return;

    const { numero, montant, dateFacture, dateEcheance, designation } = req.body ?? {};
    if (!numero || !montant || !dateEcheance) {
      return res.status(400).json({ error: 'Numéro, montant et échéance sont requis' });
    }
    const facture = await prisma.facture.create({
      data: {
        clientId: req.params.id,
        numero: String(numero).trim(),
        montant: Number(montant),
        dateFacture: dateFacture ? new Date(dateFacture) : undefined,
        dateEcheance: new Date(dateEcheance),
        designation: designation ? String(designation).trim() : undefined,
        statut: 'impayee',
      },
    });
    res.status(201).json(facture);
  } catch (err) {
    next(err);
  }
});

clientsRouter.post('/:id/actions', requireRole('admin', 'manager_entite', 'comptable'), async (req, res, next) => {
  try {
    const existing = await prisma.client.findUnique({ where: { id: req.params.id } });
    if (!existing) return res.status(404).json({ error: 'Client introuvable' });
    if (!assertEntiteInScope(req, res, existing.entite as Entite)) return;

    const palier = Number(req.body?.palier);
    const note = typeof req.body?.note === 'string' ? req.body.note.trim() : '';
    const pal = PALIERS[palier];
    if (!pal) return res.status(400).json({ error: 'Palier invalide' });

    const action = await prisma.actionRecouvrement.create({
      data: { clientId: req.params.id, palier, label: pal.label, note: note || undefined, utilisateurId: req.user!.id },
    });
    res.status(201).json(action);
  } catch (err) {
    next(err);
  }
});

// Mot bienveillant HORS PALIER : geste manuel envers un bon payeur en retard
// inhabituel. Journalisé comme action (palier 0, libellé dédié) pour garder une
// trace dans l'historique, SANS faire avancer l'échelle de recouvrement.
clientsRouter.post('/:id/relance-bienveillante', requireRole('admin', 'manager_entite', 'comptable'), async (req, res, next) => {
  try {
    const existing = await prisma.client.findUnique({ where: { id: req.params.id } });
    if (!existing) return res.status(404).json({ error: 'Client introuvable' });
    if (!assertEntiteInScope(req, res, existing.entite as Entite)) return;
    const canal = typeof req.body?.canal === 'string' ? req.body.canal.trim().slice(0, 40) : '';
    const note = ['Mot bienveillant envoyé', canal ? `(${canal})` : ''].filter(Boolean).join(' ');
    const action = await prisma.actionRecouvrement.create({
      data: { clientId: req.params.id, palier: 0, label: 'Mot bienveillant (hors palier)', note, utilisateurId: req.user!.id },
    });
    res.status(201).json(action);
  } catch (err) {
    next(err);
  }
});

clientsRouter.get('/:id/letters/:palierId', requireRole('admin', 'manager_entite'), async (req, res, next) => {
  try {
    const client = await prisma.client.findUnique({
      where: { id: req.params.id },
      include: { factures: true, actions: { orderBy: { date: 'desc' } } },
    });
    if (!client) return res.status(404).json({ error: 'Client introuvable' });
    if (!assertEntiteInScope(req, res, client.entite as Entite)) return;

    const palierId = parseInt(req.params.palierId, 10);
    if (!PALIERS[palierId]) return res.status(400).json({ error: 'Palier invalide' });

    const text = generateLetter(
      {
        nom: client.nom,
        entite: client.entite as any,
        contact: client.contact ?? '',
        factures: client.factures,
        actions: client.actions,
      },
      palierId,
    );
    res.json({ text });
  } catch (err) {
    next(err);
  }
});

interface TrancheInput {
  dateEcheance?: unknown;
  montant?: unknown;
}

// Négocié avec un client en difficulté (souvent au palier 4-6) : un accord de
// règlement en plusieurs tranches, suivi indépendamment des factures qui
// restent, elles, à leur propre statut jusqu'au règlement effectif.
clientsRouter.post('/:id/echeanciers', requireRole('admin', 'manager_entite'), async (req, res, next) => {
  try {
    const existing = await prisma.client.findUnique({ where: { id: req.params.id } });
    if (!existing) return res.status(404).json({ error: 'Client introuvable' });
    if (!assertEntiteInScope(req, res, existing.entite as Entite)) return;

    const { motif, tranches } = (req.body ?? {}) as { motif?: unknown; tranches?: TrancheInput[] };
    if (!Array.isArray(tranches) || tranches.length === 0) {
      return res.status(400).json({ error: 'Au moins une tranche est requise' });
    }
    const parsedTranches = tranches.map((t) => ({
      dateEcheance: new Date(String(t.dateEcheance)),
      montant: Number(t.montant),
    }));
    if (parsedTranches.some((t) => Number.isNaN(t.dateEcheance.getTime()) || !Number.isFinite(t.montant) || t.montant <= 0)) {
      return res.status(400).json({ error: 'Chaque tranche doit avoir une date valide et un montant positif' });
    }
    const montantTotal = parsedTranches.reduce((s, t) => s + t.montant, 0);

    const echeancier = await prisma.echeancierPaiement.create({
      data: {
        clientId: req.params.id,
        montantTotal,
        motif: typeof motif === 'string' && motif.trim() ? motif.trim() : undefined,
        tranches: {
          create: parsedTranches.map((t, i) => ({ ordre: i + 1, dateEcheance: t.dateEcheance, montant: t.montant })),
        },
      },
      include: { tranches: { orderBy: { ordre: 'asc' } } },
    });

    await prisma.actionRecouvrement.create({
      data: {
        clientId: req.params.id,
        palier: 0,
        label: 'Échéancier de paiement créé',
        note: `${fmtFCFA(montantTotal)} en ${parsedTranches.length} tranche(s) (par ${req.user!.nom})`,
        utilisateurId: req.user!.id,
      },
    });

    res.status(201).json(echeancier);
  } catch (err) {
    next(err);
  }
});

clientsRouter.patch(
  '/:id/echeanciers/:echeancierId/tranches/:trancheId/toggle-paid',
  requireRole('admin', 'manager_entite', 'comptable'),
  async (req, res, next) => {
    try {
      const existing = await prisma.client.findUnique({ where: { id: req.params.id } });
      if (!existing) return res.status(404).json({ error: 'Client introuvable' });
      if (!assertEntiteInScope(req, res, existing.entite as Entite)) return;

      const tranche = await prisma.tranchePaiement.findUnique({ where: { id: req.params.trancheId } });
      if (!tranche || tranche.echeancierId !== req.params.echeancierId) {
        return res.status(404).json({ error: 'Tranche introuvable' });
      }
      const echeancier = await prisma.echeancierPaiement.findUnique({ where: { id: req.params.echeancierId } });
      if (!echeancier || echeancier.clientId !== req.params.id) return res.status(404).json({ error: 'Échéancier introuvable' });

      const wasUnpaid = tranche.statut === 'impayee';
      const updated = await prisma.tranchePaiement.update({
        where: { id: tranche.id },
        data: { statut: wasUnpaid ? 'payee' : 'impayee', datePaiement: wasUnpaid ? new Date() : null },
      });

      if (wasUnpaid) {
        await prisma.actionRecouvrement.create({
          data: {
            clientId: req.params.id,
            palier: 0,
            label: 'Tranche réglée',
            note: `${fmtFCFA(tranche.montant)} — échéance du ${fmtDate(tranche.dateEcheance)}`,
            utilisateurId: req.user!.id,
          },
        });
      }

      res.json(updated);
    } catch (err) {
      next(err);
    }
  },
);

clientsRouter.delete('/:id/echeanciers/:echeancierId', requireRole('admin', 'manager_entite'), async (req, res, next) => {
  try {
    const existing = await prisma.client.findUnique({ where: { id: req.params.id } });
    if (!existing) return res.status(404).json({ error: 'Client introuvable' });
    if (!assertEntiteInScope(req, res, existing.entite as Entite)) return;

    const echeancier = await prisma.echeancierPaiement.findUnique({ where: { id: req.params.echeancierId } });
    if (!echeancier || echeancier.clientId !== req.params.id) return res.status(404).json({ error: 'Échéancier introuvable' });

    await prisma.echeancierPaiement.delete({ where: { id: echeancier.id } });
    await prisma.actionRecouvrement.create({
      data: {
        clientId: req.params.id,
        palier: 0,
        label: 'Échéancier de paiement supprimé',
        note: `${fmtFCFA(echeancier.montantTotal)} (par ${req.user!.nom})`,
        utilisateurId: req.user!.id,
      },
    });
    res.status(204).end();
  } catch (err) {
    next(err);
  }
});

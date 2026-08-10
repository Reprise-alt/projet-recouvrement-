import { Router } from 'express';
import multer from 'multer';
import * as XLSX from 'xlsx';
import { prisma } from '../db';
import { Entite } from '../lib/entites';
import { enLitigeSignal } from '../lib/paliers';
import { parseOperationsImportWorkbook } from '../lib/parsers/operationsImport';
import { getKnownEntitesForImport } from '../services/entrepriseService';
import { ETAPES_DEMARRAGE_DEFAUT } from '../lib/operationsDefaults';
import { repartir, trimestreInfo } from '../lib/revueTrimestre';
import { chargeDeCompteWhere, resolveEntiteScopeOperations, userCanAccessEntiteOperations } from '../lib/operationsAuth';
import { requireAuth, requireModuleOperations } from '../middleware/auth';
import {
  alertesClient,
  couleurScore,
  DEFAULT_CONFIG_OPERATIONS,
  enDemarrage,
  etatDemarrage,
  scoresClient,
  semaineIsoKey,
  trierAlertes,
  type ConfigOperationsLike,
  type EtapeDemarrageConfigLike,
  type ProblemeLike,
} from '../lib/operations';

export const operationsRouter = Router();
operationsRouter.use(requireAuth, requireModuleOperations());

// Sélection Client volontairement minimale et sans jointure facture/contrat :
// le module Opérations ne doit jamais pouvoir renvoyer une donnée
// financière, même à un utilisateur qui aurait par ailleurs accès au
// recouvrement (cahier §7 -- "aucune donnée financière ne doit apparaître
// dans l'interface des directrices des opérations"). Appliqué une fois ici
// plutôt que recopié dans chaque route, pour qu'un oubli futur ne puisse pas
// réintroduire un champ montant par erreur.
export const CLIENT_SELECT = { id: true, nom: true, entite: true, codeClient: true, contact: true, email: true, tel: true } as const;

function entiteWhereClient(entiteFilter: Entite | 'ALL') {
  if (entiteFilter === 'ALL') return {};
  return { entite: entiteFilter };
}

async function getConfig(): Promise<ConfigOperationsLike> {
  const row = await prisma.configOperations.upsert({ where: { id: 1 }, create: { id: 1 }, update: {} });
  return row;
}

async function getEtapesConfig(entite: string): Promise<EtapeDemarrageConfigLike[]> {
  return prisma.etapeDemarrageConfig.findMany({ where: { entite }, orderBy: { ordre: 'asc' } });
}

function toProblemeLike(p: { gravite: string; ouvertLe: Date; resoluLe: Date | null }): ProblemeLike {
  return { gravite: p.gravite as 'gene' | 'bloquant', ouvertLe: p.ouvertLe, resoluLe: p.resoluLe };
}

/* ---------- Config & nomenclatures paramétrables ---------- */

operationsRouter.get('/config', async (_req, res, next) => {
  try {
    res.json(await getConfig());
  } catch (err) {
    next(err);
  }
});

operationsRouter.patch('/config', requireModuleOperations('direction_generale'), async (req, res, next) => {
  try {
    const body = req.body ?? {};
    const allowed: (keyof ConfigOperationsLike)[] = [
      'contactStdVigilance',
      'contactStdRisque',
      'contactVipVigilance',
      'contactVipRisque',
      'problemeVigilanceJours',
      'problemeRisqueJours',
      'problemeBloquantRisqueJours',
      'demarrageRisqueRetardJours',
    ];
    const data: Record<string, number> = {};
    for (const key of allowed) {
      if (body[key] != null && !isNaN(Number(body[key]))) data[key] = Number(body[key]);
    }
    const updated = await prisma.configOperations.upsert({ where: { id: 1 }, create: { id: 1, ...data }, update: data });
    res.json(updated);
  } catch (err) {
    next(err);
  }
});

operationsRouter.get('/etapes-demarrage', async (req, res, next) => {
  try {
    const entite = typeof req.query.entite === 'string' ? req.query.entite : undefined;
    if (entite && !userCanAccessEntiteOperations(req.user!, entite)) {
      return res.status(403).json({ error: 'Accès refusé — hors du périmètre de votre compte' });
    }
    const etapes = await prisma.etapeDemarrageConfig.findMany({
      where: entite ? { entite } : {},
      orderBy: [{ entite: 'asc' }, { ordre: 'asc' }],
    });
    res.json(etapes);
  } catch (err) {
    next(err);
  }
});

operationsRouter.patch('/etapes-demarrage/:id', requireModuleOperations('direction_generale'), async (req, res, next) => {
  try {
    const { libelle, delaiJours, ordre } = req.body ?? {};
    const data: Record<string, unknown> = {};
    if (libelle != null) data.libelle = String(libelle);
    if (delaiJours != null && !isNaN(Number(delaiJours))) data.delaiJours = Number(delaiJours);
    if (ordre != null && !isNaN(Number(ordre))) data.ordre = Number(ordre);
    const updated = await prisma.etapeDemarrageConfig.update({ where: { id: req.params.id }, data });
    res.json(updated);
  } catch (err) {
    next(err);
  }
});

// Auto-provisioning à la demande : `prisma/seedOperations.ts` ne pose les
// étapes de démarrage que pour SORAM et IRIS au provisioning initial, et
// n'a jamais tourné sur certains environnements (ex: production) -- une
// entité créée depuis l'admin des entreprises (SIS, ou une future entité)
// n'a donc aucune ligne. Cette route les pose à la demande, uniquement si
// l'entité n'a encore aucune étape configurée, pour ne jamais écraser un
// réglage déjà personnalisé via PATCH /etapes-demarrage/:id.
operationsRouter.post('/etapes-demarrage/init-defaut', requireModuleOperations('direction_generale'), async (req, res, next) => {
  try {
    const entite = typeof req.body?.entite === 'string' ? req.body.entite.trim() : '';
    if (!entite) return res.status(400).json({ error: 'Entité requise' });

    const existantes = await prisma.etapeDemarrageConfig.count({ where: { entite } });
    if (existantes > 0) {
      return res.json(await prisma.etapeDemarrageConfig.findMany({ where: { entite }, orderBy: { ordre: 'asc' } }));
    }

    await prisma.etapeDemarrageConfig.createMany({
      data: ETAPES_DEMARRAGE_DEFAUT.map((e) => ({ entite, ...e })),
    });
    res.json(await prisma.etapeDemarrageConfig.findMany({ where: { entite }, orderBy: { ordre: 'asc' } }));
  } catch (err) {
    next(err);
  }
});

operationsRouter.get('/fenetres-saisonnieres', async (_req, res, next) => {
  try {
    res.json(await prisma.fenetreSaisonniere.findMany());
  } catch (err) {
    next(err);
  }
});

operationsRouter.patch('/fenetres-saisonnieres/:secteur', requireModuleOperations('direction_generale'), async (req, res, next) => {
  try {
    const { mois, jour, anticipationJours, label } = req.body ?? {};
    const data: Record<string, unknown> = {};
    if (mois != null && !isNaN(Number(mois))) data.mois = Number(mois);
    if (jour != null && !isNaN(Number(jour))) data.jour = Number(jour);
    if (anticipationJours != null && !isNaN(Number(anticipationJours))) data.anticipationJours = Number(anticipationJours);
    if (label != null) data.label = String(label);
    const updated = await prisma.fenetreSaisonniere.update({ where: { secteur: req.params.secteur as any }, data });
    res.json(updated);
  } catch (err) {
    next(err);
  }
});

// Démarrage à froid : un portefeuille repris par import (nom/entité/dates de
// contrat seulement, cf. POST /import) n'a jamais de dernierContact ni de
// dernierCopil -- sans ça, les alertes de contact et de COPIL remontent
// immédiatement pour tout le portefeuille dès la première ouverture du
// Cockpit, comme si des mois avaient été négligés. Cette route pose le
// point de départ à aujourd'hui une bonne fois, uniquement là où c'est
// encore vide (ne touche jamais un compte déjà suivi), pour que le suivi
// reparte de zéro plutôt que de faire remonter un faux passif.
operationsRouter.post('/alertes/reinitialiser-depart', requireModuleOperations('direction_generale'), async (req, res, next) => {
  try {
    const entiteFilter = resolveEntiteScopeOperations(req.user!, req.body?.entite);
    const now = new Date();
    const contact = await prisma.clientOperations.updateMany({
      where: { client: entiteWhereClient(entiteFilter), resilie: false, dernierContact: null },
      data: { dernierContact: now },
    });
    const copil = await prisma.clientOperations.updateMany({
      where: { client: entiteWhereClient(entiteFilter), resilie: false, vip: true, dernierCopil: null },
      data: { dernierCopil: now },
    });
    res.json({ contactInitialise: contact.count, copilInitialise: copil.count });
  } catch (err) {
    next(err);
  }
});

/* ---------- Portefeuille ---------- */

operationsRouter.get('/portefeuille', async (req, res, next) => {
  try {
    const entiteFilter = resolveEntiteScopeOperations(req.user!, req.query.entite);
    const rows = await prisma.clientOperations.findMany({
      where: { client: entiteWhereClient(entiteFilter), ...chargeDeCompteWhere(req.user!) },
      include: {
        client: { select: CLIENT_SELECT },
        problemes: true,
        chargeDeCompte: { select: { id: true, nom: true } },
      },
    });

    const config = await getConfig();
    const etapesParEntite = new Map<string, EtapeDemarrageConfigLike[]>();
    for (const entite of new Set(rows.map((r) => r.client.entite))) {
      etapesParEntite.set(entite, await getEtapesConfig(entite));
    }

    // Une seule requête groupée pour l'historique de score de tout le
    // portefeuille (sparkline "Tendance") plutôt qu'une par ligne -- même
    // portefeuille de 280 comptes, une seule allée-retour base.
    const releves = await prisma.releveHebdo.findMany({
      where: { clientOperationsId: { in: rows.map((r) => r.id) } },
      orderBy: { date: 'asc' },
      select: { clientOperationsId: true, score: true },
    });
    const tendanceParClient = new Map<string, number[]>();
    for (const rel of releves) {
      const liste = tendanceParClient.get(rel.clientOperationsId) ?? [];
      liste.push(rel.score);
      tendanceParClient.set(rel.clientOperationsId, liste);
    }

    const now = Date.now();
    const infoTrimestre = trimestreInfo();
    const portefeuille = rows.map((r) => {
      const problemes = r.problemes.map(toProblemeLike);
      const ouverts = problemes.filter((p) => !p.resoluLe);
      const scores = scoresClient(
        {
          vip: r.vip,
          dernierContact: r.dernierContact,
          climat: r.climat,
          action: r.action,
          actionEcheance: r.actionEcheance,
          actionFait: r.actionFait,
          dernierCopil: r.dernierCopil,
          demarreLe: r.demarreLe,
          demarrageCloture: r.demarrageCloture,
          resilie: r.resilie,
          problemes,
        },
        etapesParEntite.get(r.client.entite) ?? [],
        [], // faits de démarrage non chargés en liste (perf) -- l'étape "en retard" suffit ici, cf. fiche détail pour le détail
        config,
      );
      const plusAncien = ouverts.length ? Math.max(...ouverts.map((p) => Math.floor((now - new Date(p.ouvertLe).getTime()) / 86400000))) : null;
      return {
        id: r.id,
        client: r.client,
        secteur: r.secteur,
        criticite: r.criticite,
        vip: r.vip,
        chargeDeCompte: r.chargeDeCompte,
        dernierContact: r.dernierContact,
        climat: r.climat,
        dernierReleve: r.dernierReleve,
        releveFait: !!r.dernierReleve && semaineIsoKey(r.dernierReleve) === semaineIsoKey(),
        // Distinct de releveFait (cette semaine) : couvre tout le trimestre en
        // cours, pour une visibilité d'ensemble dans le tableau (cf. carte
        // Revue trimestrielle). Un compte VIP ou résilié ne suit jamais ce
        // cycle -- toujours faux pour eux, jamais mis en avant à tort.
        revueTrimestreFaite: !r.vip && !r.resilie && !!r.dernierReleve && r.dernierReleve >= infoTrimestre.debut,
        resilie: r.resilie,
        problemesOuverts: ouverts.length,
        problemesBloquants: ouverts.filter((p) => p.gravite === 'bloquant').length,
        problemePlusAncienJours: plusAncien,
        action: r.action,
        actionEcheance: r.actionEcheance,
        actionFait: r.actionFait,
        finContrat: r.finContrat,
        enDemarrage: enDemarrage(r),
        tendance: tendanceParClient.get(r.id) ?? [],
        scores,
        tone: couleurScore(scores.global),
      };
    });

    res.json(portefeuille);
  } catch (err) {
    next(err);
  }
});

/* ---------- Cockpit ---------- */

operationsRouter.get('/cockpit', async (req, res, next) => {
  try {
    const entiteFilter = resolveEntiteScopeOperations(req.user!, req.query.entite);
    const rows = await prisma.clientOperations.findMany({
      where: { client: entiteWhereClient(entiteFilter), resilie: false, ...chargeDeCompteWhere(req.user!) },
      include: { client: { select: CLIENT_SELECT }, problemes: true, etapesDemarrage: true, chargeDeCompte: { select: { id: true, nom: true } } },
    });

    const config = await getConfig();
    const etapesParEntite = new Map<string, EtapeDemarrageConfigLike[]>();
    const fenetres = await prisma.fenetreSaisonniere.findMany();
    const fenetreParSecteur = new Map(fenetres.map((f) => [f.secteur, f]));
    for (const entite of new Set(rows.map((r) => r.client.entite))) {
      etapesParEntite.set(entite, await getEtapesConfig(entite));
    }

    const now = new Date();
    const toutesAlertes = rows.flatMap((r) => {
      const problemes = r.problemes.map(toProblemeLike);
      return alertesClient(
        {
          id: r.id,
          nom: r.client.nom,
          criticite: r.criticite,
          vip: r.vip,
          dernierContact: r.dernierContact,
          climat: r.climat,
          action: r.action,
          actionEcheance: r.actionEcheance,
          actionFait: r.actionFait,
          dernierCopil: r.dernierCopil,
          demarreLe: r.demarreLe,
          demarrageCloture: r.demarrageCloture,
          resilie: r.resilie,
          problemes,
        },
        etapesParEntite.get(r.client.entite) ?? [],
        r.etapesDemarrage,
        fenetreParSecteur.get(r.secteur) ?? null,
        config,
      );
    });
    const alertesTriees = trierAlertes(toutesAlertes);

    const problemesOuvertsCount = rows.reduce((s, r) => s + r.problemes.filter((p) => !p.resoluLe).length, 0);
    const horsRegleContact = rows.filter((r) => {
      const depuis = r.dernierContact ? Math.floor((now.getTime() - new Date(r.dernierContact).getTime()) / 86400000) : null;
      const seuilRisque = r.vip ? config.contactVipRisque : config.contactStdRisque;
      return depuis == null || depuis >= seuilRisque;
    }).length;
    const copilDuMois = rows.filter((r) => r.vip && r.dernierCopil && new Date(r.dernierCopil).getMonth() === now.getMonth() && new Date(r.dernierCopil).getFullYear() === now.getFullYear()).length;
    const engagementsEnRetard = rows.filter((r) => r.action && !r.actionFait && r.actionEcheance && new Date(r.actionEcheance) < now).length;
    const releveDeLaSemaine = rows.filter((r) => r.dernierReleve && semaineIsoKey(r.dernierReleve) === semaineIsoKey(now)).length;

    const demarragesEnCours = rows
      .map((r) => ({
        id: r.id,
        client: r.client,
        demarreLe: r.demarreLe,
        chargeDeCompte: r.chargeDeCompte,
        etat: etatDemarrage(r, etapesParEntite.get(r.client.entite) ?? [], r.etapesDemarrage),
      }))
      .filter((d) => d.etat != null);

    res.json({
      compteurs: {
        problemesOuverts: problemesOuvertsCount,
        horsRegleContact,
        copilDuMois,
        engagementsEnRetard,
        releveDeLaSemaine,
        totalPortefeuille: rows.length,
      },
      alertes: alertesTriees,
      demarragesEnCours,
    });
  } catch (err) {
    next(err);
  }
});

/* ---------- Fiche compte ---------- */

operationsRouter.get('/clients/:id', async (req, res, next) => {
  try {
    const co = await prisma.clientOperations.findUnique({
      where: { id: req.params.id },
      include: {
        client: { select: CLIENT_SELECT },
        problemes: { orderBy: { ouvertLe: 'desc' } },
        releves: { orderBy: { date: 'desc' }, take: 52 },
        etapesDemarrage: true,
        chargeDeCompte: { select: { id: true, nom: true } },
      },
    });
    if (!co) return res.status(404).json({ error: 'Compte introuvable' });
    if (!userCanAccessEntiteOperations(req.user!, co.client.entite)) {
      return res.status(403).json({ error: 'Accès refusé — hors du périmètre de votre compte' });
    }
    if (req.user!.roleOperations === 'charge_compte' && co.chargeDeCompteId !== req.user!.id) {
      return res.status(403).json({ error: 'Accès refusé — ce compte ne vous est pas rattaché' });
    }

    const config = await getConfig();
    const etapesConfig = await getEtapesConfig(co.client.entite);
    const problemes = co.problemes.map(toProblemeLike);
    const scores = scoresClient(co, etapesConfig, co.etapesDemarrage, config);
    const demarrage = etatDemarrage(co, etapesConfig, co.etapesDemarrage);

    res.json({ ...co, scores, tone: couleurScore(scores.global), demarrage, etapesConfig });
  } catch (err) {
    next(err);
  }
});

// Signal croisé recouvrement -> opérations (cahier §8) : un booléen, jamais
// un montant -- "ce client est en litige, à qualifier" dès 7 factures
// consécutives impayées (enLitigeSignal, lib/paliers.ts, partagée avec le
// recouvrement). Lit la table Facture côté serveur sans jamais renvoyer un
// seul de ses champs : l'isolation financière du module (cf. CLIENT_SELECT
// plus haut) reste intacte.
operationsRouter.get('/clients/:id/signal-recouvrement', async (req, res, next) => {
  try {
    const scoped = await loadScoped(req, req.params.id);
    if (scoped.error) return res.status(scoped.error).json(scoped.body);
    const co = scoped.co!;

    const factures = await prisma.facture.findMany({
      where: { clientId: co.clientId },
      select: { statut: true, dateEcheance: true },
    });
    res.json({ enLitige: enLitigeSignal(factures) });
  } catch (err) {
    next(err);
  }
});

/* ---------- Import en masse (fichier "Suivi Contrats" SORAM/IRIS) ---------- */

const uploadOperations = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } });

// Démarre le portefeuille à partir d'un fichier qui n'a jamais été pensé
// pour Opérations (secteur, criticité, VIP en sont absents) -- on importe
// quand même l'identité et l'étendue du contrat, secteur par défaut "autre"
// et criticité "C", à charge pour la directrice de reclasser ensuite depuis
// le Portefeuille. Mieux vaut un portefeuille peuplé à affiner qu'aucun
// portefeuille tant que chaque compte n'a pas été ressaisi à la main.
operationsRouter.post(
  '/import',
  requireModuleOperations('directrice_operations', 'direction_generale'),
  uploadOperations.single('file'),
  async (req, res, next) => {
    try {
      if (!req.file) return res.status(400).json({ error: 'Aucun fichier reçu' });

      const knownEntites = await getKnownEntitesForImport();
      const wb = XLSX.read(req.file.buffer, { type: 'buffer', cellDates: true });
      const rows = parseOperationsImportWorkbook(wb, knownEntites);
      if (!rows.length) {
        return res.status(422).json({ error: "Aucune donnée exploitable dans ce fichier -- format non reconnu (attendu : suivi de contrats avec colonnes raison sociale / début / fin)." });
      }

      let created = 0;
      let dejaExistant = 0;
      let horsPerimetre = 0;
      for (const row of rows) {
        if (!userCanAccessEntiteOperations(req.user!, row.entite)) {
          horsPerimetre++;
          continue;
        }
        let client = await prisma.client.findUnique({ where: { nom_entite: { nom: row.nom, entite: row.entite } } });
        if (!client) {
          client = await prisma.client.create({ data: { nom: row.nom, entite: row.entite } });
        }
        const existing = await prisma.clientOperations.findUnique({ where: { clientId: client.id } });
        if (existing) {
          dejaExistant++;
          continue;
        }
        await prisma.clientOperations.create({
          data: {
            clientId: client.id,
            secteur: 'autre',
            criticite: 'C',
            debutContrat: row.debutContrat ? new Date(row.debutContrat) : null,
            finContrat: row.finContrat ? new Date(row.finContrat) : null,
            // Point de départ du suivi posé à l'import plutôt que laissé vide
            // -- sinon chaque compte importé alerte "aucun contact" dès la
            // première ouverture du Cockpit, pour un historique qui n'existe
            // simplement pas encore côté Opérations.
            dernierContact: new Date(),
          },
        });
        created++;
      }

      res.json({ total: rows.length, created, dejaExistant, horsPerimetre });
    } catch (err) {
      next(err);
    }
  },
);

// Création d'une fiche Opérations -- rattachée à un Client existant
// (identifié par codeClient+entite ou nom+entite) ou à un Client créé à la
// volée si aucun ne correspond. `demarrerSuivi` est explicite plutôt
// qu'automatique : contrairement à un tout nouveau produit, cette
// plateforme rattache aussi des comptes déjà anciens -- les faire démarrer
// un suivi "90 premiers jours" par défaut créerait de fausses alertes de
// retard sur tout le portefeuille existant dès la mise en service.
operationsRouter.post('/clients', requireModuleOperations('directrice_operations', 'direction_generale'), async (req, res, next) => {
  try {
    const { nom, entite, codeClient, secteur, criticite, vip, chargeDeCompteId, debutContrat, finContrat, demarrerSuivi } = req.body ?? {};
    if (!nom || !entite) return res.status(400).json({ error: 'Nom et entité requis' });
    if (!userCanAccessEntiteOperations(req.user!, entite)) {
      return res.status(403).json({ error: 'Accès refusé — hors du périmètre de votre compte' });
    }
    if (!secteur) return res.status(400).json({ error: 'Secteur requis' });

    let client = await prisma.client.findUnique({ where: { nom_entite: { nom, entite } } });
    if (!client) {
      client = await prisma.client.create({ data: { nom, entite, codeClient: codeClient || null } });
    } else if (codeClient && !client.codeClient) {
      client = await prisma.client.update({ where: { id: client.id }, data: { codeClient } });
    }

    const existing = await prisma.clientOperations.findUnique({ where: { clientId: client.id } });
    if (existing) return res.status(409).json({ error: 'Ce client a déjà une fiche Opérations', clientOperationsId: existing.id });

    const co = await prisma.clientOperations.create({
      data: {
        clientId: client.id,
        secteur,
        criticite: criticite ?? 'C',
        vip: !!vip,
        chargeDeCompteId: chargeDeCompteId || null,
        debutContrat: debutContrat ? new Date(debutContrat) : null,
        finContrat: finContrat ? new Date(finContrat) : null,
        demarreLe: demarrerSuivi ? new Date() : null,
      },
      include: { client: { select: CLIENT_SELECT } },
    });
    res.status(201).json(co);
  } catch (err) {
    next(err);
  }
});

export async function loadScoped(req: { user?: any }, id: string) {
  const co = await prisma.clientOperations.findUnique({ where: { id }, include: { client: { select: CLIENT_SELECT } } });
  if (!co) return { error: 404 as const, body: { error: 'Compte introuvable' } };
  if (!userCanAccessEntiteOperations(req.user!, co.client.entite)) {
    return { error: 403 as const, body: { error: 'Accès refusé — hors du périmètre de votre compte' } };
  }
  if (req.user!.roleOperations === 'charge_compte' && co.chargeDeCompteId !== req.user!.id) {
    return { error: 403 as const, body: { error: 'Accès refusé — ce compte ne vous est pas rattaché' } };
  }
  return { co };
}

operationsRouter.patch('/clients/:id', async (req, res, next) => {
  try {
    const scoped = await loadScoped(req, req.params.id);
    if (scoped.error) return res.status(scoped.error).json(scoped.body);

    const body = req.body ?? {};
    const data: Record<string, unknown> = {};
    const stringFields = ['secteur', 'criticite', 'climat', 'commentaire', 'action', 'enjeux', 'motifDetail'];
    const boolFields = ['vip', 'actionFait', 'demarrageCloture'];
    const dateFields = ['dernierContact', 'debutContrat', 'finContrat', 'actionEcheance', 'demarreLe', 'dernierCopil'];
    for (const f of stringFields) if (body[f] !== undefined) data[f] = body[f];
    for (const f of boolFields) if (body[f] !== undefined) data[f] = !!body[f];
    for (const f of dateFields) if (body[f] !== undefined) data[f] = body[f] ? new Date(body[f]) : null;
    if (body.chargeDeCompteId !== undefined) data.chargeDeCompteId = body.chargeDeCompteId || null;

    const updated = await prisma.clientOperations.update({
      where: { id: req.params.id },
      data,
      include: { client: { select: CLIENT_SELECT } },
    });
    res.json(updated);
  } catch (err) {
    next(err);
  }
});

/* ---------- Relevé hebdomadaire ---------- */

operationsRouter.post('/clients/:id/releve', async (req, res, next) => {
  try {
    const scoped = await loadScoped(req, req.params.id);
    if (scoped.error) return res.status(scoped.error).json(scoped.body);
    const co = scoped.co!;

    const { dernierContact, climat, commentaire, action, actionEcheance, actionFait, problemesResolus, problemesNouveaux } = req.body ?? {};

    await prisma.$transaction(async (tx) => {
      if (Array.isArray(problemesResolus) && problemesResolus.length) {
        await tx.problemeOperations.updateMany({
          where: { id: { in: problemesResolus }, clientOperationsId: co.id },
          data: { resoluLe: new Date() },
        });
      }
      if (Array.isArray(problemesNouveaux)) {
        for (const p of problemesNouveaux) {
          if (!p?.texte || !p?.gravite) continue;
          await tx.problemeOperations.create({
            data: { clientOperationsId: co.id, texte: p.texte, gravite: p.gravite, ouvertLe: new Date() },
          });
        }
      }
      await tx.clientOperations.update({
        where: { id: co.id },
        data: {
          dernierContact: dernierContact ? new Date(dernierContact) : co.dernierContact,
          climat: climat ?? undefined,
          commentaire: commentaire ?? undefined,
          action: action !== undefined ? action : undefined,
          actionEcheance: actionEcheance !== undefined ? (actionEcheance ? new Date(actionEcheance) : null) : undefined,
          actionFait: actionFait !== undefined ? !!actionFait : undefined,
          dernierReleve: new Date(),
        },
      });
    });

    const full = await prisma.clientOperations.findUniqueOrThrow({
      where: { id: co.id },
      include: { problemes: true, etapesDemarrage: true },
    });
    const config = await getConfig();
    const etapesConfig = await getEtapesConfig(co.client.entite);
    const scores = scoresClient(full, etapesConfig, full.etapesDemarrage, config);

    const releve = await prisma.releveHebdo.upsert({
      where: { clientOperationsId_semaineIso: { clientOperationsId: co.id, semaineIso: semaineIsoKey() } },
      create: {
        clientOperationsId: co.id,
        semaineIso: semaineIsoKey(),
        score: scores.global,
        commentaire: commentaire ?? null,
        action: action ?? null,
      },
      update: { score: scores.global, commentaire: commentaire ?? null, action: action ?? null, date: new Date() },
    });

    res.json({ releve, scores });
  } catch (err) {
    next(err);
  }
});

// File du relevé hebdo (cahier §6) : non relevés d'abord (cette semaine
// ISO), puis VIP, puis criticité, puis score global croissant (le plus
// fragile en premier).
operationsRouter.get('/releve-file', async (req, res, next) => {
  try {
    const entiteFilter = resolveEntiteScopeOperations(req.user!, req.query.entite);
    const rows = await prisma.clientOperations.findMany({
      where: { client: entiteWhereClient(entiteFilter), resilie: false, ...chargeDeCompteWhere(req.user!) },
      include: { client: { select: CLIENT_SELECT }, problemes: true, etapesDemarrage: true },
    });
    const config = await getConfig();
    const etapesParEntite = new Map<string, EtapeDemarrageConfigLike[]>();
    for (const entite of new Set(rows.map((r) => r.client.entite))) {
      etapesParEntite.set(entite, await getEtapesConfig(entite));
    }
    const semaine = semaineIsoKey();
    const rang: Record<'A' | 'B' | 'C', number> = { A: 0, B: 1, C: 2 };

    const file = rows
      .map((r) => {
        const scores = scoresClient(r, etapesParEntite.get(r.client.entite) ?? [], r.etapesDemarrage, config);
        return {
          id: r.id,
          client: r.client,
          vip: r.vip,
          criticite: r.criticite,
          releveFait: !!r.dernierReleve && semaineIsoKey(r.dernierReleve) === semaine,
          scores,
        };
      })
      .sort(
        (a, b) =>
          (a.releveFait === b.releveFait ? 0 : a.releveFait ? 1 : -1) ||
          (b.vip ? 1 : 0) - (a.vip ? 1 : 0) ||
          rang[a.criticite] - rang[b.criticite] ||
          a.scores.global - b.scores.global,
      );

    res.json(file);
  } catch (err) {
    next(err);
  }
});

// Revue trimestrielle (SORAM/IRIS, comptes non-VIP uniquement -- les VIP
// suivent leur COPIL mensuel) : objectif du dir des opérations, voir 100% du
// parc en un trimestre sans repasser deux fois par le même compte avant
// d'avoir fait le tour (cf. lib/revueTrimestre.ts). L'affectation aux
// semaines est calculée à la volée et posée une seule fois par compte --
// jamais de cron, juste une réparation paresseuse à chaque appel pour les
// comptes qui n'ont pas encore de tirage ce trimestre (nouveau compte, VIP
// repassé standard, ou tout simplement premier appel du trimestre).
operationsRouter.get('/revue-trimestre', async (req, res, next) => {
  try {
    const entiteFilter = resolveEntiteScopeOperations(req.user!, req.query.entite);
    const entitesRevue = ['SORAM', 'IRIS'].filter((e) => entiteFilter === 'ALL' || e === entiteFilter);
    const info = trimestreInfo();

    const eligibles = await prisma.clientOperations.findMany({
      where: {
        vip: false,
        resilie: false,
        client: { entite: { in: entitesRevue } },
        ...chargeDeCompteWhere(req.user!),
      },
      include: { client: { select: CLIENT_SELECT }, problemes: true, etapesDemarrage: true },
    });

    const nonAffectes = eligibles.filter((r) => r.revueTrimestreCle !== info.cle);
    if (nonAffectes.length) {
      const affectation = repartir(
        nonAffectes.map((r) => r.id),
        info,
      );
      await Promise.all(
        [...affectation.entries()].map(([id, semaine]) =>
          prisma.clientOperations.update({ where: { id }, data: { revueTrimestreCle: info.cle, revueTrimestreSemaine: semaine } }),
        ),
      );
      for (const r of nonAffectes) r.revueTrimestreSemaine = affectation.get(r.id) ?? null;
    }

    const config = await getConfig();
    const etapesParEntite = new Map<string, EtapeDemarrageConfigLike[]>();
    for (const entite of new Set(eligibles.map((r) => r.client.entite))) {
      etapesParEntite.set(entite, await getEtapesConfig(entite));
    }

    const faitCeTrimestre = (r: (typeof eligibles)[number]) => !!r.dernierReleve && r.dernierReleve >= info.debut;

    const aTraiter = eligibles
      .filter((r) => (r.revueTrimestreSemaine ?? info.semaine) <= info.semaine && !faitCeTrimestre(r))
      .map((r) => ({
        id: r.id,
        client: r.client,
        criticite: r.criticite,
        dernierContact: r.dernierContact,
        semaineAffectee: r.revueTrimestreSemaine ?? info.semaine,
        scores: scoresClient(r, etapesParEntite.get(r.client.entite) ?? [], r.etapesDemarrage, config),
      }))
      .sort((a, b) => a.semaineAffectee - b.semaineAffectee || a.scores.global - b.scores.global);

    // Le pendant de aTraiter : les comptes déjà vus ce trimestre -- pour que
    // "5/265 comptes vus" mène à une vraie liste, pas juste un chiffre.
    const faits = eligibles
      .filter(faitCeTrimestre)
      .map((r) => ({ id: r.id, client: r.client, dernierReleve: r.dernierReleve }))
      .sort((a, b) => new Date(b.dernierReleve!).getTime() - new Date(a.dernierReleve!).getTime());

    res.json({
      trimestre: info.cle,
      semaine: info.semaine,
      totalSemaines: info.totalSemaines,
      totalEligibles: eligibles.length,
      faits,
      totalFaits: eligibles.filter(faitCeTrimestre).length,
      aTraiter,
    });
  } catch (err) {
    next(err);
  }
});

/* ---------- Problèmes ---------- */

operationsRouter.post('/clients/:id/problemes', async (req, res, next) => {
  try {
    const scoped = await loadScoped(req, req.params.id);
    if (scoped.error) return res.status(scoped.error).json(scoped.body);
    const { texte, gravite } = req.body ?? {};
    if (!texte || !['gene', 'bloquant'].includes(gravite)) return res.status(400).json({ error: 'Texte et gravité requis' });

    const probleme = await prisma.problemeOperations.create({
      data: { clientOperationsId: req.params.id, texte, gravite, ouvertLe: new Date() },
    });
    res.status(201).json(probleme);
  } catch (err) {
    next(err);
  }
});

operationsRouter.patch('/clients/:id/problemes/:problemeId', async (req, res, next) => {
  try {
    const scoped = await loadScoped(req, req.params.id);
    if (scoped.error) return res.status(scoped.error).json(scoped.body);
    const probleme = await prisma.problemeOperations.update({
      where: { id: req.params.problemeId },
      data: { resoluLe: new Date() },
    });
    res.json(probleme);
  } catch (err) {
    next(err);
  }
});

/* ---------- Démarrage de contrat ---------- */

// Supprime le suivi des 90 jours en cours -- démarré par erreur, ou à
// reprendre proprement depuis zéro. Efface aussi l'historique des étapes
// déjà cochées : contrairement à une clôture (demarrageCloture, qui
// signale un suivi mené à terme), une annulation ne doit laisser aucune
// trace qu'un futur "Démarrer le suivi" pourrait retrouver toute faite.
// Déclarée avant /demarrage/:cle ci-dessous : sinon Express matcherait
// "annuler" comme une clé d'étape plutôt que d'atteindre cette route.
operationsRouter.post('/clients/:id/demarrage/annuler', async (req, res, next) => {
  try {
    const scoped = await loadScoped(req, req.params.id);
    if (scoped.error) return res.status(scoped.error).json(scoped.body);
    await prisma.$transaction([
      prisma.etapeDemarrageFait.deleteMany({ where: { clientOperationsId: req.params.id } }),
      prisma.clientOperations.update({ where: { id: req.params.id }, data: { demarreLe: null, demarrageCloture: false } }),
    ]);
    res.status(204).end();
  } catch (err) {
    next(err);
  }
});

operationsRouter.post('/clients/:id/demarrage/:cle', async (req, res, next) => {
  try {
    const scoped = await loadScoped(req, req.params.id);
    if (scoped.error) return res.status(scoped.error).json(scoped.body);
    const fait = await prisma.etapeDemarrageFait.upsert({
      where: { clientOperationsId_cle: { clientOperationsId: req.params.id, cle: req.params.cle } },
      create: { clientOperationsId: req.params.id, cle: req.params.cle },
      update: {},
    });
    res.status(201).json(fait);
  } catch (err) {
    next(err);
  }
});

/* ---------- COPIL ---------- */

operationsRouter.post('/clients/:id/copil', async (req, res, next) => {
  try {
    const scoped = await loadScoped(req, req.params.id);
    if (scoped.error) return res.status(scoped.error).json(scoped.body);
    const updated = await prisma.clientOperations.update({ where: { id: req.params.id }, data: { dernierCopil: new Date() } });
    res.json(updated);
  } catch (err) {
    next(err);
  }
});

/* ---------- Résiliation ---------- */

operationsRouter.post('/clients/:id/resiliation', async (req, res, next) => {
  try {
    const scoped = await loadScoped(req, req.params.id);
    if (scoped.error) return res.status(scoped.error).json(scoped.body);
    const { motif, detail, date } = req.body ?? {};
    if (!motif) return res.status(400).json({ error: 'Motif requis' });

    let dateResiliation = new Date();
    if (date) {
      const parsed = new Date(date);
      if (Number.isNaN(parsed.getTime())) return res.status(400).json({ error: 'Date de résiliation invalide' });
      dateResiliation = parsed;
    }

    const updated = await prisma.clientOperations.update({
      where: { id: req.params.id },
      data: {
        resilie: true,
        dateResiliation,
        motifResiliation: motif,
        motifDetail: detail ?? null,
      },
    });
    res.json(updated);
  } catch (err) {
    next(err);
  }
});

operationsRouter.post('/clients/:id/reactiver', async (req, res, next) => {
  try {
    const scoped = await loadScoped(req, req.params.id);
    if (scoped.error) return res.status(scoped.error).json(scoped.body);
    const updated = await prisma.clientOperations.update({
      where: { id: req.params.id },
      data: { resilie: false, dateResiliation: null, motifResiliation: null, motifDetail: null },
    });
    res.json(updated);
  } catch (err) {
    next(err);
  }
});

/* ---------- Campagnes sectorielles ---------- */

// Une campagne visible pour un utilisateur borné à une entité est soit
// spécifique à celle-ci, soit "GROUPE" (transverse) -- jamais une campagne
// de l'autre entité (cahier §7 : portée toujours respectée, même pour un
// objet qui n'est pas lui-même une donnée financière).
function campagneVisible(userEntite: string | null, campagneEntite: string): boolean {
  if (!userEntite) return true;
  return campagneEntite === userEntite || campagneEntite === 'GROUPE';
}

async function ciblesCampagne(campagne: { secteurs: string[]; entite: string }) {
  return prisma.clientOperations.findMany({
    where: {
      resilie: false,
      secteur: { in: campagne.secteurs as any },
      client: campagne.entite === 'GROUPE' ? {} : { entite: campagne.entite },
    },
    include: { client: { select: CLIENT_SELECT } },
  });
}

operationsRouter.get('/campagnes', async (req, res, next) => {
  try {
    const all = await prisma.campagne.findMany({ orderBy: { creeLe: 'desc' }, include: { faits: true } });
    const visibles = all.filter((c) => campagneVisible(req.user!.entite, c.entite));
    const withCibles = await Promise.all(
      visibles.map(async (c) => {
        const cibles = await ciblesCampagne(c);
        return { ...c, ciblesCount: cibles.length, traitesCount: c.faits.length };
      }),
    );
    res.json(withCibles);
  } catch (err) {
    next(err);
  }
});

operationsRouter.post('/campagnes', requireModuleOperations('directrice_operations', 'direction_generale'), async (req, res, next) => {
  try {
    const { nom, objectif, secteurs, entite, echeance } = req.body ?? {};
    if (!nom || !Array.isArray(secteurs) || !secteurs.length || !entite || !echeance) {
      return res.status(400).json({ error: 'nom, secteurs, entite et echeance sont requis' });
    }
    if (entite !== 'GROUPE' && !userCanAccessEntiteOperations(req.user!, entite)) {
      return res.status(403).json({ error: 'Accès refusé — hors du périmètre de votre compte' });
    }
    const campagne = await prisma.campagne.create({
      data: { nom, objectif: objectif || null, secteurs, entite, echeance: new Date(echeance) },
    });
    res.status(201).json(campagne);
  } catch (err) {
    next(err);
  }
});

operationsRouter.get('/campagnes/:id', async (req, res, next) => {
  try {
    const campagne = await prisma.campagne.findUnique({ where: { id: req.params.id }, include: { faits: true } });
    if (!campagne) return res.status(404).json({ error: 'Campagne introuvable' });
    if (!campagneVisible(req.user!.entite, campagne.entite)) {
      return res.status(403).json({ error: 'Accès refusé — hors du périmètre de votre compte' });
    }
    const cibles = await ciblesCampagne(campagne);
    const faitsParClient = new Map(campagne.faits.map((f) => [f.clientOperationsId, f]));
    const cellesAvecStatut = cibles.map((c) => ({
      clientOperationsId: c.id,
      client: c.client,
      traite: faitsParClient.has(c.id),
      fait: faitsParClient.get(c.id) ?? null,
    }));
    res.json({ ...campagne, cibles: cellesAvecStatut });
  } catch (err) {
    next(err);
  }
});

operationsRouter.post('/campagnes/:id/faits', async (req, res, next) => {
  try {
    const campagne = await prisma.campagne.findUnique({ where: { id: req.params.id } });
    if (!campagne) return res.status(404).json({ error: 'Campagne introuvable' });
    if (!campagneVisible(req.user!.entite, campagne.entite)) {
      return res.status(403).json({ error: 'Accès refusé — hors du périmètre de votre compte' });
    }
    const { clientOperationsId, note } = req.body ?? {};
    if (!clientOperationsId) return res.status(400).json({ error: 'clientOperationsId requis' });

    // Cocher un compte enregistre le contact du jour sur sa fiche (cahier §7) :
    // une campagne fait donc progresser la règle des deux mois comme un
    // relevé hebdo le ferait.
    await prisma.$transaction([
      prisma.campagneFait.upsert({
        where: { campagneId_clientOperationsId: { campagneId: campagne.id, clientOperationsId } },
        create: { campagneId: campagne.id, clientOperationsId, note: note || null },
        update: { note: note || null, date: new Date() },
      }),
      prisma.clientOperations.update({ where: { id: clientOperationsId }, data: { dernierContact: new Date() } }),
    ]);
    res.status(201).json({ ok: true });
  } catch (err) {
    next(err);
  }
});

operationsRouter.post('/campagnes/:id/cloturer', requireModuleOperations('directrice_operations', 'direction_generale'), async (req, res, next) => {
  try {
    const campagne = await prisma.campagne.findUnique({ where: { id: req.params.id } });
    if (!campagne) return res.status(404).json({ error: 'Campagne introuvable' });
    if (!campagneVisible(req.user!.entite, campagne.entite)) {
      return res.status(403).json({ error: 'Accès refusé — hors du périmètre de votre compte' });
    }
    const updated = await prisma.campagne.update({ where: { id: req.params.id }, data: { cloturee: true } });
    res.json(updated);
  } catch (err) {
    next(err);
  }
});

/* ---------- COPIL grands comptes ---------- */

operationsRouter.get('/copil', async (req, res, next) => {
  try {
    const entiteFilter = resolveEntiteScopeOperations(req.user!, req.query.entite);
    const rows = await prisma.clientOperations.findMany({
      where: { client: entiteWhereClient(entiteFilter), vip: true, resilie: false, ...chargeDeCompteWhere(req.user!) },
      include: { client: { select: CLIENT_SELECT }, problemes: true },
      orderBy: { dernierCopil: 'asc' },
    });
    const now = new Date();
    const config = await getConfig();
    const etapesParEntite = new Map<string, EtapeDemarrageConfigLike[]>();
    for (const entite of new Set(rows.map((r) => r.client.entite))) {
      etapesParEntite.set(entite, await getEtapesConfig(entite));
    }

    const copil = rows.map((r) => {
      const problemes = r.problemes.map(toProblemeLike);
      const scores = scoresClient(r, etapesParEntite.get(r.client.entite) ?? [], [], config);
      const copilFaitCeMois = !!r.dernierCopil && new Date(r.dernierCopil).getMonth() === now.getMonth() && new Date(r.dernierCopil).getFullYear() === now.getFullYear();
      return {
        id: r.id,
        client: r.client,
        enjeux: r.enjeux,
        dernierCopil: r.dernierCopil,
        copilFaitCeMois,
        problemesOuverts: problemes.filter((p) => !p.resoluLe).length,
        scores,
        tone: couleurScore(scores.global),
      };
    });
    res.json(copil);
  } catch (err) {
    next(err);
  }
});

/* ---------- Résiliations ---------- */

operationsRouter.get('/resiliations', async (req, res, next) => {
  try {
    const entiteFilter = resolveEntiteScopeOperations(req.user!, req.query.entite);
    const rows = await prisma.clientOperations.findMany({
      where: { client: entiteWhereClient(entiteFilter), resilie: true, ...chargeDeCompteWhere(req.user!) },
      include: { client: { select: CLIENT_SELECT } },
      orderBy: { dateResiliation: 'desc' },
    });

    const now = new Date();
    const moisCourant = rows.filter((r) => r.dateResiliation && new Date(r.dateResiliation).getMonth() === now.getMonth() && new Date(r.dateResiliation).getFullYear() === now.getFullYear()).length;

    const histogramme12Mois: { mois: string; nombre: number }[] = [];
    for (let i = 11; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const cle = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      const nombre = rows.filter((r) => r.dateResiliation && `${new Date(r.dateResiliation).getFullYear()}-${String(new Date(r.dateResiliation).getMonth() + 1).padStart(2, '0')}` === cle).length;
      histogramme12Mois.push({ mois: cle, nombre });
    }

    const parMotifMap = new Map<string, number>();
    for (const r of rows) {
      if (!r.motifResiliation) continue;
      parMotifMap.set(r.motifResiliation, (parMotifMap.get(r.motifResiliation) ?? 0) + 1);
    }

    res.json({
      compteurs: { total: rows.length, moisCourant },
      histogramme12Mois,
      parMotif: Array.from(parMotifMap.entries()).map(([motif, nombre]) => ({ motif, nombre })),
      liste: rows,
    });
  } catch (err) {
    next(err);
  }
});

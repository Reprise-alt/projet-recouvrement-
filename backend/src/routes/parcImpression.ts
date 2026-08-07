import { Router } from 'express';
import multer from 'multer';
import * as XLSX from 'xlsx';
import { prisma } from '../db';
import { requireAuth, requireModuleOperations } from '../middleware/auth';
import { loadScoped } from './operations';
import { computeParcSynthese, computeSlaStats } from '../lib/parcImpression';
import { detectArtisFileType, parseBiensArtis, parseEtatVenteArtis, parseInterventionsArtis } from '../lib/parsers/parcArtisImport';
import {
  calculerAlertesParc,
  calculerPeriodeReelle,
  capParModeleAvecAutres,
  capParSiteAvecAutres,
  consommablesParMois,
  consommablesParReference,
  equipementsParModele,
  interventionsParMois,
  interventionsParSite,
  interventionsParType,
  moisDansPlage,
  periodeLabel,
  volumetrieTriee,
} from '../lib/copilRapport';
import { CopilRapportData, generateCopilRapportPptx } from '../lib/copilRapportPptx';
import { fmtDate, fmtDateLong } from '../lib/dates';

// Parc d'impression (gestion de flotte pour les comptes suivis en COPIL) --
// même portée d'accès que le reste d'Opérations (loadScoped applique déjà
// le filtre entité + charge_compte), simplement un domaine de données à
// part parce que ça n'a rien à voir avec le suivi climat/contact.
export const parcImpressionRouter = Router();
parcImpressionRouter.use(requireAuth, requireModuleOperations());

function parsePeriodeRange(query: Record<string, unknown>): { debut: Date | null; fin: Date | null } {
  const debut = typeof query.debut === 'string' && query.debut ? new Date(query.debut) : null;
  const fin = typeof query.fin === 'string' && query.fin ? new Date(query.fin) : null;
  // "fin" est une date de jour (ex. "2026-07-31") -> minuit UTC sans l'heure
  // exclurait toute la dernière journée du filtre "lte" ; on la pousse à la
  // toute fin du jour pour que la journée de fin soit incluse en entier.
  if (fin && !isNaN(fin.getTime())) fin.setUTCHours(23, 59, 59, 999);
  return { debut: debut && !isNaN(debut.getTime()) ? debut : null, fin: fin && !isNaN(fin.getTime()) ? fin : null };
}

/* ---------- Import ARTIS ----------
 * Un seul bouton "Importer depuis ARTIS" côté client : le type de fichier
 * (biensDsSol / ResultatRequete / ResultatEtatVente) est détecté depuis les
 * en-têtes, jamais depuis le nom du fichier. Les colonnes montant des
 * exports ARTIS (Total HT/TTC, PU, Coût MO/Dépl/Pièce/Conso...) ne sont
 * jamais lues par les parsers -- rien à filtrer ici. */

const uploadParc = multer({ storage: multer.memoryStorage(), limits: { fileSize: 25 * 1024 * 1024 } });

parcImpressionRouter.post('/clients/:id/import', uploadParc.single('fichier'), async (req, res, next) => {
  try {
    const scoped = await loadScoped(req, req.params.id);
    if (scoped.error) return res.status(scoped.error).json(scoped.body);
    if (!req.file) return res.status(400).json({ error: 'Fichier requis' });

    const clientOperationsId = req.params.id;
    const wb = XLSX.read(req.file.buffer, { type: 'buffer', cellDates: true });
    const type = detectArtisFileType(wb);

    if (type === 'biens') {
      const rows = parseBiensArtis(wb, scoped.co.client.nom);
      for (const r of rows) {
        await prisma.equipementParc.upsert({
          where: { clientOperationsId_numeroSerie: { clientOperationsId, numeroSerie: r.numeroSerie } },
          create: { clientOperationsId, site: r.site, modele: r.modele, numeroSerie: r.numeroSerie },
          update: { site: r.site, modele: r.modele },
        });
      }
      return res.json({ type, traites: rows.length });
    }

    if (type === 'interventions') {
      const rows = parseInterventionsArtis(wb);
      const equipements = await prisma.equipementParc.findMany({
        where: { clientOperationsId },
        select: { id: true, numeroSerie: true },
      });
      const equipementIdParNumeroSerie = new Map(equipements.map((e) => [e.numeroSerie, e.id]));
      for (const r of rows) {
        const equipementId = r.numeroSerieEquipement ? equipementIdParNumeroSerie.get(r.numeroSerieEquipement) ?? null : null;
        await prisma.intervention.upsert({
          where: { clientOperationsId_referenceExterne: { clientOperationsId, referenceExterne: r.referenceExterne } },
          create: {
            clientOperationsId,
            referenceExterne: r.referenceExterne,
            site: r.site,
            type: r.type,
            urgence: r.urgence,
            equipementId,
            dateDeclaration: r.dateDeclaration,
            datePriseEnCharge: r.datePriseEnCharge,
            dateCloture: r.dateCloture,
          },
          update: {
            site: r.site,
            type: r.type,
            urgence: r.urgence,
            equipementId,
            datePriseEnCharge: r.datePriseEnCharge,
            dateCloture: r.dateCloture,
          },
        });
      }
      return res.json({ type, traites: rows.length });
    }

    if (type === 'etatvente') {
      const { consommables, volumetrie, volumetrieParMachine } = parseEtatVenteArtis(wb);
      // createMany + skipDuplicates plutôt qu'une boucle findUnique/create :
      // un vrai export ARTIS peut dépasser 2000 lignes de livraison (constaté
      // sur un export réel), et la boucle séquentielle mettait plus de 10s à
      // s'exécuter -- un aller-retour DB au lieu de deux par ligne.
      let consommablesCrees = 0;
      if (consommables.length > 0) {
        const resultat = await prisma.livraisonConsommable.createMany({
          data: consommables.map((r) => ({ clientOperationsId, referenceExterne: r.referenceExterne, date: r.date, reference: r.reference, quantite: r.quantite })),
          skipDuplicates: true,
        });
        consommablesCrees = resultat.count;
      }
      for (const v of volumetrie) {
        await prisma.releveVolumetrie.upsert({
          where: { clientOperationsId_periode: { clientOperationsId, periode: v.periode } },
          create: { clientOperationsId, periode: v.periode, copiesNB: v.copiesNB, copiesCouleur: v.copiesCouleur },
          update: { copiesNB: v.copiesNB, copiesCouleur: v.copiesCouleur },
        });
      }

      // Volumétrie par machine (alertes du rapport COPIL) -- seules les
      // machines déjà connues au parc (importées depuis biensDsSol) peuvent
      // être rattachées ; le n° de série "Bien facturé" d'une machine non
      // encore importée est silencieusement ignoré, pas créé à la volée.
      let machinesTraitees = 0;
      if (volumetrieParMachine.length > 0) {
        const equipements = await prisma.equipementParc.findMany({ where: { clientOperationsId }, select: { id: true, numeroSerie: true } });
        const equipementIdParNumeroSerie = new Map(equipements.map((e) => [e.numeroSerie, e.id]));
        for (const v of volumetrieParMachine) {
          const equipementId = equipementIdParNumeroSerie.get(v.numeroSerie);
          if (!equipementId) continue;
          await prisma.volumetrieEquipement.upsert({
            where: { equipementId_periode: { equipementId, periode: v.periode } },
            create: { equipementId, periode: v.periode, copiesNB: v.copiesNB, copiesCouleur: v.copiesCouleur },
            update: { copiesNB: v.copiesNB, copiesCouleur: v.copiesCouleur },
          });
          machinesTraitees++;
        }
      }

      return res.json({ type, consommablesTraites: consommablesCrees, periodesVolumetrie: volumetrie.length, machinesTraitees });
    }

    return res.status(400).json({ error: 'Format de fichier ARTIS non reconnu' });
  } catch (err) {
    next(err);
  }
});

// Un import ARTIS ne fait qu'ajouter/mettre à jour (createMany skipDuplicates,
// upsert) -- si un fichier a été importé avec un bug déjà corrigé depuis
// (cf. le tri consommables/volumétrie sur la famille d'article plutôt que
// sur Origine), les lignes erronées restent en base et un ré-import ne les
// retire pas puisque les lignes correctes existent déjà sous la même
// référence. Ce endpoint vide les données importées du compte pour repartir
// d'une base propre avant un ré-import complet -- jamais le plan d'action,
// saisi à la main, pas dérivé d'un import.
parcImpressionRouter.post('/clients/:id/reinitialiser', async (req, res, next) => {
  try {
    const scoped = await loadScoped(req, req.params.id);
    if (scoped.error) return res.status(scoped.error).json(scoped.body);
    const clientOperationsId = req.params.id;

    const [interventions, consommables, volumetrie, equipements] = await Promise.all([
      prisma.intervention.deleteMany({ where: { clientOperationsId } }),
      prisma.livraisonConsommable.deleteMany({ where: { clientOperationsId } }),
      prisma.releveVolumetrie.deleteMany({ where: { clientOperationsId } }),
      prisma.equipementParc.deleteMany({ where: { clientOperationsId } }), // supprime aussi VolumetrieEquipement en cascade
    ]);

    res.json({
      equipementsSupprimes: equipements.count,
      interventionsSupprimees: interventions.count,
      volumetrieSupprimee: volumetrie.count,
      consommablesSupprimes: consommables.count,
    });
  } catch (err) {
    next(err);
  }
});

/* ---------- Synthèse (diapo "vue d'ensemble" du COPIL) ---------- */

parcImpressionRouter.get('/clients/:id/synthese', async (req, res, next) => {
  try {
    const scoped = await loadScoped(req, req.params.id);
    if (scoped.error) return res.status(scoped.error).json(scoped.body);
    const { debut, fin } = parsePeriodeRange(req.query as Record<string, unknown>);
    const dateFilter = debut || fin ? { gte: debut ?? undefined, lte: fin ?? undefined } : undefined;

    const [equipements, interventions, volumetrie, livraisons] = await Promise.all([
      prisma.equipementParc.findMany({ where: { clientOperationsId: req.params.id } }),
      prisma.intervention.findMany({ where: { clientOperationsId: req.params.id, ...(dateFilter ? { dateDeclaration: dateFilter } : {}) } }),
      prisma.releveVolumetrie.findMany({ where: { clientOperationsId: req.params.id } }),
      prisma.livraisonConsommable.findMany({ where: { clientOperationsId: req.params.id, ...(dateFilter ? { date: dateFilter } : {}) } }),
    ]);

    res.json(computeParcSynthese(equipements, interventions, volumetrie, livraisons));
  } catch (err) {
    next(err);
  }
});

/* ---------- Rapport COPIL (PPTX) ----------
 * Repeuple le gabarit visuel COPIL SORAM (déjà présenté et validé par les
 * clients) avec les données réelles du compte -- aucun champ montant n'entre
 * dans CopilRapportData, structurellement impossible puisque le schéma
 * source n'en a pas. */

const STATUT_ACTION_LABELS_FR: Record<string, string> = { planifie: 'Planifié', en_cours: 'En cours', fait: 'Fait', bloque: 'Bloqué' };

parcImpressionRouter.get('/clients/:id/rapport-copil.pptx', async (req, res, next) => {
  try {
    const scoped = await loadScoped(req, req.params.id);
    if (scoped.error) return res.status(scoped.error).json(scoped.body);
    const clientOperationsId = req.params.id;
    const { debut, fin } = parsePeriodeRange(req.query as Record<string, unknown>);
    const dateFilter = debut || fin ? { gte: debut ?? undefined, lte: fin ?? undefined } : undefined;

    const [equipements, interventions, volumetrie, livraisons, actions, entreprise, chargeDeCompte, volumetrieEquipement] = await Promise.all([
      prisma.equipementParc.findMany({ where: { clientOperationsId } }),
      prisma.intervention.findMany({ where: { clientOperationsId, ...(dateFilter ? { dateDeclaration: dateFilter } : {}) } }),
      prisma.releveVolumetrie.findMany({ where: { clientOperationsId } }),
      prisma.livraisonConsommable.findMany({ where: { clientOperationsId, ...(dateFilter ? { date: dateFilter } : {}) } }),
      prisma.actionCopil.findMany({ where: { clientOperationsId }, orderBy: [{ priorite: 'asc' }, { createdAt: 'asc' }] }),
      prisma.entreprise.findUnique({ where: { code: scoped.co.client.entite } }),
      scoped.co.chargeDeCompteId ? prisma.utilisateur.findUnique({ where: { id: scoped.co.chargeDeCompteId } }) : Promise.resolve(null),
      // Compteur total volontairement non filtré par période -- c'est un
      // cumul de vie de la machine, pas un indicateur de la fenêtre affichée.
      prisma.volumetrieEquipement.findMany({ where: { equipement: { clientOperationsId } } }),
    ]);

    // ReleveVolumetrie/VolumetrieEquipement sont identifiés par période
    // ("AAAA-MM"), pas par une date ponctuelle -- debut/fin ne peuvent donc
    // pas passer par un simple filtre Prisma comme pour les interventions et
    // livraisons ; on filtre en mémoire sur la liste des mois couverts.
    const moisFiltre = debut && fin ? moisDansPlage(debut, fin) : null;
    const volumetrieFiltree = moisFiltre ? volumetrie.filter((v) => moisFiltre.includes(v.periode)) : volumetrie;
    const volumetrieEquipementFiltre = moisFiltre ? volumetrieEquipement.filter((v) => moisFiltre.includes(v.periode)) : volumetrieEquipement;

    const synthese = computeParcSynthese(equipements, interventions, volumetrieFiltree, livraisons);
    const sla = computeSlaStats(interventions);
    const volTriee = volumetrieTriee(volumetrieFiltree);
    // Compteur total (2e argument) volontairement non filtré -- cumul de vie
    // de la machine, jamais limité au mois/à la plage choisie pour le rapport.
    const alertes = calculerAlertesParc(equipements, interventions, volumetrieEquipementFiltre, volumetrieEquipement);
    const parSiteBrut = interventionsParSite(interventions);

    const periodeAffichee =
      moisFiltre && moisFiltre.length === 1
        ? periodeLabel(moisFiltre[0])
        : debut && fin
          ? `${fmtDateLong(debut)} au ${fmtDateLong(fin)}`
          : (calculerPeriodeReelle(
              [...interventions.map((i) => i.dateDeclaration), ...livraisons.map((l) => l.date)],
              volumetrie.map((v) => v.periode)
            ) ?? 'Aucune donnée importée');

    const data: CopilRapportData = {
      clientNom: scoped.co.client.nom,
      entiteLabel: entreprise?.nom ?? scoped.co.client.entite,
      periodeLabel: periodeAffichee,
      dateGenerationLabel: fmtDateLong(new Date()),
      prochainCopilLabel: null,
      contact: { nom: chargeDeCompte?.nom ?? null, email: chargeDeCompte?.email ?? null, tel: null },

      equipementsActifs: synthese.equipementsActifs,
      equipementsIntrouvables: synthese.equipementsIntrouvables,
      parModele: capParModeleAvecAutres(equipementsParModele(equipements)),

      interventionsTotal: synthese.interventionsTotal,
      interventionsPreventives: synthese.interventionsPreventives,
      sla,
      parSite: capParSiteAvecAutres(parSiteBrut),
      parMoisInterventions: interventionsParMois(interventions),
      parType: interventionsParType(interventions),

      volumetriePeriodes: volTriee.map((v) => ({ periodeLabel: periodeLabel(v.periode), copiesNB: v.copiesNB, copiesCouleur: v.copiesCouleur })),
      copiesNBTotal: synthese.copiesNBTotal,
      copiesCouleurTotal: synthese.copiesCouleurTotal,

      consommablesLivres: synthese.consommablesLivres,
      referencesDifferentes: new Set(livraisons.map((l) => l.reference)).size,
      parReference: consommablesParReference(livraisons),
      parMoisConsommables: consommablesParMois(livraisons),

      actions: actions.map((a) => ({
        priorite: a.priorite,
        action: a.action,
        responsable: a.responsable,
        echeance: a.echeance ? fmtDate(a.echeance) : null,
        statut: STATUT_ACTION_LABELS_FR[a.statut] ?? a.statut,
      })),

      alertesVolumetrieMensuelle: alertes.volumetrieMensuelle,
      alertesCompteurTotal: alertes.compteurTotal,
      alertesInterventionsFrequentes: alertes.interventionsFrequentes,
      sitesTopInterventions: alertes.sitesTop,
    };

    const buffer = await generateCopilRapportPptx(data);
    const nomFichier = `COPIL_${scoped.co.client.nom.replace(/[^a-zA-Z0-9]+/g, '_')}.pptx`;
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.presentationml.presentation');
    res.setHeader('Content-Disposition', `attachment; filename="${nomFichier}"`);
    res.send(buffer);
  } catch (err) {
    next(err);
  }
});

/* ---------- Alertes (onglet dédié dans la modale, même calcul que le rapport) ---------- */

parcImpressionRouter.get('/clients/:id/alertes', async (req, res, next) => {
  try {
    const scoped = await loadScoped(req, req.params.id);
    if (scoped.error) return res.status(scoped.error).json(scoped.body);
    const clientOperationsId = req.params.id;

    const [equipements, interventions, volumetrieEquipement] = await Promise.all([
      prisma.equipementParc.findMany({ where: { clientOperationsId } }),
      prisma.intervention.findMany({ where: { clientOperationsId } }),
      prisma.volumetrieEquipement.findMany({ where: { equipement: { clientOperationsId } } }),
    ]);

    res.json(calculerAlertesParc(equipements, interventions, volumetrieEquipement));
  } catch (err) {
    next(err);
  }
});

/* ---------- Équipements ---------- */

parcImpressionRouter.get('/clients/:id/equipements', async (req, res, next) => {
  try {
    const scoped = await loadScoped(req, req.params.id);
    if (scoped.error) return res.status(scoped.error).json(scoped.body);
    const equipements = await prisma.equipementParc.findMany({
      where: { clientOperationsId: req.params.id },
      orderBy: [{ site: 'asc' }, { modele: 'asc' }],
    });
    res.json(equipements);
  } catch (err) {
    next(err);
  }
});

parcImpressionRouter.post('/clients/:id/equipements', async (req, res, next) => {
  try {
    const scoped = await loadScoped(req, req.params.id);
    if (scoped.error) return res.status(scoped.error).json(scoped.body);
    const { site, modele, numeroSerie, dateInstallation } = req.body ?? {};
    if (!site || !modele || !numeroSerie) return res.status(400).json({ error: 'Site, modèle et numéro de série requis' });
    const equipement = await prisma.equipementParc.create({
      data: {
        clientOperationsId: req.params.id,
        site: String(site).trim(),
        modele: String(modele).trim(),
        numeroSerie: String(numeroSerie).trim(),
        dateInstallation: dateInstallation ? new Date(dateInstallation) : null,
      },
    });
    res.status(201).json(equipement);
  } catch (err) {
    next(err);
  }
});

parcImpressionRouter.patch('/equipements/:eqId', async (req, res, next) => {
  try {
    const equipement = await prisma.equipementParc.findUnique({ where: { id: req.params.eqId } });
    if (!equipement) return res.status(404).json({ error: 'Équipement introuvable' });
    const scoped = await loadScoped(req, equipement.clientOperationsId);
    if (scoped.error) return res.status(scoped.error).json(scoped.body);
    const { statut, site } = req.body ?? {};
    const data: Record<string, unknown> = {};
    if (statut === 'actif' || statut === 'retire' || statut === 'introuvable') data.statut = statut;
    if (typeof site === 'string' && site.trim()) data.site = site.trim();
    const updated = await prisma.equipementParc.update({ where: { id: req.params.eqId }, data });
    res.json(updated);
  } catch (err) {
    next(err);
  }
});

/* ---------- Interventions ---------- */

parcImpressionRouter.get('/clients/:id/interventions', async (req, res, next) => {
  try {
    const scoped = await loadScoped(req, req.params.id);
    if (scoped.error) return res.status(scoped.error).json(scoped.body);
    const interventions = await prisma.intervention.findMany({
      where: { clientOperationsId: req.params.id },
      orderBy: { dateDeclaration: 'desc' },
    });
    res.json({ interventions, sla: computeSlaStats(interventions) });
  } catch (err) {
    next(err);
  }
});

parcImpressionRouter.post('/clients/:id/interventions', async (req, res, next) => {
  try {
    const scoped = await loadScoped(req, req.params.id);
    if (scoped.error) return res.status(scoped.error).json(scoped.body);
    const { site, type, urgence, panne, equipementId, dateDeclaration, datePriseEnCharge, dateCloture } = req.body ?? {};
    if (!site || !dateDeclaration) return res.status(400).json({ error: 'Site et date de déclaration requis' });
    const intervention = await prisma.intervention.create({
      data: {
        clientOperationsId: req.params.id,
        site: String(site).trim(),
        type: type === 'preventive' ? 'preventive' : 'curative',
        urgence: urgence === 'urgente' ? 'urgente' : 'standard',
        panne: typeof panne === 'string' && panne.trim() ? panne.trim() : null,
        equipementId: equipementId || null,
        dateDeclaration: new Date(dateDeclaration),
        datePriseEnCharge: datePriseEnCharge ? new Date(datePriseEnCharge) : null,
        dateCloture: dateCloture ? new Date(dateCloture) : null,
      },
    });
    res.status(201).json(intervention);
  } catch (err) {
    next(err);
  }
});

parcImpressionRouter.patch('/interventions/:intId', async (req, res, next) => {
  try {
    const intervention = await prisma.intervention.findUnique({ where: { id: req.params.intId } });
    if (!intervention) return res.status(404).json({ error: 'Intervention introuvable' });
    const scoped = await loadScoped(req, intervention.clientOperationsId);
    if (scoped.error) return res.status(scoped.error).json(scoped.body);
    const { datePriseEnCharge, dateCloture } = req.body ?? {};
    const data: Record<string, unknown> = {};
    if (datePriseEnCharge !== undefined) data.datePriseEnCharge = datePriseEnCharge ? new Date(datePriseEnCharge) : null;
    if (dateCloture !== undefined) data.dateCloture = dateCloture ? new Date(dateCloture) : null;
    const updated = await prisma.intervention.update({ where: { id: req.params.intId }, data });
    res.json(updated);
  } catch (err) {
    next(err);
  }
});

/* ---------- Volumétrie ---------- */

parcImpressionRouter.get('/clients/:id/volumetrie', async (req, res, next) => {
  try {
    const scoped = await loadScoped(req, req.params.id);
    if (scoped.error) return res.status(scoped.error).json(scoped.body);
    const releves = await prisma.releveVolumetrie.findMany({ where: { clientOperationsId: req.params.id }, orderBy: { periode: 'desc' } });
    res.json(releves);
  } catch (err) {
    next(err);
  }
});

// Une ligne par période -- un second envoi pour le même mois corrige la
// valeur plutôt que d'empiler une ligne en double (cf. @@unique du schéma).
parcImpressionRouter.post('/clients/:id/volumetrie', async (req, res, next) => {
  try {
    const scoped = await loadScoped(req, req.params.id);
    if (scoped.error) return res.status(scoped.error).json(scoped.body);
    const { periode, copiesNB, copiesCouleur } = req.body ?? {};
    if (!periode || !/^\d{4}-\d{2}$/.test(periode)) return res.status(400).json({ error: 'Période invalide (format AAAA-MM)' });
    const releve = await prisma.releveVolumetrie.upsert({
      where: { clientOperationsId_periode: { clientOperationsId: req.params.id, periode } },
      create: { clientOperationsId: req.params.id, periode, copiesNB: Number(copiesNB) || 0, copiesCouleur: Number(copiesCouleur) || 0 },
      update: { copiesNB: Number(copiesNB) || 0, copiesCouleur: Number(copiesCouleur) || 0 },
    });
    res.status(201).json(releve);
  } catch (err) {
    next(err);
  }
});

/* ---------- Consommables ---------- */

parcImpressionRouter.get('/clients/:id/consommables', async (req, res, next) => {
  try {
    const scoped = await loadScoped(req, req.params.id);
    if (scoped.error) return res.status(scoped.error).json(scoped.body);
    const livraisons = await prisma.livraisonConsommable.findMany({ where: { clientOperationsId: req.params.id }, orderBy: { date: 'desc' } });
    res.json(livraisons);
  } catch (err) {
    next(err);
  }
});

parcImpressionRouter.post('/clients/:id/consommables', async (req, res, next) => {
  try {
    const scoped = await loadScoped(req, req.params.id);
    if (scoped.error) return res.status(scoped.error).json(scoped.body);
    const { date, reference, quantite } = req.body ?? {};
    if (!date || !reference) return res.status(400).json({ error: 'Date et référence requises' });
    const livraison = await prisma.livraisonConsommable.create({
      data: { clientOperationsId: req.params.id, date: new Date(date), reference: String(reference).trim(), quantite: Number(quantite) || 1 },
    });
    res.status(201).json(livraison);
  } catch (err) {
    next(err);
  }
});

/* ---------- Plan d'action COPIL ---------- */

parcImpressionRouter.get('/clients/:id/actions', async (req, res, next) => {
  try {
    const scoped = await loadScoped(req, req.params.id);
    if (scoped.error) return res.status(scoped.error).json(scoped.body);
    const actions = await prisma.actionCopil.findMany({
      where: { clientOperationsId: req.params.id },
      orderBy: [{ priorite: 'asc' }, { createdAt: 'asc' }],
    });
    res.json(actions);
  } catch (err) {
    next(err);
  }
});

parcImpressionRouter.post('/clients/:id/actions', async (req, res, next) => {
  try {
    const scoped = await loadScoped(req, req.params.id);
    if (scoped.error) return res.status(scoped.error).json(scoped.body);
    const { priorite, action, responsable, echeance } = req.body ?? {};
    if (!action || !String(action).trim()) return res.status(400).json({ error: 'Action requise' });
    const created = await prisma.actionCopil.create({
      data: {
        clientOperationsId: req.params.id,
        priorite: ['p1', 'p2', 'p3'].includes(priorite) ? priorite : 'p2',
        action: String(action).trim(),
        responsable: typeof responsable === 'string' && responsable.trim() ? responsable.trim() : null,
        echeance: echeance ? new Date(echeance) : null,
      },
    });
    res.status(201).json(created);
  } catch (err) {
    next(err);
  }
});

parcImpressionRouter.patch('/actions/:actionId', async (req, res, next) => {
  try {
    const action = await prisma.actionCopil.findUnique({ where: { id: req.params.actionId } });
    if (!action) return res.status(404).json({ error: 'Action introuvable' });
    const scoped = await loadScoped(req, action.clientOperationsId);
    if (scoped.error) return res.status(scoped.error).json(scoped.body);
    const { statut } = req.body ?? {};
    if (!['planifie', 'en_cours', 'fait', 'bloque'].includes(statut)) return res.status(400).json({ error: 'Statut invalide' });
    const updated = await prisma.actionCopil.update({ where: { id: req.params.actionId }, data: { statut } });
    res.json(updated);
  } catch (err) {
    next(err);
  }
});

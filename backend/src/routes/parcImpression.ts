import { Router } from 'express';
import multer from 'multer';
import * as XLSX from 'xlsx';
import { prisma } from '../db';
import { requireAuth, requireModuleOperations } from '../middleware/auth';
import { loadScoped } from './operations';
import { computeParcSynthese, computeSlaStats } from '../lib/parcImpression';
import { detectArtisFileType, parseBiensArtis, parseEtatVenteArtis, parseInterventionsArtis } from '../lib/parsers/parcArtisImport';

// Parc d'impression (gestion de flotte pour les comptes suivis en COPIL) --
// même portée d'accès que le reste d'Opérations (loadScoped applique déjà
// le filtre entité + charge_compte), simplement un domaine de données à
// part parce que ça n'a rien à voir avec le suivi climat/contact.
export const parcImpressionRouter = Router();
parcImpressionRouter.use(requireAuth, requireModuleOperations());

function parsePeriodeRange(query: Record<string, unknown>): { debut: Date | null; fin: Date | null } {
  const debut = typeof query.debut === 'string' && query.debut ? new Date(query.debut) : null;
  const fin = typeof query.fin === 'string' && query.fin ? new Date(query.fin) : null;
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
      const { consommables, volumetrie } = parseEtatVenteArtis(wb);
      let consommablesCrees = 0;
      for (const r of consommables) {
        const existant = await prisma.livraisonConsommable.findUnique({
          where: { clientOperationsId_referenceExterne: { clientOperationsId, referenceExterne: r.referenceExterne } },
        });
        if (existant) continue;
        await prisma.livraisonConsommable.create({
          data: { clientOperationsId, referenceExterne: r.referenceExterne, date: r.date, reference: r.reference, quantite: r.quantite },
        });
        consommablesCrees++;
      }
      for (const v of volumetrie) {
        await prisma.releveVolumetrie.upsert({
          where: { clientOperationsId_periode: { clientOperationsId, periode: v.periode } },
          create: { clientOperationsId, periode: v.periode, copiesNB: v.copiesNB, copiesCouleur: v.copiesCouleur },
          update: { copiesNB: v.copiesNB, copiesCouleur: v.copiesCouleur },
        });
      }
      return res.json({ type, consommablesTraites: consommablesCrees, periodesVolumetrie: volumetrie.length });
    }

    return res.status(400).json({ error: 'Format de fichier ARTIS non reconnu' });
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

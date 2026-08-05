import { Router } from 'express';
import { prisma } from '../db';
import { contractAlertLevel, contractEcheance, montantProjete, nextAnniversary } from '../lib/contracts';
import { generateContractDoc } from '../lib/letters';
import { Entite, resolveEntiteScope } from '../lib/entites';
import { assertEntiteInScope, requireAuth, requireRole } from '../middleware/auth';

export const contractsRouter = Router();
contractsRouter.use(requireAuth);

function entiteWhere(entiteFilter: Entite | 'ALL') {
  if (entiteFilter === 'ALL') return {};
  return { OR: [{ entite: entiteFilter as any }, { entite: 'COMMUN' as any }] };
}

contractsRouter.get('/kpis', async (req, res, next) => {
  try {
    const entiteFilter = resolveEntiteScope(req.user!, req.query.entite);
    const clients = await prisma.client.findMany({
      where: entiteWhere(entiteFilter),
      include: { contrats: { include: { envois: true } } },
    });
    const rows = clients.flatMap((c) => c.contrats.map((contrat) => ({ client: c, contrat })));

    const sous90 = rows.filter((r) => {
      const l = contractAlertLevel(r.contrat);
      return l >= 2 && l < 5;
    });
    const echus = rows.filter((r) => contractAlertLevel(r.contrat) === 5);
    const envoisEnvoyes = rows.reduce((s, r) => s + r.contrat.envois.length, 0);

    res.json({ sous90: sous90.length, echus: echus.length, envoisEnvoyes, contratsSuivis: rows.length });
  } catch (err) {
    next(err);
  }
});

contractsRouter.get('/', async (req, res, next) => {
  try {
    const entiteFilter = resolveEntiteScope(req.user!, req.query.entite);
    const clients = await prisma.client.findMany({ where: entiteWhere(entiteFilter), include: { contrats: true } });

    const rows = clients.flatMap((c) =>
      c.contrats.map((contrat) => {
        const e = contractEcheance(contrat);
        return {
          contratId: contrat.id,
          clientId: c.id,
          clientNom: c.nom,
          entite: c.entite,
          numero: contrat.numero,
          type: contrat.type,
          tacite: contrat.tacite,
          echeanceType: e.type,
          echeanceDate: e.date,
          joursRestants: e.jours,
          alertLevel: contractAlertLevel(contrat),
        };
      }),
    );
    rows.sort((a, b) => a.joursRestants - b.joursRestants);

    res.json(rows);
  } catch (err) {
    next(err);
  }
});

contractsRouter.get('/:id', async (req, res, next) => {
  try {
    const contrat = await prisma.contrat.findUnique({
      where: { id: req.params.id },
      include: { client: true, envois: { orderBy: { date: 'desc' } } },
    });
    if (!contrat) return res.status(404).json({ error: 'Contrat introuvable' });
    if (!assertEntiteInScope(req, res, contrat.client.entite as Entite)) return;

    const e = contractEcheance(contrat);
    const montantApresRevision =
      contrat.montantActuel != null && contrat.tauxAugmentation != null
        ? montantProjete(contrat.montantActuel, contrat.tauxAugmentation)
        : null;
    // Toujours calculée quand un taux est configuré, indépendamment de si
    // c'est l'échéance la plus proche (contrairement à `echeance`, qui ne
    // retient que celle des deux -- fin de contrat ou révision -- la plus
    // urgente) : sert d'affichage dédié pour la tarification, pas d'alerte.
    const prochaineRevision = contrat.tauxAugmentation != null ? nextAnniversary(contrat.dateDerniereRevision ?? contrat.dateDebut) : null;
    res.json({ ...contrat, echeance: e, alertLevel: contractAlertLevel(contrat), montantApresRevision, prochaineRevision });
  } catch (err) {
    next(err);
  }
});

// Active ou met à jour l'augmentation tarifaire automatique d'un contrat.
// Au premier réglage (dateDerniereRevision pas encore fixée), on l'ancre sur
// dateDebut pour que la date anniversaire se calcule dès la prochaine
// occurrence de la date de signature -- pas sur "aujourd'hui".
contractsRouter.patch('/:id/tarification', requireRole('admin', 'manager_entite'), async (req, res, next) => {
  try {
    const contrat = await prisma.contrat.findUnique({ where: { id: req.params.id }, include: { client: true } });
    if (!contrat) return res.status(404).json({ error: 'Contrat introuvable' });
    if (!assertEntiteInScope(req, res, contrat.client.entite as Entite)) return;

    const { montantActuel, tauxAugmentation } = req.body ?? {};
    if (montantActuel == null || isNaN(Number(montantActuel)) || Number(montantActuel) < 0) {
      return res.status(400).json({ error: 'Montant invalide' });
    }
    if (tauxAugmentation == null || isNaN(Number(tauxAugmentation))) {
      return res.status(400).json({ error: 'Taux invalide' });
    }

    const updated = await prisma.contrat.update({
      where: { id: req.params.id },
      data: {
        montantActuel: Number(montantActuel),
        tauxAugmentation: Number(tauxAugmentation),
        dateDerniereRevision: contrat.dateDerniereRevision ?? contrat.dateDebut,
      },
    });
    res.json(updated);
  } catch (err) {
    next(err);
  }
});

// Applique la révision due : fait passer le montant au montant projeté
// (composé sur le montant en vigueur) et avance l'ancre sur la date
// anniversaire qui vient d'échoir -- pas sur "aujourd'hui", pour que le
// cycle reste calé sur la vraie date anniversaire même si le geste est fait
// avec quelques jours de retard.
contractsRouter.post('/:id/appliquer-revision', requireRole('admin', 'manager_entite'), async (req, res, next) => {
  try {
    const contrat = await prisma.contrat.findUnique({ where: { id: req.params.id }, include: { client: true } });
    if (!contrat) return res.status(404).json({ error: 'Contrat introuvable' });
    if (!assertEntiteInScope(req, res, contrat.client.entite as Entite)) return;
    if (contrat.montantActuel == null || contrat.tauxAugmentation == null) {
      return res.status(400).json({ error: "Aucune augmentation tarifaire configurée sur ce contrat" });
    }

    const echeanceEnCours = nextAnniversary(contrat.dateDerniereRevision ?? contrat.dateDebut);
    const updated = await prisma.contrat.update({
      where: { id: req.params.id },
      data: {
        montantActuel: montantProjete(contrat.montantActuel, contrat.tauxAugmentation),
        dateDerniereRevision: echeanceEnCours,
      },
    });
    res.json(updated);
  } catch (err) {
    next(err);
  }
});

contractsRouter.get('/:id/document', requireRole('admin', 'manager_entite'), async (req, res, next) => {
  try {
    const contrat = await prisma.contrat.findUnique({ where: { id: req.params.id }, include: { client: true } });
    if (!contrat) return res.status(404).json({ error: 'Contrat introuvable' });
    if (!assertEntiteInScope(req, res, contrat.client.entite as Entite)) return;

    const doc = generateContractDoc(
      { nom: contrat.client.nom, entite: contrat.client.entite as any, contact: contrat.client.contact ?? '' },
      contrat,
    );
    res.json(doc);
  } catch (err) {
    next(err);
  }
});

contractsRouter.post('/:id/envois', requireRole('admin', 'manager_entite'), async (req, res, next) => {
  try {
    const contrat = await prisma.contrat.findUnique({ where: { id: req.params.id }, include: { client: true } });
    if (!contrat) return res.status(404).json({ error: 'Contrat introuvable' });
    if (!assertEntiteInScope(req, res, contrat.client.entite as Entite)) return;

    const { label, destinataire, sujet, corps, statutEnvoi } = req.body ?? {};
    if (!label) return res.status(400).json({ error: 'Label requis' });

    const envoi = await prisma.envoiContrat.create({
      data: { contratId: req.params.id, label, destinataire, sujet, corps, statutEnvoi },
    });
    res.status(201).json(envoi);
  } catch (err) {
    next(err);
  }
});

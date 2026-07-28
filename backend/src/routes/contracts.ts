import { Router } from 'express';
import { prisma } from '../db';
import { contractAlertLevel, contractEcheance } from '../lib/contracts';
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
    res.json({ ...contrat, echeance: e, alertLevel: contractAlertLevel(contrat) });
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

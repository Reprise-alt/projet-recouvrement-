import { Router } from 'express';
import { prisma } from '../db';
import { requireAuth, requireAccesRecouvrement, requireRole } from '../middleware/auth';
import { requireAbonnementActif } from '../middleware/abonnement';
import { tenantScope } from '../middleware/tenant';
import { verifierTokenCheque } from '../lib/authToken';
import { mentionsLegales } from '../lib/actes/mentionsLegales';

// ── Public : déclaration « chèque disponible » par le débiteur ──────────────
// Accès par un jeton signé, sans authentification. Le débiteur signale qu'un
// chèque est prêt ; on crée (ou met à jour) une alerte pour l'organisation.
export const chequePublicRouter = Router();

function num(v: unknown): number | null {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? Math.round(n) : null;
}

chequePublicRouter.get('/:token', async (req, res, next) => {
  try {
    const t = verifierTokenCheque(req.params.token);
    if (!t) return res.status(404).json({ error: 'Lien invalide ou expiré.' });
    const client = await prisma.client.findFirst({
      where: { id: t.clientId, organisationId: t.org },
      select: { nom: true, entite: true },
    });
    if (!client) return res.status(404).json({ error: 'Lien invalide.' });
    const org = await prisma.organisation.findUnique({ where: { id: t.org }, select: { raisonSociale: true } });
    res.json({
      clientNom: client.nom,
      creancierNom: org?.raisonSociale || mentionsLegales(client.entite)?.nom || client.entite,
    });
  } catch (err) {
    next(err);
  }
});

chequePublicRouter.post('/:token/declarer', async (req, res, next) => {
  try {
    const t = verifierTokenCheque(req.params.token);
    if (!t) return res.status(404).json({ error: 'Lien invalide ou expiré.' });
    const client = await prisma.client.findFirst({ where: { id: t.clientId, organisationId: t.org }, select: { id: true } });
    if (!client) return res.status(404).json({ error: 'Lien invalide.' });

    const montantEstime = num(req.body?.montantEstime);
    const message = String(req.body?.message ?? '').trim().slice(0, 500) || null;

    // Évite les doublons : on met à jour l'alerte « nouvelle » existante s'il y en a.
    const existante = await prisma.alerteCheque.findFirst({
      where: { organisationId: t.org, clientId: t.clientId, statut: 'nouvelle' },
      select: { id: true },
    });
    if (existante) {
      await prisma.alerteCheque.update({ where: { id: existante.id }, data: { montantEstime, message, createdAt: new Date() } });
    } else {
      await prisma.alerteCheque.create({ data: { organisationId: t.org, clientId: t.clientId, montantEstime, message } });
    }
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

// ── Authentifié : alertes chèque pour l'agent ───────────────────────────────
export const chequesRouter = Router();
chequesRouter.use(requireAuth, requireAbonnementActif, requireAccesRecouvrement, tenantScope);

chequesRouter.get('/alertes', async (req, res, next) => {
  try {
    const statut = req.query.statut === 'toutes' ? undefined : 'nouvelle';
    const alertes = await prisma.alerteCheque.findMany({
      where: { organisationId: req.user!.organisationId, ...(statut ? { statut } : {}) },
      orderBy: { createdAt: 'desc' },
      take: 200,
      include: { client: { select: { id: true, nom: true, tel: true } } },
    });
    const nbNouvelles = await prisma.alerteCheque.count({ where: { organisationId: req.user!.organisationId, statut: 'nouvelle' } });
    res.json({
      nbNouvelles,
      alertes: alertes.map((a) => ({
        id: a.id,
        clientId: a.clientId,
        clientNom: a.client.nom,
        clientTel: a.client.tel,
        montantEstime: a.montantEstime,
        message: a.message,
        statut: a.statut,
        createdAt: a.createdAt,
        traiteeLe: a.traiteeLe,
      })),
    });
  } catch (err) {
    next(err);
  }
});

chequesRouter.post('/alertes/:id/traiter', requireRole('admin', 'manager_entite', 'comptable'), async (req, res, next) => {
  try {
    const traitee = req.body?.traitee !== false;
    const r = await prisma.alerteCheque.updateMany({
      where: { id: req.params.id, organisationId: req.user!.organisationId },
      data: { statut: traitee ? 'traitee' : 'nouvelle', traiteeLe: traitee ? new Date() : null },
    });
    if (!r.count) return res.status(404).json({ error: 'Alerte introuvable' });
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

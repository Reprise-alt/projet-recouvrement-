import { Router } from 'express';
import { prisma } from '../db';
import { requireAuth, requireRole, requireOrgRole } from '../middleware/auth';
import { buildAuthUrl } from '../lib/gmail';
import { createState } from '../lib/oauthState';
import {
  ingererRemisesBancaires,
  getConnexionAvisBancaires,
  clearConnexionAvisBancaires,
} from '../services/remisesBancairesService';

// Encaissements bancaires (avis « remise chèque / virement / espèce ») lus
// automatiquement dans la boîte de l'organisation, pré-rapprochés par montant.
export const remisesRouter = Router();

// Statut de la connexion « avis bancaires » de l'organisation.
remisesRouter.get('/gmail/status', requireAuth, async (req, res, next) => {
  try {
    const c = await getConnexionAvisBancaires(req.user!.organisationId);
    res.json({ connected: !!c, compteEmail: c?.compteEmail ?? null, derniereSync: c?.derniereSync ?? null });
  } catch (e) {
    next(e);
  }
});

// Démarre la connexion Gmail (lecture des avis bancaires) pour CETTE organisation.
remisesRouter.get('/gmail/auth-url', requireAuth, requireOrgRole('proprietaire', 'administrateur'), (req, res, next) => {
  try {
    const state = createState('', { organisationId: req.user!.organisationId, usage: 'avis_bancaires' });
    res.json({ url: buildAuthUrl(state) });
  } catch (e) {
    next(e);
  }
});

remisesRouter.post('/gmail/disconnect', requireAuth, requireOrgRole('proprietaire', 'administrateur'), async (req, res, next) => {
  try {
    await clearConnexionAvisBancaires(req.user!.organisationId);
    res.status(204).end();
  } catch (e) {
    next(e);
  }
});

// Synchronisation manuelle (bouton « Synchroniser » dans la console).
remisesRouter.post('/sync', requireAuth, requireRole('admin', 'manager_entite', 'comptable'), async (req, res, next) => {
  try {
    const r = await ingererRemisesBancaires(req.user!.organisationId);
    res.json(r);
  } catch (e) {
    next(e);
  }
});

// Liste des encaissements bancaires (+ pré-rapprochement détaillé).
remisesRouter.get('/', requireAuth, async (req, res, next) => {
  try {
    // ISOLATION : filtrage EXPLICITE par organisation. Ce routeur n'est pas sous
    // tenantScope (la synchro fait un appel Gmail long, incompatible avec une
    // transaction tenant ouverte), donc on ne compte pas sur la RLS ici — chaque
    // requête est bornée à l'organisation de l'utilisateur.
    const orgId = req.user!.organisationId;
    const remises = await prisma.cheque.findMany({
      where: { source: 'banque', organisationId: orgId },
      orderBy: { createdAt: 'desc' },
      include: { client: { select: { id: true, nom: true } } },
      take: 200,
    });
    const idsProp = [
      ...new Set(remises.flatMap((r) => (r.facturesProposees ? r.facturesProposees.split(',') : []))),
    ].filter(Boolean);
    const factures = idsProp.length
      ? await prisma.facture.findMany({
          where: { id: { in: idsProp }, client: { organisationId: orgId } },
          select: { id: true, numero: true, montant: true, statut: true, client: { select: { id: true, nom: true } } },
        })
      : [];
    const parId = new Map(factures.map((f) => [f.id, f]));
    res.json(
      remises.map((r) => ({
        id: r.id,
        type: r.type,
        montant: r.montant,
        banque: r.banque,
        agence: r.agence,
        dateCheque: r.dateCheque,
        echeance: r.echeance,
        tireur: r.tireur,
        statut: r.statut,
        client: r.client,
        facturesReglees: r.facturesReglees,
        createdAt: r.createdAt,
        propositions: (r.facturesProposees ? r.facturesProposees.split(',') : [])
          .map((id) => parId.get(id))
          .filter(Boolean),
      })),
    );
  } catch (e) {
    next(e);
  }
});

// Valide un encaissement bancaire : marque les factures choisies réglées.
remisesRouter.post('/:id/valider', requireAuth, requireRole('admin', 'manager_entite', 'comptable'), async (req, res, next) => {
  try {
    const orgId = req.user!.organisationId;
    // ISOLATION : la remise DOIT appartenir à l'organisation de l'utilisateur.
    const remise = await prisma.cheque.findFirst({ where: { id: req.params.id, source: 'banque', organisationId: orgId } });
    if (!remise) return res.status(404).json({ error: 'Encaissement introuvable' });
    const b = (req.body ?? {}) as Record<string, unknown>;
    const clientId = typeof b.clientId === 'string' && b.clientId.trim() ? b.clientId.trim() : null;
    const factureIds = Array.isArray(b.factureIds) ? b.factureIds.filter((x): x is string => typeof x === 'string') : [];

    let numerosRegles: string[] = [];
    if (clientId && factureIds.length) {
      // Le client visé doit lui aussi appartenir à l'organisation (jamais régler
      // une facture d'un autre tenant).
      const c = await prisma.client.findFirst({ where: { id: clientId, organisationId: orgId }, select: { id: true } });
      if (!c) return res.status(400).json({ error: 'Client introuvable' });
      const factures = await prisma.facture.findMany({
        where: { id: { in: factureIds }, clientId, statut: 'impayee', client: { organisationId: orgId } },
        select: { id: true, numero: true },
      });
      numerosRegles = factures.map((f) => f.numero);
      if (factures.length) {
        await prisma.facture.updateMany({
          where: { id: { in: factures.map((f) => f.id) }, clientId, statut: 'impayee' },
          data: { statut: 'payee', datePaiement: remise.dateCheque ?? new Date() },
        });
        await prisma.actionRecouvrement.create({
          data: {
            clientId,
            palier: 0,
            label: `Réglé par ${remise.type}`,
            note: `${remise.type} ${remise.banque ? '(' + remise.banque + ') ' : ''}— ${remise.montant.toLocaleString('fr-FR')} FCFA — ${numerosRegles.join(', ')}`.trim(),
            utilisateurId: req.user!.id,
          },
        });
      }
    }
    const maj = await prisma.cheque.update({
      where: { id: remise.id },
      data: {
        clientId,
        facturesReglees: numerosRegles.join(', ') || null,
        statut: numerosRegles.length ? 'rapproche' : remise.statut,
      },
      select: { id: true },
    });
    res.json({ id: maj.id, facturesReglees: numerosRegles.length });
  } catch (e) {
    next(e);
  }
});

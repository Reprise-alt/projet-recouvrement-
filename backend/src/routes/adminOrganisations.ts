import { Router } from 'express';
import { prisma } from '../db';
import { requireAuth } from '../middleware/auth';
import { requireSuperAdmin } from '../middleware/superAdmin';
import { etatAbonnement } from '../lib/abonnement';

// Back-office EXPLOITANT (addendum §8) — réservé au super-admin (SUPERADMIN_EMAILS).
// Vue transverse sur toutes les organisations (hors contexte tenant : la table
// Organisation n'est pas sous RLS, et l'échappatoire autorise le comptage des
// clients par org). Permet d'activer, suspendre, prolonger l'essai, changer la
// formule après paiement — la brique qui rend le SaaS vendable en manuel.
export const adminOrganisationsRouter = Router();
adminOrganisationsRouter.use(requireAuth, requireSuperAdmin);

const STATUTS = ['essai', 'actif', 'coupe', 'supprime'];
const FORMULES = ['petite', 'pme', 'grands_comptes'];

adminOrganisationsRouter.get('/organisations', async (_req, res, next) => {
  try {
    const orgs = await prisma.organisation.findMany({ orderBy: { createdAt: 'desc' } });
    // Comptage clients par org + email du propriétaire, en une passe.
    const counts = await prisma.client.groupBy({ by: ['organisationId'], _count: { _all: true } });
    const parOrgClients = new Map(counts.map((c) => [c.organisationId, c._count._all]));
    const proprios = await prisma.utilisateur.findMany({
      where: { roleOrg: 'proprietaire' },
      select: { organisationId: true, email: true },
    });
    const parOrgProprio = new Map(proprios.map((p) => [p.organisationId, p.email]));

    res.json(
      orgs.map((o) => ({
        id: o.id,
        raisonSociale: o.raisonSociale,
        slug: o.slug,
        pays: o.pays,
        statut: o.statut,
        formule: o.formule,
        optionContentieux: o.optionContentieux,
        dateFinEssai: o.dateFinEssai,
        createdAt: o.createdAt,
        emailProprietaire: parOrgProprio.get(o.id) ?? null,
        nbClients: parOrgClients.get(o.id) ?? 0,
        abonnement: etatAbonnement(o),
      })),
    );
  } catch (err) {
    next(err);
  }
});

adminOrganisationsRouter.patch('/organisations/:id', async (req, res, next) => {
  try {
    const body = (req.body ?? {}) as Record<string, unknown>;
    const data: Record<string, unknown> = {};

    if (typeof body.statut === 'string') {
      if (!STATUTS.includes(body.statut)) return res.status(400).json({ error: 'Statut invalide' });
      data.statut = body.statut;
      // Activer un compte le sort définitivement de l'essai.
      if (body.statut === 'actif') data.dateFinEssai = null;
    }
    if (typeof body.formule === 'string') {
      if (!FORMULES.includes(body.formule)) return res.status(400).json({ error: 'Formule invalide' });
      data.formule = body.formule;
    }
    // Option payante « contentieux » (+10 000/mois) pour Petite/PME.
    if (typeof body.optionContentieux === 'boolean') {
      data.optionContentieux = body.optionContentieux;
    }
    // Prolonger l'essai de N jours à partir de maintenant (repasse en essai).
    if (typeof body.prolongerJours === 'number' && body.prolongerJours > 0) {
      data.statut = 'essai';
      data.dateFinEssai = new Date(Date.now() + Math.floor(body.prolongerJours) * 24 * 60 * 60 * 1000);
    } else if (body.dateFinEssai === null) {
      data.dateFinEssai = null;
    } else if (typeof body.dateFinEssai === 'string') {
      const d = new Date(body.dateFinEssai);
      if (!isNaN(d.getTime())) data.dateFinEssai = d;
    }

    if (!Object.keys(data).length) return res.status(400).json({ error: 'Aucune modification' });

    const org = await prisma.organisation.update({ where: { id: req.params.id }, data: data as never });
    res.json({
      id: org.id,
      statut: org.statut,
      formule: org.formule,
      optionContentieux: org.optionContentieux,
      dateFinEssai: org.dateFinEssai,
      abonnement: etatAbonnement(org),
    });
  } catch (err) {
    next(err);
  }
});

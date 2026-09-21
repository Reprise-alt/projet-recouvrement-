import { Router } from 'express';
import { PrismaClient } from '@prisma/client';
import { prisma } from '../db';
import { requireAuth } from '../middleware/auth';
import { requireSuperAdmin } from '../middleware/superAdmin';
import { etatAbonnement } from '../lib/abonnement';
import { confirmerParrainageSiActif } from '../lib/parrainage';
import { migrerTenant } from '../lib/migrationTenant';

// Clients Prisma dédiés à la migration (créés à la demande, mis en cache) :
// SOURCE = base de la console interne (SOURCE_DATABASE_URL), CIBLE = base Feyma
// (TARGET_DATABASE_URL, sinon DATABASE_URL du service). Clients « nus » (sans
// l'extension tenant) : écriture hors contexte → l'échappatoire RLS l'autorise,
// l'organisationId étant posé explicitement.
let migSource: PrismaClient | null = null;
let migTarget: PrismaClient | null = null;
function sourceMigration(): PrismaClient | null {
  const url = process.env.SOURCE_DATABASE_URL;
  if (!url) return null;
  if (!migSource) migSource = new PrismaClient({ datasources: { db: { url } } });
  return migSource;
}
function cibleMigration(): PrismaClient {
  const url = process.env.TARGET_DATABASE_URL || process.env.DATABASE_URL!;
  if (!migTarget) migTarget = new PrismaClient({ datasources: { db: { url } } });
  return migTarget;
}

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
    // Parrainage : si ce compte vient de passer « actif », on crédite son parrain.
    if (data.statut === 'actif') await confirmerParrainageSiActif(org.id);
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

// Migration d'un tenant depuis la console interne (base source) vers une
// organisation Feyma. apply=false ⇒ DRY-RUN (compte, n'écrit rien). apply=true
// ⇒ migration réelle (transaction). vider=true ⇒ purge la cible d'abord.
// La cible se désigne par id, slug OU raison sociale (pratique côté UI).
adminOrganisationsRouter.post('/migration', async (req, res, next) => {
  try {
    const source = sourceMigration();
    if (!source) {
      return res.status(400).json({ error: "SOURCE_DATABASE_URL n'est pas configurée sur le service (base de la console interne)." });
    }
    const entite = String(req.body?.entite ?? '').trim();
    const cible = String(req.body?.orgId ?? '').trim();
    const apply = req.body?.apply === true;
    const vider = req.body?.vider === true;
    if (!entite || !cible) return res.status(400).json({ error: 'entite et orgId (id, slug ou raison sociale) requis' });

    const org = await prisma.organisation.findFirst({
      where: { OR: [{ id: cible }, { slug: cible }, { raisonSociale: { equals: cible, mode: 'insensitive' } }] },
      select: { id: true, slug: true, raisonSociale: true },
    });
    if (!org) return res.status(404).json({ error: 'Organisation cible introuvable' });

    const rapport = await migrerTenant({
      source, target: cibleMigration(), entite, orgId: org.id, orgSlug: org.slug, apply, vider,
    });
    res.json({ ...rapport, orgRaisonSociale: org.raisonSociale });
  } catch (err) {
    next(err);
  }
});

// Nettoyage d'une entité résiduelle dans une organisation : supprime les clients
// tagués `entite` (et, par cascade, leurs factures / actions / dossiers). Sert à
// retirer des données laissées par une migration (ex. des clients « SIS » restés
// dans le tenant SORAM). apply=false ⇒ DRY-RUN (compte, ne supprime rien).
// Garde-fou : refuse de vider TOUTE l'organisation sauf force=true.
adminOrganisationsRouter.post('/organisations/:id/nettoyer-entite', async (req, res, next) => {
  try {
    const orgId = req.params.id;
    const entite = String(req.body?.entite ?? '').trim();
    const apply = req.body?.apply === true;
    if (!entite) return res.status(400).json({ error: 'entite requise' });

    const org = await prisma.organisation.findUnique({ where: { id: orgId }, select: { id: true, raisonSociale: true } });
    if (!org) return res.status(404).json({ error: 'Organisation introuvable' });

    const clients = await prisma.client.findMany({
      where: { organisationId: orgId, entite: entite as never },
      select: { id: true, nom: true },
    });
    const clientIds = clients.map((c) => c.id);
    const [nbFactures, nbActions, nbDossiers, totalClients] = await Promise.all([
      prisma.facture.count({ where: { clientId: { in: clientIds } } }),
      prisma.actionRecouvrement.count({ where: { clientId: { in: clientIds } } }),
      prisma.dossierContentieux.count({ where: { clientId: { in: clientIds } } }),
      prisma.client.count({ where: { organisationId: orgId } }),
    ]);

    const base = {
      orgRaisonSociale: org.raisonSociale,
      entite,
      nbClients: clients.length,
      nbFactures,
      nbActions,
      nbDossiers,
      apercuClients: clients.slice(0, 50).map((c) => c.nom),
    };

    if (!apply) return res.json({ apply: false, ...base });

    // Garde-fou : ne jamais vider toute l'organisation par erreur.
    if (clients.length > 0 && clients.length === totalClients && req.body?.force !== true) {
      return res.status(400).json({
        error: `Refus : cela supprimerait TOUS les clients de ${org.raisonSociale}. Renvoyez force=true si c'est réellement voulu.`,
      });
    }

    const del = await prisma.client.deleteMany({ where: { organisationId: orgId, entite: entite as never } });
    res.json({ apply: true, ...base, supprimes: del.count });
  } catch (err) {
    next(err);
  }
});

import { Router } from 'express';
import { PrismaClient } from '@prisma/client';
import { prisma, withTenant } from '../db';
import { requireAuth } from '../middleware/auth';
import { requireSuperAdmin } from '../middleware/superAdmin';
import { etatAbonnement } from '../lib/abonnement';
import { confirmerParrainageSiActif } from '../lib/parrainage';
import { migrerTenant } from '../lib/migrationTenant';
import { slugify } from '../lib/tenant';
import { normaliserEmail } from '../lib/otp';

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

async function slugUniqueOrg(nom: string): Promise<string> {
  const base = slugify(nom);
  for (let i = 0; i < 50; i++) {
    const candidat = i === 0 ? base : `${base}-${i + 1}`;
    if (!(await prisma.organisation.findUnique({ where: { slug: candidat } }))) return candidat;
  }
  return `${base}-${Date.now()}`;
}

// Provisioning prospect : le super-admin crée une console d'essai PRÊTE À REMPLIR
// pour un prospect qui n'a pas le temps de la paramétrer. Crée l'organisation
// (statut essai) + son compte propriétaire. Le super-admin « ouvre » ensuite la
// console (impersonation) pour importer le fichier / poser le logo, et le
// prospect se connecte simplement par OTP avec son email.
adminOrganisationsRouter.post('/organisations', async (req, res, next) => {
  try {
    const body = (req.body ?? {}) as Record<string, unknown>;
    const raisonSociale = String(body.raisonSociale ?? '').trim();
    const email = normaliserEmail(String(body.email ?? ''));
    const secteur = String(body.secteur ?? '').trim();
    const formule = FORMULES.includes(String(body.formule)) ? String(body.formule) : 'pme';
    const joursEssai =
      Number.isFinite(Number(body.joursEssai)) && Number(body.joursEssai) > 0 ? Math.floor(Number(body.joursEssai)) : 14;
    if (!raisonSociale) return res.status(400).json({ error: 'La raison sociale est obligatoire.' });
    if (!email || !email.includes('@')) return res.status(400).json({ error: 'Un email propriétaire valide est obligatoire.' });
    if (await prisma.utilisateur.findUnique({ where: { email } })) {
      return res.status(409).json({ error: 'Cet email possède déjà un compte.' });
    }

    const org = await prisma.organisation.create({
      data: {
        raisonSociale,
        slug: await slugUniqueOrg(raisonSociale),
        statut: 'essai',
        dateFinEssai: new Date(Date.now() + joursEssai * 24 * 60 * 60 * 1000),
        formule: formule as any,
        ...(secteur ? { secteur } : {}),
      },
    });
    const proprietaire = await prisma.utilisateur.create({
      data: {
        email,
        nom: raisonSociale,
        organisationId: org.id,
        role: 'admin', // rôle groupe historique requis (non nul) — non pertinent en SaaS
        roleOrg: 'proprietaire',
        accesRecouvrement: true,
      },
    });
    // Auto-application du modèle de secteur (s'il existe) : une nouvelle org
    // d'un secteur déjà paramétré démarre avec ses paliers + modèles d'e-mails.
    let modeleApplique = false;
    if (secteur) {
      const modele = await prisma.modeleSecteur.findUnique({ where: { secteur } });
      if (modele) {
        await appliquerConfigOrg(org.id, modele.paliers as unknown as PalierSnap[], modele.modeles as unknown as ModeleSnap[]);
        modeleApplique = true;
      }
    }
    console.info(
      `[provisioning] org "${raisonSociale}" (${org.id}) créée par ${req.user!.email} — proprio ${email}, essai ${joursEssai} j${secteur ? `, secteur « ${secteur} »${modeleApplique ? ' (modèle appliqué)' : ''}` : ''}`,
    );
    res.status(201).json({
      id: org.id,
      raisonSociale: org.raisonSociale,
      slug: org.slug,
      statut: org.statut,
      secteur: org.secteur,
      dateFinEssai: org.dateFinEssai,
      emailProprietaire: proprietaire.email,
      abonnement: etatAbonnement(org),
      modeleSecteurApplique: modeleApplique,
    });
  } catch (err) {
    next(err);
  }
});

// --- Modèles de configuration par secteur (paliers + modèles d'e-mails) ---
type PalierSnap = { palier: number; jours: number | null; actif: boolean; libelle: string | null };
type ModeleSnap = { palier: number; sujet: string; corps: string };

// Lit la config (paliers + modèles de relance) d'une org, dans son contexte tenant.
async function lireConfigOrg(organisationId: string): Promise<{ paliers: PalierSnap[]; modeles: ModeleSnap[] }> {
  return withTenant(organisationId, async () => {
    const paliers = await prisma.palierOrg.findMany({ where: { organisationId } });
    const modeles = await prisma.modeleRelanceOrg.findMany({ where: { organisationId } });
    return {
      paliers: paliers.map((p) => ({ palier: p.palier, jours: p.jours, actif: p.actif, libelle: p.libelle })),
      modeles: modeles.map((m) => ({ palier: m.palier, sujet: m.sujet, corps: m.corps })),
    };
  });
}

// Applique (upsert) une config paliers + modèles à une org, dans son contexte tenant.
async function appliquerConfigOrg(organisationId: string, paliers: PalierSnap[], modeles: ModeleSnap[]): Promise<void> {
  await withTenant(organisationId, async () => {
    for (const p of paliers ?? []) {
      await prisma.palierOrg.upsert({
        where: { organisationId_palier: { organisationId, palier: p.palier } },
        create: { organisationId, palier: p.palier, jours: p.jours ?? null, actif: p.actif ?? true, libelle: p.libelle ?? null },
        update: { jours: p.jours ?? null, actif: p.actif ?? true, libelle: p.libelle ?? null },
      });
    }
    for (const m of modeles ?? []) {
      await prisma.modeleRelanceOrg.upsert({
        where: { organisationId_palier: { organisationId, palier: m.palier } },
        create: { organisationId, palier: m.palier, sujet: m.sujet, corps: m.corps },
        update: { sujet: m.sujet, corps: m.corps },
      });
    }
  });
}

// Liste des modèles de secteur enregistrés.
adminOrganisationsRouter.get('/secteurs/modeles', async (_req, res, next) => {
  try {
    const list = await prisma.modeleSecteur.findMany({ orderBy: { secteur: 'asc' } });
    res.json(
      list.map((m) => ({
        secteur: m.secteur,
        paliers: Array.isArray(m.paliers) ? (m.paliers as unknown[]).length : 0,
        modeles: Array.isArray(m.modeles) ? (m.modeles as unknown[]).length : 0,
        majPar: m.majPar,
        updatedAt: m.updatedAt,
      })),
    );
  } catch (err) {
    next(err);
  }
});

// Enregistre la config courante d'une org comme MODÈLE de son secteur (upsert).
adminOrganisationsRouter.post('/organisations/:id/enregistrer-modele-secteur', async (req, res, next) => {
  try {
    const org = await prisma.organisation.findUnique({ where: { id: req.params.id } });
    if (!org) return res.status(404).json({ error: 'Organisation introuvable.' });
    if (!org.secteur || !org.secteur.trim()) {
      return res.status(400).json({ error: "Définissez d'abord le secteur de cette organisation." });
    }
    const secteur = org.secteur.trim();
    const cfg = await lireConfigOrg(org.id);
    const modele = await prisma.modeleSecteur.upsert({
      where: { secteur },
      create: { secteur, paliers: cfg.paliers as any, modeles: cfg.modeles as any, majPar: req.user!.email },
      update: { paliers: cfg.paliers as any, modeles: cfg.modeles as any, majPar: req.user!.email },
    });
    console.info(
      `[modele-secteur] « ${secteur} » enregistré depuis "${org.raisonSociale}" par ${req.user!.email} (${cfg.paliers.length} paliers, ${cfg.modeles.length} modèles)`,
    );
    res.json({ secteur, paliers: cfg.paliers.length, modeles: cfg.modeles.length, updatedAt: modele.updatedAt });
  } catch (err) {
    next(err);
  }
});

// Applique le modèle du secteur de l'org À cette org (paliers + modèles d'e-mails).
adminOrganisationsRouter.post('/organisations/:id/appliquer-modele-secteur', async (req, res, next) => {
  try {
    const org = await prisma.organisation.findUnique({ where: { id: req.params.id } });
    if (!org) return res.status(404).json({ error: 'Organisation introuvable.' });
    if (!org.secteur || !org.secteur.trim()) {
      return res.status(400).json({ error: "Cette organisation n'a pas de secteur défini." });
    }
    const modele = await prisma.modeleSecteur.findUnique({ where: { secteur: org.secteur.trim() } });
    if (!modele) return res.status(404).json({ error: `Aucun modèle pour le secteur « ${org.secteur} ».` });
    await appliquerConfigOrg(org.id, modele.paliers as unknown as PalierSnap[], modele.modeles as unknown as ModeleSnap[]);
    console.info(`[modele-secteur] « ${org.secteur.trim()} » appliqué à "${org.raisonSociale}" par ${req.user!.email}`);
    res.json({ ok: true, secteur: org.secteur });
  } catch (err) {
    next(err);
  }
});

// Démarrage d'impersonation : trace (audit) l'ouverture de la console d'une org
// par le super-admin et renvoie le résumé pour le bandeau. L'overlay réel passe
// par l'en-tête x-impersonate-org sur chaque requête (cf. middleware/auth).
adminOrganisationsRouter.post('/organisations/:id/impersonation', async (req, res, next) => {
  try {
    const org = await prisma.organisation.findUnique({ where: { id: req.params.id } });
    if (!org) return res.status(404).json({ error: 'Organisation introuvable.' });
    const proprio =
      (await prisma.utilisateur.findFirst({ where: { organisationId: org.id, roleOrg: 'proprietaire' } })) ??
      (await prisma.utilisateur.findFirst({ where: { organisationId: org.id } }));
    if (!proprio) return res.status(409).json({ error: "Cette organisation n'a aucun compte à emprunter." });
    console.warn(
      `[impersonation] ${req.user!.email} ouvre la console de "${org.raisonSociale}" (${org.id}) en tant que ${proprio.email}`,
    );
    res.json({ organisationId: org.id, raisonSociale: org.raisonSociale, emailProprietaire: proprio.email });
  } catch (err) {
    next(err);
  }
});

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
        secteur: o.secteur,
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
    if (typeof body.secteur === 'string') {
      data.secteur = body.secteur.trim() || null;
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

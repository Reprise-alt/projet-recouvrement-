import crypto from 'crypto';
import { Router } from 'express';
import { prisma } from '../db';
import { requireAccesRecouvrement, requireAuth, requireRole } from '../middleware/auth';
import { Entite, resolveEntiteScope } from '../lib/entites';
import { buildPlanningRapport, modeleDuLe, resumeJournee, TACHE_TYPE_LABELS, TacheRapportEntree } from '../lib/taches';

export const tachesRouter = Router();
tachesRouter.use(requireAuth, requireAccesRecouvrement);

// Même équipe que celle qui peut déjà enregistrer une action de
// recouvrement (cf. clients.ts) -- l'ADV au sens large, pas seulement les
// admins.
const ADV_ROLES = ['admin', 'manager_entite', 'comptable'] as const;

function entiteWhere(entiteFilter: Entite | 'ALL') {
  if (entiteFilter === 'ALL') return {};
  return { OR: [{ entite: entiteFilter as any }, { entite: 'COMMUN' as any }] };
}

// `{ client: {} }` n'est pas un no-op en Prisma pour une relation
// optionnelle -- vérifié en pratique, ça exclut toutes les lignes plutôt
// que de matcher tout le monde comme le ferait un `where: {}` de premier
// niveau. On omet donc entièrement le filtre relationnel plutôt que de lui
// passer un objet vide quand la portée est "ALL". Utilisé uniquement pour
// TacheCoursierModele, dont le client est obligatoire -- TacheCoursier a
// son propre champ `entite` direct (cf. schema.prisma) et n'a pas besoin
// de ce détour.
function clientEntiteFilter(entiteFilter: Entite | 'ALL') {
  return entiteFilter === 'ALL' ? undefined : { client: entiteWhere(entiteFilter) };
}

function tacheEntiteFilter(entiteFilter: Entite | 'ALL') {
  if (entiteFilter === 'ALL') return {};
  return { entite: { in: [entiteFilter, 'COMMUN'] } };
}

function parseDateOnly(value: unknown): Date | null {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const d = new Date(`${value}T00:00:00.000Z`);
  return Number.isNaN(d.getTime()) ? null : d;
}

const TACHE_TYPES = Object.keys(TACHE_TYPE_LABELS);

// ---------------------------------------------------------------------
// Coursiers
// ---------------------------------------------------------------------

tachesRouter.get('/coursiers', async (_req, res, next) => {
  try {
    const coursiers = await prisma.coursier.findMany({ orderBy: { nom: 'asc' } });
    res.json(coursiers);
  } catch (err) {
    next(err);
  }
});

tachesRouter.post('/coursiers', requireRole('admin', 'manager_entite'), async (req, res, next) => {
  try {
    const nom = (req.body?.nom ?? '').toString().trim();
    if (!nom) return res.status(400).json({ error: 'Nom requis' });
    const coursier = await prisma.coursier.create({ data: { nom, token: crypto.randomBytes(24).toString('hex') } });
    res.status(201).json(coursier);
  } catch (err) {
    next(err);
  }
});

tachesRouter.patch('/coursiers/:id', requireRole('admin', 'manager_entite'), async (req, res, next) => {
  try {
    const { nom, actif } = req.body ?? {};
    const coursier = await prisma.coursier.update({
      where: { id: req.params.id },
      data: {
        nom: typeof nom === 'string' && nom.trim() ? nom.trim() : undefined,
        actif: typeof actif === 'boolean' ? actif : undefined,
      },
    });
    res.json(coursier);
  } catch (err) {
    next(err);
  }
});

// Régénère le lien personnel d'un coursier -- utile en cas de téléphone
// perdu, sans avoir à recréer la fiche (et donc son historique de tâches).
tachesRouter.post('/coursiers/:id/regenerate-token', requireRole('admin', 'manager_entite'), async (req, res, next) => {
  try {
    const coursier = await prisma.coursier.update({
      where: { id: req.params.id },
      data: { token: crypto.randomBytes(24).toString('hex') },
    });
    res.json(coursier);
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------
// Lien "salle" -- un seul lien partagé pour toute l'équipe coursiers
// (écran affiché en salle), distinct du lien personnel de chaque coursier
// : montre le planning complet du jour (tous coursiers, y compris non
// assigné) et permet d'assigner, jamais de marquer fait/reporter -- ça
// reste le rôle du lien personnel, sur le terrain.
// ---------------------------------------------------------------------

async function getOrCreateSalleToken(): Promise<string> {
  const config = await prisma.config.upsert({ where: { id: 1 }, create: { id: 1 }, update: {} });
  if (config.salleToken) return config.salleToken;
  const updated = await prisma.config.update({ where: { id: 1 }, data: { salleToken: crypto.randomBytes(24).toString('hex') } });
  return updated.salleToken!;
}

tachesRouter.get('/salle-token', requireRole('admin', 'manager_entite'), async (_req, res, next) => {
  try {
    res.json({ token: await getOrCreateSalleToken() });
  } catch (err) {
    next(err);
  }
});

tachesRouter.post('/salle-token/regenerate', requireRole('admin', 'manager_entite'), async (_req, res, next) => {
  try {
    const updated = await prisma.config.upsert({
      where: { id: 1 },
      create: { id: 1, salleToken: crypto.randomBytes(24).toString('hex') },
      update: { salleToken: crypto.randomBytes(24).toString('hex') },
    });
    res.json({ token: updated.salleToken });
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------
// Modèles de tâches récurrentes
// ---------------------------------------------------------------------

tachesRouter.get('/modeles', requireRole(...ADV_ROLES), async (req, res, next) => {
  try {
    const entiteFilter = resolveEntiteScope(req.user!, req.query.entite);
    const clientFilter = clientEntiteFilter(entiteFilter);
    const modeles = await prisma.tacheCoursierModele.findMany({
      where: clientFilter,
      include: { client: { select: { id: true, nom: true, entite: true } } },
      orderBy: [{ actif: 'desc' }, { jourDuMois: 'asc' }],
    });
    res.json(modeles);
  } catch (err) {
    next(err);
  }
});

tachesRouter.post('/modeles', requireRole(...ADV_ROLES), async (req, res, next) => {
  try {
    const { clientId, type, label, jourDuMois } = req.body ?? {};
    if (!clientId || typeof clientId !== 'string') return res.status(400).json({ error: 'Client requis' });
    if (!TACHE_TYPES.includes(type)) return res.status(400).json({ error: 'Type de tâche invalide' });
    const jour = parseInt(jourDuMois, 10);
    if (!Number.isInteger(jour) || jour < 1 || jour > 28) {
      return res.status(400).json({ error: 'Jour du mois invalide (1 à 28)' });
    }
    const modele = await prisma.tacheCoursierModele.create({
      data: { clientId, type, label: typeof label === 'string' && label.trim() ? label.trim() : null, jourDuMois: jour },
      include: { client: { select: { id: true, nom: true, entite: true } } },
    });
    res.status(201).json(modele);
  } catch (err) {
    next(err);
  }
});

tachesRouter.patch('/modeles/:id', requireRole(...ADV_ROLES), async (req, res, next) => {
  try {
    const { actif } = req.body ?? {};
    const modele = await prisma.tacheCoursierModele.update({
      where: { id: req.params.id },
      data: { actif: typeof actif === 'boolean' ? actif : undefined },
      include: { client: { select: { id: true, nom: true, entite: true } } },
    });
    res.json(modele);
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------
// Tâches du jour
// ---------------------------------------------------------------------

// Génère les instances dues à cette date pour tous les modèles actifs qui
// n'ont pas encore d'occurrence ce jour-là (idempotent grâce à la
// contrainte unique [modeleId, dateInitiale] -- skipDuplicates couvre le
// cas d'un double appel concurrent).
async function genererTachesDues(date: Date) {
  const modeles = await prisma.tacheCoursierModele.findMany({
    where: { actif: true },
    include: { client: { select: { entite: true } } },
  });
  const dus = modeles.filter((m) => modeleDuLe(m.jourDuMois, date));
  if (dus.length === 0) return;
  await prisma.tacheCoursier.createMany({
    data: dus.map((m) => ({
      entite: m.client.entite,
      clientId: m.clientId,
      type: m.type,
      label: m.label,
      date,
      dateInitiale: date,
      modeleId: m.id,
    })),
    skipDuplicates: true,
  });
}

tachesRouter.get('/', requireRole(...ADV_ROLES), async (req, res, next) => {
  try {
    const date = parseDateOnly(req.query.date);
    if (!date) return res.status(400).json({ error: 'Paramètre date invalide (format AAAA-MM-JJ)' });
    await genererTachesDues(date);

    const entiteFilter = resolveEntiteScope(req.user!, req.query.entite);
    const nextDay = new Date(date.getTime() + 24 * 60 * 60 * 1000);
    const entiteScopeFilter = tacheEntiteFilter(entiteFilter);
    const includeArgs = { client: { select: { id: true, nom: true, entite: true } }, coursier: true } as const;

    // Deux requêtes distinctes et volontairement séparées : `taches` (à
    // travailler aujourd'hui) filtre sur `date`, la date actuellement
    // planifiée -- inclut donc une tâche reportée *vers* ce jour depuis un
    // jour précédent. `resume` (bilan de la journée) filtre sur
    // `dateInitiale` -- ce qui était prévu ce jour-là à l'origine, pour
    // qu'une tâche reportée *hors* de ce jour reste comptée "reportée"
    // plutôt que de simplement disparaître du bilan.
    const [taches, tachesInitiales] = await Promise.all([
      prisma.tacheCoursier.findMany({
        where: { date: { gte: date, lt: nextDay }, ...entiteScopeFilter },
        include: includeArgs,
        orderBy: [{ type: 'asc' }, { createdAt: 'asc' }],
      }),
      prisma.tacheCoursier.findMany({
        where: { dateInitiale: { gte: date, lt: nextDay }, ...entiteScopeFilter },
        select: { statut: true, date: true, dateInitiale: true },
      }),
    ]);
    res.json({ taches, resume: resumeJournee(tachesInitiales) });
  } catch (err) {
    next(err);
  }
});

tachesRouter.post('/', requireRole(...ADV_ROLES), async (req, res, next) => {
  try {
    const { clientId, entite, type, label, date: dateStr } = req.body ?? {};
    if (!TACHE_TYPES.includes(type)) return res.status(400).json({ error: 'Type de tâche invalide' });
    const date = parseDateOnly(dateStr);
    if (!date) return res.status(400).json({ error: 'Date invalide (format AAAA-MM-JJ)' });
    if (clientId !== undefined && clientId !== null && typeof clientId !== 'string') {
      return res.status(400).json({ error: 'Client invalide' });
    }

    // L'entité suit toujours le client quand il y en a un (jamais celle
    // envoyée par le formulaire, pour ne jamais pouvoir désynchroniser une
    // tâche de son client) -- une tâche générique (sans client) doit en
    // revanche la préciser explicitement, faute d'autre source.
    let entiteFinale: string;
    if (clientId) {
      const client = await prisma.client.findUnique({ where: { id: clientId }, select: { entite: true } });
      if (!client) return res.status(400).json({ error: 'Client introuvable' });
      entiteFinale = client.entite;
    } else {
      if (typeof entite !== 'string' || !entite.trim()) {
        return res.status(400).json({ error: 'Entreprise requise pour une tâche sans client' });
      }
      entiteFinale = entite.trim();
    }

    const tache = await prisma.tacheCoursier.create({
      data: {
        entite: entiteFinale,
        clientId: clientId || null,
        type,
        label: typeof label === 'string' && label.trim() ? label.trim() : null,
        date,
        dateInitiale: date,
      },
      include: { client: { select: { id: true, nom: true, entite: true } }, coursier: true },
    });
    res.status(201).json(tache);
  } catch (err) {
    next(err);
  }
});

tachesRouter.patch('/:id', requireRole(...ADV_ROLES), async (req, res, next) => {
  try {
    const { coursierId, date: dateStr, statut, montant, modePaiement, note } = req.body ?? {};
    const data: Record<string, unknown> = {};

    if (coursierId !== undefined) data.coursierId = coursierId || null;
    if (dateStr !== undefined) {
      const date = parseDateOnly(dateStr);
      if (!date) return res.status(400).json({ error: 'Date invalide (format AAAA-MM-JJ)' });
      data.date = date;
    }
    if (statut !== undefined) {
      if (!['a_faire', 'faite', 'annulee'].includes(statut)) return res.status(400).json({ error: 'Statut invalide' });
      data.statut = statut;
      data.dateExecution = statut === 'faite' ? new Date() : null;
    }
    if (montant !== undefined) data.montant = montant === null ? null : Number(montant);
    if (modePaiement !== undefined) data.modePaiement = modePaiement || null;
    if (note !== undefined) data.note = typeof note === 'string' ? note.trim() || null : null;

    const tache = await prisma.tacheCoursier.update({
      where: { id: req.params.id },
      data,
      include: { client: { select: { id: true, nom: true, entite: true } }, coursier: true },
    });
    res.json(tache);
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------
// Reporting planning -- agrégats sur une période (tâches par jour, par
// coursier, reportées par entité) pour objectiver l'activité de l'équipe
// coursiers dans la durée, distinct de la vue "un seul jour" ci-dessus.
// ---------------------------------------------------------------------

tachesRouter.get('/reporting', requireRole(...ADV_ROLES), async (req, res, next) => {
  try {
    const from = parseDateOnly(req.query.from);
    const to = parseDateOnly(req.query.to);
    if (!from || !to || from > to) {
      return res.status(400).json({ error: 'Période invalide — from et to sont requis (format AAAA-MM-JJ)' });
    }
    const toExclusive = new Date(to.getTime() + 24 * 60 * 60 * 1000);

    const entiteFilter = resolveEntiteScope(req.user!, req.query.entite);
    const taches = await prisma.tacheCoursier.findMany({
      where: { dateInitiale: { gte: from, lt: toExclusive }, ...tacheEntiteFilter(entiteFilter) },
      select: {
        statut: true,
        date: true,
        dateInitiale: true,
        entite: true,
        coursierId: true,
        coursier: { select: { nom: true } },
      },
    });

    const entrees: TacheRapportEntree[] = taches.map((t) => ({
      statut: t.statut,
      date: t.date,
      dateInitiale: t.dateInitiale,
      entite: t.entite,
      coursierId: t.coursierId,
      coursierNom: t.coursier?.nom ?? null,
    }));

    res.json(buildPlanningRapport(entrees));
  } catch (err) {
    next(err);
  }
});

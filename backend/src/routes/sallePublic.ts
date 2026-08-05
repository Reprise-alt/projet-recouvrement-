import { Router } from 'express';
import { prisma } from '../db';

export const sallePublicRouter = Router();

// Écran de salle des coursiers : un seul lien partagé (cf.
// routes/taches.ts:getOrCreateSalleToken), pas un par personne -- montre
// le planning complet du jour, non assigné compris, pour que l'équipe se
// dispatche elle-même en réunion du matin. Volontairement limité à la
// lecture + l'assignation : marquer une tâche faite ou la reporter reste
// réservé au lien personnel de chaque coursier, une fois sur le terrain
// (cf. routes/coursierPublic.ts).
async function checkToken(token: string): Promise<boolean> {
  const config = await prisma.config.findUnique({ where: { id: 1 } });
  return !!config?.salleToken && config.salleToken === token;
}

function parseDateOnly(value: unknown): Date | null {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const d = new Date(`${value}T00:00:00.000Z`);
  return Number.isNaN(d.getTime()) ? null : d;
}

function today(): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

sallePublicRouter.get('/:token/taches', async (req, res, next) => {
  try {
    if (!(await checkToken(req.params.token))) return res.status(404).json({ error: 'Lien invalide' });

    const date = parseDateOnly(req.query.date) ?? today();
    const nextDay = new Date(date.getTime() + 24 * 60 * 60 * 1000);

    const [taches, coursiers] = await Promise.all([
      prisma.tacheCoursier.findMany({
        where: { date: { gte: date, lt: nextDay } },
        include: { client: { select: { id: true, nom: true, entite: true } }, coursier: true },
        orderBy: [{ coursierId: 'asc' }, { type: 'asc' }, { createdAt: 'asc' }],
      }),
      prisma.coursier.findMany({ where: { actif: true }, orderBy: { nom: 'asc' } }),
    ]);

    res.json({ taches, coursiers });
  } catch (err) {
    next(err);
  }
});

sallePublicRouter.patch('/:token/taches/:id', async (req, res, next) => {
  try {
    if (!(await checkToken(req.params.token))) return res.status(404).json({ error: 'Lien invalide' });

    const { coursierId } = req.body ?? {};
    if (coursierId !== null && typeof coursierId !== 'string') {
      return res.status(400).json({ error: 'coursierId invalide' });
    }

    const tache = await prisma.tacheCoursier.update({
      where: { id: req.params.id },
      data: { coursierId: coursierId || null },
      include: { client: { select: { id: true, nom: true, entite: true } }, coursier: true },
    });
    res.json(tache);
  } catch (err) {
    next(err);
  }
});

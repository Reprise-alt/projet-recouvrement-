import { Router } from 'express';
import { prisma } from '../db';
import { MOTIF_REPORT_LABELS } from '../lib/taches';

export const sallePublicRouter = Router();

// Écran de salle des coursiers : un seul lien partagé (cf.
// routes/taches.ts:getOrCreateSalleToken), pas un par personne -- montre
// le planning complet du jour, non assigné compris, pour que l'équipe se
// dispatche elle-même en réunion du matin, et permet aussi de reporter une
// tâche que personne ne pourra faire aujourd'hui -- ça se décide souvent
// collectivement, en réunion. Marquer une tâche faite reste en revanche
// réservé au lien personnel de chaque coursier, une fois sur le terrain
// (cf. routes/coursierPublic.ts) : ça ne se décide pas en salle.
//
// Un lien salle est partagé sur un écran affiché en salle, jamais
// authentifié individuellement -- les coursiers renvoyés ici (pour le
// sélecteur d'assignation) ne doivent donc jamais inclure leur `token`
// personnel, sans quoi ce lien salle donnerait accès à tous les liens
// individuels.
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
        include: { client: { select: { id: true, nom: true, entite: true } }, coursier: { select: { id: true, nom: true } } },
        orderBy: [{ coursierId: 'asc' }, { type: 'asc' }, { createdAt: 'asc' }],
      }),
      prisma.coursier.findMany({ where: { actif: true }, select: { id: true, nom: true }, orderBy: { nom: 'asc' } }),
    ]);

    res.json({ taches, coursiers });
  } catch (err) {
    next(err);
  }
});

sallePublicRouter.patch('/:token/taches/:id', async (req, res, next) => {
  try {
    if (!(await checkToken(req.params.token))) return res.status(404).json({ error: 'Lien invalide' });

    const { coursierId, report, motifReport } = req.body ?? {};
    const data: Record<string, unknown> = {};

    if (coursierId !== undefined) {
      if (coursierId !== null && typeof coursierId !== 'string') {
        return res.status(400).json({ error: 'coursierId invalide' });
      }
      data.coursierId = coursierId || null;
    }

    if (report !== undefined) {
      if (typeof report !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(report)) {
        return res.status(400).json({ error: 'Date de report invalide (format AAAA-MM-JJ)' });
      }
      const nouvelleDate = new Date(`${report}T00:00:00.000Z`);
      if (Number.isNaN(nouvelleDate.getTime())) return res.status(400).json({ error: 'Date de report invalide' });
      // Un report doit toujours être justifié -- même en salle, pas de
      // "report silencieux" que l'ADV découvrirait sans explication.
      if (typeof motifReport !== 'string' || !(motifReport in MOTIF_REPORT_LABELS)) {
        return res.status(400).json({ error: 'Motif de report requis' });
      }
      data.date = nouvelleDate;
      data.motifReport = motifReport;
    }

    const tache = await prisma.tacheCoursier.update({
      where: { id: req.params.id },
      data,
      include: { client: { select: { id: true, nom: true, entite: true } }, coursier: { select: { id: true, nom: true } } },
    });
    res.json(tache);
  } catch (err) {
    next(err);
  }
});

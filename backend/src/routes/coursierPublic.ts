import { Router } from 'express';
import { prisma } from '../db';
import { MOTIF_REPORT_LABELS } from '../lib/taches';

export const coursierPublicRouter = Router();

// Accès terrain sans authentification classique : chaque coursier a un lien
// personnel (token imprévisible, cf. routes/taches.ts) plutôt qu'un compte
// avec mot de passe -- volontairement minimal pour un premier test (cf.
// discussion produit). Le token identifie le coursier, jamais un rôle
// applicatif : aucune de ces routes ne doit exposer plus que "les tâches de
// ce coursier, aujourd'hui".
async function findCoursierByToken(token: string) {
  const coursier = await prisma.coursier.findUnique({ where: { token } });
  if (!coursier || !coursier.actif) return null;
  return coursier;
}

function todayRange() {
  const now = new Date();
  const date = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const nextDay = new Date(date.getTime() + 24 * 60 * 60 * 1000);
  return { date, nextDay };
}

coursierPublicRouter.get('/:token/taches', async (req, res, next) => {
  try {
    const coursier = await findCoursierByToken(req.params.token);
    if (!coursier) return res.status(404).json({ error: 'Lien invalide ou désactivé' });

    const { date, nextDay } = todayRange();
    // `autresCoursiers` alimente le sélecteur de réaffectation -- volontairement
    // limité à id+nom (jamais le token, sans quoi ce lien personnel donnerait
    // accès au lien de tous les autres coursiers).
    const [taches, autresCoursiers] = await Promise.all([
      prisma.tacheCoursier.findMany({
        where: { coursierId: coursier.id, date: { gte: date, lt: nextDay }, statut: { not: 'annulee' } },
        include: { client: { select: { id: true, nom: true, tel: true, entite: true } } },
        // `ordre` nul (jamais réordonné) trie en dernier en ASC côté
        // Postgres -- une tâche fraîchement assignée atterrit donc après
        // celles déjà organisées en tournée, triée parmi elles par
        // création plutôt que dans un ordre arbitraire.
        orderBy: [{ ordre: 'asc' }, { createdAt: 'asc' }],
      }),
      prisma.coursier.findMany({
        where: { actif: true, id: { not: coursier.id } },
        select: { id: true, nom: true },
        orderBy: { nom: 'asc' },
      }),
    ]);
    res.json({ coursier: { nom: coursier.nom }, taches, autresCoursiers });
  } catch (err) {
    next(err);
  }
});

coursierPublicRouter.patch('/:token/taches/:id', async (req, res, next) => {
  try {
    const coursier = await findCoursierByToken(req.params.token);
    if (!coursier) return res.status(404).json({ error: 'Lien invalide ou désactivé' });

    const tache = await prisma.tacheCoursier.findUnique({ where: { id: req.params.id } });
    // Un coursier ne peut jamais agir sur la tâche d'un autre -- vérifié ici
    // plutôt que de faire confiance à l'id transmis par le client.
    if (!tache || tache.coursierId !== coursier.id) {
      return res.status(404).json({ error: 'Tâche introuvable' });
    }

    const { statut, montant, modePaiement, note, report, motifReport, coursierId } = req.body ?? {};
    const data: Record<string, unknown> = {};

    if (coursierId !== undefined) {
      if (typeof coursierId !== 'string' || !coursierId) {
        return res.status(400).json({ error: 'Coursier de destination requis' });
      }
      // Une tâche ne peut être réaffectée qu'à un coursier actif -- jamais
      // vers un lien désactivé (fiche désactivée = plus surveillée par
      // personne côté ADV).
      const cible = await prisma.coursier.findUnique({ where: { id: coursierId } });
      if (!cible || !cible.actif) return res.status(400).json({ error: 'Coursier de destination introuvable' });
      data.coursierId = coursierId;
    }

    if (report !== undefined) {
      if (typeof report !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(report)) {
        return res.status(400).json({ error: 'Date de report invalide (format AAAA-MM-JJ)' });
      }
      const nouvelleDate = new Date(`${report}T00:00:00.000Z`);
      if (Number.isNaN(nouvelleDate.getTime())) return res.status(400).json({ error: 'Date de report invalide' });
      // Un report doit toujours être justifié -- pas de "report silencieux"
      // que l'ADV découvrirait sans explication.
      if (typeof motifReport !== 'string' || !(motifReport in MOTIF_REPORT_LABELS)) {
        return res.status(400).json({ error: 'Motif de report requis' });
      }
      data.date = nouvelleDate;
      data.motifReport = motifReport;
    }

    if (statut !== undefined) {
      if (statut !== 'faite') return res.status(400).json({ error: 'Statut invalide' });
      data.statut = 'faite';
      data.dateExecution = new Date();
      if (montant !== undefined) data.montant = montant === null || montant === '' ? null : Number(montant);
      if (modePaiement !== undefined) data.modePaiement = modePaiement || null;
    }

    if (note !== undefined) data.note = typeof note === 'string' ? note.trim() || null : null;

    const updated = await prisma.tacheCoursier.update({
      where: { id: tache.id },
      data,
      include: { client: { select: { id: true, nom: true, tel: true, entite: true } } },
    });
    res.json(updated);
  } catch (err) {
    next(err);
  }
});

// Le coursier construit sa tournée en réordonnant sa liste du jour --
// reçoit toujours l'ordre complet (pas un simple "monter/descendre" d'une
// tâche) pour rester une opération atomique et sans ambiguïté côté
// serveur : chaque id de la liste reçoit sa position (index) comme
// nouveau `ordre`.
coursierPublicRouter.patch('/:token/reordonner', async (req, res, next) => {
  try {
    const coursier = await findCoursierByToken(req.params.token);
    if (!coursier) return res.status(404).json({ error: 'Lien invalide ou désactivé' });

    const { ordre } = req.body ?? {};
    if (!Array.isArray(ordre) || ordre.length === 0 || !ordre.every((id) => typeof id === 'string')) {
      return res.status(400).json({ error: 'Ordre invalide' });
    }

    const { date, nextDay } = todayRange();
    const tachesDuJour = await prisma.tacheCoursier.findMany({
      where: { coursierId: coursier.id, date: { gte: date, lt: nextDay }, statut: { not: 'annulee' } },
      select: { id: true },
    });
    const idsAttendus = new Set(tachesDuJour.map((t) => t.id));
    // La liste envoyée doit correspondre exactement aux tâches du jour de ce
    // coursier -- ni une tâche d'un autre coursier (jamais vérifié côté
    // client), ni un réordonnancement partiel qui laisserait deux tâches
    // avec le même `ordre`.
    if (ordre.length !== idsAttendus.size || !ordre.every((id) => idsAttendus.has(id))) {
      return res.status(400).json({ error: 'La liste ne correspond pas aux tâches du jour' });
    }

    await prisma.$transaction(ordre.map((id: string, index: number) => prisma.tacheCoursier.update({ where: { id }, data: { ordre: index } })));
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

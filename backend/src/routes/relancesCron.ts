import { Router } from 'express';
import { prisma, withTenant, rlsActive } from '../db';
import { executerRelancesTenant } from '../lib/executerRelances';

// Déclencheur automatique des relances (« les relances partent seules »,
// addendum §5). Appelé par un ordonnanceur externe (cron Render) — PAS de
// session utilisateur : authentifié par un secret partagé (RELANCES_CRON_SECRET).
// Parcourt les organisations qui ont activé les relances et exécute l'envoi réel
// pour chacune, dans SON contexte tenant. Respecte la fenêtre d'envoi
// (executerRelancesTenant n'envoie hors fenêtre que si on le force) : le cron
// peut donc tourner toutes les heures sans risque d'envoi nocturne.
export const relancesCronRouter = Router();

relancesCronRouter.post('/', async (req, res, next) => {
  try {
    const secret = process.env.RELANCES_CRON_SECRET;
    if (!secret) {
      return res.status(503).json({ error: 'Déclencheur cron désactivé (RELANCES_CRON_SECRET non défini)' });
    }
    if (req.header('x-cron-secret') !== secret) {
      return res.status(401).json({ error: 'Secret cron invalide' });
    }
    // Sans RLS, withTenant ne scope pas les requêtes : un traitement par
    // organisation lirait les clients de TOUS les tenants → doublons d'envoi.
    // L'envoi automatique multi-tenant exige donc l'isolation RLS active.
    if (!rlsActive()) {
      return res.status(503).json({ error: 'RLS requis pour l’envoi automatique multi-tenant (RLS_ENABLED != true)' });
    }

    // Hors contexte tenant : l'échappatoire RLS autorise la lecture des
    // organisations éligibles (relances activées, compte non coupé/supprimé).
    const orgs = await prisma.organisation.findMany({
      where: { relancesActivees: true, statut: { in: ['essai', 'actif'] } },
      select: { id: true },
    });

    const resultats = [];
    for (const org of orgs) {
      const rapport = await withTenant(org.id, () => executerRelancesTenant({ dryRun: false }));
      resultats.push({
        organisationId: org.id,
        envoyees: rapport.envoyees.length,
        ignorees: rapport.ignorees.length,
        envoiEffectif: rapport.envoiEffectif,
      });
    }

    res.json({ organisations: orgs.length, resultats });
  } catch (err) {
    next(err);
  }
});

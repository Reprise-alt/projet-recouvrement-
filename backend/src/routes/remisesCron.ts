import { Router } from 'express';
import { prisma, withTenant, rlsActive } from '../db';
import { ingererRemisesBancaires } from '../services/remisesBancairesService';

// Déclencheur automatique de la lecture des avis bancaires (remises chèque /
// virement / espèce). Appelé par un ordonnanceur externe (cron Render) — PAS de
// session utilisateur : authentifié par le même secret partagé que les relances
// (RELANCES_CRON_SECRET). Parcourt les organisations qui ont connecté une boîte
// « avis bancaires » et ingère les nouveaux avis pour chacune, dans SON contexte
// tenant.
//
// ISOLATION : chaque organisation ne lit QUE sa propre boîte Gmail (connexion
// scopée par organisationId) et ne remonte QUE les expéditeurs bancaires de la
// liste blanche. withTenant + RLS garantit qu'aucune écriture ne fuit vers un
// autre tenant.
export const remisesCronRouter = Router();

remisesCronRouter.post('/', async (req, res, next) => {
  try {
    const secret = process.env.RELANCES_CRON_SECRET;
    if (!secret) {
      return res.status(503).json({ error: 'Déclencheur cron désactivé (RELANCES_CRON_SECRET non défini)' });
    }
    if (req.header('x-cron-secret') !== secret) {
      return res.status(401).json({ error: 'Secret cron invalide' });
    }
    // Sans RLS, withTenant ne scope pas les requêtes : l'ingestion lirait/écrirait
    // les factures et chèques de TOUS les tenants. L'ingestion multi-tenant exige
    // donc l'isolation RLS active.
    if (!rlsActive()) {
      return res.status(503).json({ error: 'RLS requis pour l’ingestion automatique multi-tenant (RLS_ENABLED != true)' });
    }

    // Hors contexte tenant : l'échappatoire RLS autorise la lecture des connexions
    // « avis bancaires » actives (une par organisation).
    const connexions = await prisma.integrationCredential.findMany({
      where: { service: 'gmail', usage: 'avis_bancaires', statut: 'actif', organisationId: { not: null } },
      select: { organisationId: true },
    });

    const resultats = [];
    for (const c of connexions) {
      const organisationId = c.organisationId!;
      const rapport = await withTenant(organisationId, () => ingererRemisesBancaires(organisationId));
      resultats.push({ organisationId, ...rapport });
    }

    res.json({ organisations: connexions.length, resultats });
  } catch (err) {
    next(err);
  }
});

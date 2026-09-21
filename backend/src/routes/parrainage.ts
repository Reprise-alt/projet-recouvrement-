import { Router } from 'express';
import { prisma } from '../db';
import { requireAuth } from '../middleware/auth';
import { obtenirOuCreerCode } from '../lib/parrainage';

// Parrainage côté client : récupérer/générer son code, et voir ses filleuls et
// ses mois offerts. Authentifié (compte SaaS), pas de restriction d'abonnement
// (un compte en essai peut parrainer).
export const parrainageRouter = Router();
parrainageRouter.use(requireAuth);

parrainageRouter.get('/', async (req, res, next) => {
  try {
    const orgId = req.user!.organisationId;
    const code = await obtenirOuCreerCode(orgId);

    // Filleuls = organisations inscrites avec ce code.
    const filleuls = await prisma.organisation.findMany({
      where: { parrainePar: code },
      select: { raisonSociale: true, statut: true, createdAt: true },
      orderBy: { createdAt: 'desc' },
    });
    const org = await prisma.organisation.findUnique({ where: { id: orgId }, select: { moisOffertsGagnes: true } });

    const front = process.env.FRONTEND_URL?.replace(/\/$/, '') || '';
    const lien = front ? `${front}/inscription?parrain=${encodeURIComponent(code)}` : '';

    res.json({
      code,
      lien,
      moisOffertsGagnes: org?.moisOffertsGagnes ?? 0,
      filleuls: filleuls.map((f) => ({
        raisonSociale: f.raisonSociale,
        // On n'expose que « actif » vs « en attente » (pas le détail du statut).
        actif: f.statut === 'actif',
        createdAt: f.createdAt,
      })),
      nbFilleuls: filleuls.length,
      nbConfirmes: filleuls.filter((f) => f.statut === 'actif').length,
    });
  } catch (err) {
    next(err);
  }
});

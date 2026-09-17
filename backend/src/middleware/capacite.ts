import { NextFunction, Request, Response } from 'express';
import { prisma, rlsActive } from '../db';
import { capacites, Capacites } from '../lib/formules';

// Charge les capacités de l'organisation courante d'après sa formule.
export async function getCapacites(organisationId: string): Promise<Capacites> {
  const org = await prisma.organisation.findUnique({
    where: { id: organisationId },
    select: { formule: true, optionContentieux: true },
  });
  return capacites(org?.formule ?? 'pme', org?.optionContentieux ?? false);
}

// Garde une route derrière une capacité booléenne de la formule (reporting,
// contentieux, multiEntites). À placer après requireAuth. Sur le déploiement
// GROUPE (RLS désactivée = mono-tenant interne), aucun bridage : next() direct.
export function requireCapacite(nom: 'reporting' | 'contentieux' | 'multiEntites') {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!rlsActive()) return next();
      const caps = await getCapacites(req.user!.organisationId);
      if (!caps[nom]) {
        res.status(403).json({ error: 'Fonction non incluse dans votre formule', capacite: nom });
        return;
      }
      next();
    } catch (err) {
      next(err);
    }
  };
}

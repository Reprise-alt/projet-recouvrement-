import { NextFunction, Request, Response } from 'express';
import { prisma } from '../db';
import { abonnementBloque, etatAbonnement } from '../lib/abonnement';

// Garde d'abonnement (addendum §8) : bloque l'accès aux routes produit quand
// l'organisation est en essai EXPIRÉ ou suspendue. À placer après requireAuth
// (a besoin de req.user). Renvoie 402 (Payment Required) avec l'état, que le
// front traduit en écran « essai terminé / compte suspendu ». Les comptes
// « actif » (dont le groupe socle) passent sans blocage.
export async function requireAbonnementActif(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const org = await prisma.organisation.findUnique({
      where: { id: req.user!.organisationId },
      select: { statut: true, dateFinEssai: true },
    });
    if (!org) {
      res.status(404).json({ error: 'Organisation introuvable' });
      return;
    }
    const info = etatAbonnement(org);
    if (abonnementBloque(info)) {
      res.status(402).json({ error: 'Abonnement requis', abonnement: info });
      return;
    }
    next();
  } catch (err) {
    next(err);
  }
}

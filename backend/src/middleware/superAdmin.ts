import { NextFunction, Request, Response } from 'express';
import { estSuperAdmin } from '../lib/superAdmin';

// Garde « exploitant plateforme » (addendum §8) : réservée aux emails listés
// dans SUPERADMIN_EMAILS. À placer après requireAuth. Distinct des rôles
// d'organisation — c'est l'opérateur du SaaS (activation des comptes).
export function requireSuperAdmin(req: Request, res: Response, next: NextFunction): void {
  if (!estSuperAdmin(req.user?.email)) {
    res.status(403).json({ error: "Réservé à l'exploitant de la plateforme" });
    return;
  }
  next();
}

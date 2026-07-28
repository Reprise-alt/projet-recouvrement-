import { NextFunction, Request, Response } from 'express';
import { prisma } from '../db';
import { Entite, RoleUtilisateur, userCanAccessEntite } from '../lib/entites';
import { extractEmailFromToken } from '../lib/verifyToken';

export interface AuthedUser {
  id: string;
  nom: string;
  email: string;
  role: RoleUtilisateur;
  entite: Entite | null;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: AuthedUser;
    }
  }
}

// Vérifie un JWT émis par Supabase Auth (signature asymétrique, contre le
// JWKS public du projet) et résout l'utilisateur applicatif correspondant
// via son email — l'identité vient de Supabase, mais le rôle et l'entité de
// rattachement restent gérés dans la table Utilisateur de cette base (cf.
// cahier des charges §4). Voir lib/verifyToken.ts pour le repli dev-only.
export async function requireAuth(req: Request, res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Authentification requise' });
  }
  const token = header.slice('Bearer '.length);

  const email = await extractEmailFromToken(token);
  if (!email) {
    return res.status(401).json({ error: 'Token invalide ou expiré' });
  }

  const utilisateur = await prisma.utilisateur.findUnique({ where: { email } });
  if (!utilisateur) {
    return res.status(403).json({ error: "Compte non provisionné — contactez un administrateur" });
  }

  req.user = {
    id: utilisateur.id,
    nom: utilisateur.nom,
    email: utilisateur.email,
    role: utilisateur.role as RoleUtilisateur,
    entite: (utilisateur.entite as Entite | null) ?? null,
  };
  next();
}

export function requireRole(...roles: RoleUtilisateur[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) return res.status(401).json({ error: 'Authentification requise' });
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ error: 'Accès refusé pour ce rôle' });
    }
    next();
  };
}

// À appeler après avoir chargé la ressource ciblée (client, contrat...) pour
// vérifier que son entité est dans la portée de l'utilisateur authentifié —
// nécessaire en plus du filtrage de liste, car un accès direct par id ne
// passe pas par ce filtrage.
export function assertEntiteInScope(req: Request, res: Response, entite: Entite): boolean {
  if (!req.user || !userCanAccessEntite(req.user, entite)) {
    res.status(403).json({ error: "Accès refusé — hors du périmètre de votre compte" });
    return false;
  }
  return true;
}

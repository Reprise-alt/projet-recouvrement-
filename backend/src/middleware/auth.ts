import { NextFunction, Request, Response } from 'express';
import { prisma } from '../db';
import { Entite, RoleUtilisateur, userCanAccessEntite } from '../lib/entites';
import { extractEmailFromToken } from '../lib/verifyToken';

export type RoleOperations = 'directrice_operations' | 'charge_compte' | 'direction_generale';

export interface AuthedUser {
  id: string;
  nom: string;
  email: string;
  role: RoleUtilisateur;
  entite: Entite | null;
  // Accès aux deux modules -- indépendants l'un de l'autre. accesRecouvrement
  // vrai par défaut (comptes existants) ; roleOperations null par défaut
  // (nouveau module, jamais d'accès implicite).
  accesRecouvrement: boolean;
  roleOperations: RoleOperations | null;
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
    accesRecouvrement: utilisateur.accesRecouvrement,
    roleOperations: (utilisateur.roleOperations as RoleOperations | null) ?? null,
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

// Porte d'entrée du recouvrement (montants, factures, contrats, relances) --
// à appliquer sur les routers qui exposent des données financières, pour
// qu'un utilisateur provisionné uniquement côté Opérations (accesRecouvrement
// = false) ne puisse jamais les atteindre, même par un appel API direct et
// pas seulement parce que l'onglet est masqué côté interface (cahier §7).
export function requireAccesRecouvrement(req: Request, res: Response, next: NextFunction) {
  if (!req.user) return res.status(401).json({ error: 'Authentification requise' });
  if (!req.user.accesRecouvrement) {
    return res.status(403).json({ error: 'Accès refusé — pas d\'accès au module Recouvrement' });
  }
  next();
}

// Porte d'entrée du module Opérations -- roleOperations null = jamais
// provisionné pour ce module, quel que soit le rôle recouvrement par
// ailleurs (les deux sont orthogonaux, cf. AuthedUser.roleOperations).
export function requireModuleOperations(...roles: RoleOperations[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) return res.status(401).json({ error: 'Authentification requise' });
    if (!req.user.roleOperations) {
      return res.status(403).json({ error: "Accès refusé — pas d'accès au module Opérations" });
    }
    if (roles.length && !roles.includes(req.user.roleOperations)) {
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

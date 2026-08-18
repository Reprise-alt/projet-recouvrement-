import { NextFunction, Request, Response } from 'express';
import { prisma } from '../db';
import { Entite, RoleUtilisateur, userCanAccessEntite } from '../lib/entites';
import { extractEmailFromToken } from '../lib/verifyToken';
import { accesDepuisMoi, lireCookie, resoudreSession } from '../lib/sso';

// Mode d'authentification : 'sso' = session partagée du hub OLU 360 (cookie
// olu360_session validé par le socle) ; 'supabase' (défaut) = JWT Supabase,
// comportement historique. L'interrupteur permet de basculer sans rien casser,
// en gardant Supabase comme filet le temps de la transition.
const AUTH_MODE = process.env.AUTH_MODE === 'sso' ? 'sso' : 'supabase';

export type RoleOperations = 'directrice_operations' | 'charge_compte' | 'direction_generale';

export interface AuthedUser {
  id: string;
  nom: string;
  email: string;
  role: RoleUtilisateur;
  entite: Entite | null;
  // Accès aux modules -- indépendants les uns des autres. accesRecouvrement
  // vrai par défaut (comptes existants) ; roleOperations null par défaut
  // (nouveau module, jamais d'accès implicite) ; accesPlanningCoursiers pour
  // la console Planning des coursiers, découplée du recouvrement.
  accesRecouvrement: boolean;
  roleOperations: RoleOperations | null;
  accesPlanningCoursiers: boolean;
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
  if (AUTH_MODE === 'sso') return requireAuthSso(req, res, next);

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
    accesPlanningCoursiers: utilisateur.accesPlanningCoursiers,
  };
  next();
}

// Authentification par le SSO du hub : le cookie olu360_session est validé par
// le socle (/moi), qui donne l'identité + les accès console. Le socle est la
// source de vérité ; on tient une fiche locale « miroir » (créée/actualisée à
// la volée par email) parce que l'historique des relances pointe sur
// l'utilisateur local — indispensable pour le reporting « par agent ».
async function requireAuthSso(req: Request, res: Response, next: NextFunction) {
  const token = lireCookie(req.headers.cookie, 'olu360_session');
  const moi = await resoudreSession(token);
  if (!moi) {
    return res.status(401).json({ error: 'Authentification requise' });
  }
  const acc = accesDepuisMoi(moi);
  // Clé de rattachement de la fiche locale : l'email du compte socle s'il
  // existe (permet de conserver l'historique des relances de l'agent), sinon
  // un repli stable dérivé de l'identifiant (unique côté socle). On ne bloque
  // JAMAIS un compte valide du hub faute d'email — sinon boucle de connexion.
  const cleEmail = acc.email ?? `${moi.utilisateur.identifiant}@olu360.local`;

  // Miroir local : source de vérité = socle. On crée la fiche si absente, on
  // réaligne rôle/entité/accès à chaque connexion. estAgentRecouvrement n'est
  // posé qu'à la création (drapeau de reporting local, ajustable ensuite).
  const utilisateur = await prisma.utilisateur.upsert({
    where: { email: cleEmail },
    create: {
      nom: acc.nom,
      email: cleEmail,
      role: acc.role,
      entite: acc.entite,
      estAgentRecouvrement: acc.estAgentRecouvrement,
      accesRecouvrement: acc.accesRecouvrement,
      roleOperations: acc.roleOperations,
      accesPlanningCoursiers: acc.accesPlanningCoursiers,
    },
    update: {
      nom: acc.nom,
      role: acc.role,
      entite: acc.entite,
      accesRecouvrement: acc.accesRecouvrement,
      roleOperations: acc.roleOperations,
      accesPlanningCoursiers: acc.accesPlanningCoursiers,
    },
  });

  req.user = {
    id: utilisateur.id,
    nom: utilisateur.nom,
    email: utilisateur.email,
    role: utilisateur.role as RoleUtilisateur,
    entite: (utilisateur.entite as Entite | null) ?? null,
    accesRecouvrement: utilisateur.accesRecouvrement,
    roleOperations: (utilisateur.roleOperations as RoleOperations | null) ?? null,
    accesPlanningCoursiers: utilisateur.accesPlanningCoursiers,
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

// Porte d'entrée de la console Planning des coursiers -- découplée du
// recouvrement depuis le découpage en consoles séparées. Un compte peut avoir
// le Planning sans voir aucune donnée financière, et inversement.
export function requireAccesPlanningCoursiers(req: Request, res: Response, next: NextFunction) {
  if (!req.user) return res.status(401).json({ error: 'Authentification requise' });
  if (!req.user.accesPlanningCoursiers) {
    return res.status(403).json({ error: 'Accès refusé — pas d\'accès à la console Planning des coursiers' });
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

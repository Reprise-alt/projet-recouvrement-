import { NextFunction, Request, Response } from 'express';
import { RoleOrg } from '@prisma/client';
import { prisma } from '../db';
import { Entite, RoleUtilisateur, userCanAccessEntite } from '../lib/entites';
import { extractEmailFromToken } from '../lib/verifyToken';
import { verifierSession, verifierSessionPartenaire } from '../lib/authToken';
import { estPartenaire } from '../lib/partenaires';
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
  // Tenant SaaS (addendum §2-3). Pour les comptes du groupe (SSO socle), c'est
  // toujours l'organisation socle ; pour un compte SaaS, son organisation propre.
  organisationId: string;
  // Rôle SaaS dans l'organisation (null pour les comptes groupe historiques).
  roleOrg: RoleOrg | null;
  // Accès aux modules -- indépendants les uns des autres. accesRecouvrement
  // vrai par défaut (comptes existants) ; roleOperations null par défaut
  // (nouveau module, jamais d'accès implicite) ; accesPlanningCoursiers pour
  // la console Planning des coursiers, découplée du recouvrement.
  accesRecouvrement: boolean;
  roleOperations: RoleOperations | null;
  accesPlanningCoursiers: boolean;
  // Accès au seul onglet Contentieux (collaborateur juridique externe). Drapeau
  // LOCAL : jamais réaligné depuis le socle SSO — un admin l'attribue ici.
  accesContentieux: boolean;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: AuthedUser;
      // Cabinet partenaire (avocat/huissier plateforme) — identité SANS
      // organisation (transverse aux sociétés). Posé par requirePartenaire /
      // requireAuthOuPartenaire, jamais en même temps que `user`.
      partenaire?: { email: string };
    }
  }
}

// Vérifie un JWT émis par Supabase Auth (signature asymétrique, contre le
// JWKS public du projet) et résout l'utilisateur applicatif correspondant
// via son email — l'identité vient de Supabase, mais le rôle et l'entité de
// rattachement restent gérés dans la table Utilisateur de cette base (cf.
// cahier des charges §4). Voir lib/verifyToken.ts pour le repli dev-only.
// Construit le contexte d'auth à partir d'une fiche Utilisateur (chemin OTP).
function toAuthedUser(u: {
  id: string; nom: string; email: string; role: RoleUtilisateur; entite: string | null;
  organisationId: string; roleOrg: RoleOrg | null; accesRecouvrement: boolean;
  roleOperations: RoleOperations | null; accesPlanningCoursiers: boolean; accesContentieux: boolean;
}): AuthedUser {
  return {
    id: u.id,
    nom: u.nom,
    email: u.email,
    role: u.role,
    entite: (u.entite as Entite | null) ?? null,
    organisationId: u.organisationId,
    roleOrg: u.roleOrg ?? null,
    accesRecouvrement: u.accesRecouvrement,
    roleOperations: u.roleOperations ?? null,
    accesPlanningCoursiers: u.accesPlanningCoursiers,
    accesContentieux: u.accesContentieux,
  };
}

export async function requireAuth(req: Request, res: Response, next: NextFunction) {
  // Session SaaS (OTP) : token Bearer signé par notre secret. Essayé en premier
  // et indépendant du mode SSO/Supabase — les deux systèmes cohabitent. Un JWT
  // Supabase ne vérifie pas contre notre secret et retombe sur le chemin suivant.
  const bearer = req.headers.authorization;
  if (bearer?.startsWith('Bearer ')) {
    const sess = verifierSession(bearer.slice('Bearer '.length));
    if (sess) {
      const u = await prisma.utilisateur.findUnique({ where: { id: sess.sub } });
      if (!u) return res.status(403).json({ error: 'Compte introuvable' });
      req.user = toAuthedUser(u);
      return next();
    }
  }

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
    organisationId: utilisateur.organisationId,
    roleOrg: utilisateur.roleOrg ?? null,
    accesRecouvrement: utilisateur.accesRecouvrement,
    roleOperations: (utilisateur.roleOperations as RoleOperations | null) ?? null,
    accesPlanningCoursiers: utilisateur.accesPlanningCoursiers,
    accesContentieux: utilisateur.accesContentieux,
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
      accesContentieux: acc.accesContentieux,
    },
    update: {
      nom: acc.nom,
      role: acc.role,
      entite: acc.entite,
      accesRecouvrement: acc.accesRecouvrement,
      roleOperations: acc.roleOperations,
      accesPlanningCoursiers: acc.accesPlanningCoursiers,
      // Désormais piloté par le socle (grant « contentieux »).
      accesContentieux: acc.accesContentieux,
    },
  });

  req.user = {
    id: utilisateur.id,
    nom: utilisateur.nom,
    email: utilisateur.email,
    role: utilisateur.role as RoleUtilisateur,
    entite: (utilisateur.entite as Entite | null) ?? null,
    organisationId: utilisateur.organisationId,
    roleOrg: utilisateur.roleOrg ?? null,
    accesRecouvrement: utilisateur.accesRecouvrement,
    roleOperations: (utilisateur.roleOperations as RoleOperations | null) ?? null,
    accesPlanningCoursiers: utilisateur.accesPlanningCoursiers,
    // Non réaligné depuis le socle : drapeau local (l'externe n'existe pas côté hub).
    accesContentieux: utilisateur.accesContentieux,
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

// Authentifie un cabinet partenaire (jeton `partenaire`) et vérifie qu'il figure
// toujours dans PARTENAIRE_EMAILS (révocable en retirant l'email de l'env). Pose
// `req.partenaire` sans aucune organisation : les routes partenaire opèrent hors
// contexte tenant (lecture transverse via l'échappatoire RLS). Un jeton
// d'organisation normal est refusé ici.
export function requirePartenaire(req: Request, res: Response, next: NextFunction) {
  const bearer = req.headers.authorization;
  if (!bearer?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Authentification requise' });
  }
  const p = verifierSessionPartenaire(bearer.slice('Bearer '.length));
  if (!p || !estPartenaire(p.email)) {
    return res.status(403).json({ error: 'Accès réservé au cabinet partenaire' });
  }
  req.partenaire = { email: p.email };
  next();
}

// Variante pour /me : accepte soit un jeton partenaire (pose req.partenaire),
// soit un compte normal (délègue à requireAuth). Sert de point d'entrée unique
// pour que le front sache, au chargement, s'il est en session partenaire.
export async function requireAuthOuPartenaire(req: Request, res: Response, next: NextFunction) {
  const bearer = req.headers.authorization;
  if (bearer?.startsWith('Bearer ')) {
    const p = verifierSessionPartenaire(bearer.slice('Bearer '.length));
    if (p && estPartenaire(p.email)) {
      req.partenaire = { email: p.email };
      return next();
    }
  }
  return requireAuth(req, res, next);
}

// Restriction par rôle SaaS (roleOrg). À appliquer progressivement sur les routes
// pour limiter selon propriétaire / administrateur / gestionnaire / lecture. Un
// compte sans roleOrg (compte groupe historique) est refusé par ce garde — il
// n'est donc à monter que sur des routes propres au parcours SaaS.
export function requireOrgRole(...roles: RoleOrg[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) return res.status(401).json({ error: 'Authentification requise' });
    if (!req.user.roleOrg || !roles.includes(req.user.roleOrg)) {
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

// Porte d'entrée du module Contentieux. Admet DEUX profils : les internes du
// recouvrement (accesRecouvrement) ET les collaborateurs juridiques externes
// (accesContentieux) — ces derniers n'ayant accès qu'à cet onglet. La
// distinction de DROITS (l'externe ne fait que consulter/valider/signer, et ne
// voit que ses dossiers assignés) est appliquée dans le routeur contentieux via
// estCollaborateurJuridique().
export function requireAccesContentieux(req: Request, res: Response, next: NextFunction) {
  if (!req.user) return res.status(401).json({ error: 'Authentification requise' });
  if (!req.user.accesRecouvrement && !req.user.accesContentieux) {
    return res.status(403).json({ error: 'Accès refusé — pas d\'accès au module Contentieux' });
  }
  next();
}

// Vrai pour un collaborateur juridique externe : accès Contentieux SANS accès
// recouvrement interne. Détermine le périmètre (dossiers assignés uniquement) et
// les droits restreints (consulter + valider/signer, jamais créer/modifier).
export function estCollaborateurJuridique(user: AuthedUser): boolean {
  return user.accesContentieux && !user.accesRecouvrement;
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

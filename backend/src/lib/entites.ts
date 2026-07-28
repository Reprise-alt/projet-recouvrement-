export type Entite = 'SORAM' | 'SIS' | 'IRIS' | 'COMMUN';
export type RoleUtilisateur = 'admin' | 'manager_entite' | 'comptable';

export const VALID_ENTITES: Entite[] = ['SORAM', 'SIS', 'IRIS', 'COMMUN'];

// Un client COMMUN apparaît dans le filtre de chaque entité — cohérent avec
// le prototype où COMMUN désigne un client partagé entre entités du groupe.
export function matchesEntity(clientEntite: Entite, filterEntite: Entite | 'ALL'): boolean {
  if (filterEntite === 'ALL') return true;
  if (clientEntite === filterEntite) return true;
  if (clientEntite === 'COMMUN') return true;
  return false;
}

export interface ScopedUser {
  role: RoleUtilisateur;
  entite: Entite | null;
}

// Un utilisateur a une portée illimitée (les 3 entités) s'il est admin, ou
// comptable sans entité assignée (cf. §4 : "Comptable — Les 3 entités
// (lecture) ou son entité"). Un manager d'entité — ou un comptable rattaché
// à une entité précise — est toujours restreint à celle-ci, quoi qu'il
// demande côté requête : cf. §4 "un manager IRIS ne doit jamais recevoir de
// données SORAM/SIS, même via un appel API direct."
export function hasUnrestrictedScope(user: ScopedUser): boolean {
  return user.role === 'admin' || !user.entite;
}

export function userCanAccessEntite(user: ScopedUser, entite: Entite): boolean {
  if (hasUnrestrictedScope(user)) return true;
  return matchesEntity(entite, user.entite as Entite);
}

// Calcule le filtre d'entité effectif pour une requête de liste : un
// utilisateur à portée restreinte voit toujours son entité verrouillée,
// quelle que soit la valeur demandée en query string.
export function resolveEntiteScope(user: ScopedUser, requested: unknown): Entite | 'ALL' {
  const requestedNorm: Entite | 'ALL' =
    typeof requested === 'string' && VALID_ENTITES.includes(requested as Entite) ? (requested as Entite) : 'ALL';
  if (hasUnrestrictedScope(user)) return requestedNorm;
  return user.entite as Entite;
}

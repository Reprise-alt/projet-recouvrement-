// Le code d'une entité (ex: "SORAM", "IRIS", ou une entreprise ajoutée depuis
// l'interface) est un identifiant texte géré par la table Entreprise plutôt
// qu'un type figé — cet alias garde le nom `Entite` utilisé dans tout le
// reste du code sans qu'il y ait de changement à faire ailleurs.
export type Entite = string;
export type RoleUtilisateur = 'admin' | 'manager_entite' | 'comptable';

// Code réservé de l'entité spéciale "partagée entre toutes les entités"
// (cf. Entreprise.estCommun) — fixé une fois pour toutes à la création de la
// table (voir la migration), jamais éditable depuis l'admin des entreprises.
export const COMMUN_CODE = 'COMMUN';

// Un client COMMUN apparaît dans le filtre de chaque entité — cohérent avec
// le prototype où COMMUN désigne un client partagé entre entités du groupe.
export function matchesEntity(clientEntite: Entite, filterEntite: Entite | 'ALL'): boolean {
  if (filterEntite === 'ALL') return true;
  if (clientEntite === filterEntite) return true;
  if (clientEntite === COMMUN_CODE) return true;
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
// quelle que soit la valeur demandée en query string. Pour un utilisateur à
// portée illimitée, une valeur demandée qui ne correspond à aucune entité
// réelle renvoie simplement une liste vide côté requête — pas besoin de la
// valider ici contre une liste figée, la table Entreprise étant dynamique.
export function resolveEntiteScope(user: ScopedUser, requested: unknown): Entite | 'ALL' {
  if (hasUnrestrictedScope(user)) {
    return typeof requested === 'string' && requested.trim() ? requested : 'ALL';
  }
  return user.entite as Entite;
}

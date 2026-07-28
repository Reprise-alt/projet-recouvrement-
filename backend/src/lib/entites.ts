export type Entite = 'SORAM' | 'SIS' | 'IRIS' | 'COMMUN';

// Un client COMMUN apparaît dans le filtre de chaque entité — cohérent avec
// le prototype où COMMUN désigne un client partagé entre entités du groupe.
export function matchesEntity(clientEntite: Entite, filterEntite: Entite | 'ALL'): boolean {
  if (filterEntite === 'ALL') return true;
  if (clientEntite === filterEntite) return true;
  if (clientEntite === 'COMMUN') return true;
  return false;
}

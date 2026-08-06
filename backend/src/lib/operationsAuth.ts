import { Entite, matchesEntity } from './entites';
import { RoleOperations } from '../middleware/auth';

export interface ScopedUserOperations {
  roleOperations: RoleOperations | null;
  entite: Entite | null;
  id: string;
}

// direction_generale voit les deux entités (comme admin côté recouvrement) ;
// une directrice ou un chargé de compte sans entité assignée serait une
// erreur de provisioning, pas un accès élargi -- cf. userCanAccessEntite qui
// applique la même règle côté recouvrement.
export function hasUnrestrictedScopeOperations(user: ScopedUserOperations): boolean {
  return user.roleOperations === 'direction_generale' || !user.entite;
}

export function userCanAccessEntiteOperations(user: ScopedUserOperations, entite: Entite): boolean {
  if (hasUnrestrictedScopeOperations(user)) return true;
  return matchesEntity(entite, user.entite as Entite);
}

export function resolveEntiteScopeOperations(user: ScopedUserOperations, requested: unknown): Entite | 'ALL' {
  if (hasUnrestrictedScopeOperations(user)) {
    return typeof requested === 'string' && requested.trim() ? requested : 'ALL';
  }
  return user.entite as Entite;
}

// Restriction supplémentaire propre au rôle charge_compte (cahier §7 : "ses
// comptes uniquement") -- s'applique en plus du filtre d'entité ci-dessus,
// jamais à sa place : un charge_compte reste de toute façon borné à son
// entité comme une directrice.
export function chargeDeCompteWhere(user: ScopedUserOperations): { chargeDeCompteId: string } | {} {
  return user.roleOperations === 'charge_compte' ? { chargeDeCompteId: user.id } : {};
}

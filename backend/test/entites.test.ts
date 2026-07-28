import { describe, expect, it } from 'vitest';
import { hasUnrestrictedScope, matchesEntity, resolveEntiteScope, userCanAccessEntite } from '../src/lib/entites';

describe('matchesEntity', () => {
  it('matches everything for ALL', () => {
    expect(matchesEntity('SORAM', 'ALL')).toBe(true);
    expect(matchesEntity('IRIS', 'ALL')).toBe(true);
  });

  it('matches only the same entité otherwise', () => {
    expect(matchesEntity('SORAM', 'SORAM')).toBe(true);
    expect(matchesEntity('SORAM', 'IRIS')).toBe(false);
  });

  it('always matches a COMMUN client regardless of the filter', () => {
    expect(matchesEntity('COMMUN', 'SORAM')).toBe(true);
    expect(matchesEntity('COMMUN', 'IRIS')).toBe(true);
  });
});

describe('hasUnrestrictedScope', () => {
  it('is true for admin regardless of entite', () => {
    expect(hasUnrestrictedScope({ role: 'admin', entite: 'SORAM' })).toBe(true);
    expect(hasUnrestrictedScope({ role: 'admin', entite: null })).toBe(true);
  });

  it('is true for a comptable with no entite assigned (accès aux 3)', () => {
    expect(hasUnrestrictedScope({ role: 'comptable', entite: null })).toBe(true);
  });

  it('is false for a manager_entite, and for a comptable scoped to one entite', () => {
    expect(hasUnrestrictedScope({ role: 'manager_entite', entite: 'IRIS' })).toBe(false);
    expect(hasUnrestrictedScope({ role: 'comptable', entite: 'SORAM' })).toBe(false);
  });
});

describe('userCanAccessEntite', () => {
  it('lets a manager access only their own entite, plus COMMUN', () => {
    const irisManager = { role: 'manager_entite' as const, entite: 'IRIS' as const };
    expect(userCanAccessEntite(irisManager, 'IRIS')).toBe(true);
    expect(userCanAccessEntite(irisManager, 'COMMUN')).toBe(true);
    expect(userCanAccessEntite(irisManager, 'SORAM')).toBe(false);
    expect(userCanAccessEntite(irisManager, 'SIS')).toBe(false);
  });
});

describe('resolveEntiteScope', () => {
  it('lets admin request any entite, defaulting to ALL', () => {
    expect(resolveEntiteScope({ role: 'admin', entite: null }, 'SIS')).toBe('SIS');
    expect(resolveEntiteScope({ role: 'admin', entite: null }, undefined)).toBe('ALL');
  });

  it('ignores the requested entite for a manager and locks to their own', () => {
    const irisManager = { role: 'manager_entite' as const, entite: 'IRIS' as const };
    expect(resolveEntiteScope(irisManager, 'SORAM')).toBe('IRIS');
    expect(resolveEntiteScope(irisManager, 'ALL')).toBe('IRIS');
    expect(resolveEntiteScope(irisManager, undefined)).toBe('IRIS');
  });

  it('passes an unrecognized code through as-is for unrestricted users (a dynamic entity list can\'t be validated here)', () => {
    // Une entité créée depuis l'interface n'est pas connue de cette fonction
    // pure — le filtre passe tel quel, une requête Prisma sur un code
    // inexistant renvoie simplement une liste vide, sans risque de sécurité.
    expect(resolveEntiteScope({ role: 'admin', entite: null }, 'NOUVELLE_ENTITE')).toBe('NOUVELLE_ENTITE');
  });

  it('falls back to ALL only when nothing (or an empty string) is requested', () => {
    expect(resolveEntiteScope({ role: 'admin', entite: null }, undefined)).toBe('ALL');
    expect(resolveEntiteScope({ role: 'admin', entite: null }, '')).toBe('ALL');
  });
});

import { describe, expect, it } from 'vitest';
import { capacites } from '../src/lib/formules';

describe('capacites par formule', () => {
  it('Petite : 50 débiteurs, 2 utilisateurs, pas de reporting/multi-entités', () => {
    const c = capacites('petite');
    expect(c).toMatchObject({ maxDebiteurs: 50, maxUtilisateurs: 2, reporting: false, multiEntites: false, contentieux: false });
  });

  it('PME : 500 débiteurs, 5 utilisateurs, reporting + multi-entités', () => {
    const c = capacites('pme');
    expect(c).toMatchObject({ maxDebiteurs: 500, maxUtilisateurs: 5, reporting: true, multiEntites: true, contentieux: false });
  });

  it('Grands comptes : illimité, contentieux inclus', () => {
    const c = capacites('grands_comptes');
    expect(c).toMatchObject({ maxDebiteurs: null, maxUtilisateurs: null, reporting: true, multiEntites: true, contentieux: true });
  });

  it("l'option contentieux débloque le contentieux pour Petite/PME", () => {
    expect(capacites('petite', true).contentieux).toBe(true);
    expect(capacites('pme', true).contentieux).toBe(true);
    // Sans effet sur le reste
    expect(capacites('petite', true).reporting).toBe(false);
  });
});

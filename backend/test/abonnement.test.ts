import { describe, expect, it } from 'vitest';
import { abonnementBloque, etatAbonnement } from '../src/lib/abonnement';

const now = new Date('2026-06-15T12:00:00Z');
const dans = (jours: number) => new Date(now.getTime() + jours * 86_400_000);

describe('etatAbonnement', () => {
  it('compte actif = accès complet, jamais bloqué', () => {
    const info = etatAbonnement({ statut: 'actif', dateFinEssai: null }, now);
    expect(info.etat).toBe('actif');
    expect(abonnementBloque(info)).toBe(false);
  });

  it('essai en cours = jours restants, non bloqué', () => {
    const info = etatAbonnement({ statut: 'essai', dateFinEssai: dans(5) }, now);
    expect(info.etat).toBe('essai');
    expect(info.joursRestants).toBe(5);
    expect(abonnementBloque(info)).toBe(false);
  });

  it('essai échu = bloqué', () => {
    const info = etatAbonnement({ statut: 'essai', dateFinEssai: dans(-1) }, now);
    expect(info.etat).toBe('essai_expire');
    expect(abonnementBloque(info)).toBe(true);
  });

  it('compte coupé/supprimé = suspendu (bloqué)', () => {
    expect(abonnementBloque(etatAbonnement({ statut: 'coupe', dateFinEssai: null }, now))).toBe(true);
    expect(abonnementBloque(etatAbonnement({ statut: 'supprime', dateFinEssai: null }, now))).toBe(true);
  });

  it('essai sans date (legacy) = illimité, non bloqué', () => {
    const info = etatAbonnement({ statut: 'essai', dateFinEssai: null }, now);
    expect(info.etat).toBe('essai');
    expect(abonnementBloque(info)).toBe(false);
  });

  it('arrondit les jours restants au jour supérieur', () => {
    const info = etatAbonnement({ statut: 'essai', dateFinEssai: new Date(now.getTime() + 1.2 * 86_400_000) }, now);
    expect(info.joursRestants).toBe(2);
  });
});

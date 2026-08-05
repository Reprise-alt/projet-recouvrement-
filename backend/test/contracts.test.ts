import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { contractAlertLevel, contractEcheance, montantProjete, nextAnniversary } from '../src/lib/contracts';

describe('contractEcheance / contractAlertLevel', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-28T12:00:00Z'));
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('prefers the tariff revision date when it falls before the contract end and is not yet past', () => {
    const contract = { dateFin: '2027-12-31', dateRevisionTarif: '2026-09-01' };
    const e = contractEcheance(contract);
    expect(e.type).toBe('revision_tarif');
    expect(e.date).toBe('2026-09-01');
    expect(e.jours).toBe(35);
  });

  it('falls back to the contract end when the tariff revision date is already past', () => {
    const contract = { dateFin: '2027-12-31', dateRevisionTarif: '2026-01-01' };
    const e = contractEcheance(contract);
    expect(e.type).toBe('renouvellement');
    expect(e.date).toBe('2027-12-31');
  });

  it('falls back to the contract end when the tariff revision date is after it', () => {
    const contract = { dateFin: '2026-08-15', dateRevisionTarif: '2027-01-01' };
    const e = contractEcheance(contract);
    expect(e.type).toBe('renouvellement');
  });

  it('has no tariff revision date at all', () => {
    const contract = { dateFin: '2026-08-15', dateRevisionTarif: null };
    const e = contractEcheance(contract);
    expect(e.type).toBe('renouvellement');
    expect(e.jours).toBe(18);
  });

  it('classifies alert levels at their boundaries', () => {
    expect(contractAlertLevel({ dateFin: '2026-07-27' })).toBe(5); // already past
    expect(contractAlertLevel({ dateFin: '2026-08-27' })).toBe(4); // 30 days
    expect(contractAlertLevel({ dateFin: '2026-09-26' })).toBe(3); // 60 days
    expect(contractAlertLevel({ dateFin: '2026-10-26' })).toBe(2); // 90 days
    expect(contractAlertLevel({ dateFin: '2027-01-01' })).toBe(1); // far out
  });

  it('derives the tariff revision date from the anniversary when a taux is set, ignoring dateRevisionTarif', () => {
    const contract = {
      dateFin: '2028-01-01',
      dateDebut: '2024-09-15',
      tauxAugmentation: 3,
      dateRevisionTarif: '2099-01-01', // ne doit pas être utilisée
    };
    const e = contractEcheance(contract);
    expect(e.type).toBe('revision_tarif');
    expect(e.date).toEqual(new Date(2026, 8, 15)); // prochain 15 septembre
  });

  it('anchors the next revision on dateDerniereRevision once a revision has already been applied', () => {
    const contract = {
      dateFin: '2028-01-01',
      dateDebut: '2020-09-15',
      tauxAugmentation: 3,
      dateDerniereRevision: '2025-09-15',
    };
    const e = contractEcheance(contract);
    expect(e.date).toEqual(new Date(2026, 8, 15));
  });

  it('does not derive a revision date from taux alone without dateDebut', () => {
    const contract = { dateFin: '2026-08-15', tauxAugmentation: 3 };
    const e = contractEcheance(contract);
    expect(e.type).toBe('renouvellement');
  });
});

describe('nextAnniversary', () => {
  const from = new Date(2026, 6, 28); // 28 juillet 2026

  it('returns this year\'s occurrence when still ahead', () => {
    expect(nextAnniversary('2020-09-15', from)).toEqual(new Date(2026, 8, 15));
  });

  it('rolls over to next year when already past', () => {
    expect(nextAnniversary('2020-03-01', from)).toEqual(new Date(2027, 2, 1));
  });

  it('treats the exact same day as still ahead (not yet past)', () => {
    expect(nextAnniversary('2020-07-28', from)).toEqual(new Date(2026, 6, 28));
  });

  it('regression: still advances a full year when anchor is a few days ahead of today (early application)', () => {
    // Cas réel : une révision appliquée quelques jours avant sa vraie date
    // anniversaire fixe l'ancre sur cette date (encore à venir). La
    // "prochaine révision" calculée juste après doit sauter à l'année
    // suivante, pas retomber sur cette même date.
    const today = new Date(2026, 7, 5); // 5 août 2026
    const ancreFraichementAppliquee = '2026-08-10'; // encore 5 jours dans le futur
    expect(nextAnniversary(ancreFraichementAppliquee, today)).toEqual(new Date(2027, 7, 10));
  });
});

describe('montantProjete', () => {
  it('applies the percentage and rounds to the nearest unit', () => {
    expect(montantProjete(100000, 3)).toBe(103000);
    expect(montantProjete(103000, 3)).toBe(106090);
    expect(montantProjete(100000, 2.5)).toBe(102500);
  });
});

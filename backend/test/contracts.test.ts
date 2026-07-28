import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { contractAlertLevel, contractEcheance } from '../src/lib/contracts';

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
});

import { describe, expect, it } from 'vitest';
import { modeleDuLe, resumeJournee, statutAffiche } from '../src/lib/taches';

describe('modeleDuLe', () => {
  it('is due when the day of month matches', () => {
    expect(modeleDuLe(5, new Date('2026-08-05T12:00:00Z'))).toBe(true);
  });

  it('is not due on any other day', () => {
    expect(modeleDuLe(5, new Date('2026-08-06T12:00:00Z'))).toBe(false);
  });
});

describe('statutAffiche', () => {
  it('shows faite/annulee as-is regardless of date', () => {
    expect(statutAffiche({ statut: 'faite', date: '2026-08-06', dateInitiale: '2026-08-05' })).toBe('faite');
    expect(statutAffiche({ statut: 'annulee', date: '2026-08-05', dateInitiale: '2026-08-05' })).toBe('annulee');
  });

  it('shows a_faire when still on its original date', () => {
    expect(statutAffiche({ statut: 'a_faire', date: '2026-08-05', dateInitiale: '2026-08-05' })).toBe('a_faire');
  });

  it('shows reportee when the date moved away from dateInitiale', () => {
    expect(statutAffiche({ statut: 'a_faire', date: '2026-08-07', dateInitiale: '2026-08-05' })).toBe('reportee');
  });
});

describe('resumeJournee', () => {
  it('tallies each status independently', () => {
    const taches = [
      { statut: 'faite' as const, date: '2026-08-05', dateInitiale: '2026-08-05' },
      { statut: 'a_faire' as const, date: '2026-08-07', dateInitiale: '2026-08-05' }, // reportée
      { statut: 'a_faire' as const, date: '2026-08-05', dateInitiale: '2026-08-05' },
      { statut: 'annulee' as const, date: '2026-08-05', dateInitiale: '2026-08-05' },
    ];
    expect(resumeJournee(taches)).toEqual({ total: 4, faites: 1, reportees: 1, aFaire: 1, annulees: 1 });
  });

  it('returns all zeros for an empty day', () => {
    expect(resumeJournee([])).toEqual({ total: 0, faites: 0, reportees: 0, aFaire: 0, annulees: 0 });
  });
});

import { describe, expect, it } from 'vitest';
import { toISODate } from '../src/lib/dates';

describe('toISODate', () => {
  it('passes through an already-ISO string', () => {
    expect(toISODate('2026-04-20')).toBe('2026-04-20');
  });

  it('parses a day/month/year slash date (the expected convention)', () => {
    expect(toISODate('20/04/2026')).toBe('2026-04-20');
  });

  it('converts an Excel serial number', () => {
    expect(toISODate(46128)).toBe('2026-04-16');
  });

  it('falls back to month/day/year when the day/month reading is impossible', () => {
    // "4/20/2026" ne peut pas être jour=4/mois=20 (mois invalide) — c'est
    // forcément le format américain mois=4/jour=20, constaté sur un vrai
    // fichier de facturation (colonne DATE DEPOT).
    expect(toISODate('4/20/2026')).toBe('2026-04-20');
  });

  it('keeps the day/month reading when both orders would be technically valid', () => {
    // Ambigu (3 pourrait être le jour ou le mois) — on garde la convention
    // jour/mois/année par défaut plutôt que de deviner.
    expect(toISODate('3/4/2026')).toBe('2026-04-03');
  });

  it('returns an empty string for a date that is invalid in every reading', () => {
    expect(toISODate('32/13/2026')).toBe('');
  });

  it('returns an empty string for garbage input instead of throwing', () => {
    expect(toISODate('not a date')).toBe('');
    expect(toISODate(null)).toBe('');
    expect(toISODate(undefined)).toBe('');
    expect(toISODate('')).toBe('');
  });
});

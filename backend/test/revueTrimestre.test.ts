import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { melanger, repartir, trimestreInfo } from '../src/lib/revueTrimestre';

describe('trimestreInfo', () => {
  afterEach(() => vi.useRealTimers());

  it('identifie le bon trimestre et la semaine 1 à son tout début', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-01T09:00:00Z')); // mercredi, tout début de Q3
    const info = trimestreInfo();
    expect(info.cle).toBe('2026-Q3');
    expect(info.semaine).toBe(1);
    expect(info.totalSemaines).toBeGreaterThanOrEqual(12);
    expect(info.totalSemaines).toBeLessThanOrEqual(14);
  });

  it('avance à la bonne semaine calendaire en cours de trimestre', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-06T09:00:00Z')); // jeudi, ~5 semaines après le 1er juillet
    const info = trimestreInfo();
    expect(info.cle).toBe('2026-Q3');
    expect(info.semaine).toBe(6);
  });

  it('ne dépasse jamais totalSemaines à la toute fin du trimestre', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-30T23:00:00Z')); // dernier jour de Q3
    const info = trimestreInfo();
    expect(info.semaine).toBe(info.totalSemaines);
  });

  it("reste cohérent au passage d'année (Q4 -> Q1)", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-12-31T12:00:00Z'));
    const info = trimestreInfo();
    expect(info.cle).toBe('2026-Q4');
    expect(info.semaine).toBe(info.totalSemaines);

    vi.setSystemTime(new Date('2027-01-01T12:00:00Z'));
    const infoSuivant = trimestreInfo();
    expect(infoSuivant.cle).toBe('2027-Q1');
    expect(infoSuivant.semaine).toBe(1);
  });
});

describe('melanger', () => {
  it('conserve tous les éléments, dans un ordre pas nécessairement identique', () => {
    const source = Array.from({ length: 50 }, (_, i) => `id-${i}`);
    const melange = melanger(source);
    expect(melange).toHaveLength(source.length);
    expect(new Set(melange)).toEqual(new Set(source));
  });

  it("ne modifie pas le tableau d'origine", () => {
    const source = ['a', 'b', 'c'];
    melanger(source);
    expect(source).toEqual(['a', 'b', 'c']);
  });
});

describe('repartir', () => {
  it('affecte chaque id à une semaine restante du trimestre, toutes couvertes', () => {
    const info = { cle: '2026-Q3', semaine: 1, totalSemaines: 13, debut: new Date('2026-07-01') };
    const ids = Array.from({ length: 260 }, (_, i) => `id-${i}`);
    const affectation = repartir(ids, info);

    expect(affectation.size).toBe(ids.length);
    const semainesUtilisees = new Set(affectation.values());
    for (let s = 1; s <= 13; s++) expect(semainesUtilisees.has(s)).toBe(true);
    for (const s of affectation.values()) {
      expect(s).toBeGreaterThanOrEqual(1);
      expect(s).toBeLessThanOrEqual(13);
    }
  });

  it('ne répartit jamais sur une semaine déjà passée', () => {
    const info = { cle: '2026-Q3', semaine: 10, totalSemaines: 13, debut: new Date('2026-07-01') };
    const ids = Array.from({ length: 30 }, (_, i) => `id-${i}`);
    const affectation = repartir(ids, info);
    for (const s of affectation.values()) {
      expect(s).toBeGreaterThanOrEqual(10);
      expect(s).toBeLessThanOrEqual(13);
    }
  });

  it('répartit de façon équilibrée entre les semaines disponibles', () => {
    const info = { cle: '2026-Q3', semaine: 1, totalSemaines: 13, debut: new Date('2026-07-01') };
    const ids = Array.from({ length: 260 }, (_, i) => `id-${i}`);
    const affectation = repartir(ids, info);
    const compte = new Map<number, number>();
    for (const s of affectation.values()) compte.set(s, (compte.get(s) ?? 0) + 1);
    for (const n of compte.values()) expect(n).toBe(20); // 260 / 13
  });
});

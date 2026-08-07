import { describe, expect, it } from 'vitest';
import {
  consommablesParMois,
  consommablesParReference,
  equipementsParModele,
  interventionsParMois,
  interventionsParSite,
  interventionsParType,
  periodeLabel,
  volumetrieTriee,
} from '../src/lib/copilRapport';

describe('equipementsParModele', () => {
  it('counts only actif équipements, sorted by quantité décroissante', () => {
    const rows = [
      { modele: 'BH227', statut: 'actif' as const },
      { modele: 'BH227', statut: 'actif' as const },
      { modele: 'BH287', statut: 'actif' as const },
      { modele: 'BH227', statut: 'retire' as const },
    ];
    expect(equipementsParModele(rows)).toEqual([
      { modele: 'BH227', qte: 2 },
      { modele: 'BH287', qte: 1 },
    ]);
  });
});

describe('interventionsParSite', () => {
  it('splits clôturées vs en cours per site, sorted by total décroissant', () => {
    const rows = [
      { site: 'Dakar', dateCloture: new Date('2026-01-01') },
      { site: 'Dakar', dateCloture: null },
      { site: 'Dakar', dateCloture: new Date('2026-01-02') },
      { site: 'Thies', dateCloture: null },
    ];
    expect(interventionsParSite(rows)).toEqual([
      { site: 'Dakar', clotures: 2, enCours: 1, total: 3 },
      { site: 'Thies', clotures: 0, enCours: 1, total: 1 },
    ]);
  });
});

describe('interventionsParMois', () => {
  it('groups by month across a year boundary, sorted chronologically', () => {
    const rows = [
      { dateDeclaration: new Date('2026-12-15T10:00:00Z') },
      { dateDeclaration: new Date('2026-01-05T10:00:00Z') },
      { dateDeclaration: new Date('2026-01-20T10:00:00Z') },
    ];
    const result = interventionsParMois(rows);
    expect(result.map((r) => r.total)).toEqual([2, 1]);
    expect(result[0].mois).toMatch(/janvier 2026/i);
    expect(result[1].mois).toMatch(/décembre 2026/i);
  });
});

describe('interventionsParType', () => {
  it('counts curative vs préventive', () => {
    const rows = [{ type: 'curative' as const }, { type: 'curative' as const }, { type: 'preventive' as const }];
    expect(interventionsParType(rows)).toEqual([
      { type: 'Curative', total: 2 },
      { type: 'Préventive', total: 1 },
    ]);
  });
});

describe('consommablesParReference', () => {
  it('sums quantite per reference, sorted descending, capped at topN', () => {
    const rows = [
      { reference: 'TN323', quantite: 5 },
      { reference: 'TN323', quantite: 3 },
      { reference: 'TN321K', quantite: 10 },
      { reference: 'PIECE X', quantite: 1 },
    ];
    expect(consommablesParReference(rows, 2)).toEqual([
      { reference: 'TN321K', qte: 10 },
      { reference: 'TN323', qte: 8 },
    ]);
  });
});

describe('consommablesParMois', () => {
  it('counts delivery lines per month', () => {
    const rows = [{ date: new Date('2026-04-05') }, { date: new Date('2026-04-20') }, { date: new Date('2026-05-01') }];
    const result = consommablesParMois(rows);
    expect(result.map((r) => r.nbLignes)).toEqual([2, 1]);
  });
});

describe('volumetrieTriee', () => {
  it('sorts by période ascending', () => {
    const rows = [{ periode: '2026-05' }, { periode: '2026-01' }, { periode: '2026-12' }];
    expect(volumetrieTriee(rows).map((r) => r.periode)).toEqual(['2026-01', '2026-05', '2026-12']);
  });
});

describe('periodeLabel', () => {
  it('formats AAAA-MM into a French month label', () => {
    expect(periodeLabel('2026-07')).toMatch(/juillet 2026/i);
  });
});

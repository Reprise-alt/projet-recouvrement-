import { describe, expect, it } from 'vitest';
import {
  alertesCompteurTotal,
  alertesInterventionsFrequentes,
  alertesVolumetrieMensuelle,
  calculerPeriodeReelle,
  capParModeleAvecAutres,
  capParSiteAvecAutres,
  consommablesParMois,
  consommablesParReference,
  equipementsParModele,
  interventionsParMois,
  interventionsParSite,
  interventionsParType,
  periodeLabel,
  sitesTopInterventions,
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

describe('calculerPeriodeReelle', () => {
  it('returns a single month label when every date falls in the same month', () => {
    expect(calculerPeriodeReelle([new Date('2026-07-05'), new Date('2026-07-20')])).toMatch(/juillet 2026/i);
  });

  it('returns a range label spanning the earliest to the latest month across all sources', () => {
    const label = calculerPeriodeReelle([new Date('2026-04-05'), new Date('2026-06-20')], ['2026-07']);
    expect(label).toMatch(/avril 2026.*juillet 2026/i);
  });

  it('returns null when there is no data at all', () => {
    expect(calculerPeriodeReelle([])).toBeNull();
  });
});

describe('capParModeleAvecAutres', () => {
  it('leaves the list untouched when at or under the cap', () => {
    const items = [{ modele: 'A', qte: 3 }, { modele: 'B', qte: 2 }];
    expect(capParModeleAvecAutres(items, 8)).toEqual(items);
  });

  it('buckets the tail into "Autres modèles" beyond the cap', () => {
    const items = Array.from({ length: 10 }, (_, i) => ({ modele: `M${i}`, qte: 10 - i }));
    const result = capParModeleAvecAutres(items, 4);
    expect(result).toHaveLength(4);
    expect(result[3]).toEqual({ modele: 'Autres modèles (7)', qte: 7 + 6 + 5 + 4 + 3 + 2 + 1 });
  });
});

describe('capParSiteAvecAutres', () => {
  it('sums clôturées/en cours/total into the "Autres sites" bucket', () => {
    const items = Array.from({ length: 12 }, (_, i) => ({ site: `Site ${i}`, clotures: 1, enCours: 0, total: 1 }));
    const result = capParSiteAvecAutres(items, 9);
    expect(result).toHaveLength(9);
    expect(result[8]).toEqual({ site: 'Autres sites (4)', clotures: 4, enCours: 0, total: 4 });
  });
});

describe('alertesVolumetrieMensuelle', () => {
  it('flags only machines exceeding the monthly threshold, sorted descending', () => {
    const rows = [
      { numeroSerie: 'SN1', modele: 'BH227', site: 'Dakar', periode: '2026-07', copiesNB: 8000, copiesCouleur: 3000 },
      { numeroSerie: 'SN2', modele: 'BH287', site: 'Thies', periode: '2026-07', copiesNB: 5000, copiesCouleur: 0 },
      { numeroSerie: 'SN3', modele: 'BH367', site: 'Mbour', periode: '2026-07', copiesNB: 20000, copiesCouleur: 1000 },
    ];
    expect(alertesVolumetrieMensuelle(rows, 10000)).toEqual([
      { numeroSerie: 'SN3', modele: 'BH367', site: 'Mbour', periode: '2026-07', total: 21000 },
      { numeroSerie: 'SN1', modele: 'BH227', site: 'Dakar', periode: '2026-07', total: 11000 },
    ]);
  });
});

describe('alertesCompteurTotal', () => {
  it('sums across ALL periods per machine regardless of report window, then filters', () => {
    const rows = [
      { numeroSerie: 'SN1', modele: 'BH227', site: 'Dakar', periode: '2026-04', copiesNB: 400000, copiesCouleur: 0 },
      { numeroSerie: 'SN1', modele: 'BH227', site: 'Dakar', periode: '2026-05', copiesNB: 350000, copiesCouleur: 0 },
      { numeroSerie: 'SN2', modele: 'BH287', site: 'Thies', periode: '2026-04', copiesNB: 100000, copiesCouleur: 0 },
    ];
    expect(alertesCompteurTotal(rows, 700000)).toEqual([{ numeroSerie: 'SN1', modele: 'BH227', site: 'Dakar', total: 750000 }]);
  });
});

describe('alertesInterventionsFrequentes', () => {
  it('flags machines with strictly more than the threshold of interventions', () => {
    const rows = [
      ...Array.from({ length: 5 }, () => ({ numeroSerie: 'SN1', modele: 'BH227', site: 'Dakar' })),
      ...Array.from({ length: 4 }, () => ({ numeroSerie: 'SN2', modele: 'BH287', site: 'Thies' })),
      { numeroSerie: 'SN3', modele: 'BH367', site: 'Mbour' },
    ];
    expect(alertesInterventionsFrequentes(rows, 4)).toEqual([{ numeroSerie: 'SN1', modele: 'BH227', site: 'Dakar', total: 5 }]);
  });
});

describe('sitesTopInterventions', () => {
  it('returns the single top site when there is no tie', () => {
    const parSite = [{ site: 'Dakar', total: 51 }, { site: 'Thies', total: 5 }];
    expect(sitesTopInterventions(parSite)).toEqual([{ site: 'Dakar', total: 51 }]);
  });

  it('returns every tied site when several share the max', () => {
    const parSite = [{ site: 'Dakar', total: 10 }, { site: 'Thies', total: 10 }, { site: 'Mbour', total: 3 }];
    expect(sitesTopInterventions(parSite)).toEqual([{ site: 'Dakar', total: 10 }, { site: 'Thies', total: 10 }]);
  });

  it('returns an empty list when there is no data', () => {
    expect(sitesTopInterventions([])).toEqual([]);
  });
});

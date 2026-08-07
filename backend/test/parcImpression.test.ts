import { describe, expect, it } from 'vitest';
import { computeParcSynthese, computeSlaStats, ticketsLesPlusLents } from '../src/lib/parcImpression';

describe('computeSlaStats', () => {
  it('returns zeroed stats for an empty list', () => {
    const stats = computeSlaStats([]);
    expect(stats).toEqual({
      total: 0,
      clotures: 0,
      ouverts: 0,
      tauxCloture: 0,
      delaiMoyenUrgenteHeures: null,
      delaiMoyenStandardHeures: null,
      delaiMedianUrgenteHeures: null,
      delaiMedianStandardHeures: null,
      priseEnChargeMesuree: 0,
    });
  });

  it('computes taux de clôture from dateCloture presence', () => {
    const stats = computeSlaStats([
      { urgence: 'standard', dateDeclaration: '2026-06-01T08:00:00Z', datePriseEnCharge: '2026-06-01T09:00:00Z', dateCloture: '2026-06-01T10:00:00Z' },
      { urgence: 'standard', dateDeclaration: '2026-06-01T08:00:00Z', datePriseEnCharge: null, dateCloture: null },
      { urgence: 'standard', dateDeclaration: '2026-06-01T08:00:00Z', datePriseEnCharge: null, dateCloture: null },
      { urgence: 'standard', dateDeclaration: '2026-06-01T08:00:00Z', datePriseEnCharge: null, dateCloture: null },
    ]);
    expect(stats.total).toBe(4);
    expect(stats.clotures).toBe(1);
    expect(stats.ouverts).toBe(3);
    expect(stats.tauxCloture).toBe(25);
  });

  it('averages response time (déclaration -> prise en charge), separately per urgence', () => {
    const stats = computeSlaStats([
      { urgence: 'urgente', dateDeclaration: '2026-06-01T08:00:00Z', datePriseEnCharge: '2026-06-01T10:00:00Z', dateCloture: null }, // 2h
      { urgence: 'urgente', dateDeclaration: '2026-06-02T08:00:00Z', datePriseEnCharge: '2026-06-02T12:00:00Z', dateCloture: null }, // 4h
      { urgence: 'standard', dateDeclaration: '2026-06-01T08:00:00Z', datePriseEnCharge: '2026-06-02T08:00:00Z', dateCloture: null }, // 24h
    ]);
    expect(stats.delaiMoyenUrgenteHeures).toBe(3);
    expect(stats.delaiMoyenStandardHeures).toBe(24);
  });

  it('excludes interventions not yet taken in charge from the average, without crashing', () => {
    const stats = computeSlaStats([
      { urgence: 'urgente', dateDeclaration: '2026-06-01T08:00:00Z', datePriseEnCharge: null, dateCloture: null },
    ]);
    expect(stats.delaiMoyenUrgenteHeures).toBeNull();
  });

  it('computes the median alongside the mean, odd and even counts', () => {
    const stats = computeSlaStats([
      { urgence: 'urgente', dateDeclaration: '2026-06-01T00:00:00Z', datePriseEnCharge: '2026-06-01T02:00:00Z', dateCloture: null }, // 2h
      { urgence: 'urgente', dateDeclaration: '2026-06-01T00:00:00Z', datePriseEnCharge: '2026-06-01T04:00:00Z', dateCloture: null }, // 4h
      { urgence: 'urgente', dateDeclaration: '2026-06-01T00:00:00Z', datePriseEnCharge: '2026-06-01T06:00:00Z', dateCloture: null }, // 6h
      { urgence: 'standard', dateDeclaration: '2026-06-01T00:00:00Z', datePriseEnCharge: '2026-06-01T10:00:00Z', dateCloture: null }, // 10h
      { urgence: 'standard', dateDeclaration: '2026-06-01T00:00:00Z', datePriseEnCharge: '2026-06-01T20:00:00Z', dateCloture: null }, // 20h
    ]);
    expect(stats.delaiMedianUrgenteHeures).toBe(4); // 3 valeurs (2,4,6) -> milieu
    expect(stats.delaiMedianStandardHeures).toBe(15); // 2 valeurs (10,20) -> moyenne des deux
  });

  // Reproduit le signal remonté par l'utilisateur : le délai moyen des
  // urgents dépassait celui des standards. Avec une majorité d'urgents
  // traités très vite et un seul cas très en retard, la moyenne grimpe
  // au-dessus du standard alors que la médiane, elle, reste basse -- ce qui
  // confirme qu'il s'agit de quelques cas isolés, pas d'un problème général.
  it('shows the median staying low when the mean is dragged up by a single slow outlier', () => {
    const stats = computeSlaStats([
      { urgence: 'urgente', dateDeclaration: '2026-06-01T00:00:00Z', datePriseEnCharge: '2026-06-01T01:00:00Z', dateCloture: null }, // 1h
      { urgence: 'urgente', dateDeclaration: '2026-06-02T00:00:00Z', datePriseEnCharge: '2026-06-02T01:00:00Z', dateCloture: null }, // 1h
      { urgence: 'urgente', dateDeclaration: '2026-06-03T00:00:00Z', datePriseEnCharge: '2026-06-03T02:00:00Z', dateCloture: null }, // 2h
      { urgence: 'urgente', dateDeclaration: '2026-06-04T00:00:00Z', datePriseEnCharge: '2026-06-08T00:00:00Z', dateCloture: null }, // 96h -- outlier
      { urgence: 'standard', dateDeclaration: '2026-06-01T00:00:00Z', datePriseEnCharge: '2026-06-01T05:00:00Z', dateCloture: null }, // 5h
    ]);
    expect(stats.delaiMoyenUrgenteHeures).toBe(25); // (1+1+2+96)/4 -- au-dessus du standard
    expect(stats.delaiMoyenUrgenteHeures! > stats.delaiMoyenStandardHeures!).toBe(true);
    expect(stats.delaiMedianUrgenteHeures).toBe(1.5); // reste bas malgré l'outlier
    expect(stats.delaiMedianUrgenteHeures! < stats.delaiMedianStandardHeures!).toBe(true);
  });
});

describe('ticketsLesPlusLents', () => {
  it('returns the slowest tickets for the given urgence, sorted descending, capped at topN', () => {
    const interventions = [
      { site: 'Dakar', urgence: 'urgente' as const, dateDeclaration: '2026-06-01T00:00:00Z', datePriseEnCharge: '2026-06-01T01:00:00Z', dateCloture: null }, // 1h
      { site: 'Thies', urgence: 'urgente' as const, dateDeclaration: '2026-06-02T00:00:00Z', datePriseEnCharge: '2026-06-06T00:00:00Z', dateCloture: null }, // 96h
      { site: 'Mbour', urgence: 'urgente' as const, dateDeclaration: '2026-06-03T00:00:00Z', datePriseEnCharge: '2026-06-03T10:00:00Z', dateCloture: null }, // 10h
      { site: 'Rufisque', urgence: 'standard' as const, dateDeclaration: '2026-06-01T00:00:00Z', datePriseEnCharge: '2026-06-10T00:00:00Z', dateCloture: null }, // 216h mais standard -- ignoré
      { site: 'Kaolack', urgence: 'urgente' as const, dateDeclaration: '2026-06-04T00:00:00Z', datePriseEnCharge: null, dateCloture: null }, // pas mesurable
    ];
    const result = ticketsLesPlusLents(interventions, 'urgente', 2);
    expect(result).toEqual([
      { site: 'Thies', dateDeclaration: '2026-06-02T00:00:00Z', delaiHeures: 96 },
      { site: 'Mbour', dateDeclaration: '2026-06-03T00:00:00Z', delaiHeures: 10 },
    ]);
  });

  it('returns an empty list when no ticket of that urgence has a measurable delay', () => {
    expect(ticketsLesPlusLents([], 'urgente')).toEqual([]);
  });
});

describe('computeParcSynthese', () => {
  it('matches the COPIL T2 SEN\'EAU overview numbers on representative data', () => {
    const equipements = [{ statut: 'actif' as const }, { statut: 'actif' as const }, { statut: 'introuvable' as const }];
    const interventions = [
      { type: 'preventive' as const, urgence: 'standard' as const, dateDeclaration: '2026-04-01', datePriseEnCharge: '2026-04-01', dateCloture: '2026-04-02' },
      { type: 'curative' as const, urgence: 'urgente' as const, dateDeclaration: '2026-04-05', datePriseEnCharge: '2026-04-05', dateCloture: null },
    ];
    const volumetrie = [
      { copiesNB: 500000, copiesCouleur: 5000 },
      { copiesNB: 517477, copiesCouleur: 3000 },
    ];
    const livraisons = [{ date: '2026-04-10', quantite: 15 }, { date: '2026-05-10', quantite: 21 }, { date: '2026-06-10', quantite: 28 }];

    const synth = computeParcSynthese(equipements, interventions, volumetrie, livraisons);
    expect(synth.equipementsActifs).toBe(2);
    expect(synth.equipementsIntrouvables).toBe(1);
    expect(synth.interventionsTotal).toBe(2);
    expect(synth.interventionsPreventives).toBe(1);
    expect(synth.sla.tauxCloture).toBe(50);
    expect(synth.consommablesLivres).toBe(64);
    expect(synth.copiesNBTotal).toBe(1017477);
  });
});

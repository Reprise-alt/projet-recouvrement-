import { describe, expect, it } from 'vitest';
import { computeParcSynthese, computeSlaStats } from '../src/lib/parcImpression';

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

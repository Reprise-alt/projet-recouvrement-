import { describe, expect, it } from 'vitest';
import {
  buildAgentStats,
  buildDelaiParEntite,
  buildEvolutionMensuelle,
  buildReportingSummary,
  computeDelaiPondere,
  lastNMonthKeys,
} from '../src/lib/reporting';

describe('buildReportingSummary', () => {
  it('sums paid invoices and counts actions per palier over the period', () => {
    const factures = [
      { numero: 'FA-1', montant: 100000, dateFacture: '2026-06-05', datePaiement: '2026-07-05', clientNom: 'A', entite: 'SORAM' },
      { numero: 'FA-2', montant: 250000, dateFacture: '2026-06-12', datePaiement: '2026-07-12', clientNom: 'B', entite: 'SIS' },
    ];
    const actions = [{ palier: 1 }, { palier: 1 }, { palier: 4 }, { palier: 7 }];

    const summary = buildReportingSummary('2026-07-01', '2026-07-31', factures, actions, factures, ['2026-07']);

    expect(summary.facturesPayees).toEqual({ nombre: 2, montantTotal: 350000 });
    expect(summary.relances.find((r) => r.palier === 1)?.nombre).toBe(2);
    expect(summary.relances.find((r) => r.palier === 4)?.nombre).toBe(1);
    expect(summary.relances.find((r) => r.palier === 7)?.nombre).toBe(1);
    expect(summary.relances.find((r) => r.palier === 2)?.nombre).toBe(0);
  });

  it('does not report a row for palier 0 (à jour has no relance)', () => {
    const summary = buildReportingSummary('2026-07-01', '2026-07-31', [], [], [], ['2026-07']);
    expect(summary.relances.some((r) => r.palier === 0)).toBe(false);
    expect(summary.relances).toHaveLength(7);
  });

  it('returns zeroed totals when nothing happened in the period', () => {
    const summary = buildReportingSummary('2026-01-01', '2026-01-31', [], [], [], ['2026-01']);
    expect(summary.facturesPayees).toEqual({ nombre: 0, montantTotal: 0 });
    expect(summary.relances.every((r) => r.nombre === 0)).toBe(true);
    expect(summary.delaiEncaissement.global).toBeNull();
  });
});

describe('computeDelaiPondere', () => {
  it('weights the delay by invoice amount rather than a plain average', () => {
    const factures = [
      // 500k paid in 90 days, 50k paid in 5 days — weighted average should sit much closer to 90 than a plain
      // average of (90+5)/2 = 47.5 would.
      { montant: 500000, dateFacture: '2026-01-01', datePaiement: '2026-04-01' },
      { montant: 50000, dateFacture: '2026-01-01', datePaiement: '2026-01-06' },
    ];
    const result = computeDelaiPondere(factures);
    expect(result).not.toBeNull();
    expect(result!).toBeGreaterThan(70);
  });

  it('returns null when there is nothing to average', () => {
    expect(computeDelaiPondere([])).toBeNull();
  });
});

describe('buildDelaiParEntite', () => {
  it('groups by entité and computes an independent weighted delay per group', () => {
    const factures = [
      { numero: 'FA-1', montant: 100000, dateFacture: '2026-01-01', datePaiement: '2026-01-11', clientNom: 'A', entite: 'SORAM' },
      { numero: 'FA-2', montant: 200000, dateFacture: '2026-01-01', datePaiement: '2026-01-31', clientNom: 'B', entite: 'IRIS' },
    ];
    const rows = buildDelaiParEntite(factures);
    expect(rows).toHaveLength(2);
    expect(rows.find((r) => r.entite === 'SORAM')?.delaiJours).toBe(10);
    expect(rows.find((r) => r.entite === 'IRIS')?.delaiJours).toBe(30);
  });
});

describe('lastNMonthKeys', () => {
  it('returns N trailing month keys ending with the reference month', () => {
    const months = lastNMonthKeys(3, new Date('2026-07-15T00:00:00.000Z'));
    expect(months).toEqual(['2026-05', '2026-06', '2026-07']);
  });

  it('rolls over year boundaries correctly', () => {
    const months = lastNMonthKeys(3, new Date('2026-02-01T00:00:00.000Z'));
    expect(months).toEqual(['2025-12', '2026-01', '2026-02']);
  });
});

describe('buildEvolutionMensuelle', () => {
  it('buckets paid invoices by the month they were paid in, one row per requested month', () => {
    const factures = [
      { montant: 100000, dateFacture: '2026-05-01', datePaiement: '2026-06-10' },
      { montant: 200000, dateFacture: '2026-06-01', datePaiement: '2026-07-05' },
    ];
    const evolution = buildEvolutionMensuelle(factures, ['2026-06', '2026-07', '2026-08']);
    expect(evolution).toHaveLength(3);
    expect(evolution[0]).toMatchObject({ mois: '2026-06', nombre: 1, montantTotal: 100000 });
    expect(evolution[1]).toMatchObject({ mois: '2026-07', nombre: 1, montantTotal: 200000 });
    expect(evolution[2]).toMatchObject({ mois: '2026-08', nombre: 0, montantTotal: 0, delaiJours: null });
  });
});

describe('buildAgentStats', () => {
  it('counts one action per entry, grouped by agent', () => {
    const actions = [
      { utilisateurId: 'u1', utilisateurNom: 'Awa', date: '2026-07-01', datesPaiementClient: [] },
      { utilisateurId: 'u1', utilisateurNom: 'Awa', date: '2026-07-05', datesPaiementClient: [] },
      { utilisateurId: 'u2', utilisateurNom: 'Moussa', date: '2026-07-02', datesPaiementClient: [] },
    ];
    const stats = buildAgentStats(actions);
    expect(stats).toHaveLength(2);
    expect(stats[0]).toMatchObject({ nom: 'Awa', actions: 2 });
    expect(stats[1]).toMatchObject({ nom: 'Moussa', actions: 1 });
  });

  it('sorts agents by workload, busiest first', () => {
    const actions = [
      { utilisateurId: 'u1', utilisateurNom: 'Awa', date: '2026-07-01', datesPaiementClient: [] },
      { utilisateurId: 'u2', utilisateurNom: 'Moussa', date: '2026-07-01', datesPaiementClient: [] },
      { utilisateurId: 'u2', utilisateurNom: 'Moussa', date: '2026-07-02', datesPaiementClient: [] },
      { utilisateurId: 'u2', utilisateurNom: 'Moussa', date: '2026-07-03', datesPaiementClient: [] },
    ];
    const stats = buildAgentStats(actions);
    expect(stats.map((s) => s.nom)).toEqual(['Moussa', 'Awa']);
  });

  it('measures the delay to the first payment on or after the action date', () => {
    const actions = [
      {
        utilisateurId: 'u1',
        utilisateurNom: 'Awa',
        date: '2026-07-01',
        datesPaiementClient: ['2026-06-20', '2026-07-04', '2026-07-10'], // avant l'action, +3j, +9j
      },
    ];
    const stats = buildAgentStats(actions);
    expect(stats[0].delaiMoyenApresIntervention).toBe(3); // le paiement du 06-20 est avant l'action, ignoré
    expect(stats[0].nombreDelaisMesures).toBe(1);
  });

  it('averages delays across several actions from the same agent', () => {
    const actions = [
      { utilisateurId: 'u1', utilisateurNom: 'Awa', date: '2026-07-01', datesPaiementClient: ['2026-07-05'] }, // +4
      { utilisateurId: 'u1', utilisateurNom: 'Awa', date: '2026-07-10', datesPaiementClient: ['2026-07-12'] }, // +2
    ];
    const stats = buildAgentStats(actions);
    expect(stats[0].delaiMoyenApresIntervention).toBe(3);
    expect(stats[0].nombreDelaisMesures).toBe(2);
  });

  it('leaves delaiMoyenApresIntervention null (not 0) when no payment ever followed', () => {
    const actions = [{ utilisateurId: 'u1', utilisateurNom: 'Awa', date: '2026-07-01', datesPaiementClient: [null, '2026-06-01'] }];
    const stats = buildAgentStats(actions);
    expect(stats[0].delaiMoyenApresIntervention).toBeNull();
    expect(stats[0].nombreDelaisMesures).toBe(0);
  });

  it('returns an empty list for no actions', () => {
    expect(buildAgentStats([])).toEqual([]);
  });
});

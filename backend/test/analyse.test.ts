import { describe, expect, it } from 'vitest';
import { buildAnalyse, AnalyseInput } from '../src/lib/analyse';
import { ReportingSummary } from '../src/lib/reporting';

function summary(overrides: Partial<ReportingSummary> = {}): ReportingSummary {
  return {
    from: '2026-07-01',
    to: '2026-07-31',
    facturesPayees: { nombre: 5, montantTotal: 1000000 },
    relances: [],
    delaiEncaissement: { global: 30, parEntite: [] },
    evolutionMensuelle: [],
    ...overrides,
  };
}

function baseInput(overrides: Partial<AnalyseInput> = {}): AnalyseInput {
  return {
    periodeLabel: '01/07/2026 au 31/07/2026',
    actuel: summary(),
    precedent: null,
    clientsEnContentieux: { nombre: 0, montant: 0 },
    clientsRetardInhabituel: 0,
    agents: [],
    ...overrides,
  };
}

describe('buildAnalyse', () => {
  it('produces no delay-trend point without a comparable previous period', () => {
    const result = buildAnalyse(baseInput({ precedent: null }));
    expect(result.pointsForts.join(' ')).not.toMatch(/délai moyen/);
    expect(result.pointsVigilance.join(' ')).not.toMatch(/délai moyen/);
  });

  it('flags an improving delay as a strength, above the noise threshold', () => {
    const result = buildAnalyse(
      baseInput({
        actuel: summary({ delaiEncaissement: { global: 25, parEntite: [] } }),
        precedent: summary({ delaiEncaissement: { global: 35, parEntite: [] } }),
      }),
    );
    expect(result.pointsForts.some((p) => p.includes('baissé de 10 j'))).toBe(true);
    expect(result.pointsVigilance).toHaveLength(0);
  });

  it('flags a worsening delay as a vigilance point and adds a recommendation', () => {
    const result = buildAnalyse(
      baseInput({
        actuel: summary({ delaiEncaissement: { global: 40, parEntite: [] } }),
        precedent: summary({ delaiEncaissement: { global: 30, parEntite: [] } }),
      }),
    );
    expect(result.pointsVigilance.some((p) => p.includes('augmenté de 10 j'))).toBe(true);
    expect(result.recommandations.length).toBeGreaterThan(0);
  });

  it('stays silent on a delay swing under the noise threshold', () => {
    const result = buildAnalyse(
      baseInput({
        actuel: summary({ delaiEncaissement: { global: 31, parEntite: [] } }),
        precedent: summary({ delaiEncaissement: { global: 30, parEntite: [] } }),
      }),
    );
    expect(result.pointsForts).toHaveLength(0);
    expect(result.pointsVigilance).toHaveLength(0);
  });

  it('flags a meaningful spread between entities in both directions', () => {
    const result = buildAnalyse(
      baseInput({
        actuel: summary({
          delaiEncaissement: {
            global: 30,
            parEntite: [
              { entite: 'IRIS', delaiJours: 20, montantTotal: 100, nombre: 1 },
              { entite: 'SORAM', delaiJours: 40, montantTotal: 100, nombre: 1 },
            ],
          },
        }),
      }),
    );
    expect(result.pointsForts.some((p) => p.includes('IRIS'))).toBe(true);
    expect(result.axesAmelioration.some((p) => p.includes('SORAM'))).toBe(true);
  });

  it('reports current contentieux and retard-inhabituel counts as vigilance points, each with a recommendation', () => {
    const result = buildAnalyse(baseInput({ clientsEnContentieux: { nombre: 2, montant: 500000 }, clientsRetardInhabituel: 3 }));
    expect(result.pointsVigilance.some((p) => p.includes('2 clients') && p.includes('contentieux'))).toBe(true);
    expect(result.pointsVigilance.some((p) => p.includes('3 clients') && p.includes('retard'))).toBe(true);
    expect(result.recommandations.some((p) => p.includes('contentieux'))).toBe(true);
    expect(result.recommandations.some((p) => p.includes('retard inhabituel'))).toBe(true);
  });

  it('highlights the top-recovering agent and inactive agents separately, with a recommendation for inactivity', () => {
    const result = buildAnalyse(
      baseInput({
        agents: [
          { utilisateurId: 'u1', nom: 'Awa', actions: 5, delaiMoyenApresIntervention: 4, nombreDelaisMesures: 5, montantRecouvre: 900000, nombreFactures: 3 },
          { utilisateurId: 'u2', nom: 'Moussa', actions: 0, delaiMoyenApresIntervention: null, nombreDelaisMesures: 0, montantRecouvre: 0, nombreFactures: 0 },
        ],
      }),
    );
    expect(result.actionsPositives.some((p) => p.includes('Awa'))).toBe(true);
    expect(result.axesAmelioration.some((p) => p.includes('Moussa'))).toBe(true);
    expect(result.recommandations.some((p) => p.includes('Moussa'))).toBe(true);
  });

  it('falls back to a neutral recommendation when nothing negative was detected', () => {
    const result = buildAnalyse(baseInput());
    expect(result.recommandations).toHaveLength(1);
    expect(result.recommandations[0]).toMatch(/maintenir/i);
  });
});

import { describe, expect, it } from 'vitest';
import { buildReportingSummary } from '../src/lib/reporting';

describe('buildReportingSummary', () => {
  it('sums paid invoices and counts actions per palier over the period', () => {
    const factures = [
      { numero: 'FA-1', montant: 100000, datePaiement: '2026-07-05', clientNom: 'A' },
      { numero: 'FA-2', montant: 250000, datePaiement: '2026-07-12', clientNom: 'B' },
    ];
    const actions = [{ palier: 1 }, { palier: 1 }, { palier: 4 }, { palier: 7 }];

    const summary = buildReportingSummary('2026-07-01', '2026-07-31', factures, actions);

    expect(summary.facturesPayees).toEqual({ nombre: 2, montantTotal: 350000 });
    expect(summary.relances.find((r) => r.palier === 1)?.nombre).toBe(2);
    expect(summary.relances.find((r) => r.palier === 4)?.nombre).toBe(1);
    expect(summary.relances.find((r) => r.palier === 7)?.nombre).toBe(1);
    expect(summary.relances.find((r) => r.palier === 2)?.nombre).toBe(0);
  });

  it('does not report a row for palier 0 (à jour has no relance)', () => {
    const summary = buildReportingSummary('2026-07-01', '2026-07-31', [], []);
    expect(summary.relances.some((r) => r.palier === 0)).toBe(false);
    expect(summary.relances).toHaveLength(7);
  });

  it('returns zeroed totals when nothing happened in the period', () => {
    const summary = buildReportingSummary('2026-01-01', '2026-01-31', [], []);
    expect(summary.facturesPayees).toEqual({ nombre: 0, montantTotal: 0 });
    expect(summary.relances.every((r) => r.nombre === 0)).toBe(true);
  });
});

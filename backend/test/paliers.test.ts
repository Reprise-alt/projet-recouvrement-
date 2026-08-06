import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  clientDelaiMoyenHistorique,
  clientEncours,
  clientJoursRetard,
  clientOldestEcheance,
  clientPalier,
  clientRetardInhabituel,
  computePalier,
  DEFAULT_CONFIG,
  enLitigeSignal,
} from '../src/lib/paliers';

describe('computePalier', () => {
  it('returns 0 for no delay or negative delay', () => {
    expect(computePalier(0)).toBe(0);
    expect(computePalier(-5)).toBe(0);
  });

  it('respects the configured thresholds at their boundaries', () => {
    expect(computePalier(6)).toBe(0); // < j1(7)
    expect(computePalier(7)).toBe(1); // == j1
    expect(computePalier(14)).toBe(1); // < j2(15)
    expect(computePalier(15)).toBe(2);
    expect(computePalier(29)).toBe(2);
    expect(computePalier(30)).toBe(3);
    expect(computePalier(44)).toBe(3);
    expect(computePalier(45)).toBe(4);
    expect(computePalier(59)).toBe(4);
    expect(computePalier(60)).toBe(5);
    expect(computePalier(74)).toBe(5);
    expect(computePalier(75)).toBe(6);
    expect(computePalier(89)).toBe(6);
    expect(computePalier(90)).toBe(7);
    expect(computePalier(500)).toBe(7);
  });

  it('honours a custom config', () => {
    const custom = { ...DEFAULT_CONFIG, j1: 3 };
    expect(computePalier(3, custom)).toBe(1);
    expect(computePalier(2, custom)).toBe(0);
  });

  it('scales every threshold by the multiplier for non-monthly billing clients', () => {
    // 80 jours de retard : palier 6 (Mise en demeure) en mensuel, mais un
    // client trimestriel (x3) doit rester au palier 2 (80 < 3*30=90).
    expect(computePalier(80, DEFAULT_CONFIG, 1)).toBe(6);
    expect(computePalier(80, DEFAULT_CONFIG, 3)).toBe(2);
  });
});

describe('client-level helpers', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-28T12:00:00Z'));
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('sums only unpaid invoices for encours', () => {
    const client = {
      factures: [
        { montant: 1000, dateEcheance: '2026-06-01', statut: 'impayee' as const },
        { montant: 500, dateEcheance: '2026-06-15', statut: 'payee' as const },
      ],
    };
    expect(clientEncours(client)).toBe(1000);
  });

  it('picks the oldest unpaid invoice as the reference échéance', () => {
    const client = {
      factures: [
        { montant: 1000, dateEcheance: '2026-06-01', statut: 'impayee' as const },
        { montant: 2000, dateEcheance: '2026-05-01', statut: 'impayee' as const },
        { montant: 500, dateEcheance: '2026-01-01', statut: 'payee' as const },
      ],
    };
    expect(clientOldestEcheance(client)?.dateEcheance).toBe('2026-05-01');
  });

  it('returns 0 jours de retard when there is no unpaid invoice', () => {
    const client = { factures: [{ montant: 500, dateEcheance: '2026-01-01', statut: 'payee' as const }] };
    expect(clientJoursRetard(client)).toBe(0);
  });

  it('computes jours de retard from today relative to the oldest unpaid échéance', () => {
    const client = { factures: [{ montant: 1000, dateEcheance: '2026-06-28', statut: 'impayee' as const }] };
    // 2026-07-28 - 2026-06-28 = 30 days
    expect(clientJoursRetard(client)).toBe(30);
    expect(clientPalier(client)).toBe(3); // j3 threshold is 30
  });

  it('never returns a negative jours de retard for a not-yet-due invoice', () => {
    const client = { factures: [{ montant: 1000, dateEcheance: '2026-09-01', statut: 'impayee' as const }] };
    expect(clientJoursRetard(client)).toBe(0);
    expect(clientPalier(client)).toBe(0);
  });

  it('defaults to the monthly (x1) scale when frequenceFacturation is unset', () => {
    // 2026-07-28 - 2026-05-10 = 79 jours -> palier 6 en mensuel (>= j6=75)
    const client = { factures: [{ montant: 1000, dateEcheance: '2026-05-10', statut: 'impayee' as const }] };
    expect(clientPalier(client)).toBe(6);
  });

  it('spares a quarterly-billed client from a false "en retard" reading', () => {
    // Même retard (79 jours) mais un client trimestriel (x3) reste palier 2.
    const client = {
      factures: [{ montant: 1000, dateEcheance: '2026-05-10', statut: 'impayee' as const }],
      frequenceFacturation: 'trimestrielle' as const,
    };
    expect(clientPalier(client)).toBe(2);
  });
});

describe('clientDelaiMoyenHistorique', () => {
  it('returns null with fewer than 2 paid invoices', () => {
    expect(clientDelaiMoyenHistorique({ factures: [] })).toBeNull();
    const oneInvoice = {
      factures: [{ montant: 1000, dateEcheance: '2026-01-01', datePaiement: '2026-01-05', statut: 'payee' as const }],
    };
    expect(clientDelaiMoyenHistorique(oneInvoice)).toBeNull();
  });

  it('ignores unpaid invoices when averaging', () => {
    const client = {
      factures: [
        { montant: 1000, dateEcheance: '2026-01-01', datePaiement: '2026-01-05', statut: 'payee' as const }, // +4
        { montant: 1000, dateEcheance: '2026-02-01', datePaiement: '2026-02-03', statut: 'payee' as const }, // +2
        { montant: 5000, dateEcheance: '2026-03-01', statut: 'impayee' as const },
      ],
    };
    expect(clientDelaiMoyenHistorique(client)).toBe(3);
  });

  it('can be negative for a client who habitually pays early', () => {
    const client = {
      factures: [
        { montant: 1000, dateEcheance: '2026-01-10', datePaiement: '2026-01-05', statut: 'payee' as const }, // -5
        { montant: 1000, dateEcheance: '2026-02-10', datePaiement: '2026-02-07', statut: 'payee' as const }, // -3
      ],
    };
    expect(clientDelaiMoyenHistorique(client)).toBe(-4);
  });
});

describe('clientRetardInhabituel', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-28T12:00:00Z'));
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('is false without an unpaid invoice', () => {
    const client = { factures: [{ montant: 1000, dateEcheance: '2026-01-01', datePaiement: '2026-01-04', statut: 'payee' as const }] };
    expect(clientRetardInhabituel(client)).toBe(false);
  });

  it('is false without enough payment history, even with a big current delay', () => {
    const client = { factures: [{ montant: 1000, dateEcheance: '2026-05-01', statut: 'impayee' as const }] };
    expect(clientRetardInhabituel(client)).toBe(false);
  });

  it('is false when the current delay stays within ~2x the habitual delay', () => {
    const client = {
      factures: [
        { montant: 1000, dateEcheance: '2026-01-01', datePaiement: '2026-01-06', statut: 'payee' as const }, // +5
        { montant: 1000, dateEcheance: '2026-02-01', datePaiement: '2026-02-08', statut: 'payee' as const }, // +7
        // moyenne = 6j ; retard courant (2026-06-28 -> 2026-07-28 = 30j... trop) -> on garde un cas sous le seuil
        { montant: 5000, dateEcheance: '2026-07-20', statut: 'impayee' as const }, // 8 jours de retard, seuil = 12
      ],
    };
    expect(clientRetardInhabituel(client)).toBe(false);
  });

  it('is true when the current delay clears 2x the habitual delay', () => {
    const client = {
      factures: [
        { montant: 1000, dateEcheance: '2026-01-01', datePaiement: '2026-01-04', statut: 'payee' as const }, // +3
        { montant: 1000, dateEcheance: '2026-02-01', datePaiement: '2026-02-04', statut: 'payee' as const }, // +3
        // moyenne = 3j, seuil = 6j ; retard courant = 30j (2026-06-28 -> 2026-07-28)
        { montant: 5000, dateEcheance: '2026-06-28', statut: 'impayee' as const },
      ],
    };
    expect(clientRetardInhabituel(client)).toBe(true);
  });

  it('flags any current delay for a client who normally pays early', () => {
    const client = {
      factures: [
        { montant: 1000, dateEcheance: '2026-01-10', datePaiement: '2026-01-05', statut: 'payee' as const }, // -5
        { montant: 1000, dateEcheance: '2026-02-10', datePaiement: '2026-02-06', statut: 'payee' as const }, // -4
        { montant: 5000, dateEcheance: '2026-07-27', statut: 'impayee' as const }, // 1 jour de retard seulement
      ],
    };
    expect(clientRetardInhabituel(client)).toBe(true);
  });
});

describe('enLitigeSignal', () => {
  function facture(dateEcheance: string, statut: 'impayee' | 'payee') {
    return { montant: 1000, dateEcheance, statut };
  }

  it('false under the threshold', () => {
    const factures = Array.from({ length: 6 }, (_, i) => facture(`2026-0${i + 1}-01`, 'impayee'));
    expect(enLitigeSignal(factures)).toBe(false);
  });

  it('true at exactly 7 consecutive unpaid invoices', () => {
    const factures = Array.from({ length: 7 }, (_, i) => facture(`2026-0${i + 1}-01`, 'impayee'));
    expect(enLitigeSignal(factures)).toBe(true);
  });

  it('a single paid invoice in the middle breaks the streak', () => {
    const factures = [
      facture('2026-01-01', 'impayee'),
      facture('2026-02-01', 'payee'),
      facture('2026-03-01', 'impayee'),
      facture('2026-04-01', 'impayee'),
      facture('2026-05-01', 'impayee'),
      facture('2026-06-01', 'impayee'),
      facture('2026-07-01', 'impayee'),
      facture('2026-08-01', 'impayee'),
    ];
    // seulement 6 impayées consécutives depuis la plus récente (mars à août)
    expect(enLitigeSignal(factures)).toBe(false);
  });

  it('ignores order in the input array (sorts by dateEcheance internally)', () => {
    const factures = Array.from({ length: 7 }, (_, i) => facture(`2026-0${i + 1}-01`, 'impayee')).reverse();
    expect(enLitigeSignal(factures)).toBe(true);
  });

  it('respects a custom threshold', () => {
    const factures = Array.from({ length: 3 }, (_, i) => facture(`2026-0${i + 1}-01`, 'impayee'));
    expect(enLitigeSignal(factures, 3)).toBe(true);
    expect(enLitigeSignal(factures, 4)).toBe(false);
  });
});

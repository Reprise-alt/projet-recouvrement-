import { describe, expect, it } from 'vitest';
import { planContactMerge, planContratMerge, planFactureMerge } from '../src/lib/merge';

describe('planFactureMerge', () => {
  it('creates invoices that do not exist yet, keyed by numero', () => {
    const plan = planFactureMerge([], [{ numero: 'FA-1', montant: 1000, dateEcheance: '2026-01-01', statut: 'impayee' }]);
    expect(plan.toCreate).toHaveLength(1);
    expect(plan.toUpdate).toHaveLength(0);
  });

  it('updates an existing invoice matched by numero instead of duplicating it', () => {
    const existing = [{ id: 'f1', numero: 'FA-1', statut: 'impayee' as const, datePaiement: null }];
    const plan = planFactureMerge(existing, [{ numero: 'FA-1', montant: 2000, dateEcheance: '2026-02-01', statut: 'impayee' }]);
    expect(plan.toCreate).toHaveLength(0);
    expect(plan.toUpdate).toEqual([{ id: 'f1', data: { numero: 'FA-1', montant: 2000, dateEcheance: '2026-02-01', statut: 'impayee' } }]);
  });

  it('never lets a paid invoice revert to unpaid on reimport, even if the import still says impayée', () => {
    const existing = [{ id: 'f1', numero: 'FA-1', statut: 'payee' as const, datePaiement: '2026-01-15' }];
    const plan = planFactureMerge(existing, [{ numero: 'FA-1', montant: 1000, dateEcheance: '2026-01-01', statut: 'impayee' }]);
    expect(plan.toUpdate[0].data.statut).toBe('payee');
    expect(plan.toUpdate[0].data.datePaiement).toBe('2026-01-15');
  });

  it('keeps the existing paiement date when the import provides none', () => {
    const existing = [{ id: 'f1', numero: 'FA-1', statut: 'payee' as const, datePaiement: '2026-01-15' }];
    const plan = planFactureMerge(existing, [{ numero: 'FA-1', montant: 1000, dateEcheance: '2026-01-01', statut: 'impayee' }]);
    expect(plan.toUpdate[0].data.datePaiement).toBe('2026-01-15');
  });
});

describe('planContratMerge', () => {
  it('creates new contracts by numero', () => {
    const plan = planContratMerge([], [{ numero: 'CT-1', dateDebut: '2024-01-01', dateFin: '2027-01-01', tacite: false }]);
    expect(plan.toCreate).toHaveLength(1);
  });

  it('updates an existing contract matched by numero without touching envoi history', () => {
    const existing = [{ id: 'c1', numero: 'CT-1' }];
    const plan = planContratMerge(existing, [{ numero: 'CT-1', dateDebut: '2024-01-01', dateFin: '2028-01-01', tacite: true }]);
    expect(plan.toCreate).toHaveLength(0);
    expect(plan.toUpdate).toEqual([{ id: 'c1', data: { numero: 'CT-1', dateDebut: '2024-01-01', dateFin: '2028-01-01', tacite: true } }]);
  });
});

describe('planContactMerge', () => {
  it('fills in contact fields that are currently empty', () => {
    const patch = planContactMerge({ contact: '', email: '', tel: '' }, { contact: 'A. Diop', email: 'a@x.sn', tel: '+221' });
    expect(patch).toEqual({ contact: 'A. Diop', email: 'a@x.sn', tel: '+221' });
  });

  it('never overwrites a contact field that was already filled by hand', () => {
    const patch = planContactMerge(
      { contact: 'Manually Entered', email: 'manual@x.sn', tel: '+221 77' },
      { contact: 'Imported Name', email: 'imported@x.sn', tel: '+221 78' },
    );
    expect(patch).toEqual({});
  });

  it('fills only the missing subset when some fields are already set', () => {
    const patch = planContactMerge({ contact: 'Manually Entered', email: '', tel: '' }, { contact: 'Imported', email: 'a@x.sn', tel: '' });
    expect(patch).toEqual({ email: 'a@x.sn' });
  });
});

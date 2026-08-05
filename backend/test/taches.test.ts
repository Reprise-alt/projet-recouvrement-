import { describe, expect, it } from 'vitest';
import { buildPlanningRapport, modeleDuLe, resumeJournee, statutAffiche, TacheRapportEntree } from '../src/lib/taches';

describe('modeleDuLe', () => {
  it('is due when the day of month matches a weekday', () => {
    expect(modeleDuLe(5, new Date('2026-08-05T12:00:00Z'))).toBe(true); // mercredi
  });

  it('is not due on any other day', () => {
    expect(modeleDuLe(5, new Date('2026-08-06T12:00:00Z'))).toBe(false);
  });

  // Août 2026 : le 1er tombe un samedi, le 2 un dimanche, le 3 un lundi.
  it('never fires on the weekend day itself', () => {
    expect(modeleDuLe(1, new Date('2026-08-01T12:00:00Z'))).toBe(false); // samedi
    expect(modeleDuLe(2, new Date('2026-08-02T12:00:00Z'))).toBe(false); // dimanche
  });

  it('shifts a Saturday due-date to the following Monday', () => {
    expect(modeleDuLe(1, new Date('2026-08-03T12:00:00Z'))).toBe(true);
  });

  it('shifts a Sunday due-date to the following Monday', () => {
    expect(modeleDuLe(2, new Date('2026-08-03T12:00:00Z'))).toBe(true);
  });

  it('does not fire on a Monday for a day of month that was not a weekend', () => {
    expect(modeleDuLe(10, new Date('2026-08-03T12:00:00Z'))).toBe(false);
  });

  it('does not shift onto a Tuesday even if the previous Sunday matched', () => {
    expect(modeleDuLe(2, new Date('2026-08-04T12:00:00Z'))).toBe(false); // mardi
  });

  it('fires directly for a day of month that already falls on a Monday', () => {
    expect(modeleDuLe(3, new Date('2026-08-03T12:00:00Z'))).toBe(true);
  });
});

describe('statutAffiche', () => {
  it('shows faite/annulee as-is regardless of date', () => {
    expect(statutAffiche({ statut: 'faite', date: '2026-08-06', dateInitiale: '2026-08-05' })).toBe('faite');
    expect(statutAffiche({ statut: 'annulee', date: '2026-08-05', dateInitiale: '2026-08-05' })).toBe('annulee');
  });

  it('shows a_faire when still on its original date', () => {
    expect(statutAffiche({ statut: 'a_faire', date: '2026-08-05', dateInitiale: '2026-08-05' })).toBe('a_faire');
  });

  it('shows reportee when the date moved away from dateInitiale', () => {
    expect(statutAffiche({ statut: 'a_faire', date: '2026-08-07', dateInitiale: '2026-08-05' })).toBe('reportee');
  });
});

describe('resumeJournee', () => {
  it('tallies each status independently', () => {
    const taches = [
      { statut: 'faite' as const, date: '2026-08-05', dateInitiale: '2026-08-05' },
      { statut: 'a_faire' as const, date: '2026-08-07', dateInitiale: '2026-08-05' }, // reportée
      { statut: 'a_faire' as const, date: '2026-08-05', dateInitiale: '2026-08-05' },
      { statut: 'annulee' as const, date: '2026-08-05', dateInitiale: '2026-08-05' },
    ];
    expect(resumeJournee(taches)).toEqual({ total: 4, faites: 1, reportees: 1, aFaire: 1, annulees: 1 });
  });

  it('returns all zeros for an empty day', () => {
    expect(resumeJournee([])).toEqual({ total: 0, faites: 0, reportees: 0, aFaire: 0, annulees: 0 });
  });
});

describe('buildPlanningRapport', () => {
  const taches: TacheRapportEntree[] = [
    { statut: 'faite', date: '2026-08-05', dateInitiale: '2026-08-05', entite: 'SORAM', coursierId: 'u1', coursierNom: 'Awa' },
    { statut: 'a_faire', date: '2026-08-07', dateInitiale: '2026-08-05', entite: 'SORAM', coursierId: 'u1', coursierNom: 'Awa' }, // reportée
    { statut: 'a_faire', date: '2026-08-06', dateInitiale: '2026-08-06', entite: 'IRIS', coursierId: null, coursierNom: null },
    { statut: 'annulee', date: '2026-08-06', dateInitiale: '2026-08-06', entite: 'IRIS', coursierId: 'u2', coursierNom: 'Moussa' },
  ];
  const rapport = buildPlanningRapport(taches);

  it('groups counts by original day, keyed on dateInitiale not date', () => {
    expect(rapport.parJour).toEqual([
      { date: '2026-08-05', total: 2, faites: 1, reportees: 1, aFaire: 0, annulees: 0 },
      { date: '2026-08-06', total: 2, faites: 0, reportees: 0, aFaire: 1, annulees: 1 },
    ]);
  });

  it('groups counts by courier, unassigned tasks under a null-id "Non assignée" bucket', () => {
    expect(rapport.parCoursier).toEqual([
      { coursierId: 'u1', nom: 'Awa', total: 2, faites: 1, reportees: 1, aFaire: 0, annulees: 0 },
      { coursierId: null, nom: 'Non assignée', total: 1, faites: 0, reportees: 0, aFaire: 1, annulees: 0 },
      { coursierId: 'u2', nom: 'Moussa', total: 1, faites: 0, reportees: 0, aFaire: 0, annulees: 1 },
    ]);
  });

  it('counts reported tasks per entity and as a group total', () => {
    expect(rapport.reporteesParEntite).toEqual([{ entite: 'SORAM', nombre: 1 }]);
    expect(rapport.reporteesTotal).toBe(1);
  });

  it('computes a global tally across the whole period', () => {
    expect(rapport.global).toEqual({ total: 4, faites: 1, reportees: 1, aFaire: 1, annulees: 1 });
  });

  it('returns empty structures for no tasks', () => {
    const vide = buildPlanningRapport([]);
    expect(vide.parJour).toEqual([]);
    expect(vide.parCoursier).toEqual([]);
    expect(vide.reporteesParEntite).toEqual([]);
    expect(vide.reporteesTotal).toBe(0);
    expect(vide.global).toEqual({ total: 0, faites: 0, reportees: 0, aFaire: 0, annulees: 0 });
  });
});

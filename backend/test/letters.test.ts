import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { generateContractDoc, generateLetter } from '../src/lib/letters';
import { fmtFCFA } from '../src/lib/dates';

const baseClient = {
  nom: 'Teranga Négoce SA',
  entite: 'SORAM' as const,
  contact: 'A. Diop',
  factures: [{ numero: 'FA-2026-1042', montant: 1250000, dateEcheance: '2026-06-01', statut: 'impayee' as const }],
};

describe('generateLetter', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-28T12:00:00Z'));
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('generates a friendly reminder for paliers 1-3', () => {
    const text = generateLetter(baseClient, 2);
    expect(text).toContain('Rappel de règlement');
    expect(text).toContain('FA-2026-1042');
    expect(text).toContain(fmtFCFA(1250000));
    expect(text).toContain('Cordialement');
  });

  it('mentions the right service for a suspension notice, per entité', () => {
    const iris = generateLetter({ ...baseClient, entite: 'IRIS' as const }, 4);
    expect(iris).toContain('géolocalisation');

    const sis = generateLetter({ ...baseClient, entite: 'SIS' as const }, 4);
    expect(sis).toContain("d'impression");

    const soram = generateLetter(baseClient, 4);
    expect(soram).toContain('toners');
  });

  it('generates a formal mise en demeure at palier 6', () => {
    const text = generateLetter(baseClient, 6);
    expect(text).toContain('MISE EN DEMEURE');
    expect(text).toContain('quinzaine');
  });

  it('generates an internal note with the service signature at palier 7 (huissier)', () => {
    const text = generateLetter(baseClient, 7);
    expect(text).toContain('Transmission au contentieux');
    expect(text).toContain('Cordialement');
    expect(text).toContain('Service Facturation et Recouvrement');
  });
});

describe('generateContractDoc', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-28T12:00:00Z'));
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  const client = { nom: 'Baobab Distribution', entite: 'SORAM' as const, contact: 'F. Sarr' };

  it('produces a révision tarifaire document when that échéance applies', () => {
    const contract = { numero: 'CT-1', dateDebut: '2024-01-01', dateFin: '2027-12-31', dateRevisionTarif: '2026-09-01', tacite: false };
    const doc = generateContractDoc(client, contract);
    expect(doc.subject).toContain('Révision tarifaire');
    expect(doc.body).toContain('article 7.4');
  });

  it('produces a tacite reconduction document when the contract is tacite and échu', () => {
    const contract = { numero: 'CT-2', dateDebut: '2024-01-01', dateFin: '2026-08-01', dateRevisionTarif: null, tacite: true };
    const doc = generateContractDoc(client, contract);
    expect(doc.subject).toContain('tacite reconduction');
    expect(doc.body).toContain('tacite reconduction');
  });

  it('proposes a formal renewal document when the contract is not tacite', () => {
    const contract = { numero: 'CT-3', dateDebut: '2024-01-01', dateFin: '2026-08-01', dateRevisionTarif: null, tacite: false };
    const doc = generateContractDoc(client, contract);
    expect(doc.subject).toContain('renouvellement');
    expect(doc.body).toContain('projet de nouveau contrat');
  });
});

import * as XLSX from 'xlsx';
import { describe, expect, it } from 'vitest';
import { isOluFacturationWorkbook, parseOluFacturationWorkbook } from '../src/lib/parsers/oluFacturation';
import { isContractTrackingWorkbook, parseContractTrackingWorkbook } from '../src/lib/parsers/contractTracking';
import { processImportRows } from '../src/lib/parsers/genericImport';
import { parseImportBuffer } from '../src/lib/parsers';

function buildFacturationWorkbook(): XLSX.WorkBook {
  const rows = [
    ['SORAM AFRIQUE', '', '', '', '', ''],
    ['N° FACTURE', 'DATE', 'NOM CLIENT', 'MONTANT HT', 'MONTANT TTC', 'DATE DE PAIEMENT'],
    [1042, '01/06/2026', 'Teranga Négoce SA', 1000000, 1250000, ''],
    [1043, '15/05/2026', 'Baobab Distribution', 500000, 625000, '20/05/2026'],
    ['', '', 'TOTAL SORAM', '', '', ''],
    ['SIS', '', '', '', '', ''],
    ['N° FACTURE', 'DATE', 'NOM CLIENT', 'MONTANT HT', 'MONTANT TTC', 'DATE DE PAIEMENT'],
    [2001, '01/07/2026', 'Horizon BTP', 200000, 250000, ''],
  ];
  const sheet = XLSX.utils.aoa_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, sheet, 'JANV 2026');
  return wb;
}

function buildContractTrackingWorkbook(): XLSX.WorkBook {
  const rows = [
    ['SORAM AFRIQUE – Suivi des contrats Leasing', '', '', '', '', '', '', ''],
    ['RAISON SOCIALE', 'DATE DE DÉBUT', 'DATE DE FIN', 'ISSUE CONTRAT', 'STATUT', 'COMMENTAIRE', 'LIBELLÉ CONTRAT', 'CODE'],
    ['Teranga Négoce SA', '01/01/2025', '31/12/2027', 'Tacite reconduction', 'Actif', 'RAS', 'Leasing imprimante X200', 'C-001'],
    ['Baobab Distribution', '01/01/2024', '01/08/2026', 'Résiliation', 'Actif', '', '', 'C-002'],
  ];
  const sheet = XLSX.utils.aoa_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, sheet, 'Leasing');
  return wb;
}

// Variante rencontrée sur les vrais fichiers IRIS : colonne "Client" au lieu
// de "Raison sociale", et ni "Libellé contrat" ni "Code" pour distinguer
// plusieurs contrats d'un même client.
function buildIrisStyleContractWorkbook(): XLSX.WorkBook {
  const rows = [
    ["IRIS AFRIQUE – Suivi des contrats GPS Fleet Management", '', '', '', ''],
    ['Client', 'Début', 'Fin contrat', 'Statut', 'Issue contrat'],
    ['Societe Generale', '01/01/2024', '16/06/2027', 'En cours', 'Tacite reconduction'],
    ['Societe Generale', '01/01/2024', '16/06/2027', 'En cours', 'Tacite reconduction'],
  ];
  const sheet = XLSX.utils.aoa_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, sheet, '📡 Clients IRIS Afrique');
  return wb;
}

describe('parseOluFacturationWorkbook', () => {
  const wb = buildFacturationWorkbook();

  it('detects the workbook by its monthly sheet names', () => {
    expect(isOluFacturationWorkbook(wb)).toBe(true);
  });

  it('assigns each invoice to the entity from its section header, resetting after a TOTAL row', () => {
    const result = parseOluFacturationWorkbook(wb);
    expect(result.totalFactures).toBe(3);
    const soram = result.clients.filter((c) => c.entite === 'SORAM');
    const sis = result.clients.filter((c) => c.entite === 'SIS');
    expect(soram).toHaveLength(2);
    expect(sis).toHaveLength(1);
    expect(sis[0].nom).toBe('Horizon BTP');
  });

  it('computes the échéance as facture date + 30 days and infers statut from the paiement column', () => {
    const result = parseOluFacturationWorkbook(wb);
    const teranga = result.clients.find((c) => c.nom === 'Teranga Négoce SA')!;
    expect(teranga.factures[0].dateFacture).toBe('2026-06-01');
    expect(teranga.factures[0].dateEcheance).toBe('2026-07-01');
    expect(teranga.factures[0].statut).toBe('impayee');

    const baobab = result.clients.find((c) => c.nom === 'Baobab Distribution')!;
    expect(baobab.factures[0].statut).toBe('payee');
    expect(baobab.factures[0].datePaiement).toBe('2026-05-20');
  });

  it('disambiguates two distinct billing lines that reuse the same N° FACTURE for the same client', () => {
    const rows = [
      ['SORAM AFRIQUE', '', '', '', '', ''],
      ['N° FACTURE', 'DATE', 'NOM CLIENT', 'MONTANT HT', 'MONTANT TTC', 'DATE DE PAIEMENT'],
      [9001, '20/02/2026', "SEN'EAU", 946000, 19470, ''],
      [9001, '20/02/2026', "SEN'EAU", 197500, 1116280, ''],
    ];
    const sheet = XLSX.utils.aoa_to_sheet(rows);
    const wb2 = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb2, sheet, 'FEVRIER 2026');

    const result = parseOluFacturationWorkbook(wb2);
    expect(result.totalFactures).toBe(2);
    const seneau = result.clients.find((c) => c.nom === "SEN'EAU")!;
    expect(seneau.factures).toHaveLength(2);
    const numeros = seneau.factures.map((f) => f.numero);
    expect(new Set(numeros).size).toBe(2);
    // Les deux montants distincts doivent être conservés, pas juste le dernier.
    expect(seneau.factures.map((f) => f.montant).sort((a, b) => a - b)).toEqual([19470, 1116280]);
  });

  it('recognizes 3-letter month abbreviations ("JAN", "FEV"), not just the 4-letter ones', () => {
    const rows = [
      ['IRIS', '', '', '', '', ''],
      ['N° FACTURE', 'DATE', 'NOM CLIENT', 'MONTANT HT', 'MONTANT TTC', 'DATE DE PAIEMENT'],
      [1, '15/01/2026', 'Client Janvier', 100000, 125000, ''],
    ];
    const sheet = XLSX.utils.aoa_to_sheet(rows);
    const wbJan = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wbJan, sheet, 'JAN');

    expect(isOluFacturationWorkbook(wbJan)).toBe(true);
    const result = parseOluFacturationWorkbook(wbJan);
    expect(result.sheetsRead).toBe(1);
    expect(result.totalFactures).toBe(1);
  });
});

describe('parseContractTrackingWorkbook', () => {
  const wb = buildContractTrackingWorkbook();

  it('detects the workbook by its "raison sociale" + début/fin header row', () => {
    expect(isContractTrackingWorkbook(wb)).toBe(true);
  });

  it('labels contracts by sheet name and detects tacite reconduction from "issue contrat"', () => {
    const result = parseContractTrackingWorkbook(wb);
    expect(result.totalContrats).toBe(2);

    const teranga = result.clients.find((c) => c.nom === 'Teranga Négoce SA')!;
    expect(teranga.contrats[0].type).toBe('Leasing');
    expect(teranga.contrats[0].tacite).toBe(true);
    expect(teranga.contrats[0].numero).toBe('Leasing imprimante X200');
    expect(teranga.contrats[0].dateDebut).toBe('2025-01-01');
    expect(teranga.contrats[0].dateFin).toBe('2027-12-31');

    const baobab = result.clients.find((c) => c.nom === 'Baobab Distribution')!;
    expect(baobab.contrats[0].tacite).toBe(false);
    expect(baobab.contrats[0].numero).toBe('Contrat C-002');
  });

  it('detects the entité from the sheet banner rather than assuming SORAM', () => {
    const result = parseContractTrackingWorkbook(wb);
    expect(result.clients.every((c) => c.entite === 'SORAM')).toBe(true);
  });
});

describe('parseContractTrackingWorkbook — IRIS-style header ("Client" column, no libellé/code)', () => {
  const wb = buildIrisStyleContractWorkbook();

  it('detects the workbook via a "Client" header column, not just "Raison sociale"', () => {
    expect(isContractTrackingWorkbook(wb)).toBe(true);
  });

  it('detects IRIS as the entité from the sheet banner text', () => {
    const result = parseContractTrackingWorkbook(wb);
    expect(result.clients.every((c) => c.entite === 'IRIS')).toBe(true);
  });

  it('disambiguates two contracts for the same client instead of colliding on the same numero', () => {
    const result = parseContractTrackingWorkbook(wb);
    const sg = result.clients.find((c) => c.nom === 'Societe Generale')!;
    expect(sg.contrats).toHaveLength(2);
    const numeros = sg.contrats.map((c) => c.numero);
    expect(new Set(numeros).size).toBe(2);
  });
});

describe('dynamic entity recognition (a company added from the admin UI, not hardcoded)', () => {
  it('parseOluFacturationWorkbook recognizes a newly-added entity from its banner', () => {
    const rows = [
      ['NOVA TECH SOLUTIONS', '', '', '', '', ''],
      ['N° FACTURE', 'DATE', 'NOM CLIENT', 'MONTANT HT', 'MONTANT TTC', 'DATE DE PAIEMENT'],
      [1, '01/06/2026', 'Client Nova', 100000, 125000, ''],
    ];
    const sheet = XLSX.utils.aoa_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, sheet, 'JUIN 2026');

    const knownEntites = [{ code: 'NOVA', nom: 'Nova Tech Solutions' }];
    const result = parseOluFacturationWorkbook(wb, knownEntites);
    expect(result.clients).toHaveLength(1);
    expect(result.clients[0].entite).toBe('NOVA');
  });

  it('parseContractTrackingWorkbook recognizes a newly-added entity from its banner', () => {
    const rows = [
      ['NOVA TECH SOLUTIONS – Suivi des contrats', '', '', ''],
      ['Raison sociale', 'Début', 'Fin', 'Issue contrat'],
      ['Client Nova', '01/01/2025', '31/12/2027', ''],
    ];
    const sheet = XLSX.utils.aoa_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, sheet, 'Contrats');

    const knownEntites = [{ code: 'NOVA', nom: 'Nova Tech Solutions' }];
    const result = parseContractTrackingWorkbook(wb, knownEntites);
    expect(result.clients).toHaveLength(1);
    expect(result.clients[0].entite).toBe('NOVA');
  });

  it('processImportRows accepts a newly-added entity code instead of forcing it to SORAM', () => {
    const knownEntites = [
      { code: 'SORAM', nom: 'SORAM Afrique' },
      { code: 'NOVA', nom: 'Nova Tech Solutions' },
    ];
    const result = processImportRows([{ client_nom: 'Client Nova', entite: 'NOVA' }], knownEntites);
    expect(result.clients[0].entite).toBe('NOVA');
  });
});

describe('processImportRows (generic CSV/XLSX template)', () => {
  it('groups rows by client and attaches invoices/contracts, skipping rows without a client name', () => {
    const result = processImportRows([
      {
        entite: 'SIS',
        client_nom: 'Colobane Assurances',
        client_contact: 'K. Cissé',
        client_email: 'k.cisse@colobane.sn',
        facture_numero: 'FA-9001',
        facture_montant: '350000',
        facture_echeance: '2026-08-01',
        facture_statut: 'impayee',
      },
      { client_nom: '' },
    ]);
    expect(result.skipped).toBe(1);
    expect(result.clients).toHaveLength(1);
    expect(result.clients[0].entite).toBe('SIS');
    expect(result.clients[0].factures[0].montant).toBe(350000);
  });

  it('falls back to SORAM for an unrecognized entite value', () => {
    const result = processImportRows([{ client_nom: 'X', entite: 'INCONNU' }]);
    expect(result.clients[0].entite).toBe('SORAM');
  });
});

describe('parseImportBuffer dispatcher', () => {
  it('routes an OLU facturation workbook to its dedicated parser', () => {
    const buffer = XLSX.write(buildFacturationWorkbook(), { type: 'buffer', bookType: 'xlsx' });
    const { clients, message } = parseImportBuffer(buffer as Buffer);
    expect(clients.length).toBeGreaterThan(0);
    expect(message).toContain('facture(s)');
  });

  it('routes a contract tracking workbook to its dedicated parser', () => {
    const buffer = XLSX.write(buildContractTrackingWorkbook(), { type: 'buffer', bookType: 'xlsx' });
    const { clients, message } = parseImportBuffer(buffer as Buffer);
    expect(clients.length).toBeGreaterThan(0);
    expect(message).toContain('contrat(s)');
  });
});

import * as XLSX from 'xlsx';
import { describe, expect, it } from 'vitest';
import {
  extractSheet,
  guessMapping,
  rowsToGeneric,
  buildPreview,
} from '../src/lib/parsers/flexibleImport';
import { processImportRows } from '../src/lib/parsers/genericImport';

// Export "sauvage" d'un prospect : ligne de titre parasite, en-têtes libres
// (accents, ponctuation), formats de montant/date hétérogènes, une ligne vide.
function buildMessyWorkbook(): Buffer {
  const rows = [
    ['Suivi des impayés — Agro Négoce SARL', '', '', '', '', ''],
    ['Raison sociale', 'N° Facture', 'Montant TTC', "Date d'échéance", 'Email', 'Téléphone'],
    ['Teranga Négoce SA', 'FA-1042', '1 250 000', '20/05/2026', 'a.diop@teranga.sn', '+221 77 123 45 67'],
    ['Teranga Négoce SA', 'FA-1050', '430000', '2026-06-15', 'a.diop@teranga.sn', ''],
    ['Khadim Services', 'FA-2001', '87 500', '01/04/2026', 'contact@khadim.sn', '771234567'],
    ['', '', '', '', '', ''],
    ['Baol Distribution', 'FA-3012', '2100000', '30/09/2026', '', '77 900 11 22'],
  ];
  const ws = XLSX.utils.aoa_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Feuil1');
  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
}

describe('import souple (correspondance de colonnes)', () => {
  it("ignore la ligne de titre et repère la vraie ligne d'en-tête", () => {
    const extract = extractSheet(buildMessyWorkbook());
    expect(extract.headers).toContain('Raison sociale');
    expect(extract.headers).toContain('Montant TTC');
    expect(extract.rowCount).toBe(4); // la ligne vide est exclue
  });

  it('devine la correspondance des colonnes malgré les libellés libres', () => {
    const extract = extractSheet(buildMessyWorkbook());
    const guess = guessMapping(extract.headers);
    expect(guess.client_nom).toBe('Raison sociale');
    expect(guess.facture_montant).toBe('Montant TTC');
    expect(guess.facture_echeance).toBe("Date d'échéance");
    expect(guess.facture_numero).toBe('N° Facture');
    expect(guess.client_email).toBe('Email');
    expect(guess.client_tel).toBe('Téléphone');
  });

  it('produit des clients/factures exploitables avec montants et dates normalisés', () => {
    const extract = extractSheet(buildMessyWorkbook());
    const guess = guessMapping(extract.headers);
    const generic = rowsToGeneric(extract.headers, extract.rows, guess);
    const { clients, skipped } = processImportRows(generic);

    expect(skipped).toBe(0);
    expect(clients.map((c) => c.nom).sort()).toEqual([
      'Baol Distribution',
      'Khadim Services',
      'Teranga Négoce SA',
    ]);
    const teranga = clients.find((c) => c.nom === 'Teranga Négoce SA')!;
    expect(teranga.factures).toHaveLength(2);
    const fa1042 = teranga.factures.find((f) => f.numero === 'FA-1042')!;
    expect(fa1042.montant).toBe(1250000); // "1 250 000" nettoyé
    expect(fa1042.dateEcheance).toBe('2026-05-20'); // 20/05/2026 -> ISO
  });

  it('ne retient aucune colonne attribuée deux fois dans la devinette', () => {
    const extract = extractSheet(buildMessyWorkbook());
    const guess = guessMapping(extract.headers);
    const used = Object.values(guess).filter(Boolean);
    expect(new Set(used).size).toBe(used.length);
  });

  it('expose un aperçu avec en-têtes, devinette et lignes échantillon', () => {
    const preview = buildPreview(extractSheet(buildMessyWorkbook()));
    expect(preview.recognized).toBe(false);
    expect(preview.fields.find((f) => f.field === 'client_nom')?.required).toBe(true);
    expect(preview.sample.length).toBeGreaterThan(0);
    expect(preview.sample[0].length).toBe(preview.headers.length);
  });
});

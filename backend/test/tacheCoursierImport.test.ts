import { describe, expect, it } from 'vitest';
import * as XLSX from 'xlsx';
import { parseTacheCoursierImportWorkbook } from '../src/lib/parsers/tacheCoursierImport';

function workbook(rows: unknown[][]): XLSX.WorkBook {
  const sheet = XLSX.utils.aoa_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, sheet, 'Feuil1');
  return wb;
}

describe('parseTacheCoursierImportWorkbook', () => {
  it('associates every client to the day-of-month header above its block', () => {
    const wb = workbook([
      ['DATE', 'RAISON SOCIALE', null],
      [6, 'CLIENT A', null],
      [null, 'CLIENT B', null],
      [null, null, null],
      [7, 'CLIENT C', null],
    ]);
    const rows = parseTacheCoursierImportWorkbook(wb);
    expect(rows).toEqual([
      { nom: 'CLIENT A', jourDuMois: 6, intervalleMois: 1 },
      { nom: 'CLIENT B', jourDuMois: 6, intervalleMois: 1 },
      { nom: 'CLIENT C', jourDuMois: 7, intervalleMois: 1 },
    ]);
  });

  it('parses every wording of the frequency column into a month count', () => {
    const wb = workbook([
      ['DATE', 'RAISON SOCIALE', null],
      [12, 'MENSUEL', null],
      [null, 'TRIMESTRIEL A', 'Tous les 3 mois'],
      [null, 'TRIMESTRIEL B', 'TOUS LES 3 MOIS'],
      [null, 'TRIMESTRIEL C', 'Chaque 3 mois'],
      [null, 'BIMESTRIEL', 'Tous les 2 mois'],
      [null, 'SEMESTRIEL', 'Tous les 6 mois'],
    ]);
    const rows = parseTacheCoursierImportWorkbook(wb);
    expect(rows.map((r) => r.intervalleMois)).toEqual([1, 3, 3, 3, 2, 6]);
  });

  it('drops a duplicate client repeated under the same day, keeps it across different days', () => {
    const wb = workbook([
      ['DATE', 'RAISON SOCIALE', null],
      [13, 'DOUBLON MEME JOUR', null],
      [null, 'DOUBLON MEME JOUR', null],
      [null, null, null],
      [15, 'CRYSTAL PAINT', null],
      [null, null, null],
      [16, 'CRYSTAL PAINT', null],
    ]);
    const rows = parseTacheCoursierImportWorkbook(wb);
    expect(rows.filter((r) => r.nom === 'DOUBLON MEME JOUR')).toHaveLength(1);
    expect(rows.filter((r) => r.nom === 'CRYSTAL PAINT')).toHaveLength(2);
    expect(rows.filter((r) => r.nom === 'CRYSTAL PAINT').map((r) => r.jourDuMois)).toEqual([15, 16]);
  });

  it('normalises non-breaking spaces and stray whitespace in names', () => {
    const wb = workbook([
      ['DATE', 'RAISON SOCIALE', null],
      [7, ' BATINOV SARL', null],
      [null, '  IN TOUCH   SA  ', null],
    ]);
    const rows = parseTacheCoursierImportWorkbook(wb);
    expect(rows.map((r) => r.nom)).toEqual(['BATINOV SARL', 'IN TOUCH SA']);
  });

  it('ignores the header row and blank separator rows', () => {
    const wb = workbook([
      ['DATE', 'RAISON SOCIALE', null],
      [6, 'CLIENT A', null],
      [null, null, null],
      [null, null, null],
      [11, 'CLIENT B', null],
    ]);
    const rows = parseTacheCoursierImportWorkbook(wb);
    expect(rows).toHaveLength(2);
  });

  it('ignores a client row that appears before any day-of-month header', () => {
    const wb = workbook([
      ['DATE', 'RAISON SOCIALE', null],
      [null, 'ORPHELIN SANS JOUR', null],
      [9, 'CLIENT A', null],
    ]);
    const rows = parseTacheCoursierImportWorkbook(wb);
    expect(rows).toEqual([{ nom: 'CLIENT A', jourDuMois: 9, intervalleMois: 1 }]);
  });
});

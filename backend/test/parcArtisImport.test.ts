import { describe, expect, it } from 'vitest';
import * as XLSX from 'xlsx';
import {
  detectArtisFileType,
  nettoyerSiteArtis,
  parseBiensArtis,
  parseEtatVenteArtis,
  parseInterventionsArtis,
} from '../src/lib/parsers/parcArtisImport';

function workbook(rows: unknown[][]): XLSX.WorkBook {
  const sheet = XLSX.utils.aoa_to_sheet(rows, { cellDates: true });
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, sheet, 'Feuil1');
  return wb;
}

describe('nettoyerSiteArtis', () => {
  it('strips a leading raison sociale matching the client name and a trailing country', () => {
    expect(nettoyerSiteArtis('SEN EAU - Centre de Hann - Route du Front de Terre 4945 Dakar - SENEGAL', 'SEN EAU')).toBe(
      'Centre de Hann - Route du Front de Terre 4945 Dakar'
    );
  });

  it('matches loosely on punctuation (SEN EAU vs SEN\'EAU)', () => {
    expect(nettoyerSiteArtis("SEN EAU - AGENCE SALY - SENEGAL", "SEN'EAU")).toBe('AGENCE SALY');
  });

  it('leaves the string as-is when there is nothing to strip', () => {
    expect(nettoyerSiteArtis('Agence Dakar')).toBe('Agence Dakar');
  });
});

describe('detectArtisFileType', () => {
  it('recognizes biensDsSol by its headers', () => {
    const wb = workbook([['', 'Identifiant fabricant', 'Libellé', 'Site']]);
    expect(detectArtisFileType(wb)).toBe('biens');
  });

  it('recognizes ResultatRequete by its headers', () => {
    const wb = workbook([['DIT no interne', 'DIT Etat']]);
    expect(detectArtisFileType(wb)).toBe('interventions');
  });

  it('recognizes ResultatEtatVente by its headers', () => {
    const wb = workbook([['Origine', 'Code art.', 'Qté livrée']]);
    expect(detectArtisFileType(wb)).toBe('etatvente');
  });

  it('returns inconnu for an unrelated file', () => {
    const wb = workbook([['A', 'B', 'C']]);
    expect(detectArtisFileType(wb)).toBe('inconnu');
  });
});

describe('parseBiensArtis', () => {
  it('extracts numeroSerie/modele/site and dedupes by numeroSerie', () => {
    const wb = workbook([
      ['', 'Identifiant fabricant', 'Libellé', 'Site'],
      ['note', 'A1UF021017006', 'KONICABH283', 'SEN EAU - Centre de Hann - SENEGAL'],
      ['note', 'A1UF021017006', 'KONICABH283', 'SEN EAU - Centre de Hann - SENEGAL'],
      ['note', 'A61E021002998', 'BH454e', 'SEN EAU - AGENCE SALY MBOUR - SENEGAL'],
    ]);
    const rows = parseBiensArtis(wb, 'SEN EAU');
    expect(rows).toEqual([
      { numeroSerie: 'A1UF021017006', modele: 'KONICABH283', site: 'Centre de Hann' },
      { numeroSerie: 'A61E021002998', modele: 'BH454e', site: 'AGENCE SALY MBOUR' },
    ]);
  });
});

describe('parseInterventionsArtis', () => {
  const headers = [
    'DIT no interne', 'x', 'x', 'DIT Date/Heure', 'x', 'DIT Etat', 'x', 'x', 'x', 'x', 'x',
    'x', 'IT Adresse 1', 'x', 'x', 'x', 'x', 'x', 'x', 'x', 'x', 'x', 'x', 'x', 'x', 'x', 'x',
    'x', 'IT Id fabricant du bien', 'x', 'x', 'x', 'x', 'x', 'x', 'x', 'x', 'x', 'x', 'x', 'x',
    'x', 'DIT Nature',
  ];
  // pad to reach the IT D/H début / fin / priorité columns used below via explicit indices
  function row(base: Record<number, unknown>): unknown[] {
    const arr: unknown[] = new Array(120).fill(null);
    Object.entries(base).forEach(([k, v]) => (arr[Number(k)] = v));
    return arr;
  }

  it('maps état/nature/priorité to the target fields and only sets dateCloture when Clôturée', () => {
    const head = new Array(120).fill(null);
    head[0] = 'DIT no interne';
    head[3] = 'DIT Date/Heure';
    head[5] = 'DIT Etat';
    head[12] = 'IT Adresse 1';
    head[28] = 'IT Id fabricant du bien';
    head[32] = 'IT Modèle du bien';
    head[43] = 'DIT Nature';
    head[109] = 'IT D/H début';
    head[111] = 'IT D/H fin';
    head[115] = 'IT Libellé de la priorité';

    const cloturee = row({
      0: '0047340', 3: new Date('2026-08-06T15:10:00Z'), 5: 'Clôturée', 12: 'AGENCE NGNITH',
      28: 'A7AH027002348', 43: 'Maintenance curative', 109: new Date('2026-08-06T15:30:00Z'),
      111: new Date('2026-08-06T17:30:00Z'), 115: '01 - STANDARD',
    });
    const enCours = row({
      0: '0047327', 3: new Date('2026-08-06T09:32:00Z'), 5: 'En cours', 12: 'AGENCE THIAROYE',
      28: 'A7AH021003969', 43: 'Maintenance curative', 109: new Date('2026-08-06T13:00:00Z'),
      111: new Date('2026-08-06T16:08:00Z'), 115: '00 - URGENT',
    });
    const preventive = row({
      0: '0047328', 3: new Date('2026-08-06T09:18:00Z'), 5: 'Clôturée', 12: 'AGENCE GUEOUL',
      28: 'A61G021006239', 43: 'Maintenance préventive', 109: new Date('2026-08-06T10:00:00Z'),
      111: new Date('2026-08-06T12:00:00Z'), 115: '01 - STANDARD',
    });

    const wb = workbook([head, cloturee, enCours, preventive]);
    const rows = parseInterventionsArtis(wb);

    expect(rows[0]).toMatchObject({
      referenceExterne: '0047340', site: 'AGENCE NGNITH', type: 'curative', urgence: 'standard',
      numeroSerieEquipement: 'A7AH027002348',
    });
    expect(rows[0].dateCloture).toEqual(new Date('2026-08-06T17:30:00Z'));

    // "En cours" : IT D/H fin est renseigné (visite technique terminée) mais le
    // ticket (DIT) n'est pas clôturé -- dateCloture doit rester null.
    expect(rows[1].dateCloture).toBeNull();
    expect(rows[1].urgence).toBe('urgente');
    expect(rows[1].datePriseEnCharge).toEqual(new Date('2026-08-06T13:00:00Z'));

    expect(rows[2].type).toBe('preventive');
  });

  it('skips rows without a ticket reference or declaration date', () => {
    const head = new Array(120).fill(null);
    head[0] = 'DIT no interne';
    head[3] = 'DIT Date/Heure';
    const good = row({ 0: '001', 3: new Date('2026-01-01T00:00:00Z') });
    const noRef = row({ 0: null, 3: new Date('2026-01-01T00:00:00Z') });
    const noDate = row({ 0: '002', 3: null });
    const wb = workbook([head, good, noRef, noDate]);
    expect(parseInterventionsArtis(wb)).toHaveLength(1);
  });
});

describe('parseEtatVenteArtis', () => {
  function head(): unknown[] {
    const h = new Array(220).fill(null);
    h[0] = 'Origine';
    h[2] = 'Date livraison';
    h[3] = 'N° BL';
    h[7] = 'Mois-année facture';
    h[23] = 'Code art.';
    h[24] = 'Désignation';
    h[28] = 'Qté livrée';
    h[29] = 'Qté facturée';
    h[215] = 'Bien facturé';
    return h;
  }
  function row(base: Record<number, unknown>): unknown[] {
    const arr: unknown[] = new Array(220).fill(null);
    Object.entries(base).forEach(([k, v]) => (arr[Number(k)] = v));
    return arr;
  }

  it('routes Livraison rows to consommables with a BL+article referenceExterne', () => {
    const wb = workbook([
      head(),
      row({ 0: 'Livraison', 2: new Date('2026-01-05'), 3: '0022139', 23: 'TN323', 24: 'TONER NOIR BH227', 28: 1 }),
    ]);
    const { consommables, volumetrie } = parseEtatVenteArtis(wb);
    expect(consommables).toEqual([
      { referenceExterne: '0022139|TN323', date: new Date('2026-01-05'), reference: 'TONER NOIR BH227', quantite: 1 },
    ]);
    expect(volumetrie).toEqual([]);
  });

  it('sums quantite when the same BL+article appears twice (two destination machines on one line)', () => {
    const wb = workbook([
      head(),
      row({ 0: 'Livraison', 2: new Date('2026-02-10'), 3: '0022633', 23: '000728', 24: 'PIECE X', 28: 1 }),
      row({ 0: 'Livraison', 2: new Date('2026-02-10'), 3: '0022633', 23: '000728', 24: 'PIECE X', 28: 1 }),
    ]);
    const { consommables } = parseEtatVenteArtis(wb);
    expect(consommables).toEqual([
      { referenceExterne: '0022633|000728', date: new Date('2026-02-10'), reference: 'PIECE X', quantite: 2 },
    ]);
  });

  it('aggregates SSC RCN/RCC rows into monthly volumétrie and ignores LOCI', () => {
    const wb = workbook([
      head(),
      row({ 0: 'SSC', 7: new Date('2026-07-30'), 23: 'LOCI', 29: 1 }),
      row({ 0: 'SSC', 7: new Date('2026-07-30'), 23: 'RCN', 29: 2231 }),
      row({ 0: 'SSC', 7: new Date('2026-07-15'), 23: 'RCN', 29: 343 }),
      row({ 0: 'SSC', 7: new Date('2026-07-30'), 23: 'RCC', 29: 462 }),
      row({ 0: 'SSC', 7: new Date('2026-08-02'), 23: 'RCC', 29: 100 }),
    ]);
    const { consommables, volumetrie } = parseEtatVenteArtis(wb);
    expect(consommables).toEqual([]);
    expect(volumetrie).toEqual([
      { periode: '2026-07', copiesNB: 2231 + 343, copiesCouleur: 462 },
      { periode: '2026-08', copiesNB: 0, copiesCouleur: 100 },
    ]);
  });

  it('aggregates SSC rows per machine (colonne "Bien facturé" = n° de série) and per période', () => {
    const wb = workbook([
      head(),
      row({ 0: 'SSC', 7: new Date('2026-07-30'), 23: 'RCN', 29: 2231, 215: 'A7AK021010312' }),
      row({ 0: 'SSC', 7: new Date('2026-07-15'), 23: 'RCC', 29: 100, 215: 'A7AK021010312' }),
      row({ 0: 'SSC', 7: new Date('2026-07-30'), 23: 'RCN', 29: 343, 215: 'RFH0634294' }),
      row({ 0: 'SSC', 7: new Date('2026-08-01'), 23: 'RCN', 29: 50, 215: 'A7AK021010312' }),
      row({ 0: 'SSC', 7: new Date('2026-07-30'), 23: 'LOCI', 29: 1, 215: 'A7AK021010312' }),
    ]);
    const { volumetrieParMachine } = parseEtatVenteArtis(wb);
    expect(volumetrieParMachine).toEqual([
      { numeroSerie: 'A7AK021010312', periode: '2026-07', copiesNB: 2231, copiesCouleur: 100 },
      { numeroSerie: 'RFH0634294', periode: '2026-07', copiesNB: 343, copiesCouleur: 0 },
      { numeroSerie: 'A7AK021010312', periode: '2026-08', copiesNB: 50, copiesCouleur: 0 },
    ]);
  });

  it('skips per-machine aggregation when "Bien facturé" is blank', () => {
    const wb = workbook([head(), row({ 0: 'SSC', 7: new Date('2026-07-30'), 23: 'RCN', 29: 100 })]);
    const { volumetrie, volumetrieParMachine } = parseEtatVenteArtis(wb);
    expect(volumetrie).toEqual([{ periode: '2026-07', copiesNB: 100, copiesCouleur: 0 }]);
    expect(volumetrieParMachine).toEqual([]);
  });
});

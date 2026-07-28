import * as XLSX from 'xlsx';
import { toISODate } from '../dates';
import { ParsedClient } from './types';

function normHeader(s: unknown): string {
  return (s || '')
    .toString()
    .replace(/\n/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function findCol(headerRow: unknown[], keyword: string): number {
  for (let i = 0; i < headerRow.length; i++) {
    if (normHeader(headerRow[i]).includes(keyword)) return i;
  }
  return -1;
}

function findHeaderRowIndex(rows: unknown[][]): number {
  for (let i = 0; i < Math.min(rows.length, 6); i++) {
    const norm = (rows[i] || []).map(normHeader);
    if (norm.some((h) => h.includes('raison sociale')) && norm.some((h) => h.includes('début') || h.includes('fin'))) return i;
  }
  return -1;
}

export function isContractTrackingWorkbook(wb: XLSX.WorkBook): boolean {
  return wb.SheetNames.some((name) => {
    const rows: unknown[][] = XLSX.utils.sheet_to_json(wb.Sheets[name], { header: 1, defval: '', range: 0 });
    return findHeaderRowIndex(rows.slice(0, 6)) >= 0;
  });
}

export interface ContractTrackingResult {
  clients: ParsedClient[];
  totalContrats: number;
  sheetsRead: number;
}

// Parseur du suivi des contrats (ex: "SORAM Suivi Contrats") — onglets Leasing /
// Logiciel, détection de la tacite reconduction via la colonne "issue contrat".
export function parseContractTrackingWorkbook(wb: XLSX.WorkBook): ContractTrackingResult {
  const clientMap: Record<string, ParsedClient> = {};
  let totalContrats = 0;
  let sheetsRead = 0;

  wb.SheetNames.forEach((sheetName) => {
    const ws = wb.Sheets[sheetName];
    const rows: unknown[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
    const headerIdx = findHeaderRowIndex(rows);
    if (headerIdx < 0) return;
    sheetsRead++;

    const header = rows[headerIdx];
    const colRaison = findCol(header, 'raison sociale');
    const colDebut = findCol(header, 'début');
    const colFin = findCol(header, 'fin');
    const colIssue = findCol(header, 'issue contrat');
    const colStatut = findCol(header, 'statut');
    const colCommentaire = findCol(header, 'commentaire');
    const colLibelle = findCol(header, 'libellé contrat');
    const colCode = findCol(header, 'code');
    if (colRaison < 0 || colFin < 0) return;

    const typeLabel = /leasing/i.test(sheetName) ? 'Leasing' : /logiciel/i.test(sheetName) ? 'Logiciel / Maintenance' : 'Contrat';

    for (let r = headerIdx + 1; r < rows.length; r++) {
      const row = rows[r];
      const nomRaw = (row[colRaison] || '').toString().trim();
      if (!nomRaw) continue;
      const dateFin = toISODate(row[colFin]);
      if (!dateFin) continue;
      const dateDebut = colDebut >= 0 ? toISODate(row[colDebut]) || dateFin : dateFin;
      const issue = colIssue >= 0 ? (row[colIssue] || '').toString() : '';
      const tacite = /tacite/i.test(issue);
      const statutSource = colStatut >= 0 ? (row[colStatut] || '').toString().trim() : '';
      const commentaire = colCommentaire >= 0 ? (row[colCommentaire] || '').toString().trim() : '';
      const libelle = colLibelle >= 0 ? (row[colLibelle] || '').toString().trim() : '';
      const code = colCode >= 0 ? row[colCode] : '';
      const nom = nomRaw.replace(/\s+/g, ' ').trim();
      const key = nom.toUpperCase() + '|SORAM';

      if (!clientMap[key]) {
        clientMap[key] = { nom, entite: 'SORAM', contact: '', email: '', tel: '', factures: [], contrats: [] };
      }
      totalContrats++;
      clientMap[key].contrats.push({
        numero: libelle || (code ? 'Contrat ' + code : typeLabel),
        type: typeLabel,
        dateDebut,
        dateFin,
        tacite,
        dateRevisionTarif: null,
        statutSource,
        commentaire,
      });
    }
  });

  return { clients: Object.values(clientMap), totalContrats, sheetsRead };
}

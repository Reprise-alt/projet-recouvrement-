import * as XLSX from 'xlsx';
import { toISODate } from '../dates';
import { EntiteImport, ParsedClient } from './types';
import { DEFAULT_KNOWN_ENTITES, KnownEntite, matchKnownEntite } from './entiteMatch';

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

// La colonne du nom client s'appelle "Raison sociale" sur les fichiers SORAM,
// mais juste "Client" sur les fichiers IRIS — un `includes('client')` seul
// matcherait à tort une colonne "Code client".
// Taux d'augmentation depuis la colonne « Augm. » : « — », vide ou 0 → aucun.
// Accepte « 5 », « 5% », « 5 % », « 5,0 ».
function parseTaux(v: unknown): number | undefined {
  const s = (v ?? '').toString().trim();
  if (!s || s === '—' || s === '-') return undefined;
  const n = parseFloat(s.replace('%', '').replace(',', '.').replace(/[^\d.-]/g, ''));
  return isFinite(n) && n > 0 ? n : undefined;
}

// Type d'augmentation depuis une colonne optionnelle (« Type augmentation »,
// « Notification »…). Rien à renseigner tant que la colonne n'existe pas.
function parseTypeAug(v: unknown): 'sans_notification' | 'sur_notification' | undefined {
  const s = (v ?? '').toString().trim().toLowerCase();
  if (!s || s === '—' || s === '-') return undefined;
  if (/\bsans\b|\bnon\b|automat/.test(s)) return 'sans_notification';
  if (/\bsur\b|\bavec\b|\boui\b|notif/.test(s)) return 'sur_notification';
  return undefined;
}

function findClientCol(headerRow: unknown[]): number {
  const raison = findCol(headerRow, 'raison sociale');
  if (raison >= 0) return raison;
  return headerRow.findIndex((h) => normHeader(h) === 'client');
}

function hasClientCol(normalizedHeader: string[]): boolean {
  return normalizedHeader.some((h) => h.includes('raison sociale') || h === 'client');
}

function findHeaderRowIndex(rows: unknown[][]): number {
  for (let i = 0; i < Math.min(rows.length, 6); i++) {
    const norm = (rows[i] || []).map(normHeader);
    if (hasClientCol(norm) && norm.some((h) => h.includes('début') || h.includes('fin'))) return i;
  }
  return -1;
}

// Les onglets portent un bandeau titre ("SORAM AFRIQUE – Suivi des contrats…",
// "IRIS AFRIQUE – Suivi des contrats…") au-dessus de l'en-tête — on s'en sert
// pour déterminer l'entité plutôt que de la figer en dur, un même parseur
// servant à toutes les entités du groupe (y compris celles ajoutées depuis
// l'interface, via `knownEntites`).
function detectEntite(rows: unknown[][], knownEntites: KnownEntite[]): EntiteImport {
  for (const row of rows.slice(0, 6)) {
    for (const cell of row) {
      const text = (cell || '').toString();
      if (!text.trim()) continue;
      const match = matchKnownEntite(text, knownEntites);
      if (match) return match;
    }
  }
  return knownEntites[0]?.code ?? 'SORAM';
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
export function parseContractTrackingWorkbook(
  wb: XLSX.WorkBook,
  knownEntites: KnownEntite[] = DEFAULT_KNOWN_ENTITES,
): ContractTrackingResult {
  const clientMap: Record<string, ParsedClient> = {};
  // Quand ni "Libellé contrat" ni "Code" n'existent pour distinguer plusieurs
  // contrats d'un même client (cas du fichier IRIS), on numérote par ordre
  // d'apparition plutôt que de tous les nommer pareil et les faire s'écraser.
  // Limite connue : si l'ordre des lignes de ce client change d'un import à
  // l'autre, un réimport peut créer un doublon plutôt que mettre à jour le
  // bon contrat — pas de perte de données, juste une ligne à nettoyer à la
  // main le cas échéant. Sans identifiant stable dans la source, impossible
  // de garantir mieux.
  const contractSeqByClient: Record<string, number> = {};
  let totalContrats = 0;
  let sheetsRead = 0;

  wb.SheetNames.forEach((sheetName) => {
    const ws = wb.Sheets[sheetName];
    const rows: unknown[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
    const headerIdx = findHeaderRowIndex(rows);
    if (headerIdx < 0) return;
    sheetsRead++;

    const header = rows[headerIdx];
    const colRaison = findClientCol(header);
    const colDebut = findCol(header, 'début');
    const colFin = findCol(header, 'fin');
    const colIssue = findCol(header, 'issue contrat');
    const colStatut = findCol(header, 'statut');
    const colCommentaire = findCol(header, 'commentaire');
    const colLibelle = findCol(header, 'libellé contrat');
    const colCode = findCol(header, 'code');
    // Colonnes « augmentation » de l'onglet Leasing :
    //  - taux : en-tête contenant « augm » mais PAS « date » (« Augm. »).
    //  - date : « Date d'augmentation annuelle ».
    //  - type : colonne optionnelle « … notification » (sur / sans).
    const colTaux = header.findIndex((h) => { const n = normHeader(h); return n.includes('augm') && !n.includes('date'); });
    const colDateAug = header.findIndex((h) => { const n = normHeader(h); return n.includes('augmentation') && (n.includes('date') || n.includes('annuelle')); });
    const colNotif = findCol(header, 'notification');
    if (colRaison < 0 || colFin < 0) return;

    const entite = detectEntite(rows, knownEntites);
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
      const tauxAugmentation = colTaux >= 0 ? parseTaux(row[colTaux]) : undefined;
      const dateAug = colDateAug >= 0 ? toISODate(row[colDateAug]) : null;
      const typeAugmentation = colNotif >= 0 ? parseTypeAug(row[colNotif]) : undefined;
      const nom = nomRaw.replace(/\s+/g, ' ').trim();
      const key = nom.toUpperCase() + '|' + entite;

      if (!clientMap[key]) {
        clientMap[key] = { nom, entite, contact: '', email: '', tel: '', factures: [], contrats: [] };
      }

      let numero = libelle || (code ? 'Contrat ' + code : '');
      if (!numero) {
        const seq = (contractSeqByClient[key] = (contractSeqByClient[key] || 0) + 1);
        numero = seq === 1 ? typeLabel : `${typeLabel} ${seq}`;
      }

      totalContrats++;
      clientMap[key].contrats.push({
        numero,
        type: typeLabel,
        dateDebut,
        dateFin,
        tacite,
        // undefined (et non null) quand la colonne est absente/vide : à la
        // réimportation, on ne veut pas écraser une valeur saisie à la main.
        dateRevisionTarif: dateAug || undefined,
        tauxAugmentation,
        typeAugmentation,
        statutSource,
        commentaire,
      });
    }
  });

  return { clients: Object.values(clientMap), totalContrats, sheetsRead };
}

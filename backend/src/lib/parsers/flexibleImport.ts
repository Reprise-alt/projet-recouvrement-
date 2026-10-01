import * as XLSX from 'xlsx';
import { GenericImportRow } from './genericImport';

// Import souple avec correspondance de colonnes : accepte N'IMPORTE QUEL
// classeur Excel/CSV (l'export comptable d'un prospect, pas seulement notre
// modèle), devine la correspondance des colonnes, et laisse l'utilisateur la
// corriger avant d'importer. C'est ce qui débloque la toute première prise en
// main : sans ça, le parseur générique exige les en-têtes EXACTS du modèle
// (`client_nom`, `facture_montant`…) et échoue silencieusement sur tout autre
// fichier.

export type CanonicalField =
  | 'entite'
  | 'client_nom'
  | 'client_contact'
  | 'client_email'
  | 'client_tel'
  | 'facture_numero'
  | 'facture_montant'
  | 'facture_echeance'
  | 'facture_statut';

interface FieldSpec {
  field: CanonicalField;
  label: string;
  required?: boolean;
  // Synonymes normalisés (sans accents, minuscules) recherchés dans les en-têtes.
  synonyms: string[];
}

// Ordre d'affichage dans l'UI. `client_nom` est le seul champ réellement
// obligatoire ; un montant OU un numéro de facture suffit à créer une créance.
export const FIELD_SPECS: FieldSpec[] = [
  { field: 'client_nom', label: 'Nom du débiteur', required: true, synonyms: ['client', 'nom', 'raison sociale', 'raison', 'debiteur', 'societe', 'tiers', 'customer', 'name', 'denomination'] },
  { field: 'facture_montant', label: 'Montant dû', synonyms: ['montant', 'ttc', 'montant ttc', 'total', 'solde', 'solde du', 'reste', 'reste du', 'du', 'amount', 'encours', 'impaye', 'a payer'] },
  { field: 'facture_echeance', label: "Date d'échéance", synonyms: ['echeance', 'date echeance', 'date d echeance', 'due', 'date limite', 'deadline', 'date de reglement', 'date limite de paiement', 'exigibilite'] },
  { field: 'facture_numero', label: 'N° de facture', synonyms: ['facture', 'n facture', 'no facture', 'num facture', 'numero facture', 'numero', 'num', 'invoice', 'piece', 'no piece', 'reference', 'ref', 'reference facture'] },
  { field: 'facture_statut', label: 'Statut (payée / impayée)', synonyms: ['statut', 'status', 'etat', 'paye', 'paid', 'regle', 'etat facture'] },
  { field: 'client_contact', label: 'Contact (interlocuteur)', synonyms: ['contact', 'interlocuteur', 'responsable', 'nom contact', 'referent'] },
  { field: 'client_email', label: 'Email', synonyms: ['email', 'mail', 'e mail', 'courriel', 'adresse mail', 'email client'] },
  { field: 'client_tel', label: 'Téléphone', synonyms: ['tel', 'telephone', 'phone', 'mobile', 'gsm', 'portable', 'numero de telephone', 'contact tel'] },
  { field: 'entite', label: 'Entité / établissement', synonyms: ['entite', 'etablissement', 'segment', 'agence', 'site', 'societe emettrice', 'division'] },
];

export function normHeader(s: unknown): string {
  return String(s ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

export interface SheetExtract {
  headers: string[]; // en-têtes bruts (tels qu'affichés à l'utilisateur)
  rows: unknown[][]; // lignes de données (hors en-tête)
  rowCount: number;
}

// Repère la ligne d'en-tête : la première ligne (parmi les 10 premières) qui a
// au moins deux cellules texte non vides et ressemble à des libellés plutôt
// qu'à des données. À défaut, on prend la première ligne non vide.
function findHeaderRow(matrix: unknown[][]): number {
  for (let i = 0; i < Math.min(matrix.length, 10); i++) {
    const row = matrix[i] || [];
    const filled = row.filter((c) => String(c ?? '').trim() !== '');
    if (filled.length < 2) continue;
    const texty = filled.filter((c) => typeof c === 'string' && String(c).trim().length > 0);
    if (texty.length >= Math.max(2, Math.ceil(filled.length / 2))) return i;
  }
  return matrix.findIndex((r) => (r || []).some((c) => String(c ?? '').trim() !== ''));
}

export function extractSheet(buffer: Buffer): SheetExtract {
  const wb = XLSX.read(buffer, { type: 'buffer', cellDates: true });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  if (!sheet) return { headers: [], rows: [], rowCount: 0 };
  const matrix: unknown[][] = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '', blankrows: false });
  const headerIdx = findHeaderRow(matrix);
  if (headerIdx < 0) return { headers: [], rows: [], rowCount: 0 };
  const rawHeaders = (matrix[headerIdx] || []).map((h, i) => {
    const t = String(h ?? '').trim();
    return t || `Colonne ${i + 1}`;
  });
  const dataRows = matrix
    .slice(headerIdx + 1)
    .filter((r) => (r || []).some((c) => String(c ?? '').trim() !== ''));
  return { headers: rawHeaders, rows: dataRows, rowCount: dataRows.length };
}

// Devine la correspondance champ → en-tête. Correspondance exacte d'abord,
// puis « contient », pour éviter qu'un synonyme court (ex. « du ») ne capte à
// tort une colonne. Un en-tête déjà attribué n'est pas réutilisé.
export function guessMapping(headers: string[]): Record<CanonicalField, string | null> {
  const normd = headers.map((h) => ({ raw: h, norm: normHeader(h) }));
  const used = new Set<string>();
  const out = {} as Record<CanonicalField, string | null>;

  const pick = (syns: string[], exact: boolean): string | null => {
    for (const col of normd) {
      if (used.has(col.raw) || !col.norm) continue;
      for (const syn of syns) {
        const ok = exact ? col.norm === syn : col.norm.includes(syn);
        if (ok) {
          used.add(col.raw);
          return col.raw;
        }
      }
    }
    return null;
  };

  for (const spec of FIELD_SPECS) {
    out[spec.field] = pick(spec.synonyms, true);
  }
  for (const spec of FIELD_SPECS) {
    if (!out[spec.field]) out[spec.field] = pick(spec.synonyms, false);
  }
  return out;
}

// Transforme les lignes du fichier en lignes génériques exploitables par
// processImportRows(), selon la correspondance choisie.
export function rowsToGeneric(
  headers: string[],
  dataRows: unknown[][],
  mapping: Partial<Record<CanonicalField, string | null>>,
): GenericImportRow[] {
  const idxOf: Partial<Record<CanonicalField, number>> = {};
  (Object.keys(mapping) as CanonicalField[]).forEach((f) => {
    const col = mapping[f];
    if (col) {
      const i = headers.indexOf(col);
      if (i >= 0) idxOf[f] = i;
    }
  });
  const val = (row: unknown[], f: CanonicalField): unknown => {
    const i = idxOf[f];
    return i == null ? '' : row[i];
  };
  return dataRows.map((row) => ({
    entite: val(row, 'entite'),
    client_nom: val(row, 'client_nom'),
    client_contact: val(row, 'client_contact'),
    client_email: val(row, 'client_email'),
    client_tel: val(row, 'client_tel'),
    facture_numero: val(row, 'facture_numero'),
    facture_montant: val(row, 'facture_montant'),
    facture_echeance: val(row, 'facture_echeance'),
    facture_statut: val(row, 'facture_statut'),
  }));
}

export interface ImportPreview {
  recognized: boolean; // true si classeur OLU/contrats reconnu (pas de mapping à faire)
  kind?: 'olu' | 'contrats';
  message?: string;
  headers: string[];
  guess: Record<CanonicalField, string | null>;
  sample: string[][]; // quelques lignes brutes pour l'aperçu
  rowCount: number;
  fields: { field: CanonicalField; label: string; required: boolean }[];
}

const SAMPLE_ROWS = 6;

export function buildPreview(extract: SheetExtract): ImportPreview {
  const sample = extract.rows.slice(0, SAMPLE_ROWS).map((r) => extract.headers.map((_, i) => String(r[i] ?? '')));
  return {
    recognized: false,
    headers: extract.headers,
    guess: guessMapping(extract.headers),
    sample,
    rowCount: extract.rowCount,
    fields: FIELD_SPECS.map((s) => ({ field: s.field, label: s.label, required: !!s.required })),
  };
}

import * as XLSX from 'xlsx';

export interface TacheCoursierImportRow {
  nom: string;
  jourDuMois: number;
  intervalleMois: number;
}

// "Tous les 3 mois", "TOUS LES 3 MOIS", "Chaque 3 mois", "tous les 2 mois" --
// toutes les variantes rencontrées dans les exports du logiciel précédent
// se ramènent à un seul nombre entier de mois. Une cellule vide ou non
// reconnue vaut 1 (mensuel), le comportement historique.
function parseIntervalleMois(cell: unknown): number {
  if (cell == null) return 1;
  const texte = String(cell).trim();
  if (!texte) return 1;
  const m = texte.match(/(\d+)\s*mois/i);
  if (!m) return 1;
  const n = parseInt(m[1], 10);
  return Number.isInteger(n) && n >= 1 ? n : 1;
}

function normaliserNom(v: unknown): string {
  return String(v ?? '')
    .replace(/ /g, ' ') // espace insécable (courant dans ce type d'export)
    .replace(/\s+/g, ' ')
    .trim();
}

// Format constaté : colonne A = jour du mois, posé une seule fois en tête de
// chaque bloc de clients (les lignes suivantes l'ont vide et héritent du
// dernier jour rencontré) ; colonne B = raison sociale ; colonne C =
// fréquence si le client n'est pas mensuel. Des lignes vides séparent les
// blocs, à ignorer. Un même client répété avec le même jour dans le fichier
// (doublon de saisie de l'ancien logiciel) n'est importé qu'une fois --
// deux entrées pour un même client sur des jours différents sont en
// revanche conservées telles quelles : rien ne permet de les distinguer
// d'une réelle double visite mensuelle.
export function parseTacheCoursierImportWorkbook(wb: XLSX.WorkBook): TacheCoursierImportRow[] {
  const sheet = wb.Sheets[wb.SheetNames[0]];
  if (!sheet) return [];
  const rows: unknown[][] = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: null });

  const out: TacheCoursierImportRow[] = [];
  const vus = new Set<string>();
  let jourCourant: number | null = null;

  for (const row of rows) {
    const [a, b, c] = row;
    const jour = typeof a === 'number' ? a : typeof a === 'string' && /^\d+$/.test(a.trim()) ? parseInt(a.trim(), 10) : null;
    if (jour != null && jour >= 1 && jour <= 31) jourCourant = jour;

    const nom = normaliserNom(b);
    if (!nom || nom.toUpperCase() === 'RAISON SOCIALE') continue;
    if (jourCourant == null) continue;

    const intervalleMois = parseIntervalleMois(c);
    const cleDedup = `${jourCourant}::${nom.toUpperCase()}`;
    if (vus.has(cleDedup)) continue;
    vus.add(cleDedup);

    out.push({ nom, jourDuMois: jourCourant, intervalleMois });
  }

  return out;
}

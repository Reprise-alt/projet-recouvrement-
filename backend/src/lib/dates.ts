export function daysBetween(date: Date | string): number {
  const d = typeof date === 'string' ? new Date(date) : date;
  const now = new Date();
  return Math.floor((now.getTime() - d.getTime()) / (1000 * 60 * 60 * 24));
}

export function daysUntil(date: Date | string): number {
  return -daysBetween(date);
}

export function fmtFCFA(n: number): string {
  return n.toLocaleString('fr-FR') + ' FCFA';
}

export function fmtDate(d: Date | string): string {
  return new Date(d).toLocaleDateString('fr-FR');
}

export function fmtDateLong(d: Date | string): string {
  return new Date(d).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
}

function excelSerialToISO(n: number): string {
  const d = new Date(Math.round((n - 25569) * 86400 * 1000));
  return d.toISOString().slice(0, 10);
}

function isValidCalendarDate(year: number, month: number, day: number): boolean {
  if (month < 1 || month > 12 || day < 1) return false;
  const daysInMonth = new Date(year, month, 0).getDate();
  return day <= daysInMonth;
}

// Normalise une valeur de cellule Excel/CSV (numéro de série, Date, ou texte
// dans divers formats) en chaîne ISO YYYY-MM-DD. Renvoie '' si non interprétable.
export function toISODate(v: unknown): string {
  if (v === null || v === undefined || v === '') return '';
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (typeof v === 'number') return excelSerialToISO(v);
  const s = String(v).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;

  const m = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
  if (m) {
    const year = parseInt(m[3], 10);
    let day = parseInt(m[1], 10);
    let month = parseInt(m[2], 10);
    // Convention attendue jour/mois/année, mais certaines colonnes (constaté
    // sur un vrai fichier) utilisent le format américain mois/jour/année —
    // si le "mois" détecté est impossible, on retente en permutant.
    if (!isValidCalendarDate(year, month, day) && isValidCalendarDate(year, day, month)) {
      [day, month] = [month, day];
    }
    if (!isValidCalendarDate(year, month, day)) return '';
    return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  }

  const d = new Date(s);
  return isNaN(d.getTime()) ? '' : d.toISOString().slice(0, 10);
}

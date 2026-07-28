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

// Normalise une valeur de cellule Excel/CSV (numéro de série, Date, ou texte
// dans divers formats) en chaîne ISO YYYY-MM-DD. Renvoie '' si non interprétable.
export function toISODate(v: unknown): string {
  if (v === null || v === undefined || v === '') return '';
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (typeof v === 'number') return excelSerialToISO(v);
  const s = String(v).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const m = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
  if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  const d = new Date(s);
  return isNaN(d.getTime()) ? '' : d.toISOString().slice(0, 10);
}

import ExcelJS from 'exceljs';

// Parseur d'un relevé de transactions Julaya (export Excel). On ne retient que
// les ENCAISSEMENTS (« Paiement marchand », statut done, crédit > 0). Chaque
// paiement porte le montant, la date, le téléphone du payeur (extrait du
// commentaire / destinataire), une éventuelle référence, et l'identifiant de
// transaction (pour éviter les doublons à l'import).

export interface PaiementReleve {
  transactionId: string;
  montant: number;
  date: string | null; // ISO
  telPayeur: string | null; // digits, normalisés (9 derniers chiffres)
  reference: string | null;
  service: string | null;
}

// Normalise un numéro : on garde les chiffres et on prend les 9 derniers
// (numéro national sénégalais/ivoirien), ce qui gomme l'indicatif +221 / 00221.
export function normaliserTel(v: unknown): string | null {
  const digits = String(v ?? '').replace(/\D/g, '');
  if (digits.length < 6) return null;
  return digits.slice(-9);
}

function cellText(v: ExcelJS.CellValue): string {
  if (v == null) return '';
  if (typeof v === 'object') {
    const o = v as { text?: string; result?: unknown };
    if (typeof o.text === 'string') return o.text;
    if (o.result != null) return String(o.result);
    return '';
  }
  return String(v);
}

function cellNumber(v: ExcelJS.CellValue): number {
  if (typeof v === 'number') return v;
  const n = Number(String(v ?? '').replace(/[^\d.-]/g, ''));
  return Number.isFinite(n) ? n : 0;
}

export async function parseReleveJulaya(buffer: Buffer): Promise<PaiementReleve[]> {
  const wb = new ExcelJS.Workbook();
  // Le typage ExcelJS attend son propre Buffer ; cast sûr (mêmes octets).
  await wb.xlsx.load(buffer as unknown as ExcelJS.Buffer);
  const ws = wb.getWorksheet('Export') ?? wb.worksheets[0];
  if (!ws) return [];

  // Repère les colonnes par en-tête (ligne 1).
  const idx: Record<string, number> = {};
  const header = ws.getRow(1);
  header.eachCell({ includeEmpty: true }, (c, col) => {
    const t = cellText(c.value).trim().toLowerCase();
    if (t === 'identifiant') idx.id = col;
    else if (t === 'type') idx.type = col;
    else if (t === 'crédit' || t === 'credit') idx.credit = col;
    else if (t === 'date & heure' || t === 'date et heure') idx.date = col;
    else if (t === 'commentaire') idx.commentaire = col;
    else if (t === 'status' || t === 'statut') idx.status = col;
    else if (t === 'service') idx.service = col;
    else if (t === 'destinataire') idx.destinataire = col;
    else if (t.startsWith('référence') || t.startsWith('reference')) idx.ref = col;
  });
  if (!idx.type || !idx.credit) return [];

  const out: PaiementReleve[] = [];
  for (let r = 2; r <= ws.rowCount; r++) {
    const row = ws.getRow(r);
    const type = cellText(row.getCell(idx.type).value).toLowerCase();
    if (!type.includes('paiement marchand')) continue; // on ignore frais / débits
    const status = idx.status ? cellText(row.getCell(idx.status).value).toLowerCase() : 'done';
    if (status && status !== 'done' && status !== 'terminé' && status !== 'success') continue;
    const montant = cellNumber(row.getCell(idx.credit).value);
    if (montant <= 0) continue;

    const commentaire = idx.commentaire ? cellText(row.getCell(idx.commentaire).value) : '';
    const destinataire = idx.destinataire ? cellText(row.getCell(idx.destinataire).value) : '';
    // Le téléphone du payeur est dans le commentaire (« Numéro du client : +221… »)
    // ou dans la colonne Destinataire.
    const telPayeur = normaliserTel(commentaire.match(/\+?\d[\d\s]{6,}/)?.[0] ?? '') ?? normaliserTel(destinataire);

    const dateRaw = idx.date ? row.getCell(idx.date).value : null;
    let dateIso: string | null = null;
    if (dateRaw instanceof Date) dateIso = dateRaw.toISOString();
    else if (dateRaw) {
      const d = new Date(cellText(dateRaw));
      if (!Number.isNaN(d.getTime())) dateIso = d.toISOString();
    }

    out.push({
      transactionId: idx.id ? cellText(row.getCell(idx.id).value).trim() : `${r}`,
      montant,
      date: dateIso,
      telPayeur,
      reference: idx.ref ? cellText(row.getCell(idx.ref).value).trim() || null : null,
      service: idx.service ? cellText(row.getCell(idx.service).value).trim() || null : null,
    });
  }
  return out;
}

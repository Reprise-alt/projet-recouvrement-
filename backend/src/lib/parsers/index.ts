import * as XLSX from 'xlsx';
import { isOluFacturationWorkbook, parseOluFacturationWorkbook } from './oluFacturation';
import { isContractTrackingWorkbook, parseContractTrackingWorkbook } from './contractTracking';
import { GenericImportRow, processImportRows } from './genericImport';
import { ParsedClient } from './types';

export * from './types';
export { isOluFacturationWorkbook, parseOluFacturationWorkbook } from './oluFacturation';
export { isContractTrackingWorkbook, parseContractTrackingWorkbook } from './contractTracking';
export { processImportRows } from './genericImport';

export interface ImportResult {
  clients: ParsedClient[];
  message: string;
}

// Détecte le type de classeur/fichier importé et applique le parseur adapté —
// port du dispatch fait dans handleImportFile() du prototype.
export function parseImportBuffer(buffer: Buffer): ImportResult {
  const wb = XLSX.read(buffer, { type: 'buffer', cellDates: true });

  if (isOluFacturationWorkbook(wb)) {
    const result = parseOluFacturationWorkbook(wb);
    return {
      clients: result.clients,
      message: `${result.sheetsRead} onglet(s) mensuel(s) lus, ${result.totalFactures} facture(s) trouvée(s).`,
    };
  }

  if (isContractTrackingWorkbook(wb)) {
    const result = parseContractTrackingWorkbook(wb);
    return {
      clients: result.clients,
      message: `${result.sheetsRead} onglet(s) de contrats lus, ${result.totalContrats} contrat(s) trouvé(s).`,
    };
  }

  const sheet = wb.Sheets[wb.SheetNames[0]];
  const rows: GenericImportRow[] = XLSX.utils.sheet_to_json(sheet, { defval: '' });
  const result = processImportRows(rows);
  return {
    clients: result.clients,
    message: result.skipped ? `${result.skipped} ligne(s) ignorée(s).` : `${result.clients.length} client(s) trouvé(s).`,
  };
}

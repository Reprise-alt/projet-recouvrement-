import * as XLSX from 'xlsx';
import { isOluFacturationWorkbook, parseOluFacturationWorkbook } from './oluFacturation';
import { isContractTrackingWorkbook, parseContractTrackingWorkbook } from './contractTracking';
import { GenericImportRow, processImportRows } from './genericImport';
import { ParsedClient } from './types';
import { DEFAULT_KNOWN_ENTITES, KnownEntite } from './entiteMatch';

export * from './types';
export * from './entiteMatch';
export { isOluFacturationWorkbook, parseOluFacturationWorkbook } from './oluFacturation';
export { isContractTrackingWorkbook, parseContractTrackingWorkbook } from './contractTracking';
export { processImportRows } from './genericImport';

export interface ImportResult {
  clients: ParsedClient[];
  message: string;
}

// Détecte le type de classeur/fichier importé et applique le parseur adapté —
// port du dispatch fait dans handleImportFile() du prototype. `knownEntites`
// vient de la table Entreprise (voir routes/importRoutes.ts) pour que les
// entités ajoutées depuis l'interface soient reconnues dans les imports.
export function parseImportBuffer(buffer: Buffer, knownEntites: KnownEntite[] = DEFAULT_KNOWN_ENTITES): ImportResult {
  const wb = XLSX.read(buffer, { type: 'buffer', cellDates: true });

  if (isOluFacturationWorkbook(wb)) {
    const result = parseOluFacturationWorkbook(wb, knownEntites);
    return {
      clients: result.clients,
      message: `${result.sheetsRead} onglet(s) mensuel(s) lus, ${result.totalFactures} facture(s) trouvée(s).`,
    };
  }

  if (isContractTrackingWorkbook(wb)) {
    const result = parseContractTrackingWorkbook(wb, knownEntites);
    return {
      clients: result.clients,
      message: `${result.sheetsRead} onglet(s) de contrats lus, ${result.totalContrats} contrat(s) trouvé(s).`,
    };
  }

  const sheet = wb.Sheets[wb.SheetNames[0]];
  const rows: GenericImportRow[] = XLSX.utils.sheet_to_json(sheet, { defval: '' });
  const result = processImportRows(rows, knownEntites);
  return {
    clients: result.clients,
    message: result.skipped ? `${result.skipped} ligne(s) ignorée(s).` : `${result.clients.length} client(s) trouvé(s).`,
  };
}

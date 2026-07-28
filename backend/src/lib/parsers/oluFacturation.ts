import * as XLSX from 'xlsx';
import { toISODate } from '../dates';
import { ParsedClient } from './types';

// Préfixes courts plutôt que noms complets : certains classeurs abrègent les
// onglets ("JAN", "FEV") quand d'autres utilisent le nom complet
// ("JANVIER 2026") — un préfixe de 3 lettres matche les deux formes.
const MONTH_SHEET_REGEX = /^(JAN|F[EÉ]V|MARS|AVRIL|MAI|JUIN|JUIL|AO[UÛ]T|SEPT|OCT|NOV|D[EÉ]C)/i;

export function isOluFacturationWorkbook(wb: XLSX.WorkBook): boolean {
  return wb.SheetNames.some((n) => MONTH_SHEET_REGEX.test(n.trim()));
}

export interface OluFacturationResult {
  clients: ParsedClient[];
  totalFactures: number;
  sheetsRead: number;
}

function parseAmount(raw: unknown): number {
  return parseFloat(String(raw || '0').replace(/[^0-9.,-]/g, '').replace(',', '.')) || 0;
}

// Parseur dédié au classeur "TABLEAU_FACTURATION_OLU" : onglets mensuels avec
// sections SORAM AFRIQUE / SIS, colonnes N° FACTURE / DATE / NOM CLIENT / MONTANT HT / MONTANT TTC / DATE DE PAIEMENT.
// Échéance = date de facture + 30 jours. Impayée si DATE DE PAIEMENT est vide.
export function parseOluFacturationWorkbook(wb: XLSX.WorkBook): OluFacturationResult {
  const monthSheets = wb.SheetNames.filter((n) => MONTH_SHEET_REGEX.test(n.trim()));
  const clientMap: Record<string, ParsedClient> = {};
  let totalFactures = 0;

  monthSheets.forEach((sheetName) => {
    const ws = wb.Sheets[sheetName];
    const rows: unknown[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
    let currentEntity: 'SORAM' | 'SIS' | 'IRIS' | null = null;

    rows.forEach((row) => {
      const c0 = row[0],
        c1 = row[1],
        c2 = row[2],
        c3 = row[3],
        c4 = row[4],
        c5 = row[5];
      const c6 = row[6],
        c7 = row[7],
        c8 = row[8],
        c9 = row[9],
        c10 = row[10],
        c11 = row[11],
        c12 = row[12],
        c13 = row[13];
      const c2str = (c2 || '').toString().trim();

      if (c2str.toUpperCase().startsWith('TOTAL') || c2str.toUpperCase().includes('CONSOLID')) {
        currentEntity = null;
        return;
      }
      if (typeof c0 === 'string' && c0.trim() && !c1 && !c3) {
        const label = c0.trim().toUpperCase();
        if (label.startsWith('SIS')) {
          currentEntity = 'SIS';
          return;
        }
        if (label.includes('SORAM')) {
          currentEntity = 'SORAM';
          return;
        }
        if (label.includes('IRIS')) {
          currentEntity = 'IRIS';
          return;
        }
        return;
      }
      if (!currentEntity) return;
      if (c0 === 'N° FACTURE' || c0 === '') return;
      if (!c2str) return;

      const dateFacture = toISODate(c1);
      const montant = parseAmount(c4 || c3);
      const montantHT = parseAmount(c3);
      if (!dateFacture || !montant) return;

      totalFactures++;
      const nomClient = c2str.replace(/\s+/g, ' ').trim();
      const key = nomClient.toUpperCase() + '|' + currentEntity;
      if (!clientMap[key]) {
        clientMap[key] = { nom: nomClient, entite: currentEntity, contact: '', email: '', tel: '', factures: [], contrats: [] };
      }
      const ech = new Date(dateFacture);
      ech.setDate(ech.getDate() + 30);

      clientMap[key].factures.push({
        numero: 'FA-' + c0,
        montant,
        montantHT,
        dateFacture,
        dateEcheance: ech.toISOString().slice(0, 10),
        statut: c5 ? 'payee' : 'impayee',
        datePaiement: c5 ? toISODate(c5) : undefined,
        modePaiement: (c6 || '').toString().trim(),
        numPiece: (c7 || '').toString().trim(),
        remisSur: (c8 || '').toString().trim(),
        designation: (c9 || '').toString().trim(),
        commercial: (c10 || '').toString().trim(),
        traitePar: (c11 || '').toString().trim(),
        etatFactures: (c12 || '').toString().trim(),
        dateDepot: c13 ? toISODate(c13) : undefined,
      });
    });
  });

  return { clients: Object.values(clientMap), totalFactures, sheetsRead: monthSheets.length };
}

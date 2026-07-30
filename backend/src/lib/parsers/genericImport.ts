import { toISODate } from '../dates';
import { EntiteImport, ParsedClient } from './types';
import { DEFAULT_KNOWN_ENTITES, KnownEntite } from './entiteMatch';

export interface GenericImportRow {
  entite?: unknown;
  client_nom?: unknown;
  client_contact?: unknown;
  client_email?: unknown;
  client_tel?: unknown;
  facture_numero?: unknown;
  facture_montant?: unknown;
  facture_echeance?: unknown;
  facture_statut?: unknown;
  contrat_numero?: unknown;
  contrat_debut?: unknown;
  contrat_fin?: unknown;
  contrat_tacite?: unknown;
  contrat_revision_tarif?: unknown;
}

export interface GenericImportResult {
  clients: ParsedClient[];
  skipped: number;
}

// Aucune facture réelle de ce type de PME n'atteint mille milliards de FCFA —
// au-delà, c'est presque certainement une cellule corrompue plutôt qu'un vrai
// montant. On rejette plutôt que d'importer silencieusement une valeur
// aberrante qui fausserait ensuite tous les totaux/rapports.
const MAX_MONTANT_PLAUSIBLE = 1_000_000_000_000;

function parseAmount(raw: unknown): number {
  const value = parseFloat(String(raw || '0').replace(/[^0-9,.-]/g, '').replace(',', '.')) || 0;
  return value > 0 && value <= MAX_MONTANT_PLAUSIBLE ? value : 0;
}

// Parseur du modèle CSV/XLSX générique (téléchargeable via /import/template) —
// une ligne par facture/contrat, fusionnée par nom+entité client.
export function processImportRows(
  rows: GenericImportRow[],
  knownEntites: KnownEntite[] = DEFAULT_KNOWN_ENTITES,
): GenericImportResult {
  const map: Record<string, ParsedClient> = {};
  const knownCodes = knownEntites.map((e) => e.code.toUpperCase());
  const fallbackCode = knownCodes.includes('SORAM') ? 'SORAM' : (knownCodes[0] ?? 'SORAM');
  let skipped = 0;

  rows.forEach((row) => {
    const nom = (row.client_nom || '').toString().trim();
    if (!nom) {
      skipped++;
      return;
    }
    let entite = (row.entite || fallbackCode).toString().trim().toUpperCase() as EntiteImport;
    if (!knownCodes.includes(entite)) entite = fallbackCode;
    const key = nom + '|' + entite;

    if (!map[key]) {
      map[key] = {
        nom,
        entite,
        contact: (row.client_contact || '').toString(),
        email: (row.client_email || '').toString(),
        tel: (row.client_tel || '').toString(),
        factures: [],
        contrats: [],
      };
    }
    const client = map[key];

    const montant = parseAmount(row.facture_montant);
    const echeance = toISODate(row.facture_echeance);
    if (row.facture_numero && echeance) {
      client.factures.push({
        numero: String(row.facture_numero),
        montant,
        dateEcheance: echeance,
        statut: (row.facture_statut || 'impayee').toString().trim().toLowerCase() === 'payee' ? 'payee' : 'impayee',
      });
    }

    if (row.contrat_numero) {
      const dateFin = toISODate(row.contrat_fin);
      const dateDebut = toISODate(row.contrat_debut) || dateFin;
      const dateRevisionTarif = toISODate(row.contrat_revision_tarif) || dateFin;
      if (dateFin && !client.contrats.some((c) => c.numero === row.contrat_numero)) {
        client.contrats.push({
          numero: String(row.contrat_numero),
          type: 'Contrat',
          dateDebut,
          dateFin,
          tacite: ['oui', 'yes', 'true', '1'].includes((row.contrat_tacite || '').toString().trim().toLowerCase()),
          dateRevisionTarif,
          statutSource: '',
          commentaire: '',
        });
      }
    }
  });

  return { clients: Object.values(map), skipped };
}

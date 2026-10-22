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
  client_type?: unknown;
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

// Normalise la colonne « Type » du fichier vers 'assureur' | 'patient' (null si
// inconnu). Couvre le FR et l'ES : un prospect peut exporter depuis un logiciel
// hispanophone (« Mutua » / « Paciente » / « Particular »). Insensible aux
// accents et à la casse.
export function normalizeTypeDebiteur(raw: unknown): string | null {
  const s = String(raw ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim();
  if (!s) return null;
  // Tiers-payant : assureur / mutuelle / IPM (+ équivalents espagnols).
  if (/(assureur|assurance|mutuelle|mutua|\bipm\b|tiers[ -]?payant|aseguradora|\bseguro)/.test(s)) return 'assureur';
  // Particulier / cash (+ équivalents espagnols).
  if (/(patient|paciente|particulier|particular|comptant|\bcash\b|client direct)/.test(s)) return 'patient';
  return null;
}

// Parseur du modèle CSV/XLSX générique (téléchargeable via /import/template) —
// une ligne par facture/contrat, fusionnée par nom+entité client.
export function processImportRows(
  rows: GenericImportRow[],
  knownEntites: KnownEntite[] = DEFAULT_KNOWN_ENTITES,
): GenericImportResult {
  const map: Record<string, ParsedClient> = {};
  const knownCodes = knownEntites.map((e) => e.code.toUpperCase());
  // Entité par défaut quand la ligne n'en précise pas : l'entité historique du
  // groupe (SORAM) si présente, sinon la première entité connue de
  // l'organisation, sinon un établissement unique « PRINCIPAL » (client SaaS
  // mono-entité). Une entité renseignée dans le fichier est TOUJOURS conservée
  // telle quelle (et créée à l'import si l'organisation ne l'a pas encore) —
  // on ne la rabat plus de force sur l'entité par défaut, ce qui aurait
  // silencieusement mélangé les segments d'un client SaaS.
  const fallbackCode = knownCodes.includes('SORAM') ? 'SORAM' : (knownCodes[0] ?? 'PRINCIPAL');
  let skipped = 0;

  rows.forEach((row) => {
    const nom = (row.client_nom || '').toString().trim();
    if (!nom) {
      skipped++;
      return;
    }
    const rawEntite = (row.entite ?? '').toString().trim().toUpperCase();
    const entite = (rawEntite || fallbackCode) as EntiteImport;
    const key = nom + '|' + entite;

    if (!map[key]) {
      map[key] = {
        nom,
        entite,
        contact: (row.client_contact || '').toString(),
        email: (row.client_email || '').toString(),
        tel: (row.client_tel || '').toString(),
        typeDebiteur: normalizeTypeDebiteur(row.client_type),
        factures: [],
        contrats: [],
      };
    }
    const client = map[key];
    // Un client s'étale sur plusieurs lignes : si la 1re n'a pas typé le débiteur,
    // une ligne suivante peut le faire (on ne réécrit jamais un type déjà posé).
    if (!client.typeDebiteur) {
      const t = normalizeTypeDebiteur(row.client_type);
      if (t) client.typeDebiteur = t;
    }

    const montant = parseAmount(row.facture_montant);
    const echeance = toISODate(row.facture_echeance);
    if (row.facture_numero && echeance) {
      // Un même n° de facture peut apparaître sur PLUSIEURS lignes du fichier
      // (ex. une facture d'assureur détaillée par patient). Comme (client, numéro)
      // est unique en base, on CUMULE les montants sur une seule facture au lieu
      // d'en créer des doublons (qui feraient échouer l'import). On garde la plus
      // ancienne échéance (la plus en retard).
      const numero = String(row.facture_numero).trim();
      const statut = (row.facture_statut || 'impayee').toString().trim().toLowerCase() === 'payee' ? 'payee' : 'impayee';
      const existante = client.factures.find((f) => f.numero === numero);
      if (existante) {
        existante.montant += montant;
        if (echeance < existante.dateEcheance) existante.dateEcheance = echeance;
        if (statut === 'impayee') existante.statut = 'impayee';
      } else {
        client.factures.push({ numero, montant, dateEcheance: echeance, statut });
      }
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

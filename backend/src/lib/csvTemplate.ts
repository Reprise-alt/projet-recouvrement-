export const TEMPLATE_HEADERS = [
  'entite',
  'client_nom',
  'client_contact',
  'client_email',
  'client_tel',
  'facture_numero',
  'facture_montant',
  'facture_echeance',
  'facture_statut',
  'contrat_numero',
  'contrat_debut',
  'contrat_fin',
  'contrat_tacite',
  'contrat_revision_tarif',
];

export const TEMPLATE_EXAMPLE = [
  'SORAM',
  'Teranga Négoce SA',
  'A. Diop',
  'a.diop@teranga-negoce.sn',
  '+221 77 123 45 67',
  'FA-2026-1042',
  '1250000',
  '2026-05-20',
  'impayee',
  'CT-SORAM-2025-014',
  '2025-01-01',
  '2027-12-31',
  'oui',
  '2026-01-01',
];

export function buildTemplateCsv(): string {
  return TEMPLATE_HEADERS.join(';') + '\n' + TEMPLATE_EXAMPLE.join(';') + '\n';
}

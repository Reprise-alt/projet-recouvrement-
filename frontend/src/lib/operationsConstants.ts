import { Criticite, MotifResiliation, Secteur, Tone } from '../api/types';

// Miroir des nomenclatures fermées du cahier des charges OLU360 — Suivi des
// opérations (§5) — le serveur ne renvoie que les identifiants, jamais le
// libellé.
export const SECTEUR_LABELS: Record<Secteur, string> = {
  education: 'Éducation',
  administration: 'Administration et public',
  sante: 'Santé et pharmacie',
  hotellerie: 'Hôtellerie et tourisme',
  distribution: 'Distribution et commerce',
  agro: 'Agro-industrie',
  btp: 'BTP et construction',
  banque: 'Banque et finance',
  telecom: 'Télécom',
  industrie: 'Industrie',
  logistique: 'Transport et logistique',
  maritime: 'Maritime et portuaire',
  utilities: 'Utilities',
  mines: 'Mines et énergie',
  ong: 'ONG et institutions',
  it: 'IT et numérique',
  services: 'Services',
  autre: 'Autre',
};

export const CRITICITE_LABELS: Record<Criticite, string> = {
  A: 'A — prioritaire',
  B: 'B',
  C: 'C',
};

export const MOTIF_RESILIATION_LABELS: Record<MotifResiliation, string> = {
  prix: 'Prix — offre concurrente',
  qualite: 'Qualité de service',
  suivi: 'Manque de suivi commercial',
  litige: 'Litige de facturation',
  ao: "Appel d'offres perdu",
  perimetre: 'Réduction de périmètre du client',
  internal: 'Internalisation par le client',
  cessation: "Cessation d'activité du client",
  autre: 'Autre',
};

// Un motif "maîtrisable" appelle un plan d'action interne, un motif "subi"
// appelle de la prospection (cahier §5.2 / annexe B) -- c'est l'indicateur de
// pilotage principal du churn, jamais une simple info de détail.
export const MOTIF_RESILIATION_CAUSE: Record<MotifResiliation, 'maitrisable' | 'subie'> = {
  prix: 'maitrisable',
  qualite: 'maitrisable',
  suivi: 'maitrisable',
  litige: 'maitrisable',
  ao: 'maitrisable',
  perimetre: 'subie',
  internal: 'subie',
  cessation: 'subie',
  autre: 'subie',
};

export function toneColor(tone: Tone): string {
  return tone === 'success' ? 'var(--success)' : tone === 'amber' ? 'var(--amber)' : 'var(--danger)';
}

export function toneBg(tone: Tone): string {
  return tone === 'success' ? 'var(--success-soft)' : tone === 'amber' ? 'var(--amber-soft)' : 'var(--danger-soft)';
}

import { ModePaiementCollecte, MotifReport, TypeTacheCoursier } from '../api/types';

// Métadonnées d'affichage des paliers/alertes — mirroir des constantes
// backend (src/lib/paliers.ts, src/lib/contracts.ts), le serveur ne renvoyant
// que les identifiants numériques calculés.
export interface Palier {
  id: number;
  label: string;
  tone: 'success' | 'amber' | 'danger';
  key?: 'j1' | 'j2' | 'j3' | 'j4' | 'j5' | 'j6' | 'j7';
  desc?: string;
}

export const PALIERS: Palier[] = [
  { id: 0, label: 'À jour', tone: 'success' },
  { id: 1, label: 'Relance 1', tone: 'success', key: 'j1', desc: 'Relance amiable — email/appel de courtoisie' },
  { id: 2, label: 'Relance 2', tone: 'amber', key: 'j2', desc: 'Relance ferme — rappel des conditions de paiement' },
  { id: 3, label: 'Relance 3', tone: 'amber', key: 'j3', desc: 'Dernier rappel avant mesures — préavis écrit' },
  {
    id: 4,
    label: 'Arrêt de service',
    tone: 'amber',
    key: 'j4',
    desc: "Lettre annonçant la suspension du service (livraisons, interventions ou accès plateforme) jusqu'à régularisation",
  },
  { id: 5, label: 'Pénalités', tone: 'danger', key: 'j5', desc: 'Application des pénalités de retard contractuelles' },
  { id: 6, label: 'Mise en demeure', tone: 'danger', key: 'j6', desc: 'Mise en demeure formelle (LRAR)' },
  { id: 7, label: 'Huissier', tone: 'danger', key: 'j7', desc: 'Transmission au contentieux / huissier de justice' },
];

export interface ContractAlert {
  id: number;
  label: string;
  tone: 'success' | 'amber' | 'danger';
  desc?: string;
}

export const CONTRACT_ALERTS: ContractAlert[] = [
  { id: 0, label: 'Suivi', tone: 'success' },
  { id: 1, label: 'À anticiper', tone: 'success', desc: "Échéance dans plus de 90 jours — rien à faire pour l'instant" },
  { id: 2, label: 'Préparer avenant', tone: 'amber', desc: 'Échéance sous 90 jours — préparer le renouvellement ou la révision tarifaire' },
  { id: 3, label: 'Relancer signature', tone: 'amber', desc: "Échéance sous 60 jours — envoyer le projet d'avenant / nouveau contrat" },
  { id: 4, label: 'Urgent', tone: 'danger', desc: 'Échéance sous 30 jours — signature à obtenir en priorité' },
  { id: 5, label: 'Échu', tone: 'danger', desc: 'Contrat échu — statut à clarifier (tacite reconduction ou rupture)' },
];

export const TACHE_TYPE_LABELS: Record<TypeTacheCoursier, string> = {
  releve_compteur: 'Relevé compteur imprimante',
  depot_facture: 'Déposer une facture',
  depot_courrier: 'Déposer un courrier client',
  recuperation_reglement: 'Récupérer un règlement',
  depot_banque: 'Dépôt en banque',
  livraison_toner: 'Livraison toner',
  livraison_bac_recuperation: 'Livraison bac de récupération',
  autre: 'Autre',
};

export const MODE_PAIEMENT_LABELS: Record<ModePaiementCollecte, string> = {
  cheque: 'Chèque',
  espece: 'Espèces',
  autre: 'Autre',
};

export const MOTIF_REPORT_LABELS: Record<MotifReport, string> = {
  client_absent: 'Client absent',
  adresse_introuvable: 'Adresse introuvable',
  document_non_pret: 'Document/paiement non prêt',
  trafic_panne: 'Trafic / panne scooter',
  bureau_ferme: 'Bureau fermé',
  autre: 'Autre',
};

export type StatutAffiche = 'a_faire' | 'faite' | 'reportee' | 'annulee';

// Miroir de lib/taches.ts:statutAffiche côté backend -- une tâche dont la
// date planifiée a été déplacée après sa date initiale s'affiche comme
// "reportée" plutôt que de simplement disparaître de la liste du jour où
// elle était prévue à l'origine.
export function tacheStatutAffiche(t: { statut: string; date: string; dateInitiale: string }): StatutAffiche {
  if (t.statut === 'faite' || t.statut === 'annulee') return t.statut;
  return t.date.slice(0, 10) !== t.dateInitiale.slice(0, 10) ? 'reportee' : 'a_faire';
}

export function fmtFCFA(n: number): string {
  return n.toLocaleString('fr-FR') + ' FCFA';
}

export function fmtDate(d: string | null | undefined): string {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('fr-FR');
}

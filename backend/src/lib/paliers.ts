import { daysBetween, daysDiff } from './dates';

export interface PalierConfig {
  j0: number;
  j1: number;
  j2: number;
  j3: number;
  j4: number;
  j5: number;
  j6: number;
  j7: number;
}

// j0 : « Avis d'échéance » — premier e-mail courtois dès que la facture est
// échue (défaut J+1, soit ~31 jours après édition avec un délai de 30 jours).
// Les autres seuils j1..j7 sont inchangés (comptés depuis l'échéance).
export const DEFAULT_CONFIG: PalierConfig = { j0: 1, j1: 7, j2: 15, j3: 30, j4: 45, j5: 60, j6: 75, j7: 90 };

export type FrequenceFacturation = 'mensuelle' | 'trimestrielle' | 'annuelle';

// Multiplie l'échelle de paliers pour les clients qui ne payent pas chaque
// mois — un compte trimestriel à J+80 est simplement dans son cycle normal,
// pas "en retard" au même titre qu'un client mensuel.
export const FREQUENCE_MULTIPLIER: Record<FrequenceFacturation, number> = {
  mensuelle: 1,
  trimestrielle: 3,
  annuelle: 12,
};

export type PalierTone = 'success' | 'amber' | 'danger';

export interface Palier {
  id: number;
  label: string;
  tone: PalierTone;
  key?: keyof PalierConfig;
  desc?: string;
}

export const PALIERS: Palier[] = [
  { id: 0, label: 'À jour', tone: 'success' },
  { id: 1, label: "Avis d'échéance", tone: 'success', key: 'j0', desc: 'Avis courtois dès que la facture est échue — premier e-mail automatique' },
  { id: 2, label: 'Relance 1', tone: 'success', key: 'j1', desc: 'Relance amiable — email/appel de courtoisie' },
  { id: 3, label: 'Relance 2', tone: 'amber', key: 'j2', desc: 'Relance ferme — rappel des conditions de paiement' },
  { id: 4, label: 'Relance 3', tone: 'amber', key: 'j3', desc: 'Dernier rappel avant mesures — préavis écrit' },
  {
    id: 5,
    label: 'Arrêt de service',
    tone: 'amber',
    key: 'j4',
    desc: "Lettre annonçant la suspension du service (livraisons, interventions ou accès plateforme) jusqu'à régularisation",
  },
  { id: 6, label: 'Pénalités', tone: 'danger', key: 'j5', desc: 'Application des pénalités de retard contractuelles' },
  { id: 7, label: 'Commandement (société)', tone: 'danger', key: 'j6', desc: 'Commandement de payer sur entête société (LRAR) — vaut mise en demeure et bascule le dossier en contentieux' },
  { id: 8, label: 'Contentieux', tone: 'danger', key: 'j7', desc: 'Dossier passé en contentieux — voie huissier / injonction, suivi dans l’onglet Contentieux' },
];

export function computePalier(joursRetard: number, config: PalierConfig = DEFAULT_CONFIG, multiplier = 1): number {
  if (joursRetard <= 0) return 0;
  if (joursRetard < config.j0 * multiplier) return 0;
  if (joursRetard < config.j1 * multiplier) return 1; // Avis d'échéance
  if (joursRetard < config.j2 * multiplier) return 2; // Relance 1
  if (joursRetard < config.j3 * multiplier) return 3; // Relance 2
  if (joursRetard < config.j4 * multiplier) return 4; // Relance 3
  if (joursRetard < config.j5 * multiplier) return 5; // Arrêt de service
  if (joursRetard < config.j6 * multiplier) return 6; // Pénalités
  if (joursRetard < config.j7 * multiplier) return 7; // Commandement
  return 8; // Contentieux
}

export interface FactureLike {
  montant: number;
  dateEcheance: Date | string;
  datePaiement?: Date | string | null;
  statut: 'impayee' | 'payee';
  numero?: string;
}

export interface ClientWithFactures {
  factures: FactureLike[];
  frequenceFacturation?: FrequenceFacturation;
}

export function clientEncours(client: ClientWithFactures): number {
  return client.factures.filter((f) => f.statut === 'impayee').reduce((s, f) => s + f.montant, 0);
}

export function clientOldestEcheance(client: ClientWithFactures): FactureLike | null {
  const unpaid = client.factures.filter((f) => f.statut === 'impayee');
  if (!unpaid.length) return null;
  return unpaid.reduce((a, b) => (new Date(a.dateEcheance) < new Date(b.dateEcheance) ? a : b));
}

export function clientJoursRetard(client: ClientWithFactures): number {
  const f = clientOldestEcheance(client);
  if (!f) return 0;
  return Math.max(0, daysBetween(f.dateEcheance));
}

export function clientPalier(client: ClientWithFactures, config: PalierConfig = DEFAULT_CONFIG): number {
  const multiplier = FREQUENCE_MULTIPLIER[client.frequenceFacturation ?? 'mensuelle'];
  return computePalier(clientJoursRetard(client), config, multiplier);
}

// Nombre minimal de factures payées nécessaires pour qu'une moyenne de délai
// de paiement veuille dire quelque chose — en dessous, on ne peut pas dire
// si un client est "habituellement" ponctuel ou pas.
const HISTORIQUE_MIN_FACTURES = 2;

// Délai de paiement moyen historique d'un client (dateEcheance -> datePaiement,
// sur ses factures déjà payées) -- null si l'historique est insuffisant pour
// que la moyenne signifie quelque chose.
export function clientDelaiMoyenHistorique(client: ClientWithFactures): number | null {
  const payees = client.factures.filter((f) => f.statut === 'payee' && f.datePaiement);
  if (payees.length < HISTORIQUE_MIN_FACTURES) return null;
  const delais = payees.map((f) => daysDiff(f.dateEcheance, f.datePaiement!));
  return delais.reduce((a, b) => a + b, 0) / delais.length;
}

// Signal précoce, indépendant de l'échelle de paliers : un client dont le
// retard courant dépasse nettement (>2x) son propre délai de paiement
// habituel, même s'il n'a pas encore atteint un palier avancé. Silencieux
// (false) faute d'historique suffisant -- jamais de faux signal sur un
// client tout juste importé.
export function clientRetardInhabituel(client: ClientWithFactures): boolean {
  const joursRetard = clientJoursRetard(client);
  if (joursRetard <= 0) return false;
  const moyenne = clientDelaiMoyenHistorique(client);
  if (moyenne === null) return false;
  return joursRetard > Math.max(moyenne, 0) * 2;
}

// Type délibérément plus étroit que FactureLike (pas de montant) : la route
// qui appelle enLitigeSignal ne sélectionne même pas ce champ en base, pour
// que l'isolation financière du module Opérations ne dépende pas d'une
// discipline de code côté appelant.
export interface FactureStatutLike {
  dateEcheance: Date | string;
  statut: 'impayee' | 'payee';
}

// Signal croisé recouvrement -> opérations (cahier des charges OLU360 —
// Suivi des opérations, §8) : à partir de 7 factures consécutives impayées,
// ce n'est plus un sujet de trésorerie mais le symptôme d'un service
// contesté -- donc du ressort des opérations. Volontairement un booléen,
// jamais un montant : c'est tout ce qui doit franchir la frontière entre
// les deux modules. "Consécutives" s'entend dans l'ordre chronologique des
// échéances, en partant de la plus récente -- une seule facture payée au
// milieu de la série casse le compte.
export function enLitigeSignal(factures: FactureStatutLike[], seuil = 7): boolean {
  const triees = [...factures].sort((a, b) => new Date(a.dateEcheance).getTime() - new Date(b.dateEcheance).getTime());
  let streak = 0;
  for (let i = triees.length - 1; i >= 0; i--) {
    if (triees[i].statut !== 'impayee') break;
    streak++;
  }
  return streak >= seuil;
}

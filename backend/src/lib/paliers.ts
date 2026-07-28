import { daysBetween } from './dates';

export interface PalierConfig {
  j1: number;
  j2: number;
  j3: number;
  j4: number;
  j5: number;
  j6: number;
  j7: number;
}

export const DEFAULT_CONFIG: PalierConfig = { j1: 7, j2: 15, j3: 30, j4: 45, j5: 60, j6: 75, j7: 90 };

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

export function computePalier(joursRetard: number, config: PalierConfig = DEFAULT_CONFIG): number {
  if (joursRetard <= 0) return 0;
  if (joursRetard < config.j1) return 0;
  if (joursRetard < config.j2) return 1;
  if (joursRetard < config.j3) return 2;
  if (joursRetard < config.j4) return 3;
  if (joursRetard < config.j5) return 4;
  if (joursRetard < config.j6) return 5;
  if (joursRetard < config.j7) return 6;
  return 7;
}

export interface FactureLike {
  montant: number;
  dateEcheance: Date | string;
  statut: 'impayee' | 'payee';
  numero?: string;
}

export interface ClientWithFactures {
  factures: FactureLike[];
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
  return computePalier(clientJoursRetard(client), config);
}

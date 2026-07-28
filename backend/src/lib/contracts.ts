import { daysUntil } from './dates';

export type ContractAlertTone = 'success' | 'amber' | 'danger';

export interface ContractAlert {
  id: number;
  label: string;
  tone: ContractAlertTone;
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

export interface ContractLike {
  dateFin: Date | string;
  dateRevisionTarif?: Date | string | null;
}

export interface ContractEcheance {
  type: 'revision_tarif' | 'renouvellement';
  date: Date | string;
  jours: number;
}

// Renvoie l'échéance pertinente d'UN contrat : sa fin, ou sa révision tarifaire
// annuelle si elle arrive avant (et n'est pas déjà passée).
export function contractEcheance(contract: ContractLike): ContractEcheance {
  const jFin = daysUntil(contract.dateFin);
  if (contract.dateRevisionTarif) {
    const jTarif = daysUntil(contract.dateRevisionTarif);
    if (jTarif >= 0 && jTarif < jFin) {
      return { type: 'revision_tarif', date: contract.dateRevisionTarif, jours: jTarif };
    }
  }
  return { type: 'renouvellement', date: contract.dateFin, jours: jFin };
}

export function contractAlertLevel(contract: ContractLike): number {
  const e = contractEcheance(contract);
  if (e.jours < 0) return 5;
  if (e.jours <= 30) return 4;
  if (e.jours <= 60) return 3;
  if (e.jours <= 90) return 2;
  return 1;
}

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
  dateDebut?: Date | string | null;
  dateFin: Date | string;
  dateRevisionTarif?: Date | string | null;
  tauxAugmentation?: number | null;
  dateDerniereRevision?: Date | string | null;
}

export interface ContractEcheance {
  type: 'revision_tarif' | 'renouvellement';
  date: Date | string;
  jours: number;
}

// Prochaine occurrence du jour/mois de `anchor`, strictement après `anchor`
// lui-même et au plus tôt à `from` -- jamais l'année de `anchor` elle-même,
// même si cette occurrence n'est pas encore passée. Sans cette double
// contrainte, appliquer une révision un peu avant sa date anniversaire réelle
// (anchor déplacé sur une date encore à venir) ferait ressortir la même date
// comme "prochaine révision" au lieu d'avancer d'un an.
export function nextAnniversary(anchor: Date | string, from: Date = new Date()): Date {
  const a = typeof anchor === 'string' ? new Date(anchor) : anchor;
  const today = new Date(from.getFullYear(), from.getMonth(), from.getDate());
  let candidate = new Date(a.getFullYear() + 1, a.getMonth(), a.getDate());
  while (candidate.getTime() < today.getTime()) {
    candidate = new Date(candidate.getFullYear() + 1, a.getMonth(), a.getDate());
  }
  return candidate;
}

// Montant après application du taux d'augmentation annuel (composé : appliqué
// sur le dernier montant en vigueur, pas sur le montant initial du contrat).
export function montantProjete(montantActuel: number, tauxAugmentation: number): number {
  return Math.round(montantActuel * (1 + tauxAugmentation / 100));
}

// Renvoie l'échéance pertinente d'UN contrat : sa fin, ou sa révision tarifaire
// si elle arrive avant (et n'est pas déjà passée). La date de révision est soit
// dérivée automatiquement de la date anniversaire du contrat (quand un taux
// d'augmentation est renseigné), soit celle saisie manuellement sinon.
export function contractEcheance(contract: ContractLike): ContractEcheance {
  const jFin = daysUntil(contract.dateFin);
  let revisionDate: Date | string | null = null;
  if (contract.tauxAugmentation && contract.dateDebut) {
    revisionDate = nextAnniversary(contract.dateDerniereRevision ?? contract.dateDebut);
  } else if (contract.dateRevisionTarif) {
    revisionDate = contract.dateRevisionTarif;
  }
  if (revisionDate) {
    const jTarif = daysUntil(revisionDate);
    if (jTarif >= 0 && jTarif < jFin) {
      return { type: 'revision_tarif', date: revisionDate, jours: jTarif };
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

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

export type TypeAugmentation = 'sans_notification' | 'sur_notification';

export interface ContractLike {
  dateDebut?: Date | string | null;
  dateFin: Date | string;
  dateRevisionTarif?: Date | string | null;
  tauxAugmentation?: number | null;
  typeAugmentation?: TypeAugmentation | null;
  dateDerniereRevision?: Date | string | null;
}

export interface ContractEcheance {
  type: 'revision_tarif' | 'renouvellement';
  date: Date | string;
  jours: number;
  // Vrai quand l'échéance est une date d'augmentation SUR NOTIFICATION : ce
  // n'est plus un simple rappel mais une date LIMITE pour notifier le client.
  surNotification?: boolean;
}

// Durée du contrat en mois (dateDebut → dateFin), arrondie. Null si une des
// bornes manque. Le front l'affiche en années/mois selon le besoin.
export function contractDureeMois(contract: ContractLike): number | null {
  if (!contract.dateDebut || !contract.dateFin) return null;
  const d1 = new Date(contract.dateDebut as any);
  const d2 = new Date(contract.dateFin as any);
  if (isNaN(d1.getTime()) || isNaN(d2.getTime())) return null;
  const mois = (d2.getFullYear() - d1.getFullYear()) * 12 + (d2.getMonth() - d1.getMonth());
  return mois < 0 ? 0 : mois;
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
      return {
        type: 'revision_tarif',
        date: revisionDate,
        jours: jTarif,
        surNotification: contract.typeAugmentation === 'sur_notification',
      };
    }
  }
  return { type: 'renouvellement', date: contract.dateFin, jours: jFin };
}

// État de l'augmentation annuelle d'un contrat, indépendant de l'échéance de
// renouvellement. Pilote les tuiles et le filtre du module.
//  - aucune    : pas de taux paramétré ;
//  - a_venir   : prochaine augmentation à plus de 30 jours ;
//  - imminent  : prochaine augmentation dans 30 jours ou moins → à appliquer ;
//  - depassee  : l'anniversaire d'augmentation est passé sans être marqué
//                appliqué (délai dépassé) ;
//  - realisee  : marquée appliquée pour le cycle en cours (validée client).
export type AugmentationStatut = 'aucune' | 'a_venir' | 'imminent' | 'depassee' | 'realisee';

export interface AugmentationEtat {
  statut: AugmentationStatut;
  taux: number | null;
  date: Date | null; // prochaine augmentation, ou celle dépassée / réalisée
  jours: number | null;
}

const minuit = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const occurrence = (anchor: Date, annee: number) => new Date(annee, anchor.getMonth(), anchor.getDate());

export function augmentationEtat(contract: ContractLike, from: Date = new Date()): AugmentationEtat {
  const taux = contract.tauxAugmentation ?? null;
  const anchorSrc = contract.dateRevisionTarif ?? contract.dateDebut;
  if (!taux || taux <= 0 || !anchorSrc) return { statut: 'aucune', taux: null, date: null, jours: null };

  const anchor = new Date(anchorSrc);
  const today = minuit(from);
  const fin = minuit(new Date(contract.dateFin));
  const debut = contract.dateDebut ? minuit(new Date(contract.dateDebut)) : null;

  const annCourante = occurrence(anchor, today.getFullYear());
  const derniere = annCourante.getTime() <= today.getTime() ? annCourante : occurrence(anchor, today.getFullYear() - 1);
  const prochaine = annCourante.getTime() > today.getTime() ? annCourante : occurrence(anchor, today.getFullYear() + 1);
  const jours = (d: Date) => Math.round((d.getTime() - today.getTime()) / 86400000);

  const applique = contract.dateDerniereRevision ? minuit(new Date(contract.dateDerniereRevision)) : null;
  // Le dernier anniversaire compte-t-il vraiment ? (dans la période du contrat)
  const derniereDue = derniere.getTime() >= (debut ? debut.getTime() : -Infinity) && derniere.getTime() <= fin.getTime();
  const faitDerniere = applique != null && applique.getTime() >= derniere.getTime();

  // Pré-appliqué au-delà de la prochaine échéance → tout est à jour.
  if (applique != null && applique.getTime() >= prochaine.getTime()) {
    return { statut: 'realisee', taux, date: applique, jours: null };
  }
  // Délai dépassé : dernier anniversaire dû, passé, non appliqué.
  if (derniereDue && !faitDerniere && derniere.getTime() <= today.getTime()) {
    return { statut: 'depassee', taux, date: derniere, jours: jours(derniere) };
  }
  // Prochaine échéance encore dans la période du contrat.
  if (prochaine.getTime() <= fin.getTime()) {
    const j = jours(prochaine);
    if (j <= 30) return { statut: 'imminent', taux, date: prochaine, jours: j };
    if (faitDerniere) return { statut: 'realisee', taux, date: applique, jours: null };
    return { statut: 'a_venir', taux, date: prochaine, jours: j };
  }
  return faitDerniere ? { statut: 'realisee', taux, date: applique, jours: null } : { statut: 'aucune', taux, date: null, jours: null };
}

export function contractAlertLevel(contract: ContractLike): number {
  const e = contractEcheance(contract);
  if (e.jours < 0) return 5;
  if (e.jours <= 30) return 4;
  if (e.jours <= 60) return 3;
  if (e.jours <= 90) return 2;
  return 1;
}

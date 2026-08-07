// Parc d'impression (gestion de flotte pour les comptes suivis en COPIL) --
// calculs purs à partir des données saisies (équipements, interventions,
// volumétrie, consommables), portés du rapport COPIL T2 SEN'EAU/SORAM tel
// que fourni (synthèse exécutive, tableau SLA, plan d'action).

export interface InterventionLike {
  urgence: 'urgente' | 'standard';
  dateDeclaration: Date | string;
  datePriseEnCharge: Date | string | null;
  dateCloture: Date | string | null;
}

export interface SlaStats {
  total: number;
  clotures: number;
  ouverts: number;
  tauxCloture: number; // 0-100, arrondi
  delaiMoyenUrgenteHeures: number | null;
  delaiMoyenStandardHeures: number | null;
  delaiMedianUrgenteHeures: number | null;
  delaiMedianStandardHeures: number | null;
  priseEnChargeMesuree: number; // interventions avec datePriseEnCharge renseigné (déclaration -> prise en charge mesurable)
}

function heuresEntre(a: Date | string, b: Date | string): number {
  const ta = typeof a === 'string' ? new Date(a) : a;
  const tb = typeof b === 'string' ? new Date(b) : b;
  return (tb.getTime() - ta.getTime()) / (1000 * 60 * 60);
}

function moyenne(valeurs: number[]): number | null {
  if (!valeurs.length) return null;
  return valeurs.reduce((s, v) => s + v, 0) / valeurs.length;
}

// La moyenne seule masque le cas d'un petit nombre de tickets très en
// retard qui tirent le délai moyen vers le haut (ex. délai moyen urgent
// supérieur au standard alors que la plupart des urgents sont traités
// vite) -- la médiane, moins sensible aux valeurs extrêmes, sert à
// distinguer "quelques cas isolés" d'un vrai problème systémique.
function mediane(valeurs: number[]): number | null {
  if (!valeurs.length) return null;
  const triees = [...valeurs].sort((a, b) => a - b);
  const milieu = Math.floor(triees.length / 2);
  return triees.length % 2 === 0 ? (triees[milieu - 1] + triees[milieu]) / 2 : triees[milieu];
}

// Le délai SLA mesuré est déclaration -> prise en charge (délai de
// réponse), pas déclaration -> clôture (délai de résolution) : c'est
// explicitement le couple de dates que le compte rendu COPIL T2 SEN'EAU
// identifie comme manquant ("l'heure de déclaration de l'incident ainsi
// que l'heure de début de prise en charge"), pas un délai de résolution.
export function computeSlaStats(interventions: InterventionLike[]): SlaStats {
  const total = interventions.length;
  const clotures = interventions.filter((i) => i.dateCloture != null).length;
  const delaisUrgente = interventions
    .filter((i) => i.urgence === 'urgente' && i.datePriseEnCharge != null)
    .map((i) => heuresEntre(i.dateDeclaration, i.datePriseEnCharge!));
  const delaisStandard = interventions
    .filter((i) => i.urgence === 'standard' && i.datePriseEnCharge != null)
    .map((i) => heuresEntre(i.dateDeclaration, i.datePriseEnCharge!));

  return {
    total,
    clotures,
    ouverts: total - clotures,
    tauxCloture: total ? Math.round((100 * clotures) / total) : 0,
    delaiMoyenUrgenteHeures: moyenne(delaisUrgente),
    delaiMoyenStandardHeures: moyenne(delaisStandard),
    delaiMedianUrgenteHeures: mediane(delaisUrgente),
    delaiMedianStandardHeures: mediane(delaisStandard),
    priseEnChargeMesuree: interventions.filter((i) => i.datePriseEnCharge != null).length,
  };
}

export interface InterventionLenteLike extends InterventionLike {
  site: string;
}

export interface TicketLent {
  site: string;
  dateDeclaration: Date | string;
  delaiHeures: number;
}

// Les N tickets les plus lents à être pris en charge pour une urgence
// donnée -- sert à vérifier si un délai moyen élevé vient de quelques cas
// isolés (visibles ici) ou d'un problème plus large.
export function ticketsLesPlusLents(interventions: InterventionLenteLike[], urgence: 'urgente' | 'standard', topN = 5): TicketLent[] {
  return interventions
    .filter((i) => i.urgence === urgence && i.datePriseEnCharge != null)
    .map((i) => ({ site: i.site, dateDeclaration: i.dateDeclaration, delaiHeures: heuresEntre(i.dateDeclaration, i.datePriseEnCharge!) }))
    .sort((a, b) => b.delaiHeures - a.delaiHeures)
    .slice(0, topN);
}

export interface LivraisonLike {
  date: Date | string;
  quantite: number;
}

export interface VolumetrieLike {
  copiesNB: number;
  copiesCouleur: number;
}

export interface EquipementLike {
  statut: 'actif' | 'retire' | 'introuvable';
}

export interface ParcSynthese {
  equipementsActifs: number;
  equipementsIntrouvables: number;
  interventionsTotal: number;
  interventionsPreventives: number;
  sla: SlaStats;
  consommablesLivres: number;
  copiesNBTotal: number;
  copiesCouleurTotal: number;
}

// Synthèse exécutive (cahier des charges implicite : reproduit les
// compteurs de la diapo 2 "VUE D'ENSEMBLE" du COPIL T2 SEN'EAU) sur une
// période déjà filtrée en amont (le range de dates est de la responsabilité
// de l'appelant, cette fonction ne fait qu'agréger).
export function computeParcSynthese(
  equipements: EquipementLike[],
  interventions: (InterventionLike & { type: 'preventive' | 'curative' })[],
  volumetrie: VolumetrieLike[],
  livraisons: LivraisonLike[],
): ParcSynthese {
  return {
    equipementsActifs: equipements.filter((e) => e.statut === 'actif').length,
    equipementsIntrouvables: equipements.filter((e) => e.statut === 'introuvable').length,
    interventionsTotal: interventions.length,
    interventionsPreventives: interventions.filter((i) => i.type === 'preventive').length,
    sla: computeSlaStats(interventions),
    consommablesLivres: livraisons.reduce((s, l) => s + l.quantite, 0),
    copiesNBTotal: volumetrie.reduce((s, v) => s + v.copiesNB, 0),
    copiesCouleurTotal: volumetrie.reduce((s, v) => s + v.copiesCouleur, 0),
  };
}

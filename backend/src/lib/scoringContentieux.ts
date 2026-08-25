// =====================================================================
// Score de recouvrabilité d'un dossier contentieux (déterministe, explicable)
// ---------------------------------------------------------------------
// On préfère un score DÉTERMINISTE et traçable (chaque facteur est affiché)
// à une probabilité « boîte noire » : sur une créance, l'utilisateur doit
// comprendre POURQUOI le dossier est jugé solide ou fragile. La stratégie
// recommandée (injonction / assignation / compléter / abandon) en découle.
// =====================================================================

export interface FacteurScore {
  label: string;
  effet: 'positif' | 'negatif' | 'neutre';
}

export interface ScoreRecouvrabilite {
  score: number; // 0-100
  niveau: 'eleve' | 'moyen' | 'faible';
  facteurs: FacteurScore[];
  strategie: string;
}

export interface EntreeScoring {
  montant: number | null;
  analyse: {
    certaine: boolean;
    liquide: boolean;
    exigible: boolean;
    prescriptionOk: boolean;
    manquants: string[];
  } | null;
  prescriptionJoursRestants: number | null; // null si inconnu
  joursDepuisEcheance: number | null; // ancienneté de la créance la plus ancienne
  nbFactures: number;
}

export function scorerRecouvrabilite(e: EntreeScoring): ScoreRecouvrabilite {
  const facteurs: FacteurScore[] = [];
  let score = 60; // base neutre

  const a = e.analyse;
  const prescrit = e.prescriptionJoursRestants != null && e.prescriptionJoursRestants <= 0;

  if (!e.nbFactures) {
    facteurs.push({ label: 'Aucune facture rattachée', effet: 'negatif' });
    score -= 25;
  }

  if (a) {
    if (a.certaine) { facteurs.push({ label: 'Créance certaine (prouvée)', effet: 'positif' }); score += 12; }
    else { facteurs.push({ label: 'Créance non prouvée', effet: 'negatif' }); score -= 22; }
    if (a.liquide) { facteurs.push({ label: 'Montant liquide (chiffré)', effet: 'positif' }); score += 5; }
    if (a.exigible) { facteurs.push({ label: 'Créance exigible', effet: 'positif' }); score += 5; }
    else { facteurs.push({ label: 'Pas encore exigible', effet: 'negatif' }); score -= 10; }
    const nbManquants = a.manquants.length;
    if (nbManquants > 0) {
      facteurs.push({ label: `${nbManquants} pièce(s)/élément(s) manquant(s)`, effet: 'negatif' });
      score -= Math.min(15, nbManquants * 5);
    }
  } else {
    facteurs.push({ label: 'Dossier non encore analysé', effet: 'neutre' });
    score -= 5;
  }

  // Prescription.
  if (prescrit) {
    facteurs.push({ label: 'Créance prescrite', effet: 'negatif' });
    score -= 40;
  } else if (e.prescriptionJoursRestants != null && e.prescriptionJoursRestants <= 180) {
    facteurs.push({ label: `Prescription proche (${e.prescriptionJoursRestants} j)`, effet: 'negatif' });
    score -= 10;
  } else if (e.prescriptionJoursRestants != null) {
    facteurs.push({ label: 'Dans les délais de prescription', effet: 'positif' });
  }

  // Ancienneté de la créance (plus c'est vieux, plus c'est dur à recouvrer).
  if (e.joursDepuisEcheance != null) {
    if (e.joursDepuisEcheance > 365) { facteurs.push({ label: 'Créance ancienne (> 1 an)', effet: 'negatif' }); score -= 10; }
    else if (e.joursDepuisEcheance > 180) { facteurs.push({ label: 'Créance de plus de 6 mois', effet: 'negatif' }); score -= 5; }
    else if (e.joursDepuisEcheance >= 0) { facteurs.push({ label: 'Créance récente', effet: 'positif' }); score += 3; }
  }

  score = Math.max(0, Math.min(100, Math.round(score)));
  const niveau: ScoreRecouvrabilite['niveau'] = score >= 65 ? 'eleve' : score >= 40 ? 'moyen' : 'faible';

  // Stratégie recommandée.
  const nette = a && a.certaine && a.liquide && a.exigible && a.manquants.length === 0;
  let strategie: string;
  if (prescrit) {
    strategie = 'Créance prescrite : le recouvrement judiciaire est compromis. Vérifier une éventuelle cause d\'interruption avec un juriste, sinon envisager le passage en pertes (irrécouvrable).';
  } else if (!e.nbFactures || (a && !a.certaine)) {
    strategie = 'Compléter le dossier (preuve de la créance : facture, bon de commande, contrat) avant toute action judiciaire.';
  } else if (a && a.manquants.length > 0) {
    strategie = 'Réunir les pièces manquantes (mise en demeure, preuve de livraison) puis privilégier l\'injonction de payer.';
  } else if (nette) {
    strategie = 'Créance nette : privilégier l\'injonction de payer (voie rapide OHADA). Réserver l\'assignation si le débiteur conteste.';
  } else {
    strategie = 'Poursuivre l\'amiable et consolider le dossier avant d\'engager le judiciaire.';
  }

  return { score, niveau, facteurs, strategie };
}

// Capacités par formule d'abonnement (addendum §8) — source unique de vérité,
// partagée entre l'affichage (/me), les gardes serveur et le back-office.
//
// Packaging retenu :
//   Petite  (35k) : ≤ 50 débiteurs · 2 utilisateurs · 1 entité · pas de reporting
//   PME     (65k) : ≤ 500 débiteurs · 5 utilisateurs · multi-entités · reporting · contentieux inclus
//   Grands comptes: illimité · reporting · contentieux inclus · multi-entités
// Le module contentieux est inclus pour PME et Grands comptes ; pour Petite, il
// reste disponible en option payante (+10 000/mois) via optionContentieux.

export interface Capacites {
  // null = illimité.
  maxUtilisateurs: number | null;
  maxDebiteurs: number | null;
  reporting: boolean;
  contentieux: boolean;
  multiEntites: boolean;
}

export function capacites(formule: string, optionContentieux = false): Capacites {
  switch (formule) {
    case 'grands_comptes':
      return { maxUtilisateurs: null, maxDebiteurs: null, reporting: true, contentieux: true, multiEntites: true };
    case 'pme':
      return { maxUtilisateurs: 5, maxDebiteurs: 500, reporting: true, contentieux: true, multiEntites: true };
    case 'petite':
    default:
      return { maxUtilisateurs: 2, maxDebiteurs: 50, reporting: false, contentieux: optionContentieux, multiEntites: false };
  }
}

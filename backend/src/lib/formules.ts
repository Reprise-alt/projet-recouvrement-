// Capacités par formule d'abonnement (addendum §8) — source unique de vérité,
// partagée entre l'affichage (/me), les gardes serveur et le back-office.
//
// Packaging retenu :
//   Petite  (35k) : ≤ 50 débiteurs · 2 utilisateurs · 1 entité · pas de reporting
//   PME     (65k) : ≤ 500 débiteurs · 5 utilisateurs · multi-entités · reporting · contentieux inclus
//   Grands comptes: illimité · reporting · contentieux inclus · multi-entités
// Le module contentieux est inclus pour PME et Grands comptes ; pour Petite, il
// reste disponible en option payante (+10 000/mois) via optionContentieux.
//
// Pilotage par secteur : dans les métiers en tiers-payant (santé, optique,
// cliniques, pharmacies…), le créancier est réglé par des assureurs plutôt que
// poursuivi au contentieux. Pour ces secteurs on masque le contentieux et on
// active à la place l'« Espace Assureur » (relevé + signalement de règlement).

export interface Capacites {
  // null = illimité.
  maxUtilisateurs: number | null;
  maxDebiteurs: number | null;
  reporting: boolean;
  contentieux: boolean;
  multiEntites: boolean;
  // Accès assureurs : espace public où l'assureur (débiteur) consulte son relevé
  // et signale ses règlements. Piloté par le secteur d'activité (tiers-payant).
  espaceAssureur: boolean;
}

// Secteurs en tiers-payant : le recouvrement passe par des assureurs, pas par le
// contentieux. Détection souple sur le libellé libre du secteur (saisi au
// provisioning). Mots-clés volontairement larges pour couvrir les variantes.
const MOTS_CLES_TIERS_PAYANT = [
  'sant', 'opti', 'clini', 'pharma', 'medic', 'médic', 'médec', 'medec',
  'dentaire', 'dentist', 'hopit', 'hôpit', 'assur', 'mutuel', 'laborat', 'imager',
];

export function secteurTiersPayant(secteur?: string | null): boolean {
  if (!secteur) return false;
  const s = secteur.toLowerCase();
  return MOTS_CLES_TIERS_PAYANT.some((m) => s.includes(m));
}

export function capacites(formule: string, optionContentieux = false, secteur?: string | null): Capacites {
  const tiersPayant = secteurTiersPayant(secteur);
  const base = ((): Capacites => {
    switch (formule) {
      case 'grands_comptes':
        return { maxUtilisateurs: null, maxDebiteurs: null, reporting: true, contentieux: true, multiEntites: true, espaceAssureur: false };
      case 'pme':
        return { maxUtilisateurs: 5, maxDebiteurs: 500, reporting: true, contentieux: true, multiEntites: true, espaceAssureur: false };
      case 'petite':
      default:
        return { maxUtilisateurs: 2, maxDebiteurs: 50, reporting: false, contentieux: optionContentieux, multiEntites: false, espaceAssureur: false };
    }
  })();
  if (tiersPayant) {
    // Secteur tiers-payant : le contentieux cède la place à l'Espace Assureur.
    base.contentieux = false;
    base.espaceAssureur = true;
  }
  return base;
}

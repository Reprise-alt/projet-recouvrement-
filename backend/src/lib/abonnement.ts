// État d'abonnement d'une organisation (addendum §8) — logique partagée entre
// /api/auth/me (affichage) et la garde serveur (blocage). Un seul endroit de
// vérité pour décider si un espace est ouvert, en essai, ou bloqué.

export type EtatAbonnement = 'actif' | 'essai' | 'essai_expire' | 'suspendu';

export interface AbonnementInfo {
  etat: EtatAbonnement;
  // Jours d'essai restants (uniquement quand etat === 'essai').
  joursRestants?: number;
  // Date de fin d'essai (ISO), pour l'affichage.
  dateFinEssai?: string | null;
}

export interface OrgAbonnement {
  statut: string;
  dateFinEssai?: Date | null;
}

export function etatAbonnement(org: OrgAbonnement, now: Date = new Date()): AbonnementInfo {
  const dateFinEssai = org.dateFinEssai ? org.dateFinEssai.toISOString() : null;
  if (org.statut === 'actif') return { etat: 'actif', dateFinEssai };
  if (org.statut === 'coupe' || org.statut === 'supprime') return { etat: 'suspendu', dateFinEssai };
  // statut « essai »
  if (!org.dateFinEssai) return { etat: 'essai', dateFinEssai }; // essai sans date (legacy) = illimité
  const resteMs = org.dateFinEssai.getTime() - now.getTime();
  if (resteMs <= 0) return { etat: 'essai_expire', joursRestants: 0, dateFinEssai };
  return { etat: 'essai', joursRestants: Math.ceil(resteMs / 86_400_000), dateFinEssai };
}

// Un espace bloqué ne peut plus utiliser le produit (essai terminé ou compte
// suspendu) — il ne reste que l'écran « contactez-nous ».
export function abonnementBloque(info: AbonnementInfo): boolean {
  return info.etat === 'essai_expire' || info.etat === 'suspendu';
}

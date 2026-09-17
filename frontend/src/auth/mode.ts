// Mode d'authentification du front, figé au build (comme VITE_CONSOLE) :
//   'sso'      → connexion unique du hub OLU 360 (cookie olu360_session).
//               Pas de formulaire local : si pas connecté, on renvoie au hub.
//   'otp'      → SaaS self-service : inscription/connexion par code email (OTP).
//   'supabase' → comportement historique (formulaire Supabase). Défaut, pour
//               ne rien changer tant qu'on n'a pas basculé.
export const AUTH_MODE: 'supabase' | 'sso' | 'otp' =
  import.meta.env.VITE_AUTH_MODE === 'sso'
    ? 'sso'
    : import.meta.env.VITE_AUTH_MODE === 'otp'
      ? 'otp'
      : 'supabase';

// Ce build sert-il le SaaS self-service ? (déploiement OTP.) Sert à masquer le
// « chrome » propre au groupe OLU 360 — sélecteur multi-consoles, entités et
// branding SORAM/IRIS/SIS — qui n'a aucun sens pour un client SaaS autonome :
// il ne doit voir QUE sa propre marque et ses propres données.
export const IS_SAAS = AUTH_MODE === 'otp';

// URL du hub vers laquelle renvoyer un visiteur non connecté (mode SSO).
export const HUB_URL = ((import.meta.env.VITE_HUB_URL as string | undefined) || 'https://app.olu360.com').replace(/\/+$/, '');

// Renvoie le navigateur vers le hub pour s'authentifier. En mode SSO, une fois
// connecté au hub, l'utilisateur revient sur la console via sa tuile.
export function redirigerVersHub(): void {
  window.location.href = HUB_URL;
}

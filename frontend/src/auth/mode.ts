// Mode d'authentification du front, figé au build (comme VITE_CONSOLE) :
//   'sso'      → connexion unique du hub OLU 360 (cookie olu360_session).
//               Pas de formulaire local : si pas connecté, on renvoie au hub.
//   'supabase' → comportement historique (formulaire Supabase). Défaut, pour
//               ne rien changer tant qu'on n'a pas basculé.
export const AUTH_MODE: 'supabase' | 'sso' = import.meta.env.VITE_AUTH_MODE === 'sso' ? 'sso' : 'supabase';

// URL du hub vers laquelle renvoyer un visiteur non connecté (mode SSO).
export const HUB_URL = ((import.meta.env.VITE_HUB_URL as string | undefined) || 'https://app.olu360.com').replace(/\/+$/, '');

// Renvoie le navigateur vers le hub pour s'authentifier. En mode SSO, une fois
// connecté au hub, l'utilisateur revient sur la console via sa tuile.
export function redirigerVersHub(): void {
  window.location.href = HUB_URL;
}

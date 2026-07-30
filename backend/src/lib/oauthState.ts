import crypto from 'crypto';

// Anti-CSRF minimal pour le callback OAuth Google : Google redirige le
// navigateur directement vers notre backend, sans le Bearer token de la
// session admin qui a initié le flux — on vérifie donc un état signé côté
// serveur plutôt qu'une authentification classique sur cette route. L'état
// porte aussi l'entité pour laquelle la connexion Gmail est faite (Google ne
// renvoie que ce paramètre `state` sur le callback, rien d'autre qu'on
// contrôle) — indispensable maintenant qu'il y a un compte Gmail par entité.
// Stockage en mémoire : suffisant pour un seul process ; à remplacer par un
// store partagé (Redis, table dédiée) si le backend est un jour scalé
// horizontalement sur plusieurs instances.
interface PendingState {
  expiry: number;
  entite: string;
}

const pendingStates = new Map<string, PendingState>();
const STATE_TTL_MS = 10 * 60 * 1000;

export function createState(entite: string): string {
  const state = crypto.randomBytes(24).toString('hex');
  pendingStates.set(state, { expiry: Date.now() + STATE_TTL_MS, entite });
  return state;
}

export function consumeState(state: string | undefined): { entite: string } | null {
  if (!state) return null;
  const entry = pendingStates.get(state);
  pendingStates.delete(state);
  if (!entry || entry.expiry <= Date.now()) return null;
  return { entite: entry.entite };
}

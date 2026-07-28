import crypto from 'crypto';

// Anti-CSRF minimal pour le callback OAuth Google : Google redirige le
// navigateur directement vers notre backend, sans le Bearer token de la
// session admin qui a initié le flux — on vérifie donc un état signé côté
// serveur plutôt qu'une authentification classique sur cette route.
// Stockage en mémoire : suffisant pour un seul process ; à remplacer par un
// store partagé (Redis, table dédiée) si le backend est un jour scalé
// horizontalement sur plusieurs instances.
const pendingStates = new Map<string, number>();
const STATE_TTL_MS = 10 * 60 * 1000;

export function createState(): string {
  const state = crypto.randomBytes(24).toString('hex');
  pendingStates.set(state, Date.now() + STATE_TTL_MS);
  return state;
}

export function consumeState(state: string | undefined): boolean {
  if (!state) return false;
  const expiry = pendingStates.get(state);
  pendingStates.delete(state);
  return typeof expiry === 'number' && expiry > Date.now();
}

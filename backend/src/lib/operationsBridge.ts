// Pont Feyma (SaaS) → console Opérations (groupe), côté consommateur.
//
// Quand un client du groupe est passé sur Feyma, ses vraies données de
// recouvrement vivent dans la base SaaS. Ce module va les chercher par HTTP
// (lecture seule) auprès du back-end SaaS et les indexe PAR NOM, pour fusion
// dans la console Opérations. Il dégrade toujours proprement : si le pont n'est
// pas configuré ou que l'appel échoue, on retombe sur les données locales — la
// console Opérations n'est jamais bloquée.
//
// Configuration (variables d'environnement, côté back-end GROUPE uniquement) :
//   OPERATIONS_BRIDGE_URL    = https://olu360-saas-backend.onrender.com
//   OPERATIONS_BRIDGE_SECRET = <secret partagé, identique côté SaaS>
//   OPERATIONS_BRIDGE_ORG    = identifiant ou raison sociale de l'org (ex. "SORAM AFRIQUE")
//   OPERATIONS_BRIDGE_ENTITE = entité groupe concernée (défaut "SORAM")

export interface SignalFeyma {
  nom: string;
  enLitige: boolean;
  encours: number;
  joursRetard: number;
  palier: number;
}

export function pontActif(): boolean {
  return !!(
    process.env.OPERATIONS_BRIDGE_URL &&
    process.env.OPERATIONS_BRIDGE_SECRET &&
    process.env.OPERATIONS_BRIDGE_ORG
  );
}

// Entité groupe dont les comptes sont pilotés depuis Feyma (défaut SORAM).
export function pontEntite(): string {
  return (process.env.OPERATIONS_BRIDGE_ENTITE || 'SORAM').trim().toUpperCase();
}

// Normalisation du nom pour la correspondance : sans accents, minuscules,
// espaces compactés. « AQUATECH  Sénégal » ↔ « aquatech senegal ».
export function normNom(s: string | null | undefined): string {
  return (s || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

// Cache court : le portefeuille peut appeler plusieurs fois de suite ; on évite
// de marteler le back-end SaaS. TTL volontairement bas (fraîcheur > économie).
let cache: { at: number; map: Map<string, SignalFeyma> } | null = null;
const TTL_MS = 60_000;

export async function signauxFeyma(): Promise<Map<string, SignalFeyma>> {
  if (!pontActif()) return new Map();
  if (cache && Date.now() - cache.at < TTL_MS) return cache.map;
  try {
    const base = process.env.OPERATIONS_BRIDGE_URL!.replace(/\/+$/, '');
    const org = encodeURIComponent(process.env.OPERATIONS_BRIDGE_ORG!);
    const r = await fetch(`${base}/api/integration/operations-signaux?org=${org}`, {
      headers: { 'x-bridge-secret': process.env.OPERATIONS_BRIDGE_SECRET! },
      signal: AbortSignal.timeout(8000),
    });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const data = (await r.json()) as { signaux?: SignalFeyma[] };
    const map = new Map<string, SignalFeyma>();
    for (const s of data.signaux ?? []) map.set(normNom(s.nom), s);
    cache = { at: Date.now(), map };
    return map;
  } catch (e) {
    // Dégrade : dernier cache connu s'il existe, sinon vide (données locales).
    console.error('[operations-bridge] récupération des signaux Feyma échouée:', (e as Error).message);
    return cache?.map ?? new Map();
  }
}

// Signal d'un compte donné (par nom + entité). Renvoie null si le pont n'est pas
// actif, si l'entité n'est pas concernée, ou si aucun équivalent Feyma n'est
// trouvé — l'appelant retombe alors sur son calcul local.
export async function signalFeymaPourCompte(nom: string, entite: string): Promise<SignalFeyma | null> {
  if (!pontActif()) return null;
  if ((entite || '').trim().toUpperCase() !== pontEntite()) return null;
  const map = await signauxFeyma();
  return map.get(normNom(nom)) ?? null;
}

// Rapprochement automatique d'un chèque scanné : à partir du nom du tireur
// (titulaire du compte = le débiteur qui paie) et du montant, on propose le
// client et la/les facture(s) correspondante(s). L'agent n'a plus qu'à valider.

export interface ClientLite {
  id: string;
  nom: string;
  factures: { id: string; numero: string; montant: number }[];
}

export function normNom(s: string | null | undefined): string {
  return (s || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// Score de correspondance de noms [0..1] : égalité > inclusion > recouvrement
// de mots (Jaccard). Suffisant pour rapprocher « AFRICAN INTERNATIONAL SCHOOL »
// d'« African International School (Pôle Urbain) ».
// Distance d'édition (Levenshtein) bornée — pour tolérer une faute / lettre en
// plus ou en moins (ex. « assurance » ↔ « assurances », OCR « societé »).
function distance(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  if (Math.abs(m - n) > 2) return 3;
  const d = Array.from({ length: m + 1 }, (_, i) => [i, ...new Array(n).fill(0)]);
  for (let j = 0; j <= n; j++) d[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const c = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + c);
    }
  }
  return d[m][n];
}

// Deux mots « collent » : identiques, l'un préfixe de l'autre (pluriel /
// troncature), ou à une lettre près (faute / OCR).
function motsProches(a: string, b: string): boolean {
  if (a === b) return true;
  const [court, long] = a.length <= b.length ? [a, b] : [b, a];
  if (court.length >= 4 && long.startsWith(court)) return true;
  if (court.length >= 5 && distance(a, b) <= 1) return true;
  return false;
}

export function scoreNom(a: string, b: string): number {
  const na = normNom(a);
  const nb = normNom(b);
  if (!na || !nb) return 0;
  if (na === nb) return 1;
  const ta = na.split(' ').filter((t) => t.length > 2);
  const tb = nb.split(' ').filter((t) => t.length > 2);
  if (!ta.length || !tb.length) return 0;
  // Appariement flou des mots significatifs : chaque mot de l'un cherche un mot
  // « proche » dans l'autre. Le score = mots appariés / plus grand des deux noms.
  const pris = new Set<number>();
  let apparies = 0;
  for (const x of ta) {
    for (let j = 0; j < tb.length; j++) {
      if (!pris.has(j) && motsProches(x, tb[j])) {
        pris.add(j);
        apparies++;
        break;
      }
    }
  }
  return apparies / Math.max(ta.length, tb.length);
}

// Meilleur client pour un tireur donné. Renvoie null si aucun n'atteint le seuil.
// Seuil prudent : mieux vaut « client non identifié » (l'agent choisit) qu'un
// mauvais rapprochement (qui pointerait vers la mauvaise facture).
export function matcherClient(tireur: string | null, clients: ClientLite[], seuil = 0.5): { client: ClientLite; score: number } | null {
  if (!tireur) return null;
  let best: { client: ClientLite; score: number } | null = null;
  for (const c of clients) {
    const s = scoreNom(tireur, c.nom);
    if (!best || s > best.score) best = { client: c, score: s };
  }
  return best && best.score >= seuil ? best : null;
}

export interface PropositionFactures {
  proposees: string[]; // ids pré-cochés
  raison: string;
}

// Propose la/les facture(s) impayée(s) qui collent au montant du chèque :
// 1) une facture du montant exact, 2) une somme de deux factures, sinon rien
// (l'agent choisit à la main dans la liste des impayées du client).
export function proposerFactures(montant: number, factures: { id: string; numero: string; montant: number }[]): PropositionFactures {
  const arr = factures.map((f) => ({ ...f, m: Math.round(f.montant) }));
  const exact = arr.filter((f) => f.m === montant);
  if (exact.length === 1) return { proposees: [exact[0].id], raison: 'Facture du montant exact' };
  if (exact.length > 1) return { proposees: [], raison: 'Plusieurs factures de ce montant — à choisir' };
  // Somme de deux factures (borné pour rester peu coûteux).
  if (arr.length <= 40) {
    for (let i = 0; i < arr.length; i++) {
      for (let j = i + 1; j < arr.length; j++) {
        if (arr[i].m + arr[j].m === montant) return { proposees: [arr[i].id, arr[j].id], raison: 'Somme de deux factures' };
      }
    }
  }
  return { proposees: [], raison: 'Aucune facture au montant du chèque' };
}

// Exécute des tâches asynchrones avec une concurrence bornée (évite de saturer
// l'API vision quand on scanne un gros lot).
export async function mapConcurrent<T, R>(items: T[], limite: number, fn: (item: T, index: number) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let i = 0;
  const workers = Array.from({ length: Math.min(limite, items.length) }, async () => {
    while (i < items.length) {
      const idx = i++;
      out[idx] = await fn(items[idx], idx);
    }
  });
  await Promise.all(workers);
  return out;
}

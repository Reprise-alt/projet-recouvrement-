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
export function scoreNom(a: string, b: string): number {
  const na = normNom(a);
  const nb = normNom(b);
  if (!na || !nb) return 0;
  if (na === nb) return 1;
  const ta = na.split(' ').filter((t) => t.length > 2);
  const tb = nb.split(' ').filter((t) => t.length > 2);
  // Inclusion : uniquement si le nom le plus court a AU MOINS 2 mots significatifs
  // (évite qu'un simple mot générique comme « assurance » suffise à matcher).
  const [court, long, tokensCourt] = na.length <= nb.length ? [na, nb, ta] : [nb, na, tb];
  if (tokensCourt.length >= 2 && long.includes(court)) return 0.85;
  const sa = new Set(ta);
  const sb = new Set(tb);
  if (!sa.size || !sb.size) return 0;
  let inter = 0;
  for (const t of sa) if (sb.has(t)) inter++;
  const union = new Set([...ta, ...tb]).size;
  return inter / union;
}

// Meilleur client pour un tireur donné. Renvoie null si aucun n'atteint le seuil.
// Seuil prudent : mieux vaut « client non identifié » (l'agent choisit) qu'un
// mauvais rapprochement (qui pointerait vers la mauvaise facture).
export function matcherClient(tireur: string | null, clients: ClientLite[], seuil = 0.55): { client: ClientLite; score: number } | null {
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

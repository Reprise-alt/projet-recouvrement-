export interface KnownEntite {
  code: string;
  nom: string;
}

// Utilisé quand l'appelant ne fournit pas la liste réelle des entités
// (tests, scripts) — reflète les 3 entités historiques, mais toute entité
// ajoutée depuis l'interface doit être passée explicitement pour être
// reconnue dans les imports (voir routes/importRoutes.ts).
export const DEFAULT_KNOWN_ENTITES: KnownEntite[] = [
  { code: 'SORAM', nom: 'SORAM Afrique' },
  { code: 'SIS', nom: 'SIS' },
  { code: 'IRIS', nom: 'IRIS Afrique' },
];

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Cherche, dans un texte de bandeau/titre de classeur, la première entité
// connue qu'il mentionne (par code ou par nom complet). Le code est
// recherché en tant que mot entier (\b) plutôt qu'en simple sous-chaîne —
// un code court comme "SIS" apparaîtrait sinon par hasard à l'intérieur
// d'un mot sans rapport (ex. "assistance"). Les candidats les plus longs
// sont testés en premier pour qu'un code court ne présélectionne pas le
// mauvais match quand plusieurs entités sont mentionnées dans le même texte.
function matchesAsWord(text: string, value: string): boolean {
  return new RegExp(`\\b${escapeRegex(value)}\\b`, 'i').test(text);
}

export function matchKnownEntite(text: string, candidates: KnownEntite[]): string | null {
  const sorted = [...candidates].sort((a, b) => Math.max(b.code.length, b.nom.length) - Math.max(a.code.length, a.nom.length));
  for (const c of sorted) {
    if (c.code && matchesAsWord(text, c.code)) return c.code;
  }
  // Repli sur le nom complet, avec la même exigence de mot entier — un code
  // court comme "SIS" en guise de nom matcherait sinon par hasard à
  // l'intérieur d'un mot sans rapport (ex. "assistance").
  for (const c of sorted) {
    if (c.nom && matchesAsWord(text, c.nom)) return c.code;
  }
  return null;
}

// Normalise un intitulé (bandeau de section, cellule « entité ») en code
// d'entité stable : majuscules, espaces → « _ », caractères parasites retirés.
export function bannerToEntiteCode(text: string): string {
  return text
    .trim()
    .toUpperCase()
    .replace(/\s+/g, '_')
    .replace(/[^A-Z0-9_]/g, '')
    .slice(0, 40);
}

// Résout l'entité d'une section de classeur. Comportement GROUPE inchangé :
// on privilégie une entité déjà connue (matchKnownEntite). Nouveauté SaaS :
// quand aucune entité connue ne correspond — cas d'une organisation qui n'a pas
// encore déclaré ses entités —, l'intitulé lui-même devient une entité
// (auto-découverte à l'import). On écarte les intitulés implausibles (trop
// courts/longs, sans lettre) pour ne pas fabriquer d'entités parasites.
export function resolveBannerEntite(text: string, candidates: KnownEntite[]): string | null {
  const matched = matchKnownEntite(text, candidates);
  if (matched) return matched;
  const t = text.trim();
  if (t.length < 2 || t.length > 40 || !/[A-Za-zÀ-ÿ]/.test(t)) return null;
  return bannerToEntiteCode(t) || null;
}

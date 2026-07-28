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

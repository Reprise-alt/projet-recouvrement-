import { useState } from 'react';

const LOGO_PATHS: Record<string, string> = {
  SORAM: '/logos/soram.png',
  SIS: '/logos/sis.png',
  IRIS: '/logos/iris-icon.png',
};

// Le logo SIS réutilise le lettrage "soram" (juste le sous-titre change), donc
// à petite taille les deux se ressemblent trop pour se distinguer à l'oeil.
// On ajoute une couleur d'accent propre à chaque entité (indépendante des
// couleurs du logo) pour permettre un repérage rapide dans les listes.
const KNOWN_ACCENTS: Record<string, string> = {
  SORAM: '#2F6FB0',
  SIS: '#9B4FA6',
  IRIS: '#2AA7C4',
};

function hashHue(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) % 360;
  return h;
}

export function entityAccent(entite: string): string {
  return KNOWN_ACCENTS[entite] ?? `hsl(${hashHue(entite)}, 55%, 42%)`;
}

interface Props {
  entite: string;
  size?: number;
  className?: string;
}

// Affiche le logo de l'entité s'il a été déposé dans public/logos/ ; sinon
// ne rend rien (le code de l'entité reste affiché à côté par l'appelant).
export function EntityLogo({ entite, size = 16, className }: Props) {
  const src = LOGO_PATHS[entite];
  const [failed, setFailed] = useState(false);
  if (!src || failed) return null;
  return <img src={src} alt="" height={size} className={className} onError={() => setFailed(true)} />;
}

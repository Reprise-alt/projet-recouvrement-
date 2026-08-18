import { useState } from 'react';

// Marques officielles du groupe (tuiles carrées vectorielles, cf. design
// system OLU 360). Vendorées dans public/logos pour ne dépendre d'aucun CDN.
const LOGO_PATHS: Record<string, string> = {
  SORAM: '/logos/soram.svg',
  SIS: '/logos/sis.svg',
  IRIS: '/logos/iris.svg',
};

// Couleurs d'accent relevées sur les logos officiels (design system 1.0) :
// le vert exact SORAM · SIS, le cyan exact IRIS. SORAM et SIS partagent le
// vert de la marque ; l'accent ne sert donc qu'au repérage, le logo distingue.
const KNOWN_ACCENTS: Record<string, string> = {
  SORAM: '#6DEB15',
  SIS: '#6DEB15',
  IRIS: '#1BB0CA',
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

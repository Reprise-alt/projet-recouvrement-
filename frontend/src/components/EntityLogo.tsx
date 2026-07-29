import { useState } from 'react';

const LOGO_PATHS: Record<string, string> = {
  SORAM: '/logos/soram.svg',
  SIS: '/logos/sis.svg',
  IRIS: '/logos/iris.svg',
};

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

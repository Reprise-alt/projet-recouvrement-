import { useEffect } from 'react';

// Splash d'accueil (SaaS) : la pièce Feyma traverse l'écran et « Bon
// recouvrement ! » apparaît. Joué une fois par session, à l'entrée dans la
// console. Respecte prefers-reduced-motion.
export function WelcomeSplash({ onDone, nom }: { onDone: () => void; nom?: string | null }) {
  useEffect(() => {
    const reduce =
      typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    const t = setTimeout(onDone, reduce ? 1100 : 2650);
    return () => clearTimeout(t);
  }, [onDone]);

  return (
    <div className="splash" role="status" aria-label="Bienvenue sur Feyma. Bon recouvrement !">
      <div className="splash-coin" aria-hidden="true">
        <svg viewBox="0 0 150 100" width="132" height="88">
          <g stroke="#4BD0A0" strokeWidth="8" strokeLinecap="round" opacity="0.85">
            <line x1="4" y1="34" x2="34" y2="34" />
            <line x1="0" y1="50" x2="36" y2="50" />
            <line x1="8" y1="66" x2="30" y2="66" />
          </g>
          <circle cx="100" cy="50" r="40" fill="#4BD0A0" />
          <path d="M86 32 H116 M86 32 V68 M86 50 H108" fill="none" stroke="#0E1D33" strokeWidth="9" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </div>
      <div className="splash-text">{nom ? `Bienvenue, ${nom} !` : 'Bienvenue !'}</div>
    </div>
  );
}

// Logo Feyma — « la pièce qui fonce ». « Feyma » = « rends-moi mon argent »
// (wolof) : une pièce (F) qui file vers vous, tirée par des lignes de vitesse.
// Aux couleurs de l'accent (lime sur la vitrine, vert dans l'app), s'adapte au
// thème. Le « F » est dessiné en tracés (indépendant des polices, toujours net).

// Symbole seul (carré) : la pièce F. Sert de favicon / avatar / usage compact.
export function FeymaMark({ size = 28 }: { size?: number }) {
  return (
    <svg viewBox="0 0 100 100" width={size} height={size} aria-hidden="true" role="img">
      <circle cx="50" cy="50" r="42" fill="var(--accent)" />
      <path d="M38 32 H66 M38 32 V68 M38 51 H60" fill="none" stroke="#0C120F" strokeWidth="9" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

// Logo complet : lignes de vitesse + pièce F + nom + signature écosystème.
export function FeymaBrand({ size = 30, signature = true }: { size?: number; signature?: boolean }) {
  return (
    <span className="feyma-brand">
      <svg viewBox="0 0 132 100" width={Math.round(size * 1.32)} height={size} aria-hidden="true" role="img" className="feyma-mark">
        <g stroke="var(--accent)" strokeWidth="7" strokeLinecap="round">
          <line x1="4" y1="34" x2="30" y2="34" />
          <line x1="0" y1="50" x2="32" y2="50" />
          <line x1="8" y1="66" x2="26" y2="66" />
        </g>
        <circle cx="82" cy="50" r="38" fill="var(--accent)" />
        <path d="M70 34 H98 M70 34 V66 M70 50 H92" fill="none" stroke="#0C120F" strokeWidth="8" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      <span className="feyma-id">
        <b>Feyma</b>
        {signature && <small>by OLU 360</small>}
      </span>
    </span>
  );
}

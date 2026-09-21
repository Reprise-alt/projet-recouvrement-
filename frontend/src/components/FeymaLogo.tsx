// Logo Feyma — « la pièce qui fonce ». « Feyma » = « rends-moi mon argent »
// (wolof) : une pièce (F) qui file vers vous, tirée par des lignes de vitesse.
// La pièce prend l'accent du thème (émeraude sur fond clair, menthe sur les
// îlots marine) ; le « F » se pose sur `--coin-ink` (blanc par défaut, marine
// là où l'accent est clair). Le « F » est en tracés : toujours net, sans font.

// Symbole seul (carré) : la pièce F. Sert de favicon / avatar / usage compact.
export function FeymaMark({ size = 28 }: { size?: number }) {
  return (
    <svg viewBox="0 0 100 100" width={size} height={size} aria-hidden="true" role="img">
      <circle cx="50" cy="50" r="42" fill="var(--accent)" />
      <circle cx="50" cy="50" r="35.5" fill="none" stroke="var(--coin-ink, #fff)" strokeWidth="1.8" opacity="0.3" />
      <path d="M39 32 H67 M39 32 V68 M39 50 H62" fill="none" stroke="var(--coin-ink, #fff)" strokeWidth="9" strokeLinecap="round" strokeLinejoin="round" />
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
        <circle cx="82" cy="50" r="32" fill="none" stroke="var(--coin-ink, #fff)" strokeWidth="1.6" opacity="0.3" />
        <path d="M71 34 H99 M71 34 V66 M71 50 H93" fill="none" stroke="var(--coin-ink, #fff)" strokeWidth="8" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      <span className="feyma-id">
        <b>Feyma</b>
        {signature && <small>by OLU 360</small>}
      </span>
    </span>
  );
}

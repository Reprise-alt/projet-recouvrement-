// Logo Feyma. « Feyma » = « rends-moi mon argent » (wolof) → une flèche
// circulaire de retour : l'argent qui revient vers vous. Aux couleurs de la
// marque (accent), s'adapte au thème via les tokens.

export function FeymaMark({ size = 28 }: { size?: number }) {
  return (
    <svg viewBox="0 0 100 100" width={size} height={size} aria-hidden="true" role="img">
      <path d="M60 23 A32 32 0 1 1 40 23" fill="none" stroke="var(--accent)" strokeWidth="12" strokeLinecap="round" />
      {/* Pointe de flèche tangente (mouvement circulaire de retour). */}
      <path d="M50.3 19.2 L37.7 16.9 L42.3 29.1 Z" fill="var(--accent)" />
    </svg>
  );
}

// Mot-symbole complet : marque + nom + signature écosystème.
export function FeymaBrand({ size = 28, signature = true }: { size?: number; signature?: boolean }) {
  return (
    <span className="feyma-brand">
      <FeymaMark size={size} />
      <span className="feyma-id">
        <b>Feyma</b>
        {signature && <small>by OLU 360</small>}
      </span>
    </span>
  );
}

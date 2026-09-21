import { useEffect, useRef, useState } from 'react';
import { api } from '../api/client';
import { fmtFCFA } from '../lib/constants';

// « Le Fantôme du jour » — un petit récap animé de la journée, en bouton
// flottant. Au clic il déplie une carte ; les chiffres du jour grimpent de 0 à
// leur valeur (count-up). L'animation se rejoue à chaque survol de la carte —
// le petit shot de satisfaction de fin de journée. Ton sobre et pro : un
// fantôme discret, pas de confettis. Respecte prefers-reduced-motion.

interface RecapData {
  relances: number;
  encaisse: number;
  facturesReglees: number;
  clientsAJour: number;
  date: string;
}

const reduitLeMouvement = () => {
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
};

// Compteur animé 0 → value (easeOutCubic). Se rejoue quand `trigger` change.
function CountUp({ value, format, trigger, duration = 1100 }: { value: number; format?: (n: number) => string; trigger: number; duration?: number }) {
  const [display, setDisplay] = useState(() => (reduitLeMouvement() ? value : 0));
  useEffect(() => {
    if (reduitLeMouvement()) {
      setDisplay(value);
      return;
    }
    let raf = 0;
    const start = performance.now();
    const tick = (t: number) => {
      const p = Math.min(1, (t - start) / duration);
      const eased = 1 - Math.pow(1 - p, 3);
      setDisplay(value * eased);
      if (p < 1) raf = requestAnimationFrame(tick);
      else setDisplay(value);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value, trigger, duration]);
  const n = Math.round(display);
  return <>{format ? format(n) : n.toLocaleString('fr-FR')}</>;
}

function Fantome({ size = 22 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M4 11a8 8 0 0 1 16 0v9.2c0 .7-.8 1.1-1.4.7l-1.5-1a1 1 0 0 0-1.1 0l-1.4 1a1 1 0 0 1-1.2 0l-1.4-1a1 1 0 0 0-1.1 0l-1.4 1a1 1 0 0 1-1.2 0l-1.4-1a1 1 0 0 0-1.1 0l-1.5 1c-.6.4-1.4 0-1.4-.7V11Z"
        fill="currentColor"
      />
      <circle cx="9.3" cy="10.5" r="1.35" fill="var(--surface, #fff)" />
      <circle cx="14.7" cy="10.5" r="1.35" fill="var(--surface, #fff)" />
    </svg>
  );
}

const METRIQUES: { cle: keyof Omit<RecapData, 'date'>; label: string; emoji: string; devise?: boolean }[] = [
  { cle: 'encaisse', label: 'Encaissé aujourd’hui', emoji: '💰', devise: true },
  { cle: 'relances', label: 'Relances envoyées', emoji: '📨' },
  { cle: 'facturesReglees', label: 'Factures réglées', emoji: '✅' },
  { cle: 'clientsAJour', label: 'Clients repassés à jour', emoji: '🎯' },
];

export function RecapJournee() {
  const [open, setOpen] = useState(false);
  const [data, setData] = useState<RecapData | null>(null);
  const [loading, setLoading] = useState(false);
  const [erreur, setErreur] = useState(false);
  const [anim, setAnim] = useState(0); // incrémenté pour rejouer le count-up
  const chargeUneFois = useRef(false);

  function charger() {
    setLoading(true);
    setErreur(false);
    api
      .get<RecapData>('/api/clients/journee')
      .then((r) => {
        setData(r);
        setAnim((a) => a + 1);
      })
      .catch(() => setErreur(true))
      .finally(() => setLoading(false));
  }

  function ouvrir() {
    const prochain = !open;
    setOpen(prochain);
    if (prochain) {
      if (!chargeUneFois.current) {
        chargeUneFois.current = true;
        charger();
      } else {
        setAnim((a) => a + 1); // rejoue l'animation à la réouverture
      }
    }
  }

  // Recharge à minuit si la carte reste ouverte d'un jour à l'autre (rare, mais
  // évite d'afficher le récap de la veille).
  useEffect(() => {
    if (!open || !data) return;
    const aujourdHui = new Date().toISOString().slice(0, 10);
    if (data.date !== aujourdHui) charger();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const total = data ? data.relances + data.encaisse + data.facturesReglees + data.clientsAJour : 0;
  const journeeVide = !!data && total === 0;

  return (
    <div style={{ position: 'fixed', right: 20, bottom: 20, zIndex: 50, display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 10 }}>
      <style>{`
        @keyframes recapFloat { 0%,100% { transform: translateY(0) } 50% { transform: translateY(-3px) } }
        @keyframes recapPop { 0% { opacity: 0; transform: translateY(8px) scale(.98) } 100% { opacity: 1; transform: translateY(0) scale(1) } }
        @media (prefers-reduced-motion: reduce) {
          .recap-ghost { animation: none !important }
          .recap-card { animation: none !important }
        }
      `}</style>

      {open && (
        <div
          className="recap-card"
          onMouseEnter={() => setAnim((a) => a + 1)}
          style={{
            width: 288,
            background: 'var(--surface, #fff)',
            border: '1px solid var(--line)',
            borderRadius: 16,
            boxShadow: '0 18px 44px rgba(14, 29, 51, 0.16)',
            padding: 16,
            animation: 'recapPop .28s ease both',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 2 }}>
            <span style={{ color: 'var(--accent)', display: 'inline-flex' }}>
              <Fantome size={20} />
            </span>
            <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--ink)' }}>Ma journée</div>
            <button
              onClick={() => setOpen(false)}
              aria-label="Fermer"
              style={{ marginLeft: 'auto', border: 'none', background: 'transparent', color: 'var(--ink-soft)', fontSize: 18, lineHeight: 1, cursor: 'pointer', padding: 2 }}
            >
              ×
            </button>
          </div>
          <div style={{ fontSize: 11.5, color: 'var(--ink-soft)', marginBottom: 14 }}>Ce que Feyma a fait avancer aujourd’hui.</div>

          {loading && <div style={{ fontSize: 12.5, color: 'var(--ink-soft)', padding: '10px 0' }}>Chargement…</div>}
          {erreur && (
            <div style={{ fontSize: 12.5, color: 'var(--danger)', padding: '8px 0' }}>
              Récap indisponible.{' '}
              <button onClick={charger} style={{ border: 'none', background: 'none', color: 'var(--accent-dark)', cursor: 'pointer', padding: 0, textDecoration: 'underline' }}>
                Réessayer
              </button>
            </div>
          )}

          {!loading && !erreur && data && journeeVide && (
            <div style={{ fontSize: 12.8, color: 'var(--ink-soft)', lineHeight: 1.5, padding: '4px 0 6px' }}>
              Journée calme pour l’instant. <br />Le premier encaissement n’attend que toi 👻
            </div>
          )}

          {!loading && !erreur && data && !journeeVide && (
            <div style={{ display: 'grid', gap: 8 }}>
              {METRIQUES.map((m) => {
                const val = data[m.cle];
                if (!val) return null; // on ne montre que ce qui a bougé
                return (
                  <div
                    key={m.cle}
                    style={{ display: 'flex', alignItems: 'center', gap: 11, padding: '9px 11px', borderRadius: 11, background: 'var(--accent-soft)' }}
                  >
                    <span style={{ fontSize: 17, lineHeight: 1 }}>{m.emoji}</span>
                    <span style={{ fontSize: 12, color: 'var(--ink-soft)', flex: 1, minWidth: 0 }}>{m.label}</span>
                    <span style={{ fontWeight: 800, fontSize: m.devise ? 14 : 16, color: 'var(--accent-dark)', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>
                      <CountUp value={val} trigger={anim} format={m.devise ? (n) => fmtFCFA(n) : undefined} />
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      <button
        className="recap-ghost"
        onClick={ouvrir}
        aria-label="Récap de la journée"
        title="Récap de la journée"
        style={{
          width: 52,
          height: 52,
          borderRadius: '50%',
          border: 'none',
          cursor: 'pointer',
          background: open ? 'var(--accent-dark)' : 'var(--accent)',
          color: '#fff',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          boxShadow: '0 10px 26px rgba(14, 124, 90, 0.4)',
          animation: 'recapFloat 3.2s ease-in-out infinite',
        }}
      >
        <Fantome size={24} />
      </button>
    </div>
  );
}

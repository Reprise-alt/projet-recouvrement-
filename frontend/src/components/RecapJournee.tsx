import { useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../api/client';
import { fmtFCFA } from '../lib/constants';

// « Fey » — le petit compagnon fantôme qui fait le récap de la journée, en
// bouton flottant. Au clic il déplie une carte ; il salue l'agent (ton
// chaleureux, tutoie, félicite les bons jours), puis les chiffres du jour
// grimpent de 0 à leur valeur (count-up). L'animation se rejoue à chaque survol
// — le petit shot de satisfaction de fin de journée. Respecte
// prefers-reduced-motion.

interface PaiementJour {
  client: string;
  numero: string;
  montant: number;
  heure: string | null;
}

interface BilanAnnee {
  annee: number;
  factureEchu: number; // facturé cette année, déjà arrivé à échéance
  recouvre: number; // recouvré parmi ces factures échues
  tauxPct: number | null; // recouvre / factureEchu, en %
  aEchoir: number; // facturé cette année mais pas encore échu (hors taux)
}

interface Celebration {
  cle: string; // identifiant unique portée+mois+palier (pour ne fêter qu'une fois)
  mois: string; // 'septembre'
  annee: number;
  taux: number; // 98–100
  recouvre: number; // FCFA recouvrés ce mois
  parfait: boolean; // true = 100 % (confettis) ; false = ≥98 % (clin d'œil sobre)
  portee: string; // 'GLOBAL' | 'IRIS' | 'SORAM' | …
}

interface RecapData {
  relances: number;
  encaisse: number;
  facturesReglees: number;
  clientsAJour: number;
  paiements?: PaiementJour[];
  annee?: BilanAnnee;
  celebrations?: Celebration[];
  date: string;
}

// Mémoire locale des fêtes déjà vues, pour ne pas rejouer l'animation à chaque
// chargement. Tolérant aux navigateurs sans localStorage (private, etc.).
const FETE_KEY = 'fey:fetes-vues';
function fetesVues(): string[] {
  try {
    const v = JSON.parse(localStorage.getItem(FETE_KEY) || '[]');
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}
function marquerFeteVue(cle: string) {
  try {
    const v = fetesVues();
    if (!v.includes(cle)) localStorage.setItem(FETE_KEY, JSON.stringify([...v, cle].slice(-24)));
  } catch {
    /* pas de persistance → la fête pourra se rejouer, sans gravité */
  }
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

// L'humeur de Fey, lue sur le recouvrement DU JOUR :
//   • triste     → rien recouvré aujourd'hui (0 facture réglée)
//   • content    → 1 ou 2 factures recouvrées
//   • rayonnant  → 3 factures recouvrées ou plus (belle journée)
//   • curieux    → avant le chargement des données
type Humeur = 'curieux' | 'triste' | 'content' | 'rayonnant';
const SEUIL_RAYONNANT = 3; // nb de règlements dans la journée pour « rayonnant »
function humeurFey(data: RecapData | null): Humeur {
  if (!data) return 'curieux';
  const regles = data.facturesReglees ?? 0;
  if (regles === 0 && (data.encaisse ?? 0) === 0) return 'triste';
  if (regles >= SEUIL_RAYONNANT) return 'rayonnant';
  return 'content';
}

// Le fantôme, avec une bouille qui suit l'humeur. `feature` = couleur des yeux
// et de la bouche (blanc sur un fantôme coloré ; couleur d'accent sur le bouton
// où le corps est blanc).
function Fantome({ size = 22, humeur = 'curieux', feature = 'var(--surface, #fff)', fete = false }: { size?: number; humeur?: Humeur; feature?: string; fete?: boolean }) {
  const stroke = { stroke: feature, strokeWidth: 1.1, strokeLinecap: 'round' as const, fill: 'none' };
  const h: Humeur = fete ? 'rayonnant' : humeur; // en fête, Fey est forcément rayonnant
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M4 11a8 8 0 0 1 16 0v9.2c0 .7-.8 1.1-1.4.7l-1.5-1a1 1 0 0 0-1.1 0l-1.4 1a1 1 0 0 1-1.2 0l-1.4-1a1 1 0 0 0-1.1 0l-1.4 1a1 1 0 0 1-1.2 0l-1.4-1a1 1 0 0 0-1.1 0l-1.5 1c-.6.4-1.4 0-1.4-.7V11Z"
        fill="currentColor"
      />
      {/* Chapeau de fête */}
      {fete && (
        <>
          <path d="M12 2.2 L14.4 6.4 H9.6 Z" fill="#F4C542" stroke="#E0A92E" strokeWidth={0.5} strokeLinejoin="round" />
          <circle cx="12" cy="2.2" r="0.95" fill="#fff" />
        </>
      )}
      {/* Yeux : arcs joyeux quand rayonnant, sinon deux points */}
      {h === 'rayonnant' ? (
        <>
          <path d="M8.1 10.9 Q9.3 9.5 10.5 10.9" {...stroke} />
          <path d="M13.5 10.9 Q14.7 9.5 15.9 10.9" {...stroke} />
        </>
      ) : (
        <>
          <circle cx="9.3" cy="10.5" r="1.35" fill={feature} />
          <circle cx="14.7" cy="10.5" r="1.35" fill={feature} />
        </>
      )}
      {/* Sourcils inquiets + bouche tombante quand triste */}
      {h === 'triste' && (
        <>
          <path d="M8.2 8.9 L10.1 8.2" {...stroke} strokeWidth={0.9} />
          <path d="M15.8 8.9 L13.9 8.2" {...stroke} strokeWidth={0.9} />
          <path d="M9.5 15.3 Q12 13.7 14.5 15.3" {...stroke} />
        </>
      )}
      {h === 'content' && <path d="M9.3 14.2 Q12 16.2 14.7 14.2" {...stroke} />}
      {h === 'rayonnant' && <path d="M8.9 13.9 Q12 17 15.1 13.9" {...stroke} strokeWidth={1.2} />}
      {h === 'curieux' && <circle cx="12" cy="14.4" r="0.75" fill={feature} />}
    </svg>
  );
}

const METRIQUES: { cle: 'encaisse' | 'relances' | 'facturesReglees' | 'clientsAJour'; label: string; emoji: string; devise?: boolean }[] = [
  { cle: 'encaisse', label: 'Encaissé aujourd’hui', emoji: '💰', devise: true },
  { cle: 'relances', label: 'Relances envoyées', emoji: '📨' },
  { cle: 'facturesReglees', label: 'Factures réglées', emoji: '✅' },
  { cle: 'clientsAJour', label: 'Clients repassés à jour', emoji: '🎯' },
];

// La voix de Fey : chaleureuse, tutoie, félicite les bons jours et encourage
// (jamais culpabilise) les jours calmes. Varie selon l'heure et ce qui a bougé.
function saluteFey(): string {
  const h = new Date().getHours();
  if (h < 12) return 'Bonjour';
  if (h < 18) return 'Bon aprèm';
  return 'Bonsoir';
}
function messageFey(data: RecapData | null, humeur: Humeur): string {
  const s = saluteFey();
  if (!data) return `${s} 👋 Je regarde ta journée…`;
  if (humeur === 'triste') return `${s} 👋 Rien d’encaissé pour l’instant — le premier règlement n’attend que toi 💪`;
  if (humeur === 'rayonnant') return `${s} 👋 Journée en feu, tu assures 🔥`;
  return `${s} 👋 Belle journée, ça rentre 👏`;
}

// Textes de la fête « mois bouclé »
function moisCap(c: Celebration): string {
  return c.mois.charAt(0).toUpperCase() + c.mois.slice(1);
}
function titreFete(c: Celebration): string {
  return c.parfait ? `${moisCap(c)} bouclé à 100 % 🎉` : `${moisCap(c)} à ${c.taux} %`;
}
function sousTitreFete(c: Celebration): string {
  return c.parfait ? 'Bravo — tout ce qui était dû est recouvré.' : 'Plus qu’un souffle avant le 100 %, on le boucle ?';
}

export function RecapJournee() {
  const [open, setOpen] = useState(false);
  const [data, setData] = useState<RecapData | null>(null);
  const [loading, setLoading] = useState(false);
  const [erreur, setErreur] = useState(false);
  const [anim, setAnim] = useState(0); // incrémenté pour rejouer le count-up
  const [detail, setDetail] = useState(false); // liste des paiements dépliée
  const [fete, setFete] = useState<Celebration | null>(null); // fête « mois bouclé » en cours
  const chargeUneFois = useRef(false);

  function charger() {
    setLoading(true);
    setErreur(false);
    api
      .get<RecapData>('/api/clients/journee')
      .then((r) => {
        setData(r);
        setAnim((a) => a + 1);
        // Y a-t-il un mois fraîchement bouclé (ou tout proche) pas encore fêté ?
        const nouvelle = (r.celebrations ?? []).find((c) => !fetesVues().includes(c.cle));
        if (nouvelle) {
          setFete(nouvelle);
          marquerFeteVue(nouvelle.cle);
        }
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

  // Chargé une fois au montage : le petit fantôme affiche tout de suite son
  // humeur (triste/content/rayonnant) sans attendre qu'on l'ouvre.
  useEffect(() => {
    if (!chargeUneFois.current) {
      chargeUneFois.current = true;
      charger();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Recharge à minuit si la carte reste ouverte d'un jour à l'autre (rare, mais
  // évite d'afficher le récap de la veille).
  useEffect(() => {
    if (!open || !data) return;
    const aujourdHui = new Date().toISOString().slice(0, 10);
    if (data.date !== aujourdHui) charger();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // La fête se referme d'elle-même après quelques secondes (fermable à la main
  // aussi). Un peu plus longue pour un mois parfait.
  useEffect(() => {
    if (!fete) return;
    const t = setTimeout(() => setFete(null), fete.parfait ? 9000 : 6500);
    return () => clearTimeout(t);
  }, [fete]);

  // Confettis figés le temps d'une fête (recalculés seulement quand la fête change).
  const confettis = useMemo(() => {
    const cols = ['#1D9E75', '#33C594', '#F4C542', '#E8705B', '#5B8DEF'];
    return Array.from({ length: 26 }, (_, i) => ({
      left: 6 + Math.random() * 88,
      delay: Math.random() * 0.9,
      dur: 2.2 + Math.random() * 1.4,
      col: cols[i % cols.length],
      rot: Math.random() * 360,
    }));
  }, [fete?.cle]);

  const total = data ? data.relances + data.encaisse + data.facturesReglees + data.clientsAJour : 0;
  const journeeVide = !!data && total === 0;
  const humeur = humeurFey(data);

  return (
    <div style={{ position: 'fixed', right: 20, bottom: 20, zIndex: 50, display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 10 }}>
      <style>{`
        @keyframes recapFloat { 0%,100% { transform: translateY(0) } 50% { transform: translateY(-3px) } }
        @keyframes recapPop { 0% { opacity: 0; transform: translateY(8px) scale(.98) } 100% { opacity: 1; transform: translateY(0) scale(1) } }
        @keyframes feyConfetti { 0% { transform: translateY(-14px) rotate(0deg); opacity: 0 } 12% { opacity: 1 } 100% { transform: translateY(210px) rotate(320deg); opacity: 0 } }
        @keyframes feyPouf { 0% { transform: scale(.6); opacity: 0 } 55% { transform: scale(1.06) } 100% { transform: scale(1); opacity: 1 } }
        @media (prefers-reduced-motion: reduce) {
          .recap-ghost { animation: none !important }
          .recap-card { animation: none !important }
          .fey-confetti { display: none !important }
          .fey-fete { animation: none !important }
        }
      `}</style>

      {/* Fête « mois bouclé » : toast festif au-dessus de Fey. Confettis pour un
          mois parfait (100 %), version sobre pour un clin d'œil (≥98 %). */}
      {fete && (
        <div
          className="fey-fete"
          style={{
            width: 300,
            position: 'relative',
            background: 'var(--surface, #fff)',
            border: '1px solid var(--line)',
            borderRadius: 16,
            boxShadow: '0 18px 44px rgba(14, 29, 51, 0.18)',
            padding: '16px 16px 15px',
            overflow: 'hidden',
            animation: 'feyPouf .34s ease both',
          }}
        >
          <div style={{ position: 'absolute', inset: '0 0 auto 0', height: 74, background: 'linear-gradient(180deg, var(--accent-soft), transparent)', pointerEvents: 'none' }} />
          {fete.parfait && (
            <div aria-hidden className="fey-confetti" style={{ position: 'absolute', inset: 0, pointerEvents: 'none', overflow: 'hidden' }}>
              {confettis.map((c, i) => (
                <span
                  key={i}
                  style={{
                    position: 'absolute',
                    top: -14,
                    left: `${c.left}%`,
                    width: 7,
                    height: 11,
                    borderRadius: 2,
                    background: c.col,
                    transform: `rotate(${c.rot}deg)`,
                    animation: `feyConfetti ${c.dur}s linear ${c.delay}s infinite`,
                  }}
                />
              ))}
            </div>
          )}
          <div style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: 11 }}>
            <span style={{ width: 46, height: 46, borderRadius: '50%', background: 'var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 8px 18px rgba(14, 124, 90, 0.35)', flex: 'none', color: '#fff' }}>
              <Fantome size={26} fete={fete.parfait} humeur="content" feature="var(--accent)" />
            </span>
            <div style={{ minWidth: 0, flex: 1 }}>
              <div style={{ fontWeight: 800, fontSize: 14, color: 'var(--ink)', lineHeight: 1.2 }}>
                {fete.portee !== 'GLOBAL' && <span style={{ color: 'var(--accent-dark)' }}>{fete.portee} · </span>}
                {titreFete(fete)}
              </div>
              <div style={{ fontSize: 12, color: 'var(--ink-soft)', marginTop: 2, lineHeight: 1.35 }}>{sousTitreFete(fete)}</div>
            </div>
            <button
              onClick={() => setFete(null)}
              aria-label="Fermer"
              style={{ alignSelf: 'flex-start', border: 'none', background: 'transparent', color: 'var(--ink-soft)', fontSize: 18, lineHeight: 1, cursor: 'pointer', padding: 2 }}
            >
              ×
            </button>
          </div>
          <div style={{ position: 'relative', marginTop: 12, fontSize: 12.5, color: 'var(--ink)', background: 'var(--accent-soft)', borderRadius: 11, padding: '9px 11px', display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 }}>
            <span>{fete.parfait ? 'Recouvré ce mois-ci' : 'Déjà recouvré'}</span>
            <b style={{ fontSize: 15, color: 'var(--accent-dark)', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>{fmtFCFA(fete.recouvre)}</b>
          </div>
        </div>
      )}

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
              <Fantome size={20} humeur={humeur} />
            </span>
            <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--ink)' }}>Fey<span style={{ fontWeight: 500, color: 'var(--ink-soft)' }}> · ta journée</span></div>
            <button
              onClick={() => setOpen(false)}
              aria-label="Fermer"
              style={{ marginLeft: 'auto', border: 'none', background: 'transparent', color: 'var(--ink-soft)', fontSize: 18, lineHeight: 1, cursor: 'pointer', padding: 2 }}
            >
              ×
            </button>
          </div>
          <div style={{ fontSize: 12.5, color: 'var(--ink)', marginBottom: 14, lineHeight: 1.45 }}>{messageFey(data, humeur)}</div>

          {/* Bilan de l'année — toujours affiché dès que les données sont là,
              journée calme ou non. Le taux est calculé sur les factures déjà
              échues (une facture pas encore à échéance ne peut pas être « en
              retard »), la part à échoir est montrée à part pour rester honnête. */}
          {data?.annee && (
            <div style={{ marginBottom: 14, padding: '11px 12px', borderRadius: 12, background: 'var(--accent-soft)', border: '1px solid var(--line)' }}>
              <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 7, gap: 8 }}>
                <span style={{ fontSize: 10.5, letterSpacing: '.06em', textTransform: 'uppercase', color: 'var(--ink-soft)', fontWeight: 700 }}>
                  Cette année {data.annee.annee}
                </span>
                <span style={{ fontSize: 18, fontWeight: 800, color: 'var(--accent-dark)', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>
                  {data.annee.tauxPct === null ? '—' : `${data.annee.tauxPct} %`}
                </span>
              </div>
              {data.annee.tauxPct !== null && (
                <div style={{ height: 7, borderRadius: 5, background: 'var(--surface, #fff)', overflow: 'hidden', marginBottom: 8 }}>
                  <div style={{ width: `${Math.max(0, Math.min(100, data.annee.tauxPct))}%`, height: '100%', background: 'var(--accent)', borderRadius: 5, transition: 'width .6s ease' }} />
                </div>
              )}
              <div style={{ fontSize: 11.5, color: 'var(--ink)', lineHeight: 1.5 }}>
                Facturé <b style={{ fontVariantNumeric: 'tabular-nums' }}>{fmtFCFA(data.annee.factureEchu)}</b> · recouvré{' '}
                <b style={{ fontVariantNumeric: 'tabular-nums', color: 'var(--accent-dark)' }}>{fmtFCFA(data.annee.recouvre)}</b>
              </div>
              {data.annee.aEchoir > 0 && (
                <div style={{ fontSize: 10.5, color: 'var(--ink-soft)', marginTop: 3, fontVariantNumeric: 'tabular-nums' }}>
                  + {fmtFCFA(data.annee.aEchoir)} encore à échoir (hors calcul)
                </div>
              )}
              <div style={{ fontSize: 10, color: 'var(--ink-soft)', marginTop: 5, lineHeight: 1.4 }}>
                Taux calculé sur les factures déjà arrivées à échéance.
              </div>
            </div>
          )}

          {loading && <div style={{ fontSize: 12.5, color: 'var(--ink-soft)', padding: '10px 0' }}>Chargement…</div>}
          {erreur && (
            <div style={{ fontSize: 12.5, color: 'var(--danger)', padding: '8px 0' }}>
              Récap indisponible.{' '}
              <button onClick={charger} style={{ border: 'none', background: 'none', color: 'var(--accent-dark)', cursor: 'pointer', padding: 0, textDecoration: 'underline' }}>
                Réessayer
              </button>
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

          {!loading && !erreur && data && !!data.paiements?.length && (
            <div style={{ marginTop: 12, borderTop: '1px solid var(--line)', paddingTop: 10 }}>
              <button
                onClick={() => setDetail((d) => !d)}
                style={{
                  border: 'none',
                  background: 'none',
                  color: 'var(--accent-dark)',
                  cursor: 'pointer',
                  padding: 0,
                  fontSize: 12,
                  fontWeight: 600,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                }}
              >
                <span style={{ transition: 'transform .2s', transform: detail ? 'rotate(90deg)' : 'none' }}>▸</span>
                {detail ? 'Masquer le détail' : `Voir le détail des paiements (${data.paiements.length})`}
              </button>

              {detail && (
                <div style={{ marginTop: 8, maxHeight: 210, overflowY: 'auto', display: 'grid', gap: 4 }}>
                  {data.paiements.map((p, i) => (
                    <div
                      key={i}
                      style={{
                        display: 'flex',
                        alignItems: 'baseline',
                        gap: 8,
                        padding: '6px 8px',
                        borderRadius: 8,
                        background: 'var(--accent-soft)',
                      }}
                    >
                      <span style={{ minWidth: 0, flex: 1 }}>
                        <span style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--ink)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {p.client}
                        </span>
                        <span style={{ display: 'block', fontSize: 10.5, color: 'var(--ink-soft)', fontVariantNumeric: 'tabular-nums' }}>
                          {p.numero}
                          {p.heure ? ` · ${p.heure}` : ''}
                        </span>
                      </span>
                      <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--accent-dark)', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>
                        {fmtFCFA(p.montant)}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      <button
        className="recap-ghost"
        onClick={ouvrir}
        aria-label="Fey — ton récap du jour"
        title="Fey — ton récap du jour"
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
        <Fantome size={24} humeur={humeur} feature={open ? 'var(--accent-dark)' : 'var(--accent)'} />
      </button>
    </div>
  );
}

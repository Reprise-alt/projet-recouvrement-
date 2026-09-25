import type { ReactNode } from 'react';
import { ArrowDownRight, ArrowUpRight, BarChart3, Clock, Minus, Send, TrendingDown, Wallet } from 'lucide-react';
import { useResource } from '../hooks/useResource';
import { fmtFCFA, fmtFCFAcompact } from '../lib/constants';

// Tableau de bord « Impact » (accueil SaaS) : ce que Feyma a produit ce mois-ci,
// avec la tendance vs le mois précédent. Pensé pour être vu à chaque connexion et
// rendre la valeur de l'abonnement évidente.

interface Impact {
  moisLabel: string;
  recouvre: { montant: number; nombre: number; montantMoisPrec: number; variationPct: number | null };
  dso: { valeur: number | null; valeurMoisPrec: number | null; gainJours: number | null };
  encoursRetard: { montant: number; nombre: number };
  relancesEnvoyees: { ceMois: number; total: number };
  tauxRecouvrement: number | null;
  evolution: { mois: string; montant: number }[];
}

export function ImpactDashboard({ onVoirReporting }: { onVoirReporting?: () => void }) {
  const { data, loading, error } = useResource<Impact>('/api/reporting/impact');

  if (loading) return <div className="empty-state">Chargement…</div>;
  if (error || !data) return <div className="empty-state"><h3>Impossible de charger le tableau de bord</h3><p>{error}</p></div>;

  const v = data.recouvre.variationPct;

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      {/* Hero — recouvré ce mois */}
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'flex-end',
          justifyContent: 'space-between',
          gap: 18,
          padding: '22px 24px',
          borderRadius: 16,
          border: '1px solid var(--line)',
          borderLeft: '3px solid var(--accent)',
          background: 'linear-gradient(180deg, var(--surface, #fff) 0%, var(--accent-soft) 140%)',
        }}
      >
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 11.5, fontWeight: 700, letterSpacing: '.08em', textTransform: 'uppercase', color: 'var(--accent-dark)', display: 'flex', alignItems: 'center', gap: 7 }}>
            <Wallet size={15} /> Recouvré en {data.moisLabel}
          </div>
          <div className="currency" style={{ fontFamily: 'var(--font-mono)', fontSize: 38, fontWeight: 700, letterSpacing: '-.02em', lineHeight: 1.05, margin: '8px 0 2px' }}>
            {fmtFCFA(data.recouvre.montant)}
          </div>
          <div style={{ fontSize: 13, color: 'var(--ink-soft)' }}>
            {data.recouvre.nombre} facture{data.recouvre.nombre > 1 ? 's' : ''} réglée{data.recouvre.nombre > 1 ? 's' : ''}
          </div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <Tendance pct={v} />
          <div style={{ fontSize: 11.5, color: 'var(--ink-soft)', marginTop: 6 }}>
            vs {fmtFCFAcompact(data.recouvre.montantMoisPrec)} FCFA le mois dernier
          </div>
        </div>
      </div>

      {/* KPI tiles */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12 }}>
        <Tile
          icon={<Clock size={15} />}
          label="Délai d'encaissement"
          value={data.dso.valeur !== null ? `${Math.round(data.dso.valeur)} j` : '—'}
          sub={
            data.dso.gainJours !== null && data.dso.gainJours !== 0 ? (
              <span style={{ color: data.dso.gainJours > 0 ? 'var(--success)' : 'var(--danger)', fontWeight: 600 }}>
                {data.dso.gainJours > 0 ? <><TrendingDown size={12} style={{ verticalAlign: '-1px' }} /> {data.dso.gainJours} j gagnés</> : `+${Math.abs(data.dso.gainJours)} j`} vs mois dernier
              </span>
            ) : (
              'stable vs mois dernier'
            )
          }
        />
        <Tile
          icon={<Wallet size={15} />}
          label="Encours échu (en retard)"
          value={`${fmtFCFAcompact(data.encoursRetard.montant)} FCFA`}
          sub={`${data.encoursRetard.nombre} facture${data.encoursRetard.nombre > 1 ? 's' : ''} déjà échue${data.encoursRetard.nombre > 1 ? 's' : ''} — hors « à échoir »`}
          tone={data.encoursRetard.montant > 0 ? 'amber' : 'success'}
        />
        <Tile
          icon={<BarChart3 size={15} />}
          label="Taux de recouvrement"
          value={data.tauxRecouvrement !== null ? `${data.tauxRecouvrement} %` : '—'}
          sub="du montant échu ce mois"
        />
      </div>

      {/* Feyma au travail */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 14,
          padding: '14px 18px',
          borderRadius: 12,
          border: '1px solid var(--line)',
          background: 'var(--surface, #fff)',
        }}
      >
        <div style={{ flex: 'none', width: 40, height: 40, borderRadius: 10, background: 'var(--accent)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Send size={18} />
        </div>
        <div style={{ fontSize: 13.5, lineHeight: 1.5 }}>
          Feyma a envoyé <b>{data.relancesEnvoyees.ceMois}</b> relance{data.relancesEnvoyees.ceMois > 1 ? 's' : ''} ce mois-ci
          {data.relancesEnvoyees.total > data.relancesEnvoyees.ceMois && (
            <span style={{ color: 'var(--ink-soft)' }}> — {data.relancesEnvoyees.total} depuis le début</span>
          )}
          .{' '}
          <span style={{ color: 'var(--ink-soft)' }}>Autant de rappels que vous n'avez pas eu à écrire.</span>
        </div>
      </div>

      {/* Évolution 6 mois */}
      {data.evolution.length > 0 && (
        <div style={{ padding: '18px 20px', borderRadius: 14, border: '1px solid var(--line)', background: 'var(--surface, #fff)' }}>
          <div style={{ fontSize: 11.5, fontWeight: 700, letterSpacing: '.06em', textTransform: 'uppercase', color: 'var(--ink-soft)', marginBottom: 14 }}>
            Encaissements des 6 derniers mois
          </div>
          <MiniBars data={data.evolution} />
        </div>
      )}

      {onVoirReporting && (
        <div>
          <button onClick={onVoirReporting} style={{ fontSize: 13 }}>Voir le reporting détaillé →</button>
        </div>
      )}
    </div>
  );
}

function Tendance({ pct }: { pct: number | null }) {
  if (pct === null) {
    return <span style={{ fontSize: 12.5, color: 'var(--ink-soft)' }}>Pas de comparaison</span>;
  }
  const positif = pct >= 0;
  const color = positif ? 'var(--success)' : 'var(--danger)';
  const Icon = pct === 0 ? Minus : positif ? ArrowUpRight : ArrowDownRight;
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 5,
        padding: '5px 11px',
        borderRadius: 20,
        background: positif ? 'var(--success-soft)' : 'var(--danger-soft)',
        color,
        fontWeight: 700,
        fontSize: 14,
      }}
    >
      <Icon size={15} /> {positif ? '+' : ''}{pct} %
    </span>
  );
}

function Tile({ icon, label, value, sub, tone }: { icon: ReactNode; label: string; value: string; sub: ReactNode; tone?: 'amber' | 'success' }) {
  return (
    <div style={{ padding: '15px 16px', borderRadius: 12, border: '1px solid var(--line)', background: 'var(--surface, #fff)' }}>
      <div style={{ fontSize: 10.5, fontFamily: 'var(--font-mono)', textTransform: 'uppercase', letterSpacing: '.06em', color: 'var(--ink-soft)', display: 'flex', alignItems: 'center', gap: 6, marginBottom: 9 }}>
        {icon} {label}
      </div>
      <div className="currency" style={{ fontFamily: 'var(--font-mono)', fontSize: 23, fontWeight: 600, letterSpacing: '-.01em', color: tone === 'amber' ? 'var(--amber)' : 'var(--ink)' }}>
        {value}
      </div>
      <div style={{ fontSize: 11.5, color: 'var(--ink-soft)', marginTop: 4 }}>{sub}</div>
    </div>
  );
}

// Mini histogramme des encaissements par mois — barres émeraude, mois courant
// mis en avant. Une seule teinte (magnitude), ligne de base commune.
function MiniBars({ data }: { data: { mois: string; montant: number }[] }) {
  const max = Math.max(1, ...data.map((d) => d.montant));
  const moisCourt = (m: string) => {
    const [, mm] = m.split('-');
    return ['jan', 'fév', 'mar', 'avr', 'mai', 'juin', 'juil', 'aoû', 'sep', 'oct', 'nov', 'déc'][Number(mm) - 1] ?? m;
  };
  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', gap: 10, height: 130 }}>
      {data.map((d, i) => {
        const h = Math.max(3, Math.round((d.montant / max) * 100));
        const dernier = i === data.length - 1;
        return (
          <div key={d.mois} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, height: '100%', justifyContent: 'flex-end' }}>
            <div style={{ fontSize: 10.5, color: 'var(--ink-soft)', fontFamily: 'var(--font-mono)', whiteSpace: 'nowrap' }}>
              {fmtFCFAcompact(d.montant)}
            </div>
            <div
              title={`${moisCourt(d.mois)} : ${fmtFCFA(d.montant)}`}
              style={{
                width: '100%',
                maxWidth: 46,
                height: `${h}%`,
                borderRadius: '5px 5px 0 0',
                background: dernier ? 'var(--accent)' : 'var(--mint, #4BD0A0)',
                opacity: dernier ? 1 : 0.55,
                transition: 'height .3s ease',
              }}
            />
            <div style={{ fontSize: 11, color: dernier ? 'var(--ink)' : 'var(--ink-soft)', fontWeight: dernier ? 700 : 500 }}>
              {moisCourt(d.mois)}
            </div>
          </div>
        );
      })}
    </div>
  );
}

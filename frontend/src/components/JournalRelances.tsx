import { useState } from 'react';
import { useResource } from '../hooks/useResource';
import { PALIERS } from '../lib/constants';

// Journal des relances (historique des envois/actions) — filtrable par période
// (jour / semaine / mois) et par palier, avec un récap en tête. Lecture seule.
interface JournalItem {
  id: string;
  date: string;
  clientNom: string;
  palier: number;
  palierLabel: string;
  note: string | null;
}
interface RecapItem {
  palier: number;
  palierLabel: string;
  count: number;
}
interface JournalResponse {
  periode: string;
  total: number;
  recap: RecapItem[];
  items: JournalItem[];
}

const PERIODES = [
  { v: 'jour', l: 'Jour' },
  { v: 'semaine', l: 'Semaine' },
  { v: 'mois', l: 'Mois' },
];

const fmtDateHeure = (iso: string) =>
  new Date(iso).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });

export function JournalRelances() {
  const [periode, setPeriode] = useState('semaine');
  const [palier, setPalier] = useState('');
  const path = `/api/relances/journal?periode=${periode}${palier ? `&palier=${palier}` : ''}`;
  const { data, loading } = useResource<JournalResponse>(path);

  return (
    <div>
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', margin: '4px 0 14px' }}>
        <div style={{ display: 'inline-flex', border: '1px solid var(--line)', borderRadius: 999, overflow: 'hidden' }}>
          {PERIODES.map((p) => (
            <button
              key={p.v}
              type="button"
              onClick={() => setPeriode(p.v)}
              style={{
                border: 'none',
                cursor: 'pointer',
                padding: '6px 14px',
                fontSize: 12.5,
                fontWeight: 600,
                background: periode === p.v ? 'var(--accent, #177f5e)' : 'transparent',
                color: periode === p.v ? '#fff' : 'var(--ink)',
              }}
            >
              {p.l}
            </button>
          ))}
        </div>
        <select value={palier} onChange={(e) => setPalier(e.target.value)} style={{ width: 'auto' }}>
          <option value="">Tous les paliers</option>
          {PALIERS.map((p, i) => (p ? <option key={i} value={i}>{p.label}</option> : null))}
        </select>
      </div>

      {loading || !data ? (
        <div className="empty-state">Chargement…</div>
      ) : data.total === 0 ? (
        <div className="empty-state">
          <h3>Aucun envoi sur la période</h3>
          <p>Aucune relance enregistrée pour ce filtre. Élargissez la période ou activez l’envoi automatique.</p>
        </div>
      ) : (
        <>
          <div className="rv-summary" style={{ flexWrap: 'wrap' }}>
            <b>{data.total}</b> envoi{data.total > 1 ? 's' : ''} sur la période
            {data.recap.map((r) => (
              <span key={r.palier} className="badge" data-tone={PALIERS[r.palier]?.tone ?? 'amber'} style={{ marginLeft: 8 }}>
                {r.palierLabel} · {r.count}
              </span>
            ))}
          </div>
          <table>
            <thead>
              <tr>
                <th>Date</th>
                <th>Client</th>
                <th>Palier</th>
                <th>Détail</th>
              </tr>
            </thead>
            <tbody>
              {data.items.map((it) => (
                <tr key={it.id}>
                  <td className="mono" style={{ whiteSpace: 'nowrap' }}>{fmtDateHeure(it.date)}</td>
                  <td>{it.clientNom}</td>
                  <td>
                    <span className="badge" data-tone={PALIERS[it.palier]?.tone ?? 'amber'}>
                      {it.palierLabel}
                    </span>
                  </td>
                  <td style={{ color: 'var(--ink-soft)', fontSize: 12.5 }}>{it.note ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </div>
  );
}

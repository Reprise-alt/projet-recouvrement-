import { useState } from 'react';
import { api, ApiError, buildQuery, downloadFile } from '../api/client';
import { useResource } from '../hooks/useResource';
import { Entite, ReportingSummary } from '../api/types';
import { fmtDate, fmtFCFA, PALIERS } from '../lib/constants';

interface Props {
  entityFilter: Entite | 'ALL';
}

function firstDayOfMonth(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

export function ReportingView({ entityFilter }: Props) {
  const [from, setFrom] = useState(firstDayOfMonth());
  const [to, setTo] = useState(today());
  const [busy, setBusy] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);

  const query = { from, to, entite: entityFilter };
  const summaryPath = `/api/reporting/summary${buildQuery(query)}`;
  const { data: summary, loading, error } = useResource<ReportingSummary>(from && to ? summaryPath : null);

  async function handleExport(kind: 'xlsx' | 'pdf') {
    setBusy(true);
    setExportError(null);
    try {
      await downloadFile(`/api/reporting/export.${kind}${buildQuery(query)}`, `reporting_${from}_${to}.${kind}`);
    } catch (err) {
      setExportError(err instanceof ApiError ? err.message : "Échec de l'export");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <div className="table-card" style={{ padding: '18px 22px', marginBottom: 24 }}>
        <div style={{ display: 'flex', gap: 16, alignItems: 'flex-end', flexWrap: 'wrap' }}>
          <div>
            <label>Du</label>
            <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          </div>
          <div>
            <label>Au</label>
            <input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="primary" disabled={busy} onClick={() => handleExport('xlsx')}>
              Exporter en Excel
            </button>
            <button disabled={busy} onClick={() => handleExport('pdf')}>
              Exporter en PDF
            </button>
          </div>
        </div>
        {exportError && <div className="login-error" style={{ marginTop: 12 }}>{exportError}</div>}
      </div>

      {loading ? (
        <div className="empty-state">Chargement…</div>
      ) : error ? (
        <div className="empty-state">
          <h3>Erreur</h3>
          <p>{error}</p>
        </div>
      ) : !summary ? null : (
        <>
          <div className="kpis" style={{ marginBottom: 24 }}>
            <div className="kpi">
              <div className="kpi-label">Factures payées</div>
              <div className="kpi-value success">{summary.facturesPayees.nombre}</div>
            </div>
            <div className="kpi">
              <div className="kpi-label">Montant encaissé</div>
              <div className="kpi-value">{fmtFCFA(summary.facturesPayees.montantTotal)}</div>
            </div>
            <div className="kpi">
              <div className="kpi-label">Délai moyen d'encaissement (pondéré)</div>
              <div className="kpi-value">
                {summary.delaiEncaissement.global !== null ? `${Math.round(summary.delaiEncaissement.global)} j` : '—'}
              </div>
            </div>
          </div>

          {summary.delaiEncaissement.parEntite.length > 1 && (
            <div className="table-card" style={{ marginBottom: 24 }}>
              <div className="table-head">
                <div style={{ fontWeight: 600, fontSize: 14 }}>Délai d'encaissement par entité</div>
              </div>
              <table>
                <thead>
                  <tr>
                    <th>Entité</th>
                    <th>Délai moyen pondéré</th>
                    <th>Montant encaissé</th>
                    <th>Nb factures</th>
                  </tr>
                </thead>
                <tbody>
                  {summary.delaiEncaissement.parEntite.map((r) => (
                    <tr key={r.entite}>
                      <td>{r.entite}</td>
                      <td className="mono">{r.delaiJours !== null ? `${Math.round(r.delaiJours)} j` : '—'}</td>
                      <td className="mono">{fmtFCFA(r.montantTotal)}</td>
                      <td className="mono">{r.nombre}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <div className="table-card" style={{ marginBottom: 24 }}>
            <div className="table-head">
              <div style={{ fontWeight: 600, fontSize: 14 }}>Évolution du délai d'encaissement (6 derniers mois)</div>
            </div>
            <table>
              <thead>
                <tr>
                  <th>Mois</th>
                  <th>Délai moyen pondéré</th>
                  <th>Montant encaissé</th>
                  <th>Nb factures</th>
                </tr>
              </thead>
              <tbody>
                {(() => {
                  const maxDelai = Math.max(1, ...summary.evolutionMensuelle.map((r) => r.delaiJours ?? 0));
                  return summary.evolutionMensuelle.map((r) => (
                    <tr key={r.mois}>
                      <td className="mono">{r.mois}</td>
                      <td>
                        {r.delaiJours !== null ? (
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <div style={{ width: 100, height: 8, borderRadius: 4, background: 'var(--paper-2)', overflow: 'hidden' }}>
                              <div style={{ width: `${(r.delaiJours / maxDelai) * 100}%`, height: '100%', background: 'var(--accent)' }} />
                            </div>
                            <span className="mono">{Math.round(r.delaiJours)} j</span>
                          </div>
                        ) : (
                          <span style={{ color: 'var(--ink-soft)' }}>—</span>
                        )}
                      </td>
                      <td className="mono">{fmtFCFA(r.montantTotal)}</td>
                      <td className="mono">{r.nombre}</td>
                    </tr>
                  ));
                })()}
              </tbody>
            </table>
          </div>

          <div className="table-card">
            <div className="table-head">
              <div style={{ fontWeight: 600, fontSize: 14 }}>
                Relances effectuées — {fmtDate(from)} au {fmtDate(to)}
              </div>
            </div>
            <table>
              <thead>
                <tr>
                  <th>Palier</th>
                  <th>Nombre de relances effectuées</th>
                </tr>
              </thead>
              <tbody>
                {summary.relances.map((r) => {
                  const pal = PALIERS[r.palier];
                  return (
                    <tr key={r.palier}>
                      <td>
                        <span className="badge" data-tone={pal?.tone ?? 'success'}>
                          {r.label}
                        </span>
                      </td>
                      <td className="mono">{r.nombre}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}

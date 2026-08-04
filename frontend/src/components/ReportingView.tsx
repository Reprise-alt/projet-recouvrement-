import { useState } from 'react';
import { api, ApiError, buildQuery, downloadFile } from '../api/client';
import { useResource } from '../hooks/useResource';
import { AgentStat, Entite, RelanceDetail, ReportingSummary, RoleUtilisateur } from '../api/types';
import { fmtDate, fmtFCFA, PALIERS } from '../lib/constants';

interface Props {
  entityFilter: Entite | 'ALL';
  role: RoleUtilisateur;
}

function firstDayOfMonth(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

function moisCourt(key: string): string {
  const [y, m] = key.split('-').map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString('fr-FR', { month: 'short' }).replace('.', '');
}

function fmtDelta(delta: number): string {
  if (delta === 0) return '±0 j';
  return `${delta > 0 ? '+' : '−'}${Math.abs(delta)} j`;
}

export function ReportingView({ entityFilter, role }: Props) {
  const [from, setFrom] = useState(firstDayOfMonth());
  const [to, setTo] = useState(today());
  const [busy, setBusy] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const [selectedPalier, setSelectedPalier] = useState<number | null>(null);

  const query = { from, to, entite: entityFilter };
  const summaryPath = `/api/reporting/summary${buildQuery(query)}`;
  const { data: summary, loading, error } = useResource<ReportingSummary>(from && to ? summaryPath : null);

  const relancesPath = selectedPalier !== null ? `/api/reporting/relances${buildQuery({ ...query, palier: selectedPalier })}` : null;
  const { data: relanceDetails, loading: loadingRelances } = useResource<RelanceDetail[]>(relancesPath);

  const canSeeAgents = role === 'admin' || role === 'manager_entite';
  const agentsPath = canSeeAgents && from && to ? `/api/reporting/agents${buildQuery(query)}` : null;
  const { data: agentStats, loading: loadingAgents } = useResource<AgentStat[]>(agentsPath);

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
          {(() => {
            // Écarts mois civil / mois civil précédent (indépendants de la période
            // Du/Au choisie ci-dessus) — pour voir si le délai s'améliore ou se
            // dégrade, plutôt qu'une simple valeur brute.
            const evo = summary.evolutionMensuelle;
            const pairs = evo.slice(1).map((cur, i) => {
              const prev = evo[i];
              const delta = cur.delaiJours !== null && prev.delaiJours !== null ? Math.round(cur.delaiJours - prev.delaiJours) : null;
              return { from: prev.mois, to: cur.mois, delta };
            });
            const lastPair = pairs.length ? pairs[pairs.length - 1] : null;
            const history = pairs.slice(0, -1);

            return (
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
                <div className="kpi">
                  <div className="kpi-label">Tendance du délai (mois civil)</div>
                  <div
                    className="kpi-value"
                    style={lastPair?.delta ? { color: lastPair.delta < 0 ? 'var(--success)' : 'var(--danger)' } : undefined}
                  >
                    {lastPair?.delta === null || lastPair === null ? '—' : fmtDelta(lastPair.delta)}
                  </div>
                  <div className="kpi-sub">{lastPair ? `${moisCourt(lastPair.from)} → ${moisCourt(lastPair.to)}` : 'Pas assez de données'}</div>
                  {history.length > 0 && (
                    <div style={{ display: 'flex', gap: 9, flexWrap: 'wrap', marginTop: 9 }}>
                      {history.map((p) => (
                        <span key={p.to} className="mono" style={{ fontSize: 10.5, color: 'var(--ink-soft)' }}>
                          {moisCourt(p.from)}→{moisCourt(p.to)} {p.delta === null ? '—' : fmtDelta(p.delta)}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            );
          })()}

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
                    <tr key={r.palier} className={r.nombre > 0 ? 'row-hover' : ''} onClick={() => r.nombre > 0 && setSelectedPalier(r.palier)}>
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

          {canSeeAgents && (
            <div className="table-card" style={{ marginTop: 24 }}>
              <div className="table-head">
                <div>
                  <div style={{ fontWeight: 600, fontSize: 14 }}>
                    Performance par agent — {fmtDate(from)} au {fmtDate(to)}
                  </div>
                  <div style={{ fontSize: 11.5, color: 'var(--ink-soft)', marginTop: 3 }}>
                    Relances effectuées uniquement (paiements, corrections et suppressions de facture exclus).
                  </div>
                </div>
              </div>
              {loadingAgents ? (
                <div className="empty-state">Chargement…</div>
              ) : !agentStats || agentStats.length === 0 ? (
                <div className="empty-state">
                  <h3>Aucune relance attribuée sur cette période</h3>
                  <p>Les relances envoyées avant l'ajout de ce suivi n'ont pas d'agent enregistré.</p>
                </div>
              ) : (
                <table>
                  <thead>
                    <tr>
                      <th>Agent</th>
                      <th>Relances effectuées</th>
                      <th title="Jours entre une relance de l'agent et le paiement suivant du client — une corrélation, pas une preuve de cause.">
                        Délai moyen après intervention
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {agentStats.map((a) => (
                      <tr key={a.utilisateurId}>
                        <td>{a.nom}</td>
                        <td className="mono">{a.actions}</td>
                        <td className="mono">
                          {a.delaiMoyenApresIntervention !== null ? (
                            <>
                              {a.delaiMoyenApresIntervention} j{' '}
                              <span style={{ color: 'var(--ink-soft)', fontSize: 11 }}>(sur {a.nombreDelaisMesures})</span>
                            </>
                          ) : (
                            <span style={{ color: 'var(--ink-soft)' }}>—</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )}
        </>
      )}

      {selectedPalier !== null && (
        <div className="modal-overlay open" onClick={(e) => e.target === e.currentTarget && setSelectedPalier(null)}>
          <div className="modal" style={{ width: 'min(560px, 92%)' }}>
            <h2 style={{ marginBottom: 4 }}>
              {PALIERS[selectedPalier]?.label} — {fmtDate(from)} au {fmtDate(to)}
            </h2>
            <div style={{ color: 'var(--ink-soft)', fontSize: 12.5, marginBottom: 16 }}>Relances enregistrées sur la période.</div>

            {loadingRelances || !relanceDetails ? (
              <div>Chargement…</div>
            ) : relanceDetails.length === 0 ? (
              <div style={{ color: 'var(--ink-soft)', fontSize: 13 }}>Aucune relance enregistrée sur cette période.</div>
            ) : (
              <div style={{ maxHeight: 400, overflowY: 'auto' }}>
                {relanceDetails.map((r) => (
                  <div className="card-mini" key={r.id}>
                    <div className="row">
                      <strong>{r.clientNom}</strong>
                      <span style={{ fontSize: 12, color: 'var(--ink-soft)' }}>{fmtDate(r.date)}</span>
                    </div>
                    {r.note && <div style={{ fontSize: 12.5, color: 'var(--ink-soft)', marginTop: 4 }}>{r.note}</div>}
                  </div>
                ))}
              </div>
            )}

            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 16 }}>
              <button onClick={() => setSelectedPalier(null)}>Fermer</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

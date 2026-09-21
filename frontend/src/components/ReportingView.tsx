import { useEffect, useState } from 'react';
import { api, ApiError, buildQuery, downloadFilePost } from '../api/client';
import { useResource } from '../hooks/useResource';
import { AgentStat, AnalyseResult, ComparaisonResult, Entite, RelanceDetail, ReportingSummary, RoleUtilisateur } from '../api/types';
import { fmtDate, fmtFCFA, PALIERS } from '../lib/constants';
import { usePaliersConfig } from '../lib/paliersConfig';
import { IS_SAAS } from '../auth/mode';

// Données de pilotage mono-société (balance âgée, top débiteurs, conversion,
// taux de recouvrement) — cf. GET /api/reporting/pilotage.
interface TrancheAge {
  cle: 'a_echoir' | 'j0_30' | 'j31_60' | 'j61_90' | 'j90_plus';
  label: string;
  montant: number;
  nombre: number;
}
interface TopDebiteur {
  nom: string;
  encours: number;
  joursRetard: number;
  palier: number;
  dernierPalierLabel: string | null;
  derniereRelance: string | null;
}
interface ConversionPalier {
  palier: number;
  label: string;
  relances: number;
  converties: number;
  taux: number | null;
}
interface PilotageData {
  balanceAgee: TrancheAge[];
  topDebiteurs: TopDebiteur[];
  recouvrement: { montantEchu: number; montantPaye: number; taux: number | null };
  conversion: ConversionPalier[];
}

// Couleurs séquentielles de la balance âgée (du sain vers le critique).
const AGE_COLORS: Record<TrancheAge['cle'], string> = {
  a_echoir: 'var(--ink-soft)',
  j0_30: '#0E7C5A',
  j31_60: '#4BD0A0',
  j61_90: 'var(--amber, #B0700F)',
  j90_plus: 'var(--danger, #C0392B)',
};

type CategorieAnalyse = 'pointsForts' | 'actionsPositives' | 'pointsVigilance' | 'axesAmelioration' | 'recommandations';

const ANALYSE_SECTIONS: { key: CategorieAnalyse; titre: string; tone: 'success' | 'amber' | 'neutre' }[] = [
  { key: 'pointsForts', titre: 'Points forts', tone: 'success' },
  { key: 'actionsPositives', titre: 'Actions positives', tone: 'success' },
  { key: 'pointsVigilance', titre: 'Points de vigilance', tone: 'amber' },
  { key: 'axesAmelioration', titre: "Axes d'amélioration", tone: 'neutre' },
  { key: 'recommandations', titre: 'Recommandation', tone: 'neutre' },
];

const TONE_STYLE: Record<'success' | 'amber' | 'neutre', { bg: string; fg: string }> = {
  success: { bg: 'var(--success-soft)', fg: 'var(--success)' },
  amber: { bg: 'var(--amber-soft)', fg: 'var(--amber)' },
  neutre: { bg: 'var(--paper-2)', fg: 'var(--ink-soft)' },
};

function AnalyseSection({
  titre,
  tone,
  items,
  onChange,
}: {
  titre: string;
  tone: 'success' | 'amber' | 'neutre';
  items: string[];
  onChange: (items: string[]) => void;
}) {
  const style = TONE_STYLE[tone];
  return (
    <div style={{ marginBottom: 14 }}>
      <div
        style={{
          display: 'inline-block',
          background: style.bg,
          color: style.fg,
          fontWeight: 600,
          fontSize: 12.5,
          padding: '4px 12px',
          borderRadius: 6,
          marginBottom: 8,
        }}
      >
        {titre}
      </div>
      {items.length === 0 && <div style={{ fontSize: 12, color: 'var(--ink-soft)', marginBottom: 6 }}>Aucun point — ajoutez-en un si besoin.</div>}
      {items.map((item, i) => (
        <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'flex-start', marginBottom: 6 }}>
          <textarea
            value={item}
            rows={2}
            style={{ flex: 1, fontSize: 12.5, resize: 'vertical' }}
            onChange={(e) => {
              const next = [...items];
              next[i] = e.target.value;
              onChange(next);
            }}
          />
          <button
            type="button"
            className="danger-btn"
            style={{ padding: '3px 9px', fontSize: 11 }}
            onClick={() => onChange(items.filter((_, j) => j !== i))}
          >
            Retirer
          </button>
        </div>
      ))}
      <button type="button" style={{ padding: '3px 10px', fontSize: 11.5 }} onClick={() => onChange([...items, ''])}>
        + Ajouter un point
      </button>
    </div>
  );
}

function firstDayOfPrevMonth(): string {
  const d = new Date();
  d.setDate(1);
  d.setMonth(d.getMonth() - 1);
  return d.toISOString().slice(0, 10);
}

function lastDayOfPrevMonth(): string {
  const d = new Date();
  d.setDate(0);
  return d.toISOString().slice(0, 10);
}

function fmtDeltaMontant(delta: number): string {
  if (delta === 0) return '±0 FCFA';
  return `${delta > 0 ? '+' : '−'}${fmtFCFA(Math.abs(delta))}`;
}

function fmtDeltaNombre(delta: number): string {
  if (delta === 0) return '±0';
  return `${delta > 0 ? '+' : '−'}${Math.abs(delta)}`;
}

function fmtDeltaPourcent(pourcent: number | null): string {
  if (pourcent === null) return '';
  return ` (${pourcent > 0 ? '+' : ''}${pourcent} %)`;
}

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
  const { libelle } = usePaliersConfig();
  const [from, setFrom] = useState(firstDayOfMonth());
  const [to, setTo] = useState(today());
  const [busy, setBusy] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const [selectedPalier, setSelectedPalier] = useState<number | null>(null);

  const query = { from, to, entite: entityFilter };
  const summaryPath = `/api/reporting/summary${buildQuery(query)}`;
  const { data: summary, loading, error } = useResource<ReportingSummary>(from && to ? summaryPath : null);

  const pilotagePath = from && to ? `/api/reporting/pilotage${buildQuery(query)}` : null;
  const { data: pilotage } = useResource<PilotageData>(pilotagePath);

  const relancesPath = selectedPalier !== null ? `/api/reporting/relances${buildQuery({ ...query, palier: selectedPalier })}` : null;
  const { data: relanceDetails, loading: loadingRelances } = useResource<RelanceDetail[]>(relancesPath);

  const canSeeAgents = role === 'admin' || role === 'manager_entite';
  const agentsPath = canSeeAgents && from && to ? `/api/reporting/agents${buildQuery(query)}` : null;
  const { data: agentStats, loading: loadingAgents } = useResource<AgentStat[]>(agentsPath);

  // Suggestions générées par des règles côté serveur (cf. lib/analyse.ts),
  // rechargées à chaque changement de période/entité puis laissées éditables
  // en local — l'utilisateur peut corriger ou compléter avant export, jamais
  // contraint au texte auto-généré.
  const analysePath = canSeeAgents && from && to ? `/api/reporting/analyse${buildQuery(query)}` : null;
  const { data: analyseData, loading: loadingAnalyse } = useResource<AnalyseResult>(analysePath);
  const [analyseEdit, setAnalyseEdit] = useState<AnalyseResult | null>(null);
  useEffect(() => {
    setAnalyseEdit(analyseData);
  }, [analyseData]);

  const [showComparaison, setShowComparaison] = useState(false);
  const [fromA, setFromA] = useState(firstDayOfPrevMonth());
  const [toA, setToA] = useState(lastDayOfPrevMonth());
  const [fromB, setFromB] = useState(firstDayOfMonth());
  const [toB, setToB] = useState(today());
  const comparaisonPath =
    showComparaison && canSeeAgents && fromA && toA && fromB && toB
      ? `/api/reporting/comparaison${buildQuery({ fromA, toA, fromB, toB, entite: entityFilter })}`
      : null;
  const { data: comparaison, loading: loadingComparaison, error: comparaisonError } = useResource<ComparaisonResult>(comparaisonPath);

  async function handleExport(kind: 'xlsx' | 'pdf') {
    setBusy(true);
    setExportError(null);
    try {
      await downloadFilePost(`/api/reporting/export.${kind}`, `reporting_${from}_${to}.${kind}`, {
        from,
        to,
        entite: entityFilter,
        analyse: analyseEdit ?? undefined,
      });
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

      {IS_SAAS && <ReportingEmailAuto canEdit={role === 'admin'} />}

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
                  <div className="kpi-value currency">{fmtFCFA(summary.facturesPayees.montantTotal)}</div>
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

          {canSeeAgents && (
            <div className="table-card" style={{ marginBottom: 24, padding: '18px 22px' }}>
              <div style={{ marginBottom: 4 }}>
                <div style={{ fontWeight: 600, fontSize: 14 }}>
                  Analyse du mois — {fmtDate(from)} au {fmtDate(to)}
                </div>
                <div style={{ fontSize: 11.5, color: 'var(--ink-soft)', marginTop: 3, marginBottom: 14 }}>
                  Suggestions générées automatiquement à partir des chiffres de la période — corrigez ou complétez librement,
                  le texte ci-dessous sera repris tel quel dans les exports PDF et Excel.
                </div>
              </div>
              {loadingAnalyse ? (
                <div className="empty-state">Chargement…</div>
              ) : !analyseEdit ? null : (
                <div>
                  {ANALYSE_SECTIONS.map((s) => (
                    <AnalyseSection
                      key={s.key}
                      titre={s.titre}
                      tone={s.tone}
                      items={analyseEdit[s.key]}
                      onChange={(items) => setAnalyseEdit({ ...analyseEdit, [s.key]: items })}
                    />
                  ))}
                </div>
              )}
            </div>
          )}

          {canSeeAgents && (
            <div className="table-card" style={{ marginBottom: 24, padding: '18px 22px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ fontWeight: 600, fontSize: 14 }}>Comparaison de périodes</div>
                <button type="button" style={{ padding: '4px 12px', fontSize: 12 }} onClick={() => setShowComparaison((v) => !v)}>
                  {showComparaison ? 'Masquer' : 'Comparer deux périodes'}
                </button>
              </div>
              {showComparaison && (
                <div style={{ marginTop: 16 }}>
                  <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap', marginBottom: 16 }}>
                    <div>
                      <div style={{ fontSize: 11.5, fontWeight: 600, color: 'var(--ink-soft)', marginBottom: 6 }}>Période A</div>
                      <div style={{ display: 'flex', gap: 10 }}>
                        <div>
                          <label>Du</label>
                          <input type="date" value={fromA} onChange={(e) => setFromA(e.target.value)} />
                        </div>
                        <div>
                          <label>Au</label>
                          <input type="date" value={toA} onChange={(e) => setToA(e.target.value)} />
                        </div>
                      </div>
                    </div>
                    <div>
                      <div style={{ fontSize: 11.5, fontWeight: 600, color: 'var(--ink-soft)', marginBottom: 6 }}>Période B</div>
                      <div style={{ display: 'flex', gap: 10 }}>
                        <div>
                          <label>Du</label>
                          <input type="date" value={fromB} onChange={(e) => setFromB(e.target.value)} />
                        </div>
                        <div>
                          <label>Au</label>
                          <input type="date" value={toB} onChange={(e) => setToB(e.target.value)} />
                        </div>
                      </div>
                    </div>
                  </div>

                  {loadingComparaison ? (
                    <div className="empty-state">Chargement…</div>
                  ) : comparaisonError ? (
                    <div className="login-error">{comparaisonError}</div>
                  ) : comparaison ? (
                    <table>
                      <thead>
                        <tr>
                          <th>Indicateur</th>
                          <th>{comparaison.periodeA.label}</th>
                          <th>{comparaison.periodeB.label}</th>
                          <th>Écart</th>
                        </tr>
                      </thead>
                      <tbody>
                        <tr>
                          <td>Montant encaissé</td>
                          <td className="mono">{fmtFCFA(comparaison.periodeA.summary.facturesPayees.montantTotal)}</td>
                          <td className="mono">{fmtFCFA(comparaison.periodeB.summary.facturesPayees.montantTotal)}</td>
                          <td
                            className="mono"
                            style={{ color: comparaison.deltas.montantEncaisse.absolu >= 0 ? 'var(--success)' : 'var(--danger)' }}
                          >
                            {fmtDeltaMontant(comparaison.deltas.montantEncaisse.absolu)}
                            {fmtDeltaPourcent(comparaison.deltas.montantEncaisse.pourcent)}
                          </td>
                        </tr>
                        <tr>
                          <td>Factures payées</td>
                          <td className="mono">{comparaison.periodeA.summary.facturesPayees.nombre}</td>
                          <td className="mono">{comparaison.periodeB.summary.facturesPayees.nombre}</td>
                          <td
                            className="mono"
                            style={{ color: comparaison.deltas.facturesPayees.absolu >= 0 ? 'var(--success)' : 'var(--danger)' }}
                          >
                            {fmtDeltaNombre(comparaison.deltas.facturesPayees.absolu)}
                            {fmtDeltaPourcent(comparaison.deltas.facturesPayees.pourcent)}
                          </td>
                        </tr>
                        <tr>
                          <td>Délai moyen d'encaissement</td>
                          <td className="mono">
                            {comparaison.periodeA.summary.delaiEncaissement.global !== null
                              ? `${Math.round(comparaison.periodeA.summary.delaiEncaissement.global)} j`
                              : '—'}
                          </td>
                          <td className="mono">
                            {comparaison.periodeB.summary.delaiEncaissement.global !== null
                              ? `${Math.round(comparaison.periodeB.summary.delaiEncaissement.global)} j`
                              : '—'}
                          </td>
                          <td
                            className="mono"
                            style={
                              comparaison.deltas.delaiMoyen
                                ? { color: comparaison.deltas.delaiMoyen.absolu <= 0 ? 'var(--success)' : 'var(--danger)' }
                                : undefined
                            }
                          >
                            {comparaison.deltas.delaiMoyen ? fmtDelta(Math.round(comparaison.deltas.delaiMoyen.absolu)) : '—'}
                          </td>
                        </tr>
                        <tr>
                          <td>Relances effectuées</td>
                          <td className="mono">{comparaison.periodeA.relancesTotal}</td>
                          <td className="mono">{comparaison.periodeB.relancesTotal}</td>
                          <td
                            className="mono"
                            style={{ color: comparaison.deltas.relancesTotal.absolu >= 0 ? 'var(--success)' : 'var(--danger)' }}
                          >
                            {fmtDeltaNombre(comparaison.deltas.relancesTotal.absolu)}
                            {fmtDeltaPourcent(comparaison.deltas.relancesTotal.pourcent)}
                          </td>
                        </tr>
                      </tbody>
                    </table>
                  ) : null}
                </div>
              )}
            </div>
          )}

          {/* Pilotage mono-société : balance âgée, conversion, top débiteurs. */}
          {pilotage && <PilotageSections pilotage={pilotage} libelle={libelle} />}

          {/* « Par entité » = héritage de la console groupe : masqué en SaaS
              (un client Feyma est une seule société). */}
          {!IS_SAAS && summary.delaiEncaissement.parEntite.length > 1 && (
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
                          {libelle(r.palier)}
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
                    Relances effectuées uniquement (paiements, corrections et suppressions de facture exclus) — seuls les
                    comptes marqués « Agent de recouvrement » apparaissent ici (voir Utilisateurs).
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
                      <th title="Montant des factures payées sur la période, créditées à l'agent du dernier contact avant le paiement — une convention d'attribution, pas une preuve de cause.">
                        Montant recouvré
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
                        <td className="mono">
                          {a.montantRecouvre > 0 ? (
                            <>
                              {fmtFCFA(a.montantRecouvre)}{' '}
                              <span style={{ color: 'var(--ink-soft)', fontSize: 11 }}>({a.nombreFactures} facture{a.nombreFactures > 1 ? 's' : ''})</span>
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
              {libelle(selectedPalier)} — {fmtDate(from)} au {fmtDate(to)}
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

// Sections de pilotage mono-société : taux de recouvrement + encours en retard,
// balance âgée (barre empilée), conversion des relances par palier, top débiteurs.
function PilotageSections({
  pilotage,
  libelle,
}: {
  pilotage: PilotageData;
  libelle: (palier: number, fallback?: string | null) => string;
}) {
  const overdue = pilotage.balanceAgee.filter((t) => t.cle !== 'a_echoir');
  const overdueTotal = overdue.reduce((s, t) => s + t.montant, 0);
  const encoursRetard = overdueTotal;
  const aEchoir = pilotage.balanceAgee.find((t) => t.cle === 'a_echoir');

  return (
    <>
      {/* KPIs de pilotage */}
      <div className="kpis" style={{ marginBottom: 24 }}>
        <div className="kpi">
          <div className="kpi-label">Taux de recouvrement (période)</div>
          <div className="kpi-value">{pilotage.recouvrement.taux !== null ? `${pilotage.recouvrement.taux} %` : '—'}</div>
          <div className="kpi-sub">
            {fmtFCFA(pilotage.recouvrement.montantPaye)} encaissés sur {fmtFCFA(pilotage.recouvrement.montantEchu)} échus
          </div>
        </div>
        <div className="kpi">
          <div className="kpi-label">Encours en retard (actuel)</div>
          <div className="kpi-value currency" style={{ color: encoursRetard > 0 ? 'var(--danger)' : undefined }}>
            {fmtFCFA(encoursRetard)}
          </div>
          <div className="kpi-sub">{overdue.reduce((s, t) => s + t.nombre, 0)} factures échues</div>
        </div>
      </div>

      {/* Balance âgée */}
      <div className="table-card" style={{ marginBottom: 24, padding: '18px 22px' }}>
        <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 3 }}>Balance âgée de l'encours</div>
        <div style={{ fontSize: 12.5, color: 'var(--ink-soft)', marginBottom: 16 }}>
          Où en est l'argent en retard, par tranche d'ancienneté.
        </div>
        {overdueTotal > 0 ? (
          <>
            <div style={{ display: 'flex', height: 40, borderRadius: 9, overflow: 'hidden', marginBottom: 14 }}>
              {overdue.map((t) =>
                t.montant > 0 ? (
                  <div
                    key={t.cle}
                    title={`${t.label} · ${fmtFCFA(t.montant)}`}
                    style={{
                      width: `${(t.montant / overdueTotal) * 100}%`,
                      background: AGE_COLORS[t.cle],
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      color: t.cle === 'j31_60' ? 'var(--ink)' : '#fff', fontSize: 11.5, fontWeight: 700,
                    }}
                    className="mono"
                  >
                    {Math.round((t.montant / overdueTotal) * 100)}%
                  </div>
                ) : null,
              )}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {overdue.map((t) => (
                <div key={t.cle} style={{ display: 'flex', alignItems: 'center', gap: 9, fontSize: 13 }}>
                  <span style={{ width: 11, height: 11, borderRadius: 3, background: AGE_COLORS[t.cle], flex: 'none' }} />
                  {t.label}
                  <span className="mono" style={{ marginLeft: 'auto', fontWeight: 600 }}>{fmtFCFA(t.montant)}</span>
                  <span className="mono" style={{ color: 'var(--ink-soft)', width: 74, textAlign: 'right' }}>{t.nombre} fact.</span>
                </div>
              ))}
              {aEchoir && aEchoir.montant > 0 && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 9, fontSize: 12.5, color: 'var(--ink-soft)', marginTop: 2 }}>
                  <span style={{ width: 11, height: 11, borderRadius: 3, background: AGE_COLORS.a_echoir, flex: 'none' }} />
                  À échoir (pas encore exigible)
                  <span className="mono" style={{ marginLeft: 'auto' }}>{fmtFCFA(aEchoir.montant)}</span>
                  <span className="mono" style={{ width: 74, textAlign: 'right' }}>{aEchoir.nombre} fact.</span>
                </div>
              )}
            </div>
          </>
        ) : (
          <div style={{ fontSize: 13, color: 'var(--ink-soft)' }}>Aucun encours en retard sur la période.</div>
        )}
      </div>

      {/* Conversion des relances par palier */}
      <div className="table-card" style={{ marginBottom: 24 }}>
        <div className="table-head">
          <div>
            <div style={{ fontWeight: 600, fontSize: 14 }}>Efficacité des relances</div>
            <div style={{ fontSize: 12.5, color: 'var(--ink-soft)', marginTop: 2 }}>
              Part des relances suivies d'un paiement sous 15 jours (corrélation, pas une preuve).
            </div>
          </div>
        </div>
        <table>
          <thead>
            <tr>
              <th>Palier</th>
              <th>Relances</th>
              <th>Payé sous 15 j</th>
              <th>Taux de conversion</th>
            </tr>
          </thead>
          <tbody>
            {pilotage.conversion
              .filter((c) => c.relances > 0)
              .map((c) => (
                <tr key={c.palier}>
                  <td>{libelle(c.palier, c.label)}</td>
                  <td className="mono">{c.relances}</td>
                  <td className="mono">{c.converties}</td>
                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <div style={{ flex: 1, maxWidth: 120, height: 6, background: 'var(--line-soft)', borderRadius: 99, overflow: 'hidden' }}>
                        <div style={{ height: '100%', width: `${c.taux ?? 0}%`, background: 'var(--accent)', borderRadius: 99 }} />
                      </div>
                      <b className="mono">{c.taux !== null ? `${c.taux} %` : '—'}</b>
                    </div>
                  </td>
                </tr>
              ))}
            {pilotage.conversion.every((c) => c.relances === 0) && (
              <tr>
                <td colSpan={4} style={{ color: 'var(--ink-soft)', fontSize: 13 }}>Aucune relance sur la période.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Top débiteurs */}
      {pilotage.topDebiteurs.length > 0 && (
        <div className="table-card" style={{ marginBottom: 24 }}>
          <div className="table-head">
            <div style={{ fontWeight: 600, fontSize: 14 }}>Top débiteurs à surveiller</div>
          </div>
          <table>
            <thead>
              <tr>
                <th>Client</th>
                <th>Encours</th>
                <th>Retard</th>
                <th>Dernier palier</th>
                <th>Dernière relance</th>
              </tr>
            </thead>
            <tbody>
              {pilotage.topDebiteurs.map((d) => (
                <tr key={d.nom}>
                  <td>{d.nom}</td>
                  <td className="mono">{fmtFCFA(d.encours)}</td>
                  <td className="mono">+{d.joursRetard} j</td>
                  <td>
                    {d.dernierPalierLabel ? (
                      <span className="badge" data-tone={PALIERS[d.palier]?.tone ?? 'amber'}>{d.dernierPalierLabel}</span>
                    ) : (
                      <span style={{ color: 'var(--ink-soft)' }}>—</span>
                    )}
                  </td>
                  <td className="mono" style={{ color: 'var(--ink-soft)' }}>{d.derniereRelance ? fmtDate(d.derniereRelance) : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

// Réglage de l'envoi automatique du rapport mensuel : adresse destinataire.
// Le rapport (PDF du mois écoulé) part le 1er de chaque mois à cette adresse.
function ReportingEmailAuto({ canEdit }: { canEdit: boolean }) {
  const { data, refetch } = useResource<{ reportingEmail: string | null }>('/api/reporting/reglages');
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    setEmail(data?.reportingEmail ?? '');
  }, [data]);

  async function save(next: string) {
    setBusy(true);
    setMsg(null);
    setErr(null);
    try {
      const r = await api.put<{ reportingEmail: string | null }>('/api/reporting/reglages', { reportingEmail: next });
      setEmail(r.reportingEmail ?? '');
      setMsg(r.reportingEmail ? 'Envoi automatique activé.' : 'Envoi automatique désactivé.');
      refetch();
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : 'Erreur');
    } finally {
      setBusy(false);
    }
  }

  const actif = !!data?.reportingEmail;

  return (
    <div className="table-card" style={{ padding: '16px 20px', marginBottom: 24 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <div style={{ flex: '1 1 320px', minWidth: 0 }}>
          <div style={{ fontWeight: 600, fontSize: 14 }}>Envoi automatique du rapport mensuel</div>
          <div style={{ fontSize: 12.5, color: 'var(--ink-soft)', marginTop: 2 }}>
            Le 1er de chaque mois, le rapport du mois écoulé (PDF) est envoyé à cette adresse.
            {actif ? (
              <span style={{ color: 'var(--accent-dark)', fontWeight: 600 }}> Activé.</span>
            ) : (
              <span> Actuellement désactivé.</span>
            )}
          </div>
        </div>
      </div>
      <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap', alignItems: 'center' }}>
        <input
          type="email"
          placeholder="agent@votresociete.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          disabled={!canEdit || busy}
          style={{ flex: '1 1 260px', maxWidth: 360 }}
        />
        {canEdit ? (
          <>
            <button className="primary" disabled={busy} onClick={() => save(email.trim())}>
              Enregistrer
            </button>
            {actif && (
              <button disabled={busy} onClick={() => save('')}>
                Désactiver
              </button>
            )}
          </>
        ) : (
          <span style={{ fontSize: 12.5, color: 'var(--ink-soft)' }}>Seul un administrateur peut modifier ce réglage.</span>
        )}
      </div>
      {msg && <div style={{ marginTop: 8, fontSize: 12.5, color: 'var(--accent-dark)' }}>{msg}</div>}
      {err && <div className="login-error" style={{ marginTop: 8 }}>{err}</div>}
    </div>
  );
}

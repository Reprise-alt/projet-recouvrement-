import { useCallback, useEffect, useRef, useState } from 'react';
import { api, ApiError } from '../api/client';
import { MotifReport, SalleTachesResponse, TacheCoursierSalle } from '../api/types';
import { MOTIF_REPORT_LABELS, TACHE_TYPE_LABELS, tacheStatutAffiche } from '../lib/constants';
import { EntityLogo, entityAccent } from './EntityLogo';

const REFRESH_MS = 30000;

function tomorrow(): string {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return d.toISOString().slice(0, 10);
}

// Écran partagé affiché en salle des coursiers -- pas un accès individuel :
// toute l'équipe voit le même planning complet du jour (y compris non
// assigné) et se dispatche elle-même en réunion du matin, contrairement au
// lien personnel de chaque coursier qui ne montre que ses propres tâches
// (cf. CoursierPublicView). Pensé pour rester ouvert toute la journée sur
// un écran/tablette partagé -- se rafraîchit seul, gros texte. Assigner et
// reporter se décident souvent collectivement en réunion, donc possibles
// ici ; marquer une tâche faite reste réservé au lien personnel de chaque
// coursier, une fois sur le terrain.
export function SalleCoursierView({ token }: { token: string }) {
  const [data, setData] = useState<SalleTachesResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [reportOpenId, setReportOpenId] = useState<string | null>(null);
  const [reportDates, setReportDates] = useState<Record<string, string>>({});
  const [reportMotifs, setReportMotifs] = useState<Record<string, MotifReport | ''>>({});
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await api.get<SalleTachesResponse>(`/api/salle-public/${token}/taches`);
      setData(res);
      setError(null);
      setLastUpdated(new Date());
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Lien invalide ou indisponible');
    }
  }, [token]);

  useEffect(() => {
    load();
    intervalRef.current = setInterval(load, REFRESH_MS);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [load]);

  async function assigner(tacheId: string, coursierId: string) {
    setBusyId(tacheId);
    try {
      await api.patch(`/api/salle-public/${token}/taches/${tacheId}`, { coursierId: coursierId || null });
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Erreur');
    } finally {
      setBusyId(null);
    }
  }

  async function reporter(tacheId: string) {
    const motifReport = reportMotifs[tacheId];
    if (!motifReport) return;
    setBusyId(tacheId);
    try {
      await api.patch(`/api/salle-public/${token}/taches/${tacheId}`, {
        report: reportDates[tacheId] ?? tomorrow(),
        motifReport,
      });
      setReportOpenId(null);
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Erreur');
    } finally {
      setBusyId(null);
    }
  }

  function renderReportControl(t: TacheCoursierSalle) {
    if (tacheStatutAffiche(t) !== 'a_faire') return null;
    if (reportOpenId !== t.id) {
      return (
        <button
          type="button"
          onClick={() => setReportOpenId(t.id)}
          style={{ fontSize: 11.5, padding: '2px 8px', background: 'none', border: '1px solid var(--line)', borderRadius: 6, color: 'var(--ink-soft)' }}
        >
          Reporter
        </button>
      );
    }
    return (
      <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap', marginTop: 4 }}>
        <input
          type="date"
          value={reportDates[t.id] ?? tomorrow()}
          onChange={(e) => setReportDates((prev) => ({ ...prev, [t.id]: e.target.value }))}
          style={{ fontSize: 12, padding: '4px 6px' }}
        />
        <select
          value={reportMotifs[t.id] ?? ''}
          onChange={(e) => setReportMotifs((prev) => ({ ...prev, [t.id]: e.target.value as MotifReport }))}
          style={{ fontSize: 12, padding: '4px 6px' }}
        >
          <option value="">Motif…</option>
          {(Object.keys(MOTIF_REPORT_LABELS) as MotifReport[]).map((m) => (
            <option key={m} value={m}>
              {MOTIF_REPORT_LABELS[m]}
            </option>
          ))}
        </select>
        <button type="button" disabled={busyId === t.id || !reportMotifs[t.id]} onClick={() => reporter(t.id)} style={{ fontSize: 12, padding: '4px 8px' }}>
          OK
        </button>
        <button type="button" onClick={() => setReportOpenId(null)} style={{ fontSize: 12, padding: '4px 8px', background: 'none' }}>
          Annuler
        </button>
      </div>
    );
  }

  if (error && !data) {
    return (
      <div className="empty-state" style={{ maxWidth: 480, margin: '80px auto' }}>
        <h3>Lien indisponible</h3>
        <p>{error}</p>
      </div>
    );
  }
  if (!data) return <div className="empty-state">Chargement…</div>;

  const nonAssignees = data.taches.filter((t) => !t.coursierId);
  const parCoursier = data.coursiers.map((c) => ({ coursier: c, taches: data.taches.filter((t) => t.coursierId === c.id) }));

  return (
    <div style={{ maxWidth: 1100, margin: '0 auto', padding: '28px 24px 60px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', flexWrap: 'wrap', gap: 8, marginBottom: 22 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <svg viewBox="0 0 100 100" width="32" height="32">
            <circle cx="50" cy="50" r="34" fill="none" stroke="#1D9E75" strokeWidth="13" strokeLinecap="round" strokeDasharray="168 46" transform="rotate(100 50 50)" />
          </svg>
          <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 26 }}>Planning du jour — Salle coursiers</div>
        </div>
        <div style={{ fontSize: 13, color: 'var(--ink-soft)' }}>
          {new Date().toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })}
          {lastUpdated && <> · actualisé à {lastUpdated.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}</>}
        </div>
      </div>

      {data.taches.length === 0 ? (
        <div className="empty-state">
          <h3>Rien de planifié aujourd'hui</h3>
          <p>Le planning sera mis à jour automatiquement.</p>
        </div>
      ) : (
        <>
          <div className="table-card" style={{ marginBottom: 22, ...(nonAssignees.length === 0 ? { opacity: 0.6 } : {}) }}>
            <div className="table-head">
              <div style={{ fontWeight: 700, fontSize: 17 }}>À dispatcher ({nonAssignees.length})</div>
            </div>
            {nonAssignees.length === 0 ? (
              <div style={{ padding: '18px 22px', fontSize: 14, color: 'var(--ink-soft)' }}>Tout est assigné.</div>
            ) : (
              <table style={{ fontSize: 15 }}>
                <tbody>
                  {nonAssignees.map((t) => (
                    <tr key={t.id} style={{ boxShadow: `inset 4px 0 0 ${entityAccent(t.entite)}` }}>
                      <td style={{ width: '32%' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <EntityLogo entite={t.entite} size={14} />
                          {t.client ? t.client.nom : <span style={{ color: 'var(--ink-soft)' }}>— (générique)</span>}
                        </div>
                      </td>
                      <td>
                        {TACHE_TYPE_LABELS[t.type]}
                        {t.label && <div style={{ fontSize: 12.5, color: 'var(--ink-soft)' }}>{t.label}</div>}
                      </td>
                      <td style={{ width: 200 }}>
                        <select
                          style={{ fontSize: 15, padding: '8px 10px', width: '100%' }}
                          disabled={busyId === t.id}
                          defaultValue=""
                          onChange={(e) => e.target.value && assigner(t.id, e.target.value)}
                        >
                          <option value="" disabled>
                            Se l'attribuer…
                          </option>
                          {data.coursiers.map((c) => (
                            <option key={c.id} value={c.id}>
                              {c.nom}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td style={{ width: 170 }}>{renderReportControl(t)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 18 }}>
            {parCoursier.map(({ coursier, taches }) => (
              <div className="table-card" key={coursier.id}>
                <div className="table-head">
                  <div style={{ fontWeight: 700, fontSize: 16 }}>{coursier.nom}</div>
                  <div style={{ fontSize: 12, color: 'var(--ink-soft)' }}>{taches.length} tâche{taches.length > 1 ? 's' : ''}</div>
                </div>
                {taches.length === 0 ? (
                  <div style={{ padding: '16px 20px', fontSize: 13, color: 'var(--ink-soft)' }}>Rien pour l'instant.</div>
                ) : (
                  <div style={{ padding: '10px 16px 16px' }}>
                    {taches.map((t) => {
                      const statut = tacheStatutAffiche(t);
                      return (
                        <div
                          key={t.id}
                          style={{
                            padding: '8px 4px 8px 10px',
                            borderBottom: '1px solid var(--line)',
                            fontSize: 13.5,
                            boxShadow: `inset 3px 0 0 ${entityAccent(t.entite)}`,
                          }}
                        >
                          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                            <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                              <EntityLogo entite={t.entite} size={12} />
                              <strong>{t.client ? t.client.nom : '— (générique)'}</strong>
                            </span>
                            {statut !== 'a_faire' && (
                              <span
                                className="badge"
                                data-tone={statut === 'faite' ? 'success' : statut === 'annulee' ? 'danger' : 'amber'}
                                style={{ fontSize: 10 }}
                              >
                                {statut === 'faite' ? 'Faite' : statut === 'annulee' ? 'Annulée' : 'Reportée'}
                              </span>
                            )}
                          </div>
                          <div style={{ color: 'var(--ink-soft)' }}>
                            {TACHE_TYPE_LABELS[t.type]}
                            {t.label ? ` — ${t.label}` : ''}
                          </div>
                          {renderReportControl(t)}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

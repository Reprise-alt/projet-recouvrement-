import { useEffect, useState } from 'react';
import { api, ApiError } from '../api/client';
import { CoursierTachesPubliques, ModePaiementCollecte, TacheCoursierPublic } from '../api/types';
import { MODE_PAIEMENT_LABELS, TACHE_TYPE_LABELS, tacheStatutAffiche } from '../lib/constants';
import { EntityLogo, entityAccent } from './EntityLogo';

function tomorrow(): string {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return d.toISOString().slice(0, 10);
}

// Vue terrain sans authentification classique : identifiée uniquement par
// le token dans l'URL (cf. App.tsx / routes/coursierPublic.ts côté
// backend). Volontairement minimale — pas de topbar, gros boutons, pensée
// pour un téléphone en pleine rue, pas pour un poste de bureau.
export function CoursierPublicView({ token }: { token: string }) {
  const [data, setData] = useState<CoursierTachesPubliques | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [montants, setMontants] = useState<Record<string, string>>({});
  const [modes, setModes] = useState<Record<string, ModePaiementCollecte>>({});
  const [reportDates, setReportDates] = useState<Record<string, string>>({});

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const res = await api.get<CoursierTachesPubliques>(`/api/coursier-public/${token}/taches`);
      setData(res);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Lien invalide ou expiré');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  async function marquerFait(t: TacheCoursierPublic) {
    setBusyId(t.id);
    try {
      await api.patch(`/api/coursier-public/${token}/taches/${t.id}`, {
        statut: 'faite',
        montant: t.type === 'recuperation_reglement' ? montants[t.id] || null : undefined,
        modePaiement: t.type === 'recuperation_reglement' ? modes[t.id] || null : undefined,
      });
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Erreur');
    } finally {
      setBusyId(null);
    }
  }

  async function reporter(t: TacheCoursierPublic) {
    setBusyId(t.id);
    try {
      await api.patch(`/api/coursier-public/${token}/taches/${t.id}`, { report: reportDates[t.id] ?? tomorrow() });
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Erreur');
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div style={{ maxWidth: 480, margin: '0 auto', padding: '20px 16px 60px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 18 }}>
        <svg viewBox="0 0 100 100" width="26" height="26">
          <circle cx="50" cy="50" r="34" fill="none" stroke="#1D9E75" strokeWidth="13" strokeLinecap="round" strokeDasharray="168 46" transform="rotate(100 50 50)" />
        </svg>
        <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 18 }}>Olu 360 — Tournée du jour</div>
      </div>

      {loading ? (
        <div className="empty-state">Chargement…</div>
      ) : error && !data ? (
        <div className="empty-state">
          <h3>Lien indisponible</h3>
          <p>{error}</p>
        </div>
      ) : data ? (
        <>
          <div style={{ fontSize: 14, color: 'var(--ink-soft)', marginBottom: 16 }}>
            Bonjour <strong>{data.coursier.nom}</strong> — {new Date().toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })}
          </div>
          {error && <div className="login-error" style={{ marginBottom: 12 }}>{error}</div>}

          {data.taches.length === 0 ? (
            <div className="empty-state">
              <h3>Aucune tâche assignée</h3>
              <p>Rien à faire pour l'instant sur votre tournée d'aujourd'hui.</p>
            </div>
          ) : (
            data.taches.map((t) => {
              const statut = tacheStatutAffiche(t);
              const busy = busyId === t.id;
              return (
                <div
                  className="card-mini"
                  key={t.id}
                  style={{
                    padding: 16,
                    marginBottom: 12,
                    borderLeft: t.client ? `5px solid ${entityAccent(t.client.entite)}` : undefined,
                  }}
                >
                  {t.client && (
                    <div
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 5,
                        background: 'var(--paper-2)',
                        borderRadius: 20,
                        padding: '3px 10px 3px 6px',
                        marginBottom: 8,
                      }}
                    >
                      <EntityLogo entite={t.client.entite} size={13} />
                      <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, fontWeight: 700, color: entityAccent(t.client.entite) }}>
                        {t.client.entite}
                      </span>
                    </div>
                  )}
                  <div style={{ fontWeight: 600, fontSize: 15 }}>{TACHE_TYPE_LABELS[t.type]}</div>
                  {t.client && (
                    <div style={{ fontSize: 13.5, marginTop: 2 }}>
                      {t.client.nom}
                      {t.client.tel && <span style={{ color: 'var(--ink-soft)' }}> · {t.client.tel}</span>}
                    </div>
                  )}
                  {t.label && <div style={{ fontSize: 12.5, color: 'var(--ink-soft)', marginTop: 2 }}>{t.label}</div>}

                  {statut === 'faite' ? (
                    <div style={{ marginTop: 10 }}>
                      <span className="badge" data-tone="success">
                        Faite
                      </span>
                    </div>
                  ) : (
                    <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 10 }}>
                      {t.type === 'recuperation_reglement' && (
                        <div style={{ display: 'flex', gap: 8 }}>
                          <input
                            type="number"
                            placeholder="Montant (FCFA)"
                            style={{ flex: 1 }}
                            value={montants[t.id] ?? ''}
                            onChange={(e) => setMontants((prev) => ({ ...prev, [t.id]: e.target.value }))}
                          />
                          <select
                            style={{ flex: 1 }}
                            value={modes[t.id] ?? ''}
                            onChange={(e) => setModes((prev) => ({ ...prev, [t.id]: e.target.value as ModePaiementCollecte }))}
                          >
                            <option value="">Mode…</option>
                            {(Object.keys(MODE_PAIEMENT_LABELS) as ModePaiementCollecte[]).map((m) => (
                              <option key={m} value={m}>
                                {MODE_PAIEMENT_LABELS[m]}
                              </option>
                            ))}
                          </select>
                        </div>
                      )}
                      <button className="primary" type="button" disabled={busy} style={{ width: '100%', padding: '10px 0' }} onClick={() => marquerFait(t)}>
                        ✓ Marquer fait
                      </button>
                      <div style={{ display: 'flex', gap: 8 }}>
                        <input
                          type="date"
                          style={{ flex: 1 }}
                          value={reportDates[t.id] ?? tomorrow()}
                          onChange={(e) => setReportDates((prev) => ({ ...prev, [t.id]: e.target.value }))}
                        />
                        <button type="button" disabled={busy} onClick={() => reporter(t)}>
                          Reporter
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </>
      ) : null}
    </div>
  );
}

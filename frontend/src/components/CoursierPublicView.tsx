import { useEffect, useState } from 'react';
import { CheckCircle2 } from 'lucide-react';
import { api, ApiError } from '../api/client';
import { CoursierTachesPubliques, ModePaiementCollecte, TacheCoursierPublic } from '../api/types';
import { MODE_PAIEMENT_LABELS, TACHE_TYPE_LABELS, tacheStatutAffiche } from '../lib/constants';
import { EntityLogo, entityAccent } from './EntityLogo';

function tomorrow(): string {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return d.toISOString().slice(0, 10);
}

function fmtHeure(iso: string): string {
  return new Date(iso).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
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

  const total = data?.taches.length ?? 0;
  const faites = data?.taches.filter((t) => tacheStatutAffiche(t) === 'faite').length ?? 0;

  return (
    <div className="coursier-mobile">
      <div className="cm-header">
        <svg viewBox="0 0 100 100" width="34" height="34">
          <circle cx="50" cy="50" r="34" fill="none" stroke="#1D9E75" strokeWidth="13" strokeLinecap="round" strokeDasharray="168 46" transform="rotate(100 50 50)" />
        </svg>
        <div className="cm-wordmark">Olu 360 — Tournée du jour</div>
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
          <div className="cm-greeting">
            Bonjour <strong>{data.coursier.nom}</strong> — {new Date().toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })}
          </div>
          {error && <div className="login-error">{error}</div>}

          {data.taches.length === 0 ? (
            <div className="empty-state">
              <h3>Aucune tâche assignée</h3>
              <p>Rien à faire pour l'instant sur votre tournée d'aujourd'hui.</p>
            </div>
          ) : (
            <>
              <div className="cm-progress">
                <div className="cm-progress-bar">
                  <div className="cm-progress-fill" style={{ width: `${total ? (faites / total) * 100 : 0}%` }} />
                </div>
                <div className="cm-progress-label">
                  {faites}/{total} faites
                </div>
              </div>

              {data.taches.map((t) => {
                const statut = tacheStatutAffiche(t);
                const busy = busyId === t.id;
                const accent = entityAccent(t.entite);
                return (
                  <div className={`cm-card${statut === 'faite' ? ' done' : ''}`} key={t.id} style={{ borderLeftColor: accent }}>
                    <div className="cm-chip" style={{ background: `${accent}1f` }}>
                      <EntityLogo entite={t.entite} size={17} />
                      <span className="cm-chip-label" style={{ color: accent }}>
                        {t.entite}
                      </span>
                    </div>
                    <div className="cm-title">{TACHE_TYPE_LABELS[t.type]}</div>
                    {t.client && (
                      <div className="cm-client">
                        {t.client.nom}
                        {t.client.tel && (
                          <>
                            {' · '}
                            <a href={`tel:${t.client.tel.replace(/\s+/g, '')}`}>{t.client.tel}</a>
                          </>
                        )}
                      </div>
                    )}
                    {t.label && <div className="cm-note">{t.label}</div>}

                    {statut === 'faite' ? (
                      <div className="cm-done-badge">
                        <CheckCircle2 size={18} /> Faite
                        {t.dateExecution && <span className="cm-done-time">à {fmtHeure(t.dateExecution)}</span>}
                      </div>
                    ) : (
                      <div className="cm-actions">
                        {t.type === 'recuperation_reglement' && (
                          <div className="cm-row2">
                            <div className="cm-field" style={{ flex: 1.3 }}>
                              <label>Montant (FCFA)</label>
                              <input
                                type="number"
                                inputMode="numeric"
                                placeholder="0"
                                value={montants[t.id] ?? ''}
                                onChange={(e) => setMontants((prev) => ({ ...prev, [t.id]: e.target.value }))}
                              />
                            </div>
                            <div className="cm-field" style={{ flex: 1 }}>
                              <label>Mode</label>
                              <select
                                value={modes[t.id] ?? ''}
                                onChange={(e) => setModes((prev) => ({ ...prev, [t.id]: e.target.value as ModePaiementCollecte }))}
                              >
                                <option value="">Choisir…</option>
                                {(Object.keys(MODE_PAIEMENT_LABELS) as ModePaiementCollecte[]).map((m) => (
                                  <option key={m} value={m}>
                                    {MODE_PAIEMENT_LABELS[m]}
                                  </option>
                                ))}
                              </select>
                            </div>
                          </div>
                        )}
                        <button className="primary" type="button" disabled={busy} onClick={() => marquerFait(t)}>
                          <CheckCircle2 size={18} /> Marquer fait
                        </button>
                        <div className="cm-row2">
                          <div className="cm-field" style={{ flex: 1 }}>
                            <label>Reporter au</label>
                            <input
                              type="date"
                              value={reportDates[t.id] ?? tomorrow()}
                              onChange={(e) => setReportDates((prev) => ({ ...prev, [t.id]: e.target.value }))}
                            />
                          </div>
                          <button className="cm-report-btn" type="button" disabled={busy} onClick={() => reporter(t)}>
                            Reporter
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </>
          )}
        </>
      ) : null}
    </div>
  );
}

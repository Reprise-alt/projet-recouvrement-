import { useEffect, useState } from 'react';
import { CheckCircle2, ChevronDown, ChevronUp } from 'lucide-react';
import { api, ApiError } from '../api/client';
import { CoursierTachesPubliques, ModePaiementCollecte, MotifReport, TacheCoursierPublic } from '../api/types';
import { MODE_PAIEMENT_LABELS, MOTIF_REPORT_LABELS, TACHE_TYPE_LABELS, tacheStatutAffiche, tachesDoublons } from '../lib/constants';
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
  const [motifs, setMotifs] = useState<Record<string, MotifReport | ''>>({});
  const [reaffectations, setReaffectations] = useState<Record<string, string>>({});
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [reorderBusy, setReorderBusy] = useState(false);

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
        note: notes[t.id]?.trim() || undefined,
      });
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Erreur');
    } finally {
      setBusyId(null);
    }
  }

  async function reaffecter(t: TacheCoursierPublic) {
    const coursierId = reaffectations[t.id];
    if (!coursierId) return;
    setBusyId(t.id);
    try {
      await api.patch(`/api/coursier-public/${token}/taches/${t.id}`, { coursierId });
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Erreur');
    } finally {
      setBusyId(null);
    }
  }

  async function reporter(t: TacheCoursierPublic) {
    const motifReport = motifs[t.id];
    if (!motifReport) return;
    setBusyId(t.id);
    try {
      await api.patch(`/api/coursier-public/${token}/taches/${t.id}`, {
        report: reportDates[t.id] ?? tomorrow(),
        motifReport,
      });
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Erreur');
    } finally {
      setBusyId(null);
    }
  }

  // Le coursier ne réordonne que les tâches restant à faire -- une tâche
  // déjà faite est passée, la déplacer dans la tournée n'a pas de sens.
  // Reçoit toujours la liste complète des ids du jour (faites incluses) :
  // le backend exige un réordonnancement exhaustif (cf. coursierPublic.ts).
  async function reordonner(idsOrdonnes: string[]) {
    setReorderBusy(true);
    try {
      await api.patch(`/api/coursier-public/${token}/reordonner`, { ordre: idsOrdonnes });
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Erreur');
    } finally {
      setReorderBusy(false);
    }
  }

  function deplacer(t: TacheCoursierPublic, direction: 'haut' | 'bas') {
    if (!data) return;
    const liste = [...data.taches];
    const aFaire = liste.filter((x) => tacheStatutAffiche(x) === 'a_faire');
    const idx = aFaire.findIndex((x) => x.id === t.id);
    const cibleIdx = direction === 'haut' ? idx - 1 : idx + 1;
    if (idx === -1 || cibleIdx < 0 || cibleIdx >= aFaire.length) return;
    const autre = aFaire[cibleIdx];
    const posA = liste.findIndex((x) => x.id === t.id);
    const posB = liste.findIndex((x) => x.id === autre.id);
    [liste[posA], liste[posB]] = [liste[posB], liste[posA]];
    reordonner(liste.map((x) => x.id));
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

              {(() => {
                const doublons = tachesDoublons(data.taches);
                // Sert à numéroter la tournée (1, 2, 3…) et à savoir si une
                // tâche est en tête/en fin de liste pour désactiver la
                // flèche correspondante -- uniquement parmi les tâches
                // restant à faire, une tâche déjà faite ne compte pas dans
                // la tournée à venir.
                const aFaireIds = data.taches.filter((x) => tacheStatutAffiche(x) === 'a_faire').map((x) => x.id);
                return data.taches.map((t) => {
                  const statut = tacheStatutAffiche(t);
                  const busy = busyId === t.id;
                  const accent = entityAccent(t.entite);
                  const doublon = doublons.has(t.id);
                  const posAFaire = aFaireIds.indexOf(t.id);
                  return (
                    <div
                      className={`cm-card${statut === 'faite' ? ' done' : ''}${doublon ? ' doublon' : ''}`}
                      key={t.id}
                      style={{ borderLeftColor: accent }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                        <div className="cm-chip" style={{ background: `${accent}1f` }}>
                          <EntityLogo entite={t.entite} size={17} />
                          <span className="cm-chip-label" style={{ color: accent }}>
                            {t.entite}
                          </span>
                        </div>
                        {posAFaire !== -1 && (
                          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                            <span style={{ fontSize: 12.5, color: 'var(--ink-soft)', fontWeight: 700 }}>#{posAFaire + 1}</span>
                            <button
                              type="button"
                              aria-label="Monter dans la tournée"
                              disabled={reorderBusy || posAFaire === 0}
                              onClick={() => deplacer(t, 'haut')}
                              style={{ padding: '4px 7px' }}
                            >
                              <ChevronUp size={16} />
                            </button>
                            <button
                              type="button"
                              aria-label="Descendre dans la tournée"
                              disabled={reorderBusy || posAFaire === aFaireIds.length - 1}
                              onClick={() => deplacer(t, 'bas')}
                              style={{ padding: '4px 7px' }}
                            >
                              <ChevronDown size={16} />
                            </button>
                          </div>
                        )}
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
                      {doublon && <div className="cm-doublon-note">↔ Même client, autre société — à combiner si possible</div>}
                      {t.label && <div className="cm-note">{t.label}</div>}

                    {statut === 'faite' ? (
                      <>
                        <div className="cm-done-badge">
                          <CheckCircle2 size={18} /> Faite
                          {t.dateExecution && <span className="cm-done-time">à {fmtHeure(t.dateExecution)}</span>}
                        </div>
                        {t.note && <div className="cm-note">{t.note}</div>}
                      </>
                    ) : (
                      <div className="cm-actions">
                        <div className="cm-field">
                          <label>Site / repère (optionnel)</label>
                          <input
                            type="text"
                            placeholder="Ex : Agence Sandaga, machine n°HP-4521"
                            value={notes[t.id] ?? ''}
                            onChange={(e) => setNotes((prev) => ({ ...prev, [t.id]: e.target.value }))}
                          />
                        </div>
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
                        <div className="cm-field">
                          <label>Motif du report</label>
                          <select
                            value={motifs[t.id] ?? ''}
                            onChange={(e) => setMotifs((prev) => ({ ...prev, [t.id]: e.target.value as MotifReport }))}
                          >
                            <option value="">Choisir un motif…</option>
                            {(Object.keys(MOTIF_REPORT_LABELS) as MotifReport[]).map((m) => (
                              <option key={m} value={m}>
                                {MOTIF_REPORT_LABELS[m]}
                              </option>
                            ))}
                          </select>
                        </div>
                        <div className="cm-row2">
                          <div className="cm-field" style={{ flex: 1 }}>
                            <label>Reporter au</label>
                            <input
                              type="date"
                              value={reportDates[t.id] ?? tomorrow()}
                              onChange={(e) => setReportDates((prev) => ({ ...prev, [t.id]: e.target.value }))}
                            />
                          </div>
                          <button
                            className="cm-report-btn"
                            type="button"
                            disabled={busy || !motifs[t.id]}
                            onClick={() => reporter(t)}
                          >
                            Reporter
                          </button>
                        </div>
                        {data.autresCoursiers.length > 0 && (
                          <div className="cm-row2">
                            <div className="cm-field" style={{ flex: 1 }}>
                              <label>Réaffecter à</label>
                              <select
                                value={reaffectations[t.id] ?? ''}
                                onChange={(e) => setReaffectations((prev) => ({ ...prev, [t.id]: e.target.value }))}
                              >
                                <option value="">Choisir un coursier…</option>
                                {data.autresCoursiers.map((c) => (
                                  <option key={c.id} value={c.id}>
                                    {c.nom}
                                  </option>
                                ))}
                              </select>
                            </div>
                            <button
                              className="cm-report-btn"
                              type="button"
                              disabled={busy || !reaffectations[t.id]}
                              onClick={() => reaffecter(t)}
                            >
                              Réaffecter
                            </button>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                  );
                });
              })()}
            </>
          )}
        </>
      ) : null}
    </div>
  );
}

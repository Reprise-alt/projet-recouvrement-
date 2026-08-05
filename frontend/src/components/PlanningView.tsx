import { FormEvent, useEffect, useState } from 'react';
import { api, ApiError, buildQuery } from '../api/client';
import { useResource } from '../hooks/useResource';
import { ClientListItem, Coursier, Entite, Entreprise, RoleUtilisateur, TachesJourResponse, TypeTacheCoursier } from '../api/types';
import { MODE_PAIEMENT_LABELS, TACHE_TYPE_LABELS, tacheStatutAffiche } from '../lib/constants';
import { CoursiersPanel } from './CoursiersPanel';
import { TacheModelesPanel } from './TacheModelesPanel';
import { EntityLogo } from './EntityLogo';
import { PlanningRapportView } from './PlanningRapportView';

interface Props {
  entityFilter: Entite | 'ALL';
  role: RoleUtilisateur;
}

const TYPE_KEYS = Object.keys(TACHE_TYPE_LABELS) as TypeTacheCoursier[];

const STATUT_LABEL: Record<string, string> = { a_faire: 'À faire', faite: 'Faite', reportee: 'Reportée', annulee: 'Annulée' };
const STATUT_TONE: Record<string, 'success' | 'amber' | 'danger' | undefined> = {
  faite: 'success',
  reportee: 'amber',
  annulee: 'danger',
  a_faire: undefined,
};

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

function tomorrow(): string {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return d.toISOString().slice(0, 10);
}

function fmtHeure(iso: string): string {
  return new Date(iso).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
}

export function PlanningView({ entityFilter, role }: Props) {
  const [date, setDate] = useState(today());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showAjout, setShowAjout] = useState(false);
  const [showCoursiers, setShowCoursiers] = useState(false);
  const [showModeles, setShowModeles] = useState(false);
  const [showRapport, setShowRapport] = useState(false);
  const [reportDates, setReportDates] = useState<Record<string, string>>({});
  // Entreprise du formulaire d'ajout -- verrouillée sur l'onglet actif sauf
  // en vue "Tous", où il faut la choisir explicitement (cf. demande :
  // aucune tâche générique ne peut être créée sans savoir de quelle
  // société elle relève).
  const [formEntite, setFormEntite] = useState(entityFilter !== 'ALL' ? entityFilter : '');
  useEffect(() => {
    if (entityFilter !== 'ALL') setFormEntite(entityFilter);
  }, [entityFilter]);

  const query = { date, entite: entityFilter };
  const path = `/api/taches${buildQuery(query)}`;
  const { data, loading, refetch } = useResource<TachesJourResponse>(path);

  const { data: coursiers, refetch: refetchCoursiers } = useResource<Coursier[]>('/api/taches/coursiers');
  const { data: entreprises } = useResource<Entreprise[]>('/api/entreprises');
  const entreprisesSelectionnables = (entreprises ?? []).filter((e) => e.actif && !e.estCommun);
  const clientEntiteScope = entityFilter !== 'ALL' ? entityFilter : formEntite;
  const { data: clients } = useResource<ClientListItem[]>(
    clientEntiteScope ? `/api/clients${buildQuery({ entite: clientEntiteScope, all: 'true' })}` : null,
  );

  const coursiersActifs = (coursiers ?? []).filter((c) => c.actif);

  async function mutate(fn: () => Promise<unknown>) {
    setBusy(true);
    setError(null);
    try {
      await fn();
      refetch();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Erreur');
    } finally {
      setBusy(false);
    }
  }

  async function handleCreate(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const fd = new FormData(form);
    await mutate(async () => {
      await api.post('/api/taches', {
        clientId: fd.get('clientId') || null,
        entite: formEntite,
        type: fd.get('type'),
        label: fd.get('label') || undefined,
        date,
      });
      form.reset();
      setShowAjout(false);
    });
  }

  return (
    <div>
      <div className="table-card" style={{ padding: '18px 22px', marginBottom: 24 }}>
        <div style={{ display: 'flex', gap: 16, alignItems: 'flex-end', flexWrap: 'wrap', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', gap: 16, alignItems: 'flex-end', flexWrap: 'wrap' }}>
            <div>
              <label>Jour</label>
              <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
            <button type="button" onClick={() => setDate(today())}>
              Aujourd'hui
            </button>
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button type="button" onClick={() => setShowRapport((v) => !v)}>
              {showRapport ? 'Masquer le reporting' : 'Reporting planning'}
            </button>
            <button type="button" onClick={() => setShowModeles(true)}>
              Tâches récurrentes
            </button>
            <button type="button" onClick={() => setShowCoursiers(true)}>
              Coursiers
            </button>
            <button className="primary" type="button" onClick={() => setShowAjout((v) => !v)}>
              {showAjout ? 'Annuler' : '+ Ajouter une tâche'}
            </button>
          </div>
        </div>

        {showAjout && (
          <form onSubmit={handleCreate} style={{ display: 'flex', gap: 10, alignItems: 'flex-end', flexWrap: 'wrap', marginTop: 16 }}>
            <div style={{ flex: '1 1 160px' }}>
              <label>Entreprise</label>
              {entityFilter !== 'ALL' ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, height: 38, padding: '0 4px' }}>
                  <EntityLogo entite={entityFilter} size={16} />
                  <strong>{entityFilter}</strong>
                </div>
              ) : (
                <select required value={formEntite} onChange={(e) => setFormEntite(e.target.value)}>
                  <option value="" disabled>
                    Choisir…
                  </option>
                  {entreprisesSelectionnables.map((e) => (
                    <option key={e.id} value={e.code}>
                      {e.code}
                    </option>
                  ))}
                </select>
              )}
            </div>
            <div style={{ flex: '1 1 220px' }}>
              <label>Client (optionnel)</label>
              <select name="clientId" defaultValue="" key={clientEntiteScope} disabled={!clientEntiteScope}>
                <option value="">— Aucun (tâche générique) —</option>
                {(clients ?? []).map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nom}
                  </option>
                ))}
              </select>
            </div>
            <div style={{ flex: '1 1 200px' }}>
              <label>Type</label>
              <select name="type" required defaultValue="">
                <option value="" disabled>
                  Choisir…
                </option>
                {TYPE_KEYS.map((t) => (
                  <option key={t} value={t}>
                    {TACHE_TYPE_LABELS[t]}
                  </option>
                ))}
              </select>
            </div>
            <div style={{ flex: '1 1 200px' }}>
              <label>Précision (optionnel)</label>
              <input type="text" name="label" placeholder="Ex : avenant tarifaire" />
            </div>
            <button className="primary" type="submit" disabled={busy || !formEntite}>
              Ajouter
            </button>
          </form>
        )}
        {error && <div className="login-error" style={{ marginTop: 12 }}>{error}</div>}
      </div>

      {showRapport && <PlanningRapportView entityFilter={entityFilter} />}

      {loading || !data ? (
        <div className="empty-state">Chargement…</div>
      ) : (
        <>
          <div className="kpis" style={{ marginBottom: 24 }}>
            <div className="kpi">
              <div className="kpi-label">Tâches prévues ce jour-là</div>
              <div className="kpi-value">{data.resume.total}</div>
            </div>
            <div className="kpi">
              <div className="kpi-label">Faites</div>
              <div className="kpi-value success">{data.resume.faites}</div>
            </div>
            <div className="kpi">
              <div className="kpi-label">Reportées</div>
              <div className="kpi-value amber">{data.resume.reportees}</div>
            </div>
            <div className="kpi">
              <div className="kpi-label">À faire / annulées</div>
              <div className="kpi-value">
                {data.resume.aFaire} <span style={{ fontSize: 13, color: 'var(--ink-soft)' }}>/ {data.resume.annulees}</span>
              </div>
            </div>
          </div>

          <div className="table-card">
            <div className="table-head">
              <div style={{ fontWeight: 600, fontSize: 14 }}>Tâches à travailler ce jour</div>
            </div>
            {data.taches.length === 0 ? (
              <div className="empty-state">
                <h3>Rien de planifié</h3>
                <p>Aucune tâche à cette date — ajoutez-en une ou changez de jour.</p>
              </div>
            ) : (
              <table>
                <thead>
                  <tr>
                    <th>Client</th>
                    <th>Tâche</th>
                    <th>Statut</th>
                    <th>Coursier</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {data.taches.map((t) => {
                    const statut = tacheStatutAffiche(t);
                    return (
                      <tr key={t.id}>
                        <td>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            <EntityLogo entite={t.entite} size={14} />
                            {t.client ? t.client.nom : <span style={{ color: 'var(--ink-soft)' }}>— (tâche générique)</span>}
                          </div>
                        </td>
                        <td>
                          {TACHE_TYPE_LABELS[t.type]}
                          {t.label && <div style={{ fontSize: 11.5, color: 'var(--ink-soft)' }}>{t.label}</div>}
                          {t.montant !== null && (
                            <div style={{ fontSize: 11.5, color: 'var(--ink-soft)' }} className="mono">
                              {t.montant.toLocaleString('fr-FR')} FCFA
                              {t.modePaiement ? ` · ${MODE_PAIEMENT_LABELS[t.modePaiement]}` : ''}
                            </div>
                          )}
                          {t.note && <div style={{ fontSize: 11.5, color: 'var(--ink-soft)', fontStyle: 'italic' }}>{t.note}</div>}
                        </td>
                        <td>
                          <span className="badge" data-tone={STATUT_TONE[statut] ?? 'success'} style={!STATUT_TONE[statut] ? { background: 'var(--paper-2)', color: 'var(--ink-soft)' } : undefined}>
                            {STATUT_LABEL[statut]}
                          </span>
                          {statut === 'faite' && t.dateExecution && (
                            <div style={{ fontSize: 11, color: 'var(--ink-soft)', marginTop: 3 }} className="mono">
                              à {fmtHeure(t.dateExecution)}
                            </div>
                          )}
                        </td>
                        <td>
                          <select
                            value={t.coursierId ?? ''}
                            disabled={busy}
                            onChange={(e) => mutate(() => api.patch(`/api/taches/${t.id}`, { coursierId: e.target.value || null }))}
                          >
                            <option value="">— Non assignée —</option>
                            {coursiersActifs.map((c) => (
                              <option key={c.id} value={c.id}>
                                {c.nom}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td>
                          <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
                            {statut !== 'faite' && statut !== 'annulee' && (
                              <button
                                type="button"
                                style={{ padding: '3px 9px', fontSize: 11 }}
                                disabled={busy}
                                onClick={() => mutate(() => api.patch(`/api/taches/${t.id}`, { statut: 'faite' }))}
                              >
                                Marquer fait
                              </button>
                            )}
                            {statut !== 'faite' && statut !== 'annulee' && (
                              <>
                                <input
                                  type="date"
                                  style={{ padding: '3px 6px', fontSize: 11 }}
                                  value={reportDates[t.id] ?? tomorrow()}
                                  onChange={(e) => setReportDates((prev) => ({ ...prev, [t.id]: e.target.value }))}
                                />
                                <button
                                  type="button"
                                  style={{ padding: '3px 9px', fontSize: 11 }}
                                  disabled={busy}
                                  onClick={() => mutate(() => api.patch(`/api/taches/${t.id}`, { date: reportDates[t.id] ?? tomorrow() }))}
                                >
                                  Reporter
                                </button>
                              </>
                            )}
                            {statut !== 'annulee' && (
                              <button
                                type="button"
                                className="danger-btn"
                                style={{ padding: '3px 9px', fontSize: 11 }}
                                disabled={busy}
                                onClick={() => mutate(() => api.patch(`/api/taches/${t.id}`, { statut: 'annulee' }))}
                              >
                                Annuler
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </>
      )}

      {showCoursiers && (
        <CoursiersPanel
          onClose={() => {
            setShowCoursiers(false);
            refetchCoursiers();
          }}
        />
      )}
      {showModeles && <TacheModelesPanel entityFilter={entityFilter} onClose={() => setShowModeles(false)} />}
    </div>
  );
}

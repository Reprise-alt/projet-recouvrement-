import { FormEvent, useState } from 'react';
import { CheckCircle2, Circle, PlusCircle, X } from 'lucide-react';
import { api, ApiError } from '../api/client';
import { ClientOperationsDetail, Climat, CurrentUser, GraviteProbleme, MotifResiliation, Secteur } from '../api/types';
import { useResource } from '../hooks/useResource';
import { useToast } from '../hooks/useToast';
import { fmtDate } from '../lib/constants';
import { CRITICITE_LABELS, MOTIF_RESILIATION_LABELS, SECTEUR_LABELS } from '../lib/operationsConstants';
import { ScoreGauge } from './ScoreGauge';

interface Props {
  id: string;
  user: CurrentUser;
  onClose: () => void;
  onChanged: () => void;
}

export function ClientOperationsDrawer({ id, user, onClose, onChanged }: Props) {
  const { showToast } = useToast();
  const { data: co, loading, error, refetch } = useResource<ClientOperationsDetail>(`/api/operations/clients/${id}`);

  const [editingIdentite, setEditingIdentite] = useState(false);
  const [addingProbleme, setAddingProbleme] = useState(false);
  const [showReleve, setShowReleve] = useState(false);
  const [showResiliation, setShowResiliation] = useState(false);
  const [busy, setBusy] = useState(false);

  const canEdit = user.roleOperations === 'directrice_operations' || user.roleOperations === 'direction_generale';

  function afterMutation() {
    refetch();
    onChanged();
  }

  async function handleSaveIdentite(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    setBusy(true);
    try {
      await api.patch(`/api/operations/clients/${id}`, {
        secteur: form.get('secteur'),
        criticite: form.get('criticite'),
        vip: form.get('vip') === 'on',
        debutContrat: form.get('debutContrat') || null,
        finContrat: form.get('finContrat') || null,
        enjeux: form.get('enjeux'),
      });
      setEditingIdentite(false);
      afterMutation();
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : 'Erreur');
    } finally {
      setBusy(false);
    }
  }

  async function handleAddProbleme(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const texte = String(form.get('texte') || '').trim();
    if (!texte) return;
    setBusy(true);
    try {
      await api.post(`/api/operations/clients/${id}/problemes`, { texte, gravite: form.get('gravite') as GraviteProbleme });
      setAddingProbleme(false);
      afterMutation();
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : 'Erreur');
    } finally {
      setBusy(false);
    }
  }

  async function resoudreProbleme(problemeId: string) {
    setBusy(true);
    try {
      await api.patch(`/api/operations/clients/${id}/problemes/${problemeId}`, {});
      afterMutation();
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : 'Erreur');
    } finally {
      setBusy(false);
    }
  }

  async function cocherEtape(cle: string) {
    setBusy(true);
    try {
      await api.post(`/api/operations/clients/${id}/demarrage/${cle}`, {});
      afterMutation();
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : 'Erreur');
    } finally {
      setBusy(false);
    }
  }

  async function marquerCopil() {
    setBusy(true);
    try {
      await api.post(`/api/operations/clients/${id}/copil`, {});
      showToast('COPIL enregistré');
      afterMutation();
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : 'Erreur');
    } finally {
      setBusy(false);
    }
  }

  async function handleReleve(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    setBusy(true);
    try {
      await api.post(`/api/operations/clients/${id}/releve`, {
        dernierContact: form.get('dernierContact') || undefined,
        climat: form.get('climat') || undefined,
        commentaire: form.get('commentaire') || '',
        action: form.get('action') ?? '',
        actionEcheance: form.get('actionEcheance') || null,
        actionFait: form.get('actionFait') === 'on',
      });
      setShowReleve(false);
      showToast('Relevé enregistré');
      afterMutation();
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : 'Erreur');
    } finally {
      setBusy(false);
    }
  }

  async function handleResiliation(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    setBusy(true);
    try {
      await api.post(`/api/operations/clients/${id}/resiliation`, {
        motif: form.get('motif') as MotifResiliation,
        detail: form.get('detail'),
      });
      setShowResiliation(false);
      showToast('Résiliation enregistrée');
      afterMutation();
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : 'Erreur');
    } finally {
      setBusy(false);
    }
  }

  async function reactiver() {
    setBusy(true);
    try {
      await api.post(`/api/operations/clients/${id}/reactiver`, {});
      showToast('Compte réactivé');
      afterMutation();
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : 'Erreur');
    } finally {
      setBusy(false);
    }
  }

  const problemesOuverts = co?.problemes.filter((p) => !p.resoluLe) ?? [];
  const problemesResolus = co?.problemes.filter((p) => p.resoluLe) ?? [];

  return (
    <div className="overlay open" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="drawer">
        <button className="drawer-close" onClick={onClose} aria-label="Fermer" title="Fermer">
          <X size={16} />
        </button>
        {loading || !co ? (
          <div>{error || 'Chargement…'}</div>
        ) : (
          <>
            <h2>{co.client.nom}</h2>
            <div className="sub">
              {co.client.entite} · {co.client.codeClient || 'sans code client'} {co.resilie && '· Résilié'}
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 16, margin: '16px 0' }}>
              <ScoreGauge scores={co.scores} size="lg" />
              <div>
                <div style={{ fontSize: 26, fontWeight: 700, fontFamily: 'var(--font-mono)' }}>{co.scores.global}</div>
                <span className="badge" data-tone={co.tone}>
                  {co.tone === 'success' ? 'Sain' : co.tone === 'amber' ? 'À surveiller' : 'Fragile'}
                </span>
              </div>
            </div>

            <div className="section-title">
              <span>Identité</span>
              {canEdit && !editingIdentite && <button onClick={() => setEditingIdentite(true)}>Modifier</button>}
            </div>
            {editingIdentite ? (
              <form onSubmit={handleSaveIdentite} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <div>
                  <label>Secteur</label>
                  <select name="secteur" defaultValue={co.secteur}>
                    {(Object.keys(SECTEUR_LABELS) as Secteur[]).map((s) => (
                      <option key={s} value={s}>
                        {SECTEUR_LABELS[s]}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label>Criticité</label>
                  <select name="criticite" defaultValue={co.criticite}>
                    {(['A', 'B', 'C'] as const).map((c) => (
                      <option key={c} value={c}>
                        {CRITICITE_LABELS[c]}
                      </option>
                    ))}
                  </select>
                </div>
                <label style={{ display: 'flex', alignItems: 'center', gap: 6, textTransform: 'none' }}>
                  <input type="checkbox" name="vip" defaultChecked={co.vip} /> Grand compte (VIP)
                </label>
                <div>
                  <label>Début du contrat</label>
                  <input type="date" name="debutContrat" defaultValue={co.debutContrat?.slice(0, 10) ?? ''} />
                </div>
                <div>
                  <label>Fin du contrat</label>
                  <input type="date" name="finContrat" defaultValue={co.finContrat?.slice(0, 10) ?? ''} />
                </div>
                <div>
                  <label>Enjeux (6-12 mois)</label>
                  <textarea name="enjeux" defaultValue={co.enjeux ?? ''} rows={2} />
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button className="primary" type="submit" disabled={busy}>
                    Enregistrer
                  </button>
                  <button type="button" onClick={() => setEditingIdentite(false)}>
                    Annuler
                  </button>
                </div>
              </form>
            ) : (
              <div className="info-grid">
                <div>
                  <span>Secteur</span>
                  {SECTEUR_LABELS[co.secteur]}
                </div>
                <div>
                  <span>Criticité</span>
                  {CRITICITE_LABELS[co.criticite]}
                </div>
                <div>
                  <span>Grand compte</span>
                  {co.vip ? 'Oui' : 'Non'}
                </div>
                <div>
                  <span>Chargé de compte</span>
                  {co.chargeDeCompte?.nom || '—'}
                </div>
                <div>
                  <span>Début contrat</span>
                  {fmtDate(co.debutContrat)}
                </div>
                <div>
                  <span>Fin contrat</span>
                  {fmtDate(co.finContrat)}
                </div>
                {co.enjeux && (
                  <div style={{ gridColumn: '1 / -1' }}>
                    <span>Enjeux</span>
                    {co.enjeux}
                  </div>
                )}
              </div>
            )}

            {co.demarrage && (
              <>
                <div className="section-title">
                  <span>
                    Démarrage — J+{co.demarrage.age} sur 90 ({co.demarrage.nbFaits}/{co.demarrage.total})
                  </span>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 8 }}>
                  {co.demarrage.restantes.length === 0 ? (
                    <div style={{ fontSize: 13, color: 'var(--success)' }}>Toutes les étapes sont bouclées.</div>
                  ) : (
                    co.demarrage.restantes.map((e) => {
                      const enRetard = co.demarrage!.retard.some((r) => r.cle === e.cle);
                      return (
                        <button
                          key={e.cle}
                          onClick={() => cocherEtape(e.cle)}
                          disabled={busy || !canEdit}
                          style={{ display: 'flex', alignItems: 'center', gap: 8, textAlign: 'left', background: 'none', border: 'none', padding: '4px 0', color: enRetard ? 'var(--danger)' : 'var(--ink)' }}
                        >
                          <Circle size={15} />
                          <span style={{ fontSize: 13 }}>
                            {e.libelle} — J+{e.delaiJours}
                            {enRetard && ' (en retard)'}
                          </span>
                        </button>
                      );
                    })
                  )}
                </div>
              </>
            )}

            <div className="section-title">
              <span>Problèmes ({problemesOuverts.length} ouverts)</span>
              {canEdit && !addingProbleme && (
                <button onClick={() => setAddingProbleme(true)}>
                  <PlusCircle size={13} /> Ajouter
                </button>
              )}
            </div>
            {addingProbleme && (
              <form onSubmit={handleAddProbleme} style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 10 }}>
                <textarea name="texte" placeholder="Décrire le problème…" rows={2} required />
                <select name="gravite" defaultValue="gene">
                  <option value="gene">Gêne</option>
                  <option value="bloquant">Bloquant</option>
                </select>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button className="primary" type="submit" disabled={busy}>
                    Ouvrir
                  </button>
                  <button type="button" onClick={() => setAddingProbleme(false)}>
                    Annuler
                  </button>
                </div>
              </form>
            )}
            {problemesOuverts.length === 0 ? (
              <p style={{ fontSize: 13, color: 'var(--ink-soft)' }}>Aucun problème ouvert.</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 10 }}>
                {problemesOuverts.map((p) => (
                  <div key={p.id} style={{ display: 'flex', alignItems: 'flex-start', gap: 8, fontSize: 13 }}>
                    <span className="badge" data-tone={p.gravite === 'bloquant' ? 'danger' : 'amber'} style={{ flexShrink: 0, marginTop: 1 }}>
                      {p.gravite === 'bloquant' ? 'Bloquant' : 'Gêne'}
                    </span>
                    <div style={{ flex: 1 }}>
                      {p.texte}
                      <div style={{ fontSize: 11, color: 'var(--ink-soft)' }}>Ouvert le {fmtDate(p.ouvertLe)}</div>
                    </div>
                    {canEdit && (
                      <button onClick={() => resoudreProbleme(p.id)} disabled={busy} title="Marquer résolu">
                        <CheckCircle2 size={15} />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
            {problemesResolus.length > 0 && (
              <details style={{ marginBottom: 10 }}>
                <summary style={{ fontSize: 12, color: 'var(--ink-soft)', cursor: 'pointer' }}>{problemesResolus.length} problème(s) résolu(s)</summary>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginTop: 6 }}>
                  {problemesResolus.map((p) => (
                    <div key={p.id} style={{ fontSize: 12.5, color: 'var(--ink-soft)' }}>
                      {p.texte} — résolu le {fmtDate(p.resoluLe)}
                    </div>
                  ))}
                </div>
              </details>
            )}

            {co.vip && (
              <>
                <div className="section-title">
                  <span>COPIL</span>
                </div>
                <div className="info-grid" style={{ marginBottom: 10 }}>
                  <div>
                    <span>Dernier COPIL</span>
                    {fmtDate(co.dernierCopil)}
                  </div>
                </div>
                {canEdit && (
                  <button onClick={marquerCopil} disabled={busy} style={{ marginBottom: 10 }}>
                    Marquer le COPIL du mois tenu
                  </button>
                )}
              </>
            )}

            <div className="section-title">
              <span>Relevé hebdomadaire</span>
              {canEdit && !showReleve && <button onClick={() => setShowReleve(true)}>Faire le relevé</button>}
            </div>
            {showReleve ? (
              <form onSubmit={handleReleve} style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 10 }}>
                <div>
                  <label>Dernier contact</label>
                  <input type="date" name="dernierContact" defaultValue={co.dernierContact?.slice(0, 10) ?? new Date().toISOString().slice(0, 10)} />
                </div>
                <div>
                  <label>Climat</label>
                  <select name="climat" defaultValue={co.climat ?? ''}>
                    <option value="">—</option>
                    <option value="vert">Vert</option>
                    <option value="orange">Orange</option>
                    <option value="rouge">Rouge</option>
                  </select>
                </div>
                <div>
                  <label>Note de la semaine</label>
                  <textarea name="commentaire" defaultValue={co.commentaire ?? ''} rows={2} />
                </div>
                <div>
                  <label>Prochain engagement</label>
                  <input type="text" name="action" defaultValue={co.action ?? ''} placeholder="Ce que vous vous engagez à faire…" />
                </div>
                <div>
                  <label>Échéance de l'engagement</label>
                  <input type="date" name="actionEcheance" defaultValue={co.actionEcheance?.slice(0, 10) ?? ''} />
                </div>
                <label style={{ display: 'flex', alignItems: 'center', gap: 6, textTransform: 'none' }}>
                  <input type="checkbox" name="actionFait" defaultChecked={co.actionFait} /> Engagement précédent tenu
                </label>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button className="primary" type="submit" disabled={busy}>
                    Enregistrer le relevé
                  </button>
                  <button type="button" onClick={() => setShowReleve(false)}>
                    Annuler
                  </button>
                </div>
              </form>
            ) : (
              <div className="info-grid" style={{ marginBottom: 10 }}>
                <div>
                  <span>Dernier relevé</span>
                  {fmtDate(co.dernierReleve)}
                </div>
                <div>
                  <span>Prochain engagement</span>
                  {co.action || '—'}
                </div>
              </div>
            )}

            <div className="section-title">
              <span>Statut du compte</span>
            </div>
            {co.resilie ? (
              <div>
                <div className="info-grid" style={{ marginBottom: 10 }}>
                  <div>
                    <span>Résilié le</span>
                    {fmtDate(co.dateResiliation)}
                  </div>
                  <div>
                    <span>Motif</span>
                    {co.motifResiliation ? MOTIF_RESILIATION_LABELS[co.motifResiliation] : '—'}
                  </div>
                </div>
                {canEdit && (
                  <button onClick={reactiver} disabled={busy}>
                    Réactiver le compte
                  </button>
                )}
              </div>
            ) : canEdit ? (
              showResiliation ? (
                <form onSubmit={handleResiliation} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <div>
                    <label>Motif</label>
                    <select name="motif" required defaultValue="">
                      <option value="" disabled>
                        Choisir un motif…
                      </option>
                      {(Object.keys(MOTIF_RESILIATION_LABELS) as MotifResiliation[]).map((m) => (
                        <option key={m} value={m}>
                          {MOTIF_RESILIATION_LABELS[m]}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label>Circonstances</label>
                    <textarea name="detail" rows={2} />
                  </div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button type="submit" disabled={busy} style={{ color: 'var(--danger)' }}>
                      Confirmer la résiliation
                    </button>
                    <button type="button" onClick={() => setShowResiliation(false)}>
                      Annuler
                    </button>
                  </div>
                </form>
              ) : (
                <button onClick={() => setShowResiliation(true)}>Déclarer une résiliation</button>
              )
            ) : null}
          </>
        )}
      </div>
    </div>
  );
}

import { FormEvent, useState } from 'react';
import { AlertTriangle, CheckCircle2, Circle, PlusCircle, X } from 'lucide-react';
import { api, ApiError } from '../api/client';
import { ClientOperationsDetail, Climat, CurrentUser, GraviteProbleme, MotifResiliation, Secteur } from '../api/types';
import { useResource } from '../hooks/useResource';
import { useToast } from '../hooks/useToast';
import { fmtDate } from '../lib/constants';
import { CLIMAT_DOT_COLOR, CLIMAT_LABELS, CRITICITE_LABELS, MOTIF_RESILIATION_LABELS, SECTEUR_LABELS } from '../lib/operationsConstants';
import { Sparkline } from './Sparkline';
import { ParcImpressionModal } from './ParcImpressionModal';

interface Props {
  id: string;
  user: CurrentUser;
  initialSection?: 'resiliation';
  onClose: () => void;
  onChanged: () => void;
}

export function ClientOperationsDrawer({ id, user, initialSection, onClose, onChanged }: Props) {
  const { showToast } = useToast();
  const { data: co, loading, error, refetch } = useResource<ClientOperationsDetail>(`/api/operations/clients/${id}`);
  // Signal recouvrement -> opérations (cahier §8) : un booléen, jamais un
  // montant -- déclenché à 7 factures consécutives impayées.
  const { data: signalRecouvrement } = useResource<{ enLitige: boolean }>(`/api/operations/clients/${id}/signal-recouvrement`);

  const [editingIdentite, setEditingIdentite] = useState(false);
  const [addingProbleme, setAddingProbleme] = useState(false);
  const [showReleve, setShowReleve] = useState(false);
  const [climatChoice, setClimatChoice] = useState<Climat | ''>('');
  const [showResiliation, setShowResiliation] = useState(initialSection === 'resiliation');
  const [showParc, setShowParc] = useState(false);
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
        climat: climatChoice || undefined,
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
        date: form.get('date'),
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

  async function toggleVip() {
    if (!co) return;
    setBusy(true);
    try {
      await api.patch(`/api/operations/clients/${id}`, { vip: !co.vip });
      afterMutation();
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : 'Erreur');
    } finally {
      setBusy(false);
    }
  }

  async function demarrerSuivi() {
    setBusy(true);
    try {
      await api.patch(`/api/operations/clients/${id}`, { demarreLe: new Date().toISOString() });
      showToast('Suivi des 90 jours démarré');
      afterMutation();
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : 'Erreur');
    } finally {
      setBusy(false);
    }
  }

  async function annulerDemarrage() {
    if (!confirm("Supprimer ce suivi des 90 jours ? Les étapes déjà cochées seront perdues -- vous pourrez redémarrer le suivi depuis zéro ensuite.")) return;
    setBusy(true);
    try {
      await api.post(`/api/operations/clients/${id}/demarrage/annuler`, {});
      showToast('Suivi des 90 jours supprimé');
      afterMutation();
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : 'Erreur');
    } finally {
      setBusy(false);
    }
  }

  async function initEtapesDefaut() {
    if (!co) return;
    setBusy(true);
    try {
      await api.post('/api/operations/etapes-demarrage/init-defaut', { entite: co.client.entite });
      showToast('Étapes par défaut configurées');
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
            <h2 style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              {co.client.nom}
              {co.vip && (
                <span className="badge" data-tone="amber" style={{ fontSize: 11 }}>
                  VIP
                </span>
              )}
            </h2>
            <div className="sub">
              {co.client.entite} · {SECTEUR_LABELS[co.secteur]}
              {co.chargeDeCompte && ` · ${co.chargeDeCompte.nom}`}
              {co.resilie && ' · Résilié'}
            </div>

            {signalRecouvrement?.enLitige && (
              <div
                className="signal-banner"
                style={{ margin: '12px 0' }}
                title="Signal en provenance du recouvrement — jamais un montant, juste ce signal"
              >
                <AlertTriangle size={17} />
                <div>
                  Signal recouvrement : 7 factures consécutives impayées — ce n'est plus un sujet de trésorerie, à qualifier ici.
                </div>
              </div>
            )}

            {!co.resilie && (
              <label className={`toggle-card danger${showResiliation ? ' open' : ''}`}>
                <input type="checkbox" checked={showResiliation} disabled={!canEdit} onChange={(e) => setShowResiliation(e.target.checked)} />
                <div>
                  <strong>Déclarer une résiliation</strong>
                  <div className="toggle-card-desc">Le motif est obligatoire : il alimente la statistique mensuelle.</div>
                </div>
              </label>
            )}
            {showResiliation && !co.resilie && (
              <form onSubmit={handleResiliation} style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: -6, marginBottom: 14 }}>
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
                  <label>Date de résiliation</label>
                  <input type="date" name="date" required defaultValue={new Date().toISOString().slice(0, 10)} />
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
            )}

            <label className={`toggle-card${co.vip ? ' open' : ''}`}>
              <input type="checkbox" checked={co.vip} disabled={busy || !canEdit} onChange={toggleVip} />
              <div>
                <strong>Grand compte (VIP)</strong>
                <div className="toggle-card-desc">Déclenche un dossier COPIL mensuel et un rythme de contact d'un mois au lieu de deux.</div>
              </div>
            </label>

            <div style={{ display: 'flex', alignItems: 'center', gap: 16, margin: '16px 0' }}>
              <div>
                <div style={{ fontSize: 26, fontWeight: 700, fontFamily: 'var(--font-mono)' }}>{co.scores.global}</div>
                <div style={{ fontSize: 11.5, color: 'var(--ink-soft)' }}>Santé du compte</div>
                <div style={{ fontSize: 10.5, color: 'var(--ink-soft)' }}>recalculée à chaque saisie</div>
              </div>
              <Sparkline values={co.releves.map((r) => r.score).reverse()} width={140} height={36} />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 7, marginBottom: 8 }}>
              {(
                [
                  ['Échanges', co.scores.contact],
                  ['Climat', co.scores.climat],
                  ['Problèmes', co.scores.problemes],
                  ['Engagements', co.scores.engagements],
                ] as [string, number][]
              ).map(([label, v]) => (
                <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div style={{ width: 90, fontFamily: 'var(--font-mono)', fontSize: 10.5, textTransform: 'uppercase', letterSpacing: '.05em', color: 'var(--ink-soft)' }}>{label}</div>
                  <div style={{ flex: 1, height: 6, background: 'var(--line-soft)', borderRadius: 3, overflow: 'hidden' }}>
                    <div style={{ width: `${Math.round(v)}%`, height: '100%', background: v >= 70 ? 'var(--success)' : v >= 45 ? 'var(--amber)' : 'var(--danger)' }} />
                  </div>
                  <div style={{ width: 28, textAlign: 'right', fontFamily: 'var(--font-mono)', fontSize: 12.5, fontWeight: 600 }}>{Math.round(v)}</div>
                </div>
              ))}
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

            {!co.resilie && (
              <>
                <div className="section-title">
                  <span>Démarrage de contrat</span>
                </div>
                {co.demarrage && co.etapesConfig.length === 0 ? (
                  <div className="demarrage-panel">
                    <p style={{ fontSize: 13, color: 'var(--ink-soft)', margin: user.roleOperations === 'direction_generale' ? '0 0 10px' : 0 }}>
                      Suivi démarré, mais aucune étape n'est configurée pour {co.client.entite}.
                      {user.roleOperations !== 'direction_generale' && ' Contactez la direction générale.'}
                    </p>
                    {user.roleOperations === 'direction_generale' && (
                      <button onClick={initEtapesDefaut} disabled={busy}>
                        Configurer les étapes par défaut pour {co.client.entite}
                      </button>
                    )}
                  </div>
                ) : co.demarrage ? (
                  <div className="demarrage-panel">
                    <div className="demarrage-panel-head">
                      <div style={{ fontSize: 13, color: 'var(--ink-soft)' }}>
                        J+{co.demarrage.age} sur 90 · {co.demarrage.nbFaits}/{co.demarrage.total} étapes
                      </div>
                      <div className="demarrage-pct">{co.demarrage.pct}%</div>
                    </div>
                    <div className="demarrage-progress">
                      <div className="demarrage-progress-fill" style={{ width: `${co.demarrage.pct}%` }} />
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 14 }}>
                      {co.etapesConfig.map((e) => {
                        const fait = co.etapesDemarrage.find((f) => f.cle === e.cle);
                        const enRetard = co.demarrage!.retard.some((r) => r.cle === e.cle);
                        return (
                          <div key={e.cle} className={`demarrage-etape${fait ? ' fait' : ''}${enRetard ? ' retard' : ''}`}>
                            <button
                              className="demarrage-etape-check"
                              onClick={() => !fait && cocherEtape(e.cle)}
                              disabled={busy || !canEdit || !!fait}
                              aria-label={fait ? 'Étape faite' : 'Marquer faite'}
                            >
                              {fait ? <CheckCircle2 size={18} /> : <Circle size={18} />}
                            </button>
                            <div style={{ flex: 1 }}>
                              <div className={fait ? 'demarrage-etape-libelle fait' : 'demarrage-etape-libelle'}>{e.libelle}</div>
                              {e.description && !fait && <div className="demarrage-etape-desc">{e.description}</div>}
                              <div className="demarrage-etape-meta">{fait ? `Fait le ${fmtDate(fait.date)}` : `Attendue à J+${e.delaiJours}${enRetard ? ' — en retard' : ''}`}</div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                    {canEdit && (
                      <button
                        className="danger-btn"
                        onClick={annulerDemarrage}
                        disabled={busy}
                        style={{ marginTop: 14, fontSize: 12 }}
                      >
                        Supprimer ce suivi
                      </button>
                    )}
                  </div>
                ) : co.demarrageCloture ? (
                  <p style={{ fontSize: 13, color: 'var(--ink-soft)' }}>Suivi des 90 premiers jours clôturé.</p>
                ) : (
                  <div className="demarrage-panel">
                    <p style={{ fontSize: 13, color: 'var(--ink-soft)', margin: canEdit ? '0 0 10px' : 0 }}>
                      Le suivi des 90 premiers jours n'a pas été activé pour ce compte.
                    </p>
                    {canEdit && (
                      <button onClick={demarrerSuivi} disabled={busy}>
                        Démarrer le suivi des 90 jours
                      </button>
                    )}
                  </div>
                )}
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
                <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
                  {canEdit && (
                    <button onClick={marquerCopil} disabled={busy}>
                      Marquer le COPIL du mois tenu
                    </button>
                  )}
                  <button onClick={() => setShowParc(true)}>Parc d'impression</button>
                </div>
              </>
            )}

            <div className="section-title">
              <span>Relevé hebdomadaire</span>
              {canEdit && !showReleve && (
                <button
                  onClick={() => {
                    setClimatChoice(co.climat ?? '');
                    setShowReleve(true);
                  }}
                >
                  Faire le relevé
                </button>
              )}
            </div>
            {!showReleve && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, marginBottom: 10 }}>
                {co.climat ? (
                  <>
                    <span className="climat-dot" style={{ background: CLIMAT_DOT_COLOR[co.climat], display: 'inline-block' }} />
                    Climat actuel : {CLIMAT_LABELS[co.climat]}
                  </>
                ) : (
                  <span style={{ color: 'var(--ink-soft)' }}>Climat non renseigné — aucun relevé effectué pour l'instant.</span>
                )}
                {co.dernierReleve && <span style={{ color: 'var(--ink-soft)' }}>· dernier relevé le {fmtDate(co.dernierReleve)}</span>}
              </div>
            )}
            {showReleve ? (
              <form onSubmit={handleReleve} style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 10 }}>
                <div>
                  <label>Climat</label>
                  <div className="climat-picker">
                    <button type="button" className={`climat-option${climatChoice === 'vert' ? ' active' : ''}`} data-climat="vert" onClick={() => setClimatChoice('vert')}>
                      <span className="climat-dot" /> Ça roule
                    </button>
                    <button type="button" className={`climat-option${climatChoice === 'orange' ? ' active' : ''}`} data-climat="orange" onClick={() => setClimatChoice('orange')}>
                      <span className="climat-dot" /> À surveiller
                    </button>
                    <button type="button" className={`climat-option${climatChoice === 'rouge' ? ' active' : ''}`} data-climat="rouge" onClick={() => setClimatChoice('rouge')}>
                      <span className="climat-dot" /> Ça coince
                    </button>
                  </div>
                </div>
                <div>
                  <label>Dernier contact</label>
                  <input type="date" name="dernierContact" defaultValue={co.dernierContact?.slice(0, 10) ?? new Date().toISOString().slice(0, 10)} />
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

            {co.resilie && (
              <>
                <div className="section-title">
                  <span>Statut du compte</span>
                </div>
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
                    {co.motifDetail && (
                      <div style={{ gridColumn: '1 / -1' }}>
                        <span>Circonstances</span>
                        {co.motifDetail}
                      </div>
                    )}
                  </div>
                  {canEdit && (
                    <button onClick={reactiver} disabled={busy}>
                      Réactiver le compte
                    </button>
                  )}
                </div>
              </>
            )}
          </>
        )}
      </div>
      {showParc && co && (
        <ParcImpressionModal clientOperationsId={id} clientNom={co.client.nom} canEdit={canEdit} onClose={() => setShowParc(false)} />
      )}
    </div>
  );
}

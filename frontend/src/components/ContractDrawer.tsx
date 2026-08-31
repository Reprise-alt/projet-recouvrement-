import { FormEvent, useState } from 'react';
import { X } from 'lucide-react';
import { api, ApiError, downloadFile } from '../api/client';
import { ContractDetail, ContractDoc, RoleUtilisateur, TypeAugmentation } from '../api/types';
import { useResource } from '../hooks/useResource';
import { useToast } from '../hooks/useToast';
import { CONTRACT_ALERTS, fmtDate } from '../lib/constants';

interface Props {
  contratId: string;
  role: RoleUtilisateur;
  onClose: () => void;
  onChanged: () => void;
}

export function ContractDrawer({ contratId, role, onClose, onChanged }: Props) {
  const { showToast } = useToast();
  const { data: contrat, loading, error, refetch } = useResource<ContractDetail>(`/api/contracts/${contratId}`);
  const [doc, setDoc] = useState<ContractDoc | null>(null);
  const [sending, setSending] = useState(false);
  const [destinataire, setDestinataire] = useState('');
  const [attachments, setAttachments] = useState<File[]>([]);
  const [sendStatus, setSendStatus] = useState<{ kind: 'ok' | 'err'; message: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [editingTarif, setEditingTarif] = useState(false);
  const [tauxInput, setTauxInput] = useState('');
  const [typeInput, setTypeInput] = useState<TypeAugmentation | ''>('');
  const [commentaireInput, setCommentaireInput] = useState('');
  const [tarifBusy, setTarifBusy] = useState(false);

  const canAct = role === 'admin' || role === 'manager_entite';

  // Durée en années + mois (« 3 ans », « 3 ans 6 mois », « 8 mois »).
  const fmtDuree = (mois: number | null | undefined) => {
    if (mois == null) return '—';
    const a = Math.floor(mois / 12);
    const m = mois % 12;
    return [a ? `${a} an${a > 1 ? 's' : ''}` : '', m ? `${m} mois` : ''].filter(Boolean).join(' ') || '0 mois';
  };
  const TYPE_AUG_LABEL: Record<TypeAugmentation, string> = {
    sans_notification: 'Sans notification (automatique)',
    sur_notification: 'Sur notification préalable',
  };

  function openTarifForm() {
    setTauxInput(contrat?.tauxAugmentation != null ? String(contrat.tauxAugmentation) : '');
    setTypeInput(contrat?.typeAugmentation ?? '');
    setCommentaireInput(contrat?.commentaire ?? '');
    setEditingTarif(true);
  }

  async function handleSaveTarification(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setTarifBusy(true);
    try {
      await api.patch(`/api/contracts/${contratId}/tarification`, {
        tauxAugmentation: Number(tauxInput),
        typeAugmentation: typeInput || undefined,
        commentaire: commentaireInput,
      });
      setEditingTarif(false);
      refetch();
      onChanged();
      showToast('Augmentation annuelle enregistrée');
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : 'Erreur');
    } finally {
      setTarifBusy(false);
    }
  }

  async function handleAppliquerRevision() {
    setTarifBusy(true);
    try {
      await api.post(`/api/contracts/${contratId}/appliquer-revision`);
      refetch();
      onChanged();
      showToast('Révision appliquée');
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : 'Erreur');
    } finally {
      setTarifBusy(false);
    }
  }

  async function loadDocument() {
    setBusy(true);
    try {
      const d = await api.get<ContractDoc>(`/api/contracts/${contratId}/document`);
      setDoc(d);
      setDestinataire(contrat?.client.email || '');
      setAttachments([]);
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : 'Erreur');
    } finally {
      setBusy(false);
    }
  }

  function copyDoc() {
    if (!doc) return;
    navigator.clipboard?.writeText(doc.body).then(
      () => showToast('Texte copié'),
      () => showToast('Copie impossible dans cet environnement'),
    );
  }

  async function handleSendEmail(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!doc) return;
    setBusy(true);
    setSendStatus(null);
    try {
      const formData = new FormData();
      formData.append('to', destinataire);
      formData.append('subject', doc.subject);
      formData.append('body', doc.body);
      formData.append('context', JSON.stringify({ type: 'contract_doc', contratId }));
      attachments.forEach((file) => formData.append('attachments', file));
      await api.upload('/api/send-email', formData);
      setSendStatus({ kind: 'ok', message: 'Message envoyé avec succès.' });
      setSending(false);
      setDoc(null);
      setAttachments([]);
      refetch();
      onChanged();
    } catch (err) {
      setSendStatus({ kind: 'err', message: err instanceof ApiError ? err.message : "Échec de l'envoi." });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="overlay open" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="drawer">
        <button className="drawer-close" onClick={onClose} aria-label="Fermer" title="Fermer">
          <X size={16} />
        </button>
        {loading || !contrat ? (
          <div>{error || 'Chargement…'}</div>
        ) : (
          <>
            <h2>{contrat.client.nom}</h2>
            <div className="sub">
              {contrat.client.entite} · {contrat.type || 'Contrat'} · {contrat.numero}
            </div>

            <div className="info-grid">
              <div>
                <span>Début</span>
                {fmtDate(contrat.dateDebut)}
              </div>
              <div>
                <span>Fin</span>
                {fmtDate(contrat.dateFin)}
              </div>
              <div>
                <span>Durée</span>
                {fmtDuree(contrat.dureeMois)}
              </div>
              <div>
                <span>Révision tarifaire</span>
                {contrat.prochaineRevision
                  ? fmtDate(contrat.prochaineRevision)
                  : contrat.dateRevisionTarif
                    ? fmtDate(contrat.dateRevisionTarif)
                    : 'Non renseignée'}
              </div>
              <div>
                <span>Reconduction</span>
                {contrat.tacite ? 'Tacite' : 'Non tacite'}
              </div>
            </div>

            {(contrat.statutSource || contrat.commentaire) && (
              <div className="info-grid" style={{ marginTop: 10 }}>
                {contrat.statutSource && (
                  <div>
                    <span>Statut (source)</span>
                    {contrat.statutSource}
                  </div>
                )}
                {contrat.commentaire && (
                  <div>
                    <span>Commentaire</span>
                    {contrat.commentaire}
                  </div>
                )}
              </div>
            )}

            <div className="section-title">
              <span>Augmentation annuelle</span>
              {canAct && contrat.tauxAugmentation != null && !editingTarif && (
                <button onClick={openTarifForm}>Modifier</button>
              )}
            </div>
            {editingTarif ? (
              <form onSubmit={handleSaveTarification} className="card-mini" style={{ borderColor: 'var(--accent)' }}>
                <div style={{ marginBottom: 8 }}>
                  <label>Augmentation annuelle (%)</label>
                  <input type="number" step="0.1" min="0" value={tauxInput} onChange={(e) => setTauxInput(e.target.value)} placeholder="ex. 5" required />
                </div>
                <div style={{ marginBottom: 8 }}>
                  <label>Type d'augmentation</label>
                  <select value={typeInput} onChange={(e) => setTypeInput(e.target.value as TypeAugmentation | '')}>
                    <option value="">Sans notification (automatique)</option>
                    <option value="sans_notification">Sans notification (automatique)</option>
                    <option value="sur_notification">Sur notification préalable</option>
                  </select>
                  <div style={{ fontSize: 11.5, color: 'var(--ink-soft)', marginTop: 4 }}>
                    {typeInput === 'sur_notification'
                      ? 'La hausse n\'est due que si le client est notifié avant la date d\'augmentation — sinon elle est perdue pour l\'année.'
                      : 'La hausse s\'applique automatiquement à la date anniversaire, sans démarche.'}
                  </div>
                </div>
                <div style={{ marginBottom: 8 }}>
                  <label>Commentaire</label>
                  <textarea rows={2} value={commentaireInput} onChange={(e) => setCommentaireInput(e.target.value)} placeholder="Note libre sur le contrat / l'augmentation…" />
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button className="primary" type="submit" disabled={tarifBusy}>
                    Enregistrer
                  </button>
                  <button type="button" onClick={() => setEditingTarif(false)} disabled={tarifBusy}>
                    Annuler
                  </button>
                </div>
              </form>
            ) : contrat.tauxAugmentation != null ? (
              <div className="card-mini">
                <div className="info-grid">
                  <div>
                    <span>Augmentation annuelle</span>
                    {contrat.tauxAugmentation} %
                  </div>
                  <div>
                    <span>Type d'augmentation</span>
                    {TYPE_AUG_LABEL[contrat.typeAugmentation ?? 'sans_notification']}
                  </div>
                  <div>
                    <span>Prochaine augmentation</span>
                    {contrat.prochaineRevision ? fmtDate(contrat.prochaineRevision) : contrat.dateRevisionTarif ? fmtDate(contrat.dateRevisionTarif) : '—'}
                  </div>
                </div>
                {contrat.echeance.type === 'revision_tarif' &&
                  (contrat.typeAugmentation === 'sur_notification' ? (
                    <div
                      className="badge"
                      data-tone={contrat.alertLevel >= 4 ? 'danger' : 'amber'}
                      style={{ display: 'block', marginTop: 10, padding: '8px 12px', fontSize: 12.5, lineHeight: 1.4 }}
                    >
                      ⚠ Augmentation <strong>sur notification</strong> — à notifier au client <strong>avant le {fmtDate(contrat.echeance.date)}</strong>{' '}
                      ({contrat.echeance.jours} j). Sans notification dans les délais, la revalorisation est perdue pour l'année.
                    </div>
                  ) : (
                    <div style={{ fontSize: 12.5, color: 'var(--ink-soft)', marginTop: 10 }}>
                      Prochaine augmentation de <strong>{contrat.tauxAugmentation} %</strong> le{' '}
                      <strong>{fmtDate(contrat.echeance.date)}</strong> ({contrat.echeance.jours} j) — automatique, à répercuter en facturation.
                    </div>
                  ))}
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 12 }}>
                  <button
                    type="button"
                    onClick={() =>
                      downloadFile(
                        `/api/contracts/${contratId}/lettre-augmentation`,
                        `avis-augmentation-${contrat.numero}.pdf`,
                      ).catch((err) => showToast(err instanceof ApiError ? err.message : 'Génération impossible'))
                    }
                    title="Génère la lettre d'avis de revalorisation, à l'en-tête de la société (logo + mentions)"
                  >
                    Générer la lettre d'avis (PDF)
                  </button>
                  {canAct && (
                    <button
                      className="primary"
                      disabled={tarifBusy}
                      onClick={handleAppliquerRevision}
                      title="Marque l'augmentation de cette année comme appliquée et validée avec le client, et réarme le rappel pour l'an prochain"
                    >
                      Augmentation appliquée &amp; validée client
                    </button>
                  )}
                </div>
              </div>
            ) : (
              <div style={{ fontSize: 12.5, color: 'var(--ink-soft)', marginBottom: canAct ? 8 : 0 }}>
                Pas d'augmentation annuelle configurée sur ce contrat.
                {canAct && (
                  <>
                    {' '}
                    <button style={{ padding: '2px 10px', fontSize: 12 }} onClick={openTarifForm}>
                      Configurer
                    </button>
                  </>
                )}
              </div>
            )}

            <div className="section-title">Statut</div>
            <span className="badge" data-tone={CONTRACT_ALERTS[contrat.alertLevel].tone} style={{ fontSize: 13, padding: '6px 12px' }}>
              {CONTRACT_ALERTS[contrat.alertLevel].label}
            </span>
            <div style={{ fontSize: 12.5, color: 'var(--ink-soft)', marginTop: 8 }}>{CONTRACT_ALERTS[contrat.alertLevel].desc || ''}</div>

            <div className="section-title">Historique des envois</div>
            {contrat.envois.length ? (
              contrat.envois.map((a) => (
                <div className="timeline-item" key={a.id}>
                  <div className="timeline-date">{fmtDate(a.date)}</div>
                  <div>{a.label}</div>
                </div>
              ))
            ) : (
              <div style={{ color: 'var(--ink-soft)', fontSize: 12.5 }}>Aucun envoi enregistré.</div>
            )}

            {canAct && (
              <div className="action-box">
                <div style={{ fontWeight: 600, marginBottom: 4 }}>
                  {contrat.echeance.type === 'revision_tarif' ? 'Brouillon — révision tarifaire' : 'Brouillon — avenant / renouvellement'}
                </div>
                <div style={{ fontSize: 12.5, color: 'var(--ink-soft)', marginBottom: 12 }}>
                  Le document est généré automatiquement. Relis-le avant tout envoi.
                </div>
                {!doc ? (
                  <button className="primary" disabled={busy} onClick={loadDocument}>
                    Générer le document
                  </button>
                ) : (
                  <>
                    <textarea
                      className="letter-preview"
                      rows={10}
                      value={doc.body}
                      onChange={(e) => setDoc({ ...doc, body: e.target.value })}
                      style={{ width: '100%', resize: 'vertical' }}
                    />
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 10 }}>
                      <button onClick={copyDoc}>Copier le texte</button>
                      {!sending && (
                        <button className="primary" onClick={() => setSending(true)}>
                          Envoyer par email (validation requise)
                        </button>
                      )}
                    </div>
                    {sending && (
                      <form onSubmit={handleSendEmail} style={{ marginTop: 10 }}>
                        <label>Destinataire(s) — séparés par une virgule</label>
                        <input type="email" multiple value={destinataire} onChange={(e) => setDestinataire(e.target.value)} required />
                        <div style={{ marginTop: 10 }}>
                          <label>Pièces jointes (5 max, 15 Mo/fichier)</label>
                          <input
                            type="file"
                            multiple
                            onChange={(e) => setAttachments((prev) => [...prev, ...Array.from(e.target.files ?? [])].slice(0, 5))}
                          />
                          {attachments.length > 0 && (
                            <ul style={{ margin: '6px 0 0', paddingLeft: 18, fontSize: 12.5 }}>
                              {attachments.map((file, i) => (
                                <li key={`${file.name}-${i}`} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                  {file.name} ({(file.size / 1024 / 1024).toFixed(1)} Mo)
                                  <button
                                    type="button"
                                    style={{ padding: '1px 6px', fontSize: 11 }}
                                    onClick={() => setAttachments((prev) => prev.filter((_, j) => j !== i))}
                                  >
                                    Retirer
                                  </button>
                                </li>
                              ))}
                            </ul>
                          )}
                        </div>
                        <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                          <button className="primary" type="submit" disabled={busy}>
                            Confirmer et envoyer
                          </button>
                          <button type="button" onClick={() => setSending(false)}>
                            Annuler
                          </button>
                        </div>
                      </form>
                    )}
                    {sendStatus && <div className={`send-status ${sendStatus.kind === 'ok' ? 'ok' : 'err'}`}>{sendStatus.message}</div>}
                  </>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

import { FormEvent, useState } from 'react';
import { api, ApiError } from '../api/client';
import { ContractDetail, ContractDoc, RoleUtilisateur } from '../api/types';
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

  const canAct = role === 'admin' || role === 'manager_entite';

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
          ✕
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
                <span>Révision tarifaire</span>
                {contrat.dateRevisionTarif ? fmtDate(contrat.dateRevisionTarif) : 'Non renseignée'}
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

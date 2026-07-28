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
  const [recording, setRecording] = useState(false);
  const [destinataire, setDestinataire] = useState('');
  const [busy, setBusy] = useState(false);

  const canAct = role === 'admin' || role === 'manager_entite';

  async function loadDocument() {
    setBusy(true);
    try {
      const d = await api.get<ContractDoc>(`/api/contracts/${contratId}/document`);
      setDoc(d);
      setDestinataire(contrat?.client.email || '');
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

  async function handleRecordEnvoi(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!doc) return;
    setBusy(true);
    try {
      await api.post(`/api/contracts/${contratId}/envois`, {
        label: doc.subject,
        destinataire,
        sujet: doc.subject,
        corps: doc.body,
      });
      showToast('Envoi enregistré');
      setRecording(false);
      refetch();
      onChanged();
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : 'Erreur');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="overlay open" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="drawer">
        <button className="drawer-close" onClick={onClose}>
          Fermer ✕
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
                    <div className="letter-preview">{doc.body}</div>
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 10 }}>
                      <button onClick={copyDoc}>Copier le texte</button>
                      {!recording && <button className="primary" onClick={() => setRecording(true)}>Enregistrer l'envoi</button>}
                    </div>
                    {recording && (
                      <form onSubmit={handleRecordEnvoi} style={{ marginTop: 10 }}>
                        <label>Destinataire</label>
                        <input type="email" value={destinataire} onChange={(e) => setDestinataire(e.target.value)} required />
                        <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                          <button className="primary" type="submit" disabled={busy}>
                            Confirmer l'envoi (manuel)
                          </button>
                          <button type="button" onClick={() => setRecording(false)}>
                            Annuler
                          </button>
                        </div>
                      </form>
                    )}
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

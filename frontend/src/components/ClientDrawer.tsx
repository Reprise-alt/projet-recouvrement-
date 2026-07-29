import { FormEvent, useState } from 'react';
import { api, ApiError } from '../api/client';
import { ClientDetail, Contact, RoleUtilisateur } from '../api/types';
import { useResource } from '../hooks/useResource';
import { useToast } from '../hooks/useToast';
import { fmtDate, fmtFCFA, PALIERS } from '../lib/constants';

interface Props {
  clientId: string;
  role: RoleUtilisateur;
  onClose: () => void;
  onChanged: () => void;
}

export function ClientDrawer({ clientId, role, onClose, onChanged }: Props) {
  const { showToast } = useToast();
  const { data: client, loading, error, refetch } = useResource<ClientDetail>(`/api/clients/${clientId}`);

  const [editingContact, setEditingContact] = useState(false);
  const [editingNote, setEditingNote] = useState(false);
  const [addingContact, setAddingContact] = useState(false);
  const [addingFacture, setAddingFacture] = useState(false);
  const [actionNote, setActionNote] = useState('');
  const [letterText, setLetterText] = useState<string | null>(null);
  const [sendTo, setSendTo] = useState('');
  const [attachments, setAttachments] = useState<File[]>([]);
  const [sendStatus, setSendStatus] = useState<{ kind: 'ok' | 'err'; message: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const canEditContact = role === 'admin' || role === 'manager_entite';
  const canEditNote = role === 'admin' || role === 'manager_entite' || role === 'comptable';
  const canAddFacture = role === 'admin' || role === 'manager_entite';
  const canRecordAction = role === 'admin' || role === 'manager_entite' || role === 'comptable';
  const canGenerateLetter = role === 'admin' || role === 'manager_entite';
  const canTogglePaid = role === 'admin' || role === 'manager_entite' || role === 'comptable';

  function afterMutation() {
    refetch();
    onChanged();
  }

  async function handleSaveContact(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    setBusy(true);
    try {
      await api.patch(`/api/clients/${clientId}/contact`, {
        contact: form.get('contact'),
        email: form.get('email'),
        tel: form.get('tel'),
      });
      showToast('Contact mis à jour');
      setEditingContact(false);
      afterMutation();
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : 'Erreur');
    } finally {
      setBusy(false);
    }
  }

  async function handleSaveNote(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    setBusy(true);
    try {
      await api.patch(`/api/clients/${clientId}/note`, { note: form.get('note') });
      showToast('Note enregistrée');
      setEditingNote(false);
      afterMutation();
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : 'Erreur');
    } finally {
      setBusy(false);
    }
  }

  async function handleAddContact(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    setBusy(true);
    try {
      await api.post(`/api/clients/${clientId}/contacts`, {
        nom: form.get('nom'),
        fonction: form.get('fonction'),
        email: form.get('email'),
        tel: form.get('tel'),
      });
      showToast('Contact ajouté');
      setAddingContact(false);
      afterMutation();
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : 'Erreur');
    } finally {
      setBusy(false);
    }
  }

  async function handleDeleteContact(contact: Contact) {
    if (!confirm(`Supprimer le contact « ${contact.nom} » ?`)) return;
    setBusy(true);
    try {
      await api.delete(`/api/clients/${clientId}/contacts/${contact.id}`);
      showToast('Contact supprimé');
      afterMutation();
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : 'Erreur');
    } finally {
      setBusy(false);
    }
  }

  async function handleAddFacture(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    setBusy(true);
    try {
      await api.post(`/api/clients/${clientId}/factures`, {
        numero: form.get('numero'),
        montant: Number(form.get('montant')),
        dateFacture: form.get('dateFacture'),
        dateEcheance: form.get('dateEcheance'),
        designation: form.get('designation'),
      });
      showToast('Facture ajoutée');
      setAddingFacture(false);
      afterMutation();
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : 'Erreur');
    } finally {
      setBusy(false);
    }
  }

  async function toggleFacturePaid(factureId: string) {
    setBusy(true);
    try {
      await api.patch(`/api/factures/${factureId}/toggle-paid`);
      afterMutation();
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : 'Erreur');
    } finally {
      setBusy(false);
    }
  }

  async function handleGenerateLetter(palierId: number) {
    setBusy(true);
    try {
      const { text } = await api.get<{ text: string }>(`/api/clients/${clientId}/letters/${palierId}`);
      setLetterText(text);
      setSendTo(client?.email ?? '');
      setAttachments([]);
      setSendStatus(null);
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : 'Erreur');
    } finally {
      setBusy(false);
    }
  }

  async function handleSendEmail(palierId: number) {
    if (!letterText || !client) return;
    setBusy(true);
    setSendStatus(null);
    try {
      const formData = new FormData();
      formData.append('to', sendTo);
      formData.append('subject', `${PALIERS[palierId].label} — ${client.nom}`);
      formData.append('body', letterText);
      formData.append('context', JSON.stringify({ type: 'client_letter', clientId, palier: palierId }));
      attachments.forEach((file) => formData.append('attachments', file));
      await api.upload('/api/send-email', formData);
      setSendStatus({ kind: 'ok', message: 'Message envoyé avec succès.' });
      setLetterText(null);
      setAttachments([]);
      afterMutation();
    } catch (err) {
      setSendStatus({ kind: 'err', message: err instanceof ApiError ? err.message : "Échec de l'envoi." });
    } finally {
      setBusy(false);
    }
  }

  async function handleMarkActionDone(palierId: number) {
    setBusy(true);
    try {
      await api.post(`/api/clients/${clientId}/actions`, { palier: palierId, note: actionNote });
      showToast('Action enregistrée');
      setActionNote('');
      setLetterText(null);
      afterMutation();
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : 'Erreur');
    } finally {
      setBusy(false);
    }
  }

  function copyLetter() {
    if (!letterText) return;
    navigator.clipboard?.writeText(letterText).then(
      () => showToast('Courrier copié'),
      () => showToast('Copie impossible dans cet environnement'),
    );
  }

  return (
    <div className="overlay open" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="drawer">
        <button className="drawer-close" onClick={onClose} aria-label="Fermer" title="Fermer">
          ✕
        </button>
        {loading || !client ? (
          <div>{error || 'Chargement…'}</div>
        ) : (
          <>
            <h2>{client.nom}</h2>
            <div className="sub">
              {client.entite} · {client.contact || '—'}
            </div>

            <div className="section-title">
              <span>Contact</span>
              {canEditContact && !editingContact && <button onClick={() => setEditingContact(true)}>Modifier</button>}
            </div>
            {editingContact ? (
              <form onSubmit={handleSaveContact} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <div>
                  <label>Contact</label>
                  <input type="text" name="contact" defaultValue={client.contact ?? ''} />
                </div>
                <div>
                  <label>Email</label>
                  <input type="email" name="email" defaultValue={client.email ?? ''} />
                </div>
                <div>
                  <label>Téléphone</label>
                  <input type="text" name="tel" defaultValue={client.tel ?? ''} />
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button className="primary" type="submit" disabled={busy}>
                    Enregistrer
                  </button>
                  <button type="button" onClick={() => setEditingContact(false)}>
                    Annuler
                  </button>
                </div>
              </form>
            ) : (
              <div className="info-grid">
                <div>
                  <span>Contact</span>
                  {client.contact || '—'}
                </div>
                <div>
                  <span>Email</span>
                  {client.email || '—'}
                </div>
                <div>
                  <span>Téléphone</span>
                  {client.tel || '—'}
                </div>
                <div>
                  <span>Encours</span>
                  {fmtFCFA(client.encours)}
                </div>
              </div>
            )}
            <div style={{ fontSize: 12, color: 'var(--ink-soft)', margin: '4px 0 0' }}>Jours de retard : {client.joursRetard} j</div>

            <div className="section-title">
              <span>Note</span>
              {canEditNote && !editingNote && <button onClick={() => setEditingNote(true)}>{client.note ? 'Modifier' : '+ Ajouter'}</button>}
            </div>
            {editingNote ? (
              <form onSubmit={handleSaveNote} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <textarea
                  name="note"
                  rows={2}
                  placeholder="Ex : en litige, attend un virement, contact injoignable…"
                  defaultValue={client.note ?? ''}
                />
                <div style={{ display: 'flex', gap: 8 }}>
                  <button className="primary" type="submit" disabled={busy}>
                    Enregistrer
                  </button>
                  <button type="button" onClick={() => setEditingNote(false)}>
                    Annuler
                  </button>
                </div>
              </form>
            ) : (
              client.note && <div style={{ fontSize: 13, color: 'var(--ink-soft)', whiteSpace: 'pre-wrap' }}>{client.note}</div>
            )}

            <div className="section-title">
              <span>Contacts</span>
              {canEditContact && !addingContact && <button onClick={() => setAddingContact(true)}>+ Ajouter</button>}
            </div>
            {addingContact && (
              <form onSubmit={handleAddContact} className="card-mini" style={{ borderColor: 'var(--accent)', display: 'flex', flexDirection: 'column', gap: 8 }}>
                <div>
                  <label>Nom</label>
                  <input type="text" name="nom" required />
                </div>
                <div>
                  <label>Fonction (optionnel)</label>
                  <input type="text" name="fonction" placeholder="Ex : Comptabilité, Direction…" />
                </div>
                <div>
                  <label>Email</label>
                  <input type="email" name="email" />
                </div>
                <div>
                  <label>Téléphone</label>
                  <input type="text" name="tel" />
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button className="primary" type="submit" disabled={busy}>
                    Ajouter
                  </button>
                  <button type="button" onClick={() => setAddingContact(false)}>
                    Annuler
                  </button>
                </div>
              </form>
            )}
            {client.contacts.length === 0 && !addingContact ? (
              <div style={{ color: 'var(--ink-soft)', fontSize: 12.5 }}>Aucun contact supplémentaire.</div>
            ) : (
              client.contacts.map((c) => (
                <div className="card-mini" key={c.id}>
                  <div className="row">
                    <strong>{c.nom}</strong>
                    {canEditContact && (
                      <button style={{ padding: '3px 9px', fontSize: 11 }} disabled={busy} onClick={() => handleDeleteContact(c)}>
                        Supprimer
                      </button>
                    )}
                  </div>
                  <div style={{ color: 'var(--ink-soft)', fontSize: 12 }}>
                    {[c.fonction, c.email, c.tel].filter(Boolean).join(' · ') || '—'}
                  </div>
                </div>
              ))
            )}

            <div className="section-title">
              <span>Palier actuel</span>
            </div>
            <span className="badge" data-tone={PALIERS[client.palier].tone} style={{ fontSize: 13, padding: '6px 12px' }}>
              {PALIERS[client.palier].label}
            </span>

            <div className="section-title">
              <span>Factures</span>
              {canAddFacture && !addingFacture && <button onClick={() => setAddingFacture(true)}>+ Ajouter</button>}
            </div>
            {addingFacture && (
              <form onSubmit={handleAddFacture} className="card-mini" style={{ borderColor: 'var(--accent)' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 8 }}>
                  <div>
                    <label>N° facture</label>
                    <input type="text" name="numero" placeholder="FA-2026-XXXX" required />
                  </div>
                  <div>
                    <label>Montant (FCFA)</label>
                    <input type="number" name="montant" required />
                  </div>
                  <div>
                    <label>Date de facture</label>
                    <input type="date" name="dateFacture" defaultValue={new Date().toISOString().slice(0, 10)} />
                  </div>
                  <div>
                    <label>Échéance</label>
                    <input type="date" name="dateEcheance" required />
                  </div>
                  <div style={{ gridColumn: '1 / -1' }}>
                    <label>Désignation (optionnel)</label>
                    <input type="text" name="designation" placeholder="Ex : Leasing, vente imprimante…" />
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button className="primary" type="submit" disabled={busy}>
                    Enregistrer
                  </button>
                  <button type="button" onClick={() => setAddingFacture(false)}>
                    Annuler
                  </button>
                </div>
              </form>
            )}
            {client.factures.map((f) => (
              <div className="card-mini" key={f.id}>
                <div className="row">
                  <strong>{f.numero}</strong>
                  <span className="mono">{fmtFCFA(f.montant)}</span>
                </div>
                <div className="row" style={{ color: 'var(--ink-soft)', fontSize: 12 }}>
                  <span>Échéance {fmtDate(f.dateEcheance)}</span>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ color: f.statut === 'impayee' ? 'var(--danger)' : 'var(--success)', fontWeight: 600 }}>
                      {f.statut === 'impayee' ? 'Impayée' : 'Payée'}
                    </span>
                    {canTogglePaid && (
                      <button style={{ padding: '3px 9px', fontSize: 11 }} disabled={busy} onClick={() => toggleFacturePaid(f.id)}>
                        {f.statut === 'impayee' ? 'Marquer payée' : 'Annuler'}
                      </button>
                    )}
                  </span>
                </div>
              </div>
            ))}

            <div className="section-title">Historique des actions</div>
            {client.actions.length ? (
              client.actions.map((a) => (
                <div className="timeline-item" key={a.id}>
                  <div className="timeline-date">{fmtDate(a.date)}</div>
                  <div>
                    {a.label}
                    {a.note ? ` — ${a.note}` : ''}
                  </div>
                </div>
              ))
            ) : (
              <div style={{ color: 'var(--ink-soft)', fontSize: 12.5 }}>Aucune action enregistrée.</div>
            )}

            {client.palier > 0 ? (
              <div className="action-box">
                <div style={{ fontWeight: 600, marginBottom: 4 }}>Action recommandée</div>
                <div style={{ fontSize: 12.5, color: 'var(--ink-soft)', marginBottom: 12 }}>{PALIERS[client.palier].desc}</div>
                {canRecordAction && (
                  <textarea
                    rows={2}
                    placeholder="Commentaire (optionnel) — ex : contact obtenu, promesse de paiement, litige signalé…"
                    value={actionNote}
                    onChange={(e) => setActionNote(e.target.value)}
                    style={{ marginBottom: 10 }}
                  />
                )}
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  {canGenerateLetter && (
                    <button className="primary" disabled={busy} onClick={() => handleGenerateLetter(client.palier)}>
                      Générer le courrier
                    </button>
                  )}
                  {canRecordAction && (
                    <button disabled={busy} onClick={() => handleMarkActionDone(client.palier)}>
                      Marquer l'action comme faite
                    </button>
                  )}
                </div>
                {letterText && (
                  <>
                    <textarea
                      className="letter-preview"
                      rows={10}
                      value={letterText}
                      onChange={(e) => setLetterText(e.target.value)}
                      style={{ width: '100%', resize: 'vertical' }}
                    />
                    <div style={{ marginTop: 10 }}>
                      <label>Destinataire(s) — séparés par une virgule</label>
                      <input type="email" multiple value={sendTo} onChange={(e) => setSendTo(e.target.value)} />
                    </div>
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
                      <button onClick={copyLetter}>Copier le texte</button>
                      <button className="primary" disabled={busy || !sendTo} onClick={() => handleSendEmail(client.palier)}>
                        Envoyer par email (validation requise)
                      </button>
                    </div>
                    {sendStatus && <div className={`send-status ${sendStatus.kind === 'ok' ? 'ok' : 'err'}`}>{sendStatus.message}</div>}
                  </>
                )}
              </div>
            ) : (
              <div style={{ color: 'var(--success)', fontSize: 13, marginTop: 14 }}>✓ Compte à jour, aucune action requise.</div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

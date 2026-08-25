import { FormEvent, useState } from 'react';
import { AlertTriangle, CheckCircle2, Scale, TrendingUp, X } from 'lucide-react';
import { api, ApiError } from '../api/client';
import { ClientDetail, Contact, DossierRef, EcheancierPaiement, RoleUtilisateur, SignalOperations } from '../api/types';
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
  // Signal opérations -> recouvrement (cahier §8) : n'affiche rien tant que
  // le client n'a pas de fiche Opérations -- silencieux plutôt qu'un état
  // "vide" qui laisserait croire que le module a été consulté sans rien y
  // trouver.
  const { data: signalOperations } = useResource<SignalOperations>(`/api/clients/${clientId}/signal-operations`);
  // Dossier contentieux du client — chargé seulement à partir du palier 6
  // (« Commandement société »), pour proposer la bascule ou renvoyer au dossier.
  const dossierContentieuxPath = client && client.palier >= 6 ? `/api/contentieux/client/${clientId}/dossier` : null;
  const { data: dossierContentieux, refetch: refetchDossier } = useResource<DossierRef | null>(dossierContentieuxPath);

  const [editingContact, setEditingContact] = useState(false);
  const [editingNote, setEditingNote] = useState(false);
  const [editingRelance, setEditingRelance] = useState(false);
  const [addingContact, setAddingContact] = useState(false);
  const [addingFacture, setAddingFacture] = useState(false);
  const [editingFactureId, setEditingFactureId] = useState<string | null>(null);
  const [addingEcheancier, setAddingEcheancier] = useState(false);
  const [newTranches, setNewTranches] = useState<{ dateEcheance: string; montant: string }[]>([{ dateEcheance: '', montant: '' }]);
  const [actionNote, setActionNote] = useState('');
  const [letterText, setLetterText] = useState<string | null>(null);
  const [sendTo, setSendTo] = useState('');
  const [attachments, setAttachments] = useState<File[]>([]);
  const [sendStatus, setSendStatus] = useState<{ kind: 'ok' | 'err'; message: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const canEditContact = role === 'admin' || role === 'manager_entite';
  const canEditNote = role === 'admin' || role === 'manager_entite' || role === 'comptable';
  const canAddFacture = role === 'admin' || role === 'manager_entite';
  const canEditFacture = role === 'admin' || role === 'manager_entite';
  const canDeleteFacture = role === 'admin';
  const canRecordAction = role === 'admin' || role === 'manager_entite' || role === 'comptable';
  const canGenerateLetter = role === 'admin' || role === 'manager_entite';
  const canTogglePaid = role === 'admin' || role === 'manager_entite' || role === 'comptable';
  const canManageEcheancier = role === 'admin' || role === 'manager_entite';
  const canToggleTranche = role === 'admin' || role === 'manager_entite' || role === 'comptable';

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

  async function handleSaveRelance(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    setBusy(true);
    try {
      await api.patch(`/api/clients/${clientId}/prochaine-relance`, { date: form.get('date') });
      showToast('Prochaine relance enregistrée');
      setEditingRelance(false);
      afterMutation();
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : 'Erreur');
    } finally {
      setBusy(false);
    }
  }

  async function handleClearRelance() {
    setBusy(true);
    try {
      await api.patch(`/api/clients/${clientId}/prochaine-relance`, { date: null });
      showToast('Prochaine relance effacée');
      afterMutation();
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : 'Erreur');
    } finally {
      setBusy(false);
    }
  }

  async function handleChangeFrequence(frequenceFacturation: string) {
    setBusy(true);
    try {
      await api.patch(`/api/clients/${clientId}/frequence-facturation`, { frequenceFacturation });
      showToast('Fréquence de facturation mise à jour');
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

  async function handleSaveFacture(e: FormEvent<HTMLFormElement>, factureId: string) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    setBusy(true);
    try {
      await api.patch(`/api/factures/${factureId}`, {
        montant: Number(form.get('montant')),
        dateFacture: form.get('dateFacture'),
        dateEcheance: form.get('dateEcheance'),
        designation: form.get('designation'),
      });
      showToast('Facture corrigée');
      setEditingFactureId(null);
      afterMutation();
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : 'Erreur');
    } finally {
      setBusy(false);
    }
  }

  async function handleDeleteFacture(factureId: string, numero: string) {
    if (!confirm(`Supprimer définitivement la facture ${numero} ?`)) return;
    setBusy(true);
    try {
      await api.delete(`/api/factures/${factureId}`);
      showToast('Facture supprimée');
      afterMutation();
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : 'Erreur');
    } finally {
      setBusy(false);
    }
  }

  function updateNewTranche(index: number, field: 'dateEcheance' | 'montant', value: string) {
    setNewTranches((rows) => rows.map((r, i) => (i === index ? { ...r, [field]: value } : r)));
  }

  async function handleCreateEcheancier(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const motif = new FormData(e.currentTarget).get('motif');
    setBusy(true);
    try {
      await api.post(`/api/clients/${clientId}/echeanciers`, {
        motif,
        tranches: newTranches
          .filter((t) => t.dateEcheance && t.montant)
          .map((t) => ({ dateEcheance: t.dateEcheance, montant: Number(t.montant) })),
      });
      showToast('Échéancier créé');
      setAddingEcheancier(false);
      setNewTranches([{ dateEcheance: '', montant: '' }]);
      afterMutation();
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : 'Erreur');
    } finally {
      setBusy(false);
    }
  }

  async function toggleTranchePaid(echeancierId: string, trancheId: string) {
    setBusy(true);
    try {
      await api.patch(`/api/clients/${clientId}/echeanciers/${echeancierId}/tranches/${trancheId}/toggle-paid`);
      afterMutation();
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : 'Erreur');
    } finally {
      setBusy(false);
    }
  }

  async function handleDeleteEcheancier(echeancier: EcheancierPaiement) {
    if (!confirm(`Supprimer cet échéancier (${fmtFCFA(echeancier.montantTotal)}) ?`)) return;
    setBusy(true);
    try {
      await api.delete(`/api/clients/${clientId}/echeanciers/${echeancier.id}`);
      showToast('Échéancier supprimé');
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

  async function handleBasculer() {
    if (!confirm('Basculer ce client en contentieux ?\n\nUn dossier contentieux et un brouillon de commandement de payer (société) seront préparés automatiquement. L’envoi restera à valider dans l’onglet Contentieux.')) return;
    setBusy(true);
    try {
      const r = await api.post<{ dossier: DossierRef; existant: boolean }>('/api/contentieux/basculer', { clientId });
      showToast(
        r.existant
          ? `Déjà en contentieux : ${r.dossier.reference}`
          : `Basculé en contentieux : ${r.dossier.reference} — brouillon de commandement prêt dans l’onglet Contentieux`,
      );
      refetchDossier();
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : 'Erreur');
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
        {loading || !client ? (
          <div>{error || 'Chargement…'}</div>
        ) : (
          <>
            <h2>{client.nom}</h2>
            <div className="sub">
              {client.entite} · {client.contact || '—'}
            </div>

            {signalOperations?.hasOperations && (signalOperations.problemesOuverts > 0 || signalOperations.climat === 'rouge') && (
              <div
                className="signal-banner"
                style={{ margin: '12px 0' }}
                title="Signal en provenance du module Opérations — jamais de détail, juste ce compteur et le climat"
              >
                <AlertTriangle size={17} />
                <div>
                  Suivi Opérations : {signalOperations.problemesOuverts} problème{signalOperations.problemesOuverts > 1 ? 's' : ''} ouvert
                  {signalOperations.problemesOuverts > 1 ? 's' : ''}
                  {signalOperations.problemesBloquants > 0 && ` (${signalOperations.problemesBloquants} bloquant${signalOperations.problemesBloquants > 1 ? 's' : ''})`}
                  {signalOperations.climat === 'rouge' && ' · Climat rouge'}
                  {' — '}
                  un agent qui voit ce signal doit alerter plutôt qu'escalader vers une mise en demeure.
                </div>
              </div>
            )}

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
            <div style={{ fontSize: 12, color: 'var(--ink-soft)', margin: '4px 0 0', display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <span>
                Jours de retard : {client.joursRetard} j
                {client.delaiMoyenHistorique !== null && (
                  <>
                    {' '}
                    · Habituellement :{' '}
                    {client.delaiMoyenHistorique > 0
                      ? `${Math.round(client.delaiMoyenHistorique)} j de retard en moyenne`
                      : client.delaiMoyenHistorique < 0
                        ? `${Math.round(-client.delaiMoyenHistorique)} j d'avance en moyenne`
                        : 'paie à l’échéance'}
                  </>
                )}
              </span>
              {client.retardInhabituel && (
                <span className="badge" data-tone="amber" title="Nettement au-dessus du délai de paiement habituel de ce client">
                  <TrendingUp size={11} /> Retard inhabituel
                </span>
              )}
            </div>

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
              <span>Prochaine relance (promesse de paiement)</span>
              {canEditNote && !editingRelance && (
                <button onClick={() => setEditingRelance(true)}>{client.prochaineRelance ? 'Modifier' : '+ Ajouter'}</button>
              )}
            </div>
            {editingRelance ? (
              <form onSubmit={handleSaveRelance} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <input type="date" name="date" defaultValue={client.prochaineRelance?.slice(0, 10) ?? ''} />
                <div style={{ display: 'flex', gap: 8 }}>
                  <button className="primary" type="submit" disabled={busy}>
                    Enregistrer
                  </button>
                  <button type="button" onClick={() => setEditingRelance(false)}>
                    Annuler
                  </button>
                </div>
              </form>
            ) : client.prochaineRelance ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 13 }}>
                <span
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 4,
                    color: new Date(client.prochaineRelance) < new Date() ? 'var(--danger)' : 'var(--ink-soft)',
                    fontWeight: new Date(client.prochaineRelance) < new Date() ? 600 : 400,
                  }}
                >
                  {new Date(client.prochaineRelance) < new Date() && <AlertTriangle size={12} />}
                  {fmtDate(client.prochaineRelance)}
                </span>
                {canEditNote && (
                  <button style={{ padding: '3px 9px', fontSize: 11 }} disabled={busy} onClick={handleClearRelance}>
                    Effacer
                  </button>
                )}
              </div>
            ) : (
              <div style={{ color: 'var(--ink-soft)', fontSize: 12.5 }}>Aucune date enregistrée.</div>
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
              <span>Fréquence de facturation</span>
            </div>
            {canEditContact ? (
              <select
                value={client.frequenceFacturation}
                disabled={busy}
                onChange={(e) => handleChangeFrequence(e.target.value)}
                style={{ maxWidth: 220 }}
              >
                <option value="mensuelle">Mensuelle</option>
                <option value="trimestrielle">Trimestrielle</option>
                <option value="annuelle">Annuelle</option>
              </select>
            ) : (
              <div style={{ fontSize: 13 }}>
                {client.frequenceFacturation === 'trimestrielle' ? 'Trimestrielle' : client.frequenceFacturation === 'annuelle' ? 'Annuelle' : 'Mensuelle'}
              </div>
            )}
            {client.frequenceFacturation !== 'mensuelle' && (
              <div style={{ fontSize: 11.5, color: 'var(--ink-soft)', marginTop: 4 }}>
                L'échelle de paliers est adaptée en conséquence (seuils ×{client.frequenceFacturation === 'trimestrielle' ? 3 : 12}).
              </div>
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
            {client.factures.map((f) =>
              editingFactureId === f.id ? (
                <form
                  key={f.id}
                  onSubmit={(e) => handleSaveFacture(e, f.id)}
                  className="card-mini"
                  style={{ borderColor: 'var(--accent)' }}
                >
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 8 }}>
                    <div>
                      <label>Montant (FCFA)</label>
                      <input type="number" name="montant" step="any" defaultValue={f.montant} required />
                    </div>
                    <div>
                      <label>Date de facture</label>
                      <input type="date" name="dateFacture" defaultValue={f.dateFacture?.slice(0, 10) ?? ''} />
                    </div>
                    <div>
                      <label>Échéance</label>
                      <input type="date" name="dateEcheance" defaultValue={f.dateEcheance.slice(0, 10)} required />
                    </div>
                    <div style={{ gridColumn: '1 / -1' }}>
                      <label>Désignation (optionnel)</label>
                      <input type="text" name="designation" defaultValue={f.designation ?? ''} />
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button className="primary" type="submit" disabled={busy}>
                      Enregistrer
                    </button>
                    <button type="button" onClick={() => setEditingFactureId(null)}>
                      Annuler
                    </button>
                  </div>
                </form>
              ) : (
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
                      {canEditFacture && (
                        <button style={{ padding: '3px 9px', fontSize: 11 }} disabled={busy} onClick={() => setEditingFactureId(f.id)}>
                          Modifier
                        </button>
                      )}
                      {canDeleteFacture && (
                        <button
                          className="danger-btn"
                          style={{ padding: '3px 9px', fontSize: 11 }}
                          disabled={busy}
                          onClick={() => handleDeleteFacture(f.id, f.numero)}
                        >
                          Supprimer
                        </button>
                      )}
                    </span>
                  </div>
                </div>
              ),
            )}

            <div className="section-title">
              <span>Échéancier de paiement</span>
              {canManageEcheancier && !addingEcheancier && <button onClick={() => setAddingEcheancier(true)}>+ Créer</button>}
            </div>
            {addingEcheancier && (
              <form onSubmit={handleCreateEcheancier} className="card-mini" style={{ borderColor: 'var(--accent)' }}>
                <div style={{ marginBottom: 8 }}>
                  <label>Motif (optionnel)</label>
                  <input type="text" name="motif" placeholder="Ex : accord amiable suite à difficulté de trésorerie" />
                </div>
                {newTranches.map((t, i) => (
                  <div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 8 }}>
                    <div>
                      <label>Date tranche {i + 1}</label>
                      <input
                        type="date"
                        value={t.dateEcheance}
                        onChange={(e) => updateNewTranche(i, 'dateEcheance', e.target.value)}
                        required
                      />
                    </div>
                    <div>
                      <label>Montant (FCFA)</label>
                      <input
                        type="number"
                        value={t.montant}
                        onChange={(e) => updateNewTranche(i, 'montant', e.target.value)}
                        required
                      />
                    </div>
                  </div>
                ))}
                <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
                  <button type="button" onClick={() => setNewTranches((rows) => [...rows, { dateEcheance: '', montant: '' }])}>
                    + Ajouter une tranche
                  </button>
                  {newTranches.length > 1 && (
                    <button type="button" onClick={() => setNewTranches((rows) => rows.slice(0, -1))}>
                      Retirer la dernière
                    </button>
                  )}
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button className="primary" type="submit" disabled={busy}>
                    Enregistrer
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setAddingEcheancier(false);
                      setNewTranches([{ dateEcheance: '', montant: '' }]);
                    }}
                  >
                    Annuler
                  </button>
                </div>
              </form>
            )}
            {client.echeanciers.length === 0 && !addingEcheancier ? (
              <div style={{ color: 'var(--ink-soft)', fontSize: 12.5 }}>Aucun échéancier en cours.</div>
            ) : (
              client.echeanciers.map((ech) => {
                const paye = ech.tranches.filter((t) => t.statut === 'payee').reduce((s, t) => s + t.montant, 0);
                const restant = ech.montantTotal - paye;
                return (
                  <div className="card-mini" key={ech.id}>
                    <div className="row">
                      <strong>{fmtFCFA(ech.montantTotal)}</strong>
                      <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ fontSize: 12, color: restant > 0 ? 'var(--amber)' : 'var(--success)' }}>
                          {restant > 0 ? `Reste ${fmtFCFA(restant)}` : 'Soldé'}
                        </span>
                        {canManageEcheancier && (
                          <button className="danger-btn" style={{ padding: '3px 9px', fontSize: 11 }} disabled={busy} onClick={() => handleDeleteEcheancier(ech)}>
                            Supprimer
                          </button>
                        )}
                      </span>
                    </div>
                    {ech.motif && <div style={{ color: 'var(--ink-soft)', fontSize: 12, marginBottom: 6 }}>{ech.motif}</div>}
                    {ech.tranches.map((t) => (
                      <div key={t.id} className="row" style={{ fontSize: 12.5, padding: '4px 0' }}>
                        <span>
                          Tranche {t.ordre} — {fmtDate(t.dateEcheance)}
                        </span>
                        <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <span className="mono">{fmtFCFA(t.montant)}</span>
                          <span style={{ color: t.statut === 'impayee' ? 'var(--danger)' : 'var(--success)', fontWeight: 600 }}>
                            {t.statut === 'impayee' ? 'Impayée' : 'Payée'}
                          </span>
                          {canToggleTranche && (
                            <button style={{ padding: '2px 8px', fontSize: 11 }} disabled={busy} onClick={() => toggleTranchePaid(ech.id, t.id)}>
                              {t.statut === 'impayee' ? 'Marquer payée' : 'Annuler'}
                            </button>
                          )}
                        </span>
                      </div>
                    ))}
                  </div>
                );
              })
            )}

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
                {client.palier >= 6 ? (
                  dossierContentieux ? (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
                      <Scale size={16} style={{ color: 'var(--accent-dark)', flexShrink: 0 }} />
                      <div>
                        En contentieux : <strong>{dossierContentieux.reference}</strong>. Poursuivez dans l’onglet{' '}
                        <strong>Contentieux</strong> (commandement société, huissier, assignation).
                      </div>
                    </div>
                  ) : (
                    <div>
                      <div style={{ fontSize: 12.5, color: 'var(--ink-soft)', marginBottom: 10 }}>
                        À ce palier on ne rédige plus de courrier amiable : le commandement de payer (société) se prépare dans le
                        contentieux — l’envoi restera à valider.
                      </div>
                      <button className="primary" disabled={busy} onClick={handleBasculer}>
                        <Scale size={14} /> Basculer en contentieux
                      </button>
                    </div>
                  )
                ) : (
                <>
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
                </>
                )}
              </div>
            ) : (
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'var(--success)', fontSize: 13, marginTop: 14 }}>
                <CheckCircle2 size={15} /> Compte à jour, aucune action requise.
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

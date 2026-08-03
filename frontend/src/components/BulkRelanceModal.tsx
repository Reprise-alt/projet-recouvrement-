import { useState } from 'react';
import { api, ApiError } from '../api/client';
import { useToast } from '../hooks/useToast';
import { ClientListItem } from '../api/types';
import { PALIERS } from '../lib/constants';

interface Props {
  palierId: number;
  clients: ClientListItem[];
  onClose: () => void;
  onDone: () => void;
}

interface SendResult {
  clientId: string;
  nom: string;
  ok: boolean;
  message: string;
}

interface Recipient {
  key: string;
  label: string;
  email: string;
}

// Le contact principal (contact/email de la fiche) plus tous les contacts
// additionnels ayant une adresse — chacun sélectionnable indépendamment,
// plutôt que de ne proposer que le premier email de la fiche.
function recipientsOf(c: ClientListItem): Recipient[] {
  const list: Recipient[] = [];
  if (c.email?.trim()) {
    list.push({ key: `${c.id}:principal`, label: c.contact?.trim() || 'Contact principal', email: c.email.trim() });
  }
  for (const ct of c.contacts) {
    if (ct.email?.trim()) {
      list.push({ key: `${c.id}:${ct.id}`, label: ct.fonction ? `${ct.nom} (${ct.fonction})` : ct.nom, email: ct.email.trim() });
    }
  }
  return list;
}

// Envoie, un par un (pas en parallèle, pour rester raisonnable côté quota
// Gmail et laisser une trace propre par client), le courrier standard du
// palier à tous les clients sélectionnés. Contrairement à l'envoi individuel,
// le texte n'est pas relu avant envoi — on ne l'utilise donc que pour des
// relances formulaïques (rappels, avis de suspension...), jamais pour la
// mise en demeure ou le contentieux qui restent du cas par cas.
export function BulkRelanceModal({ palierId, clients, onClose, onDone }: Props) {
  const { showToast } = useToast();
  const recipientsByClient = new Map(clients.map((c) => [c.id, recipientsOf(c)] as const));
  const eligible = clients.filter((c) => (recipientsByClient.get(c.id)?.length ?? 0) > 0);

  const [selected, setSelected] = useState<Set<string>>(() => {
    // Par défaut, seul le contact principal (ou à défaut le premier contact)
    // est coché — envoyer à tout le monde d'un coup reste un choix explicite.
    const initial = new Set<string>();
    eligible.forEach((c) => {
      const first = recipientsByClient.get(c.id)?.[0];
      if (first) initial.add(first.key);
    });
    return initial;
  });
  const [sending, setSending] = useState(false);
  const [progress, setProgress] = useState(0);
  const [results, setResults] = useState<SendResult[] | null>(null);

  function toggle(key: string) {
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  const clientsWithSelection = eligible.filter((c) => recipientsByClient.get(c.id)!.some((r) => selected.has(r.key)));

  async function handleSend() {
    if (!clientsWithSelection.length) return;
    setSending(true);
    setProgress(0);
    const outcome: SendResult[] = [];
    for (const c of clientsWithSelection) {
      const to = recipientsByClient
        .get(c.id)!
        .filter((r) => selected.has(r.key))
        .map((r) => r.email)
        .join(', ');
      try {
        const { text } = await api.get<{ text: string }>(`/api/clients/${c.id}/letters/${palierId}`);
        const formData = new FormData();
        formData.append('to', to);
        formData.append('subject', `${PALIERS[palierId].label} — ${c.nom}`);
        formData.append('body', text);
        formData.append('context', JSON.stringify({ type: 'client_letter', clientId: c.id, palier: palierId }));
        await api.upload('/api/send-email', formData);
        outcome.push({ clientId: c.id, nom: c.nom, ok: true, message: 'Envoyé' });
      } catch (err) {
        outcome.push({ clientId: c.id, nom: c.nom, ok: false, message: err instanceof ApiError ? err.message : 'Échec' });
      }
      setProgress((p) => p + 1);
    }
    setResults(outcome);
    setSending(false);
    onDone();
    const okCount = outcome.filter((r) => r.ok).length;
    showToast(`${okCount}/${outcome.length} relance(s) envoyée(s)`);
  }

  return (
    <div className="modal-overlay open" onClick={(e) => e.target === e.currentTarget && !sending && onClose()}>
      <div className="modal" style={{ maxWidth: 560 }}>
        <h2 style={{ marginBottom: 4 }}>Relance groupée — {PALIERS[palierId].label}</h2>
        <div style={{ color: 'var(--ink-soft)', fontSize: 12.5, marginBottom: 14 }}>
          Envoie à chaque client sélectionné le courrier standard de ce palier (texte non personnalisé par client). Un client
          avec plusieurs contacts cochés reçoit un seul mail avec tous en destinataires.
        </div>

        {!results && (
          <>
            <div style={{ maxHeight: 380, overflowY: 'auto', marginBottom: 14 }}>
              {clients.map((c) => {
                const recipients = recipientsByClient.get(c.id) ?? [];
                if (!recipients.length) {
                  return (
                    <div key={c.id} style={{ padding: '8px 0', opacity: 0.5, fontSize: 13 }}>
                      <div style={{ fontWeight: 600 }}>{c.nom}</div>
                      <div style={{ color: 'var(--ink-soft)', fontSize: 11.5 }}>Pas d'email — ignoré</div>
                    </div>
                  );
                }
                return (
                  <div key={c.id} style={{ padding: '8px 0', borderBottom: '1px solid var(--line-soft)' }}>
                    <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 4 }}>{c.nom}</div>
                    {recipients.map((r) => (
                      <label key={r.key} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '3px 0 3px 8px', fontSize: 12.5 }}>
                        <input type="checkbox" disabled={sending} checked={selected.has(r.key)} onChange={() => toggle(r.key)} />
                        <span style={{ flex: 1 }}>{r.label}</span>
                        <span style={{ color: 'var(--ink-soft)', fontSize: 11.5 }}>{r.email}</span>
                      </label>
                    ))}
                  </div>
                );
              })}
            </div>
            {sending && (
              <div style={{ marginBottom: 12, fontSize: 12.5, color: 'var(--ink-soft)' }}>
                Envoi en cours… {progress}/{clientsWithSelection.length}
              </div>
            )}
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button type="button" onClick={onClose} disabled={sending}>
                Annuler
              </button>
              <button className="primary" onClick={handleSend} disabled={sending || clientsWithSelection.length === 0}>
                Envoyer à {clientsWithSelection.length} client{clientsWithSelection.length > 1 ? 's' : ''}
              </button>
            </div>
          </>
        )}

        {results && (
          <>
            <div style={{ maxHeight: 320, overflowY: 'auto', marginBottom: 14 }}>
              {results.map((r) => (
                <div key={r.clientId} style={{ fontSize: 13, padding: '4px 0', color: r.ok ? 'var(--ink)' : 'var(--danger)' }}>
                  {r.ok ? '✓' : '✗'} {r.nom} — {r.message}
                </div>
              ))}
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <button className="primary" onClick={onClose}>
                Fermer
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

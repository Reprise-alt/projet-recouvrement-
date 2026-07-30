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

// Envoie, un par un (pas en parallèle, pour rester raisonnable côté quota
// Gmail et laisser une trace propre par client), le courrier standard du
// palier à tous les clients sélectionnés. Contrairement à l'envoi individuel,
// le texte n'est pas relu avant envoi — on ne l'utilise donc que pour des
// relances formulaïques (rappels, avis de suspension...), jamais pour la
// mise en demeure ou le contentieux qui restent du cas par cas.
export function BulkRelanceModal({ palierId, clients, onClose, onDone }: Props) {
  const { showToast } = useToast();
  const eligible = clients.filter((c) => c.email && c.email.trim());
  const [selected, setSelected] = useState<Set<string>>(new Set(eligible.map((c) => c.id)));
  const [sending, setSending] = useState(false);
  const [progress, setProgress] = useState(0);
  const [results, setResults] = useState<SendResult[] | null>(null);

  function toggle(id: string) {
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function handleSend() {
    const targets = eligible.filter((c) => selected.has(c.id));
    if (!targets.length) return;
    setSending(true);
    setProgress(0);
    const outcome: SendResult[] = [];
    for (const c of targets) {
      try {
        const { text } = await api.get<{ text: string }>(`/api/clients/${c.id}/letters/${palierId}`);
        const formData = new FormData();
        formData.append('to', c.email!);
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
      <div className="modal" style={{ maxWidth: 520 }}>
        <h2 style={{ marginBottom: 4 }}>Relance groupée — {PALIERS[palierId].label}</h2>
        <div style={{ color: 'var(--ink-soft)', fontSize: 12.5, marginBottom: 14 }}>
          Envoie à chaque client sélectionné le courrier standard de ce palier (texte non personnalisé par client).
        </div>

        {!results && (
          <>
            <div style={{ maxHeight: 320, overflowY: 'auto', marginBottom: 14 }}>
              {clients.map((c) => {
                const hasEmail = !!c.email?.trim();
                return (
                  <label
                    key={c.id}
                    style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 0', opacity: hasEmail ? 1 : 0.5, fontSize: 13 }}
                  >
                    <input type="checkbox" disabled={!hasEmail || sending} checked={selected.has(c.id)} onChange={() => toggle(c.id)} />
                    <span style={{ flex: 1 }}>{c.nom}</span>
                    <span style={{ color: 'var(--ink-soft)', fontSize: 11.5 }}>{hasEmail ? c.email : "Pas d'email — ignoré"}</span>
                  </label>
                );
              })}
            </div>
            {sending && (
              <div style={{ marginBottom: 12, fontSize: 12.5, color: 'var(--ink-soft)' }}>
                Envoi en cours… {progress}/{selected.size}
              </div>
            )}
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button type="button" onClick={onClose} disabled={sending}>
                Annuler
              </button>
              <button className="primary" onClick={handleSend} disabled={sending || selected.size === 0}>
                Envoyer à {selected.size} client{selected.size > 1 ? 's' : ''}
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

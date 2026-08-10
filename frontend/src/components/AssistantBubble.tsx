import { FormEvent, useEffect, useRef, useState } from 'react';
import { MessageCircle, Send, X } from 'lucide-react';
import { api, ApiError } from '../api/client';
import { AssistantChatResponse, AssistantMessage } from '../api/types';

// Bulle flottante visible sur toute la plateforme (Recouvrement, Opérations,
// Parc d'impression) -- un composant global monté une seule fois dans
// App.tsx, indépendant du module/onglet affiché. L'historique de
// conversation vit uniquement en mémoire côté client (pas de session
// serveur) : renvoyé en entier à chaque message, perdu à l'actualisation de
// la page -- volontairement simple, cohérent avec le reste de l'API qui ne
// garde aucun état entre deux requêtes.
export function AssistantBubble() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<AssistantMessage[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (listRef.current) listRef.current.scrollTop = listRef.current.scrollHeight;
  }, [messages, open]);

  async function envoyer(e: FormEvent) {
    e.preventDefault();
    const texte = input.trim();
    if (!texte || busy) return;
    const historique = [...messages, { role: 'user' as const, content: texte }];
    setMessages(historique);
    setInput('');
    setError(null);
    setBusy(true);
    try {
      const res = await api.post<AssistantChatResponse>('/api/assistant/chat', { messages: historique });
      setMessages([...historique, res.message]);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "L'assistant n'a pas pu répondre — réessayez.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label={open ? "Fermer l'assistant" : "Ouvrir l'assistant"}
        style={{
          position: 'fixed',
          bottom: 24,
          right: 24,
          width: 52,
          height: 52,
          borderRadius: '50%',
          background: 'var(--chrome-bg)',
          color: 'var(--chrome-text)',
          border: 'none',
          boxShadow: 'var(--shadow-lg)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          cursor: 'pointer',
          zIndex: 1000,
        }}
      >
        {open ? <X size={22} /> : <MessageCircle size={22} />}
      </button>

      {open && (
        <div
          style={{
            position: 'fixed',
            bottom: 88,
            right: 24,
            width: 'min(380px, calc(100vw - 32px))',
            height: 'min(560px, calc(100vh - 140px))',
            background: 'var(--surface)',
            border: '1px solid var(--line)',
            borderRadius: 'var(--radius-lg)',
            boxShadow: 'var(--shadow-lg)',
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
            zIndex: 1000,
          }}
        >
          <div
            style={{
              padding: '14px 16px',
              borderBottom: '1px solid var(--line-soft)',
              fontWeight: 700,
              fontSize: 14,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}
          >
            Assistant Olu 360
            <button onClick={() => setOpen(false)} aria-label="Fermer" style={{ background: 'none', border: 'none', padding: 4 }}>
              <X size={15} />
            </button>
          </div>

          <div ref={listRef} style={{ flex: 1, overflowY: 'auto', padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 10 }}>
            {messages.length === 0 && (
              <div style={{ fontSize: 12.5, color: 'var(--ink-soft)', lineHeight: 1.5 }}>
                Posez une question sur vos données — ex. « Combien de clients en retard chez SEN'EAU ? » ou « Climat du portefeuille
                Opérations ? ». Je réponds à partir des données réelles de l'application, dans les limites de vos droits d'accès.
              </div>
            )}
            {messages.map((m, i) => (
              <div
                key={i}
                style={{
                  alignSelf: m.role === 'user' ? 'flex-end' : 'flex-start',
                  maxWidth: '85%',
                  background: m.role === 'user' ? 'var(--accent-soft)' : 'var(--paper-2, var(--surface))',
                  border: m.role === 'user' ? 'none' : '1px solid var(--line-soft)',
                  borderRadius: 10,
                  padding: '8px 11px',
                  fontSize: 13,
                  lineHeight: 1.45,
                  whiteSpace: 'pre-wrap',
                }}
              >
                {m.content}
              </div>
            ))}
            {busy && (
              <div style={{ alignSelf: 'flex-start', fontSize: 12.5, color: 'var(--ink-soft)', fontStyle: 'italic' }}>L'assistant réfléchit…</div>
            )}
            {error && <div className="login-error">{error}</div>}
          </div>

          <form onSubmit={envoyer} style={{ display: 'flex', gap: 8, padding: 12, borderTop: '1px solid var(--line-soft)' }}>
            <input
              type="text"
              placeholder="Votre question…"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              disabled={busy}
              style={{ flex: 1 }}
            />
            <button className="primary" type="submit" disabled={busy || !input.trim()} aria-label="Envoyer" style={{ padding: '9px 12px' }}>
              <Send size={15} />
            </button>
          </form>
        </div>
      )}
    </>
  );
}

import { useEffect } from 'react';
import { api, ApiError } from '../api/client';
import { GmailStatus } from '../api/types';
import { useResource } from '../hooks/useResource';
import { useToast } from '../hooks/useToast';
import { fmtDate } from '../lib/constants';

export function IntegrationsPanel({ onClose }: { onClose: () => void }) {
  const { showToast } = useToast();
  const { data: status, loading, refetch } = useResource<GmailStatus>('/api/integrations/gmail/status');

  // L'autorisation Google se termine dans un nouvel onglet (le callback OAuth
  // n'a pas accès au token de cette session) — on rafraîchit le statut quand
  // l'admin revient sur cet onglet, plutôt que d'exiger un clic manuel.
  useEffect(() => {
    function onFocus() {
      refetch();
    }
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [refetch]);

  async function handleConnect() {
    try {
      const { url } = await api.get<{ url: string }>('/api/integrations/gmail/auth-url');
      window.open(url, '_blank', 'noopener');
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : 'Erreur');
    }
  }

  async function handleDisconnect() {
    if (!confirm('Déconnecter le compte Gmail ?')) return;
    try {
      await api.post('/api/integrations/gmail/disconnect');
      showToast('Gmail déconnecté');
      refetch();
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : 'Erreur');
    }
  }

  return (
    <div className="modal-overlay open" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal">
        <h2 style={{ marginBottom: 4 }}>Intégrations</h2>
        <div style={{ color: 'var(--ink-soft)', fontSize: 12.5, marginBottom: 16 }}>
          Compte Gmail dédié utilisé pour l'envoi des courriers et avenants (ex : recouvrement@soram-afrique.com).
          ARTIS et MAPON seront ajoutés ici une fois les accès obtenus.
        </div>

        <div className="section-title">Gmail</div>
        {loading || !status ? (
          <div>Chargement…</div>
        ) : status.connected ? (
          <div className="card-mini">
            <div className="row">
              <div>
                <strong>Connecté</strong>
                <div style={{ fontSize: 12, color: 'var(--ink-soft)' }}>{status.compteEmail}</div>
              </div>
              <button className="danger-btn" onClick={handleDisconnect}>
                Déconnecter
              </button>
            </div>
            {status.derniereSync && (
              <div style={{ fontSize: 11, color: 'var(--ink-soft)', marginTop: 6 }}>Dernier envoi : {fmtDate(status.derniereSync)}</div>
            )}
          </div>
        ) : (
          <div className="card-mini">
            <div style={{ marginBottom: 10, fontSize: 13 }}>Aucun compte Gmail connecté.</div>
            <button className="primary" onClick={handleConnect}>
              Connecter Gmail
            </button>
          </div>
        )}

        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 20 }}>
          <button onClick={onClose}>Fermer</button>
        </div>
      </div>
    </div>
  );
}

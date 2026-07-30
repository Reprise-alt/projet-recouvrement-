import { useEffect } from 'react';
import { api, ApiError } from '../api/client';
import { Entreprise, GmailStatus } from '../api/types';
import { useResource } from '../hooks/useResource';
import { useToast } from '../hooks/useToast';
import { fmtDate } from '../lib/constants';

export function IntegrationsPanel({ onClose }: { onClose: () => void }) {
  const { showToast } = useToast();
  const { data: entreprises, loading: loadingEntreprises } = useResource<Entreprise[]>('/api/entreprises');
  const { data: statuses, loading: loadingStatus, refetch } = useResource<GmailStatus[]>('/api/integrations/gmail/status');

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

  async function handleConnect(entite: string) {
    try {
      const { url } = await api.get<{ url: string }>(`/api/integrations/gmail/auth-url?entite=${encodeURIComponent(entite)}`);
      window.open(url, '_blank', 'noopener');
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : 'Erreur');
    }
  }

  async function handleDisconnect(entite: string) {
    if (!confirm(`Déconnecter le compte Gmail de ${entite} ?`)) return;
    try {
      await api.post('/api/integrations/gmail/disconnect', { entite });
      showToast('Gmail déconnecté');
      refetch();
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : 'Erreur');
    }
  }

  const loading = loadingEntreprises || loadingStatus;

  return (
    <div className="modal-overlay open" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ width: 'min(560px, 92%)' }}>
        <h2 style={{ marginBottom: 4 }}>Intégrations</h2>
        <div style={{ color: 'var(--ink-soft)', fontSize: 12.5, marginBottom: 16 }}>
          Un compte Gmail par entité — chaque société envoie ses courriers de relance depuis sa propre adresse
          (ex : recouvrement@soram-afrique.com), jamais depuis un compte partagé. ARTIS et MAPON seront ajoutés ici
          une fois les accès obtenus.
        </div>

        <div className="section-title">Gmail</div>
        {loading || !entreprises ? (
          <div>Chargement…</div>
        ) : (
          entreprises.map((entreprise) => {
            const status = statuses?.find((s) => s.entite === entreprise.code);
            return (
              <div className="card-mini" key={entreprise.id}>
                <div className="row">
                  <div>
                    <strong>{entreprise.nom}</strong>
                    <div style={{ fontSize: 11, color: 'var(--ink-soft)' }} className="mono">
                      {entreprise.code}
                    </div>
                  </div>
                  {status?.connected ? (
                    <button className="danger-btn" onClick={() => handleDisconnect(entreprise.code)}>
                      Déconnecter
                    </button>
                  ) : (
                    <button className="primary" onClick={() => handleConnect(entreprise.code)}>
                      Connecter
                    </button>
                  )}
                </div>
                {status?.connected ? (
                  <div style={{ fontSize: 12, color: 'var(--ink-soft)', marginTop: 4 }}>
                    {status.compteEmail}
                    {status.derniereSync && ` · dernier envoi : ${fmtDate(status.derniereSync)}`}
                  </div>
                ) : (
                  <div style={{ fontSize: 12, color: 'var(--ink-soft)', marginTop: 4 }}>Aucun compte Gmail connecté.</div>
                )}
              </div>
            );
          })
        )}

        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 20 }}>
          <button onClick={onClose}>Fermer</button>
        </div>
      </div>
    </div>
  );
}

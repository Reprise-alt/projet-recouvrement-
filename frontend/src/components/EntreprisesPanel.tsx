import { FormEvent, useState } from 'react';
import { api, ApiError } from '../api/client';
import { Entreprise } from '../api/types';
import { useResource } from '../hooks/useResource';
import { useToast } from '../hooks/useToast';

export function EntreprisesPanel({ onClose, onChanged }: { onClose: () => void; onChanged: () => void }) {
  const { showToast } = useToast();
  const { data: entreprises, loading, refetch } = useResource<Entreprise[]>('/api/entreprises?all=true');
  const [busy, setBusy] = useState(false);

  function afterMutation() {
    refetch();
    onChanged();
  }

  async function handleCreate(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    setBusy(true);
    try {
      await api.post('/api/entreprises', { code: form.get('code'), nom: form.get('nom') });
      showToast('Entreprise créée');
      (e.target as HTMLFormElement).reset();
      afterMutation();
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : 'Erreur');
    } finally {
      setBusy(false);
    }
  }

  async function toggleActif(entreprise: Entreprise) {
    setBusy(true);
    try {
      await api.patch(`/api/entreprises/${entreprise.id}`, { actif: !entreprise.actif });
      afterMutation();
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : 'Erreur');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="modal-overlay open" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ width: 'min(560px, 92%)' }}>
        <h2 style={{ marginBottom: 4 }}>Entreprises</h2>
        <div style={{ color: 'var(--ink-soft)', fontSize: 12.5, marginBottom: 16 }}>
          Les entités du groupe (SORAM, SIS, IRIS…). En ajouter une la rend disponible partout : filtre par entité,
          import de fichiers (reconnue si son nom apparaît dans le bandeau du classeur), rattachement des utilisateurs.
          Une entité désactivée n'apparaît plus dans les filtres, mais ses données existantes sont conservées.
        </div>

        <div className="section-title">Entités</div>
        {loading || !entreprises ? (
          <div>Chargement…</div>
        ) : (
          entreprises.map((e) => (
            <div className="card-mini" key={e.id}>
              <div className="row">
                <div>
                  <strong>{e.nom}</strong>
                  <div style={{ fontSize: 12, color: 'var(--ink-soft)' }} className="mono">
                    {e.code}
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  {e.estCommun && <span className="entity-tag">Entité commune</span>}
                  <span className="badge" data-tone={e.actif ? 'success' : 'danger'}>
                    {e.actif ? 'Active' : 'Désactivée'}
                  </span>
                  {!e.estCommun && (
                    <button style={{ padding: '3px 9px', fontSize: 11 }} disabled={busy} onClick={() => toggleActif(e)}>
                      {e.actif ? 'Désactiver' : 'Réactiver'}
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))
        )}

        <div className="section-title">Nouvelle entreprise</div>
        <form onSubmit={handleCreate} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div>
            <label>Code (court, sans espaces — ex: NOVA)</label>
            <input type="text" name="code" placeholder="NOVA" required />
          </div>
          <div>
            <label>Nom complet</label>
            <input type="text" name="nom" placeholder="Nova Tech Solutions" required />
          </div>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 8 }}>
            <button type="button" onClick={onClose}>
              Fermer
            </button>
            <button className="primary" type="submit" disabled={busy}>
              Créer
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

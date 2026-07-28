import { FormEvent, useState } from 'react';
import { api, ApiError } from '../api/client';
import { CurrentUser } from '../api/types';
import { useResource } from '../hooks/useResource';
import { useToast } from '../hooks/useToast';
import { ENTITES } from '../lib/constants';

const ROLE_LABELS: Record<string, string> = {
  admin: 'Admin',
  manager_entite: "Manager d'entité",
  comptable: 'Comptable',
};

export function UsersPanel({ onClose }: { onClose: () => void }) {
  const { showToast } = useToast();
  const { data: users, loading, refetch } = useResource<CurrentUser[]>('/api/users');
  const [busy, setBusy] = useState(false);

  async function handleCreate(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const role = form.get('role');
    const entite = form.get('entite');
    setBusy(true);
    try {
      await api.post('/api/users', {
        nom: form.get('nom'),
        email: form.get('email'),
        role,
        entite: entite || undefined,
      });
      showToast('Utilisateur créé');
      (e.target as HTMLFormElement).reset();
      refetch();
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : 'Erreur');
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm('Supprimer cet utilisateur ?')) return;
    setBusy(true);
    try {
      await api.delete(`/api/users/${id}`);
      showToast('Utilisateur supprimé');
      refetch();
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : 'Erreur');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="modal-overlay open" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ width: 'min(560px, 92%)' }}>
        <h2 style={{ marginBottom: 4 }}>Utilisateurs</h2>
        <div style={{ color: 'var(--ink-soft)', fontSize: 12.5, marginBottom: 16 }}>
          L'authentification vient de Supabase ; le rôle et l'entité de rattachement sont gérés ici.
        </div>

        <div className="section-title">Comptes</div>
        {loading || !users ? (
          <div>Chargement…</div>
        ) : (
          users.map((u) => (
            <div className="card-mini" key={u.id}>
              <div className="row">
                <div>
                  <strong>{u.nom}</strong>
                  <div style={{ fontSize: 12, color: 'var(--ink-soft)' }}>{u.email}</div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span className="entity-tag">
                    {ROLE_LABELS[u.role] ?? u.role}
                    {u.entite ? ` · ${u.entite}` : ''}
                  </span>
                  <button style={{ padding: '3px 9px', fontSize: 11 }} className="danger-btn" disabled={busy} onClick={() => handleDelete(u.id)}>
                    Supprimer
                  </button>
                </div>
              </div>
            </div>
          ))
        )}

        <div className="section-title">Nouveau compte</div>
        <form onSubmit={handleCreate} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div>
            <label>Nom</label>
            <input type="text" name="nom" required />
          </div>
          <div>
            <label>Email (doit correspondre au compte Supabase)</label>
            <input type="email" name="email" required />
          </div>
          <div>
            <label>Rôle</label>
            <select name="role" required defaultValue="manager_entite">
              <option value="admin">Admin</option>
              <option value="manager_entite">Manager d'entité</option>
              <option value="comptable">Comptable</option>
            </select>
          </div>
          <div>
            <label>Entité (requis pour un manager)</label>
            <select name="entite" defaultValue="">
              <option value="">Aucune (accès aux 3 pour un comptable)</option>
              {ENTITES.map((e) => (
                <option key={e} value={e}>
                  {e}
                </option>
              ))}
            </select>
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

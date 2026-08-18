import { FormEvent, useState } from 'react';
import { api, ApiError } from '../api/client';
import { CurrentUser, Entreprise } from '../api/types';
import { useResource } from '../hooks/useResource';
import { useToast } from '../hooks/useToast';

const ROLE_LABELS: Record<string, string> = {
  admin: 'Admin',
  manager_entite: "Manager d'entité",
  comptable: 'Comptable',
};

const ROLE_OPERATIONS_LABELS: Record<string, string> = {
  directrice_operations: 'Directrice des opérations',
  charge_compte: 'Chargé de compte',
  direction_generale: 'Direction générale',
};

export function UsersPanel({ onClose }: { onClose: () => void }) {
  const { showToast } = useToast();
  const { data: users, loading, refetch } = useResource<CurrentUser[]>('/api/users');
  const { data: entreprises } = useResource<Entreprise[]>('/api/entreprises');
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
        estAgentRecouvrement: form.get('estAgentRecouvrement') === 'on',
        accesRecouvrement: form.get('accesRecouvrement') === 'on',
        accesPlanningCoursiers: form.get('accesPlanningCoursiers') === 'on',
        roleOperations: form.get('roleOperations') || undefined,
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

  async function toggleAgent(u: CurrentUser) {
    setBusy(true);
    try {
      await api.patch(`/api/users/${u.id}`, { estAgentRecouvrement: !u.estAgentRecouvrement });
      refetch();
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : 'Erreur');
    } finally {
      setBusy(false);
    }
  }

  async function toggleRecouvrement(u: CurrentUser) {
    setBusy(true);
    try {
      await api.patch(`/api/users/${u.id}`, { accesRecouvrement: !u.accesRecouvrement });
      refetch();
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : 'Erreur');
    } finally {
      setBusy(false);
    }
  }

  async function togglePlanningCoursiers(u: CurrentUser) {
    setBusy(true);
    try {
      await api.patch(`/api/users/${u.id}`, { accesPlanningCoursiers: !u.accesPlanningCoursiers });
      refetch();
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : 'Erreur');
    } finally {
      setBusy(false);
    }
  }

  async function updateRoleOperations(u: CurrentUser, roleOperations: string) {
    setBusy(true);
    try {
      await api.patch(`/api/users/${u.id}`, { roleOperations: roleOperations || null });
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
          L'authentification vient de Supabase ; le rôle et l'entité de rattachement sont gérés ici. Le drapeau « Agent de
          recouvrement » détermine qui apparaît dans le reporting Performance par agent — un admin qui consulte la
          plateforme sans faire de relance n'a pas à y figurer.
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
              <div style={{ fontSize: 11.5, color: 'var(--ink-soft)', marginTop: 6 }}>
                Dernière connexion :{' '}
                {u.derniereConnexion
                  ? new Date(u.derniereConnexion).toLocaleString('fr-FR', { dateStyle: 'medium', timeStyle: 'short' })
                  : 'jamais'}
              </div>
              <div style={{ fontSize: 11.5, marginTop: 8, display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'center' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 5, textTransform: 'none', fontFamily: 'var(--font-body)', cursor: 'pointer' }}>
                  <input type="checkbox" checked={u.estAgentRecouvrement} disabled={busy} onChange={() => toggleAgent(u)} style={{ width: 'auto' }} />
                  Agent de recouvrement
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: 5, textTransform: 'none', fontFamily: 'var(--font-body)', cursor: 'pointer' }}>
                  <input type="checkbox" checked={u.accesRecouvrement} disabled={busy} onChange={() => toggleRecouvrement(u)} style={{ width: 'auto' }} />
                  Accès module Recouvrement
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: 5, textTransform: 'none', fontFamily: 'var(--font-body)', cursor: 'pointer' }}>
                  <input type="checkbox" checked={u.accesPlanningCoursiers} disabled={busy} onChange={() => togglePlanningCoursiers(u)} style={{ width: 'auto' }} />
                  Accès Planning coursiers
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: 5, textTransform: 'none', fontFamily: 'var(--font-body)' }}>
                  Accès Opérations :
                  <select
                    value={u.roleOperations ?? ''}
                    disabled={busy}
                    onChange={(e) => updateRoleOperations(u, e.target.value)}
                    style={{ fontSize: 11.5, padding: '2px 6px', width: 'auto' }}
                  >
                    <option value="">Aucun</option>
                    {Object.entries(ROLE_OPERATIONS_LABELS).map(([v, l]) => (
                      <option key={v} value={v}>
                        {l}
                      </option>
                    ))}
                  </select>
                </label>
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
              {(entreprises ?? [])
                .filter((e) => !e.estCommun)
                .map((e) => (
                  <option key={e.code} value={e.code}>
                    {e.nom}
                  </option>
                ))}
            </select>
          </div>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, textTransform: 'none', fontFamily: 'var(--font-body)', fontSize: 13, cursor: 'pointer' }}>
            <input type="checkbox" name="estAgentRecouvrement" defaultChecked style={{ width: 'auto' }} />
            Agent de recouvrement — apparaît dans le reporting de performance
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, textTransform: 'none', fontFamily: 'var(--font-body)', fontSize: 13, cursor: 'pointer' }}>
            <input type="checkbox" name="accesRecouvrement" defaultChecked style={{ width: 'auto' }} />
            Accès au module Recouvrement
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, textTransform: 'none', fontFamily: 'var(--font-body)', fontSize: 13, cursor: 'pointer' }}>
            <input type="checkbox" name="accesPlanningCoursiers" defaultChecked style={{ width: 'auto' }} />
            Accès à la console Planning des coursiers
          </label>
          <div>
            <label>Accès Opérations (optionnel)</label>
            <select name="roleOperations" defaultValue="">
              <option value="">Aucun</option>
              {Object.entries(ROLE_OPERATIONS_LABELS).map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
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

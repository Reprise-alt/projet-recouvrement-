import { FormEvent, useState } from 'react';
import { api, ApiError, buildQuery } from '../api/client';
import { ClientListItem, Entite, TacheCoursierModele, TypeTacheCoursier } from '../api/types';
import { useResource } from '../hooks/useResource';
import { useToast } from '../hooks/useToast';
import { TACHE_TYPE_LABELS } from '../lib/constants';

const TYPE_KEYS = Object.keys(TACHE_TYPE_LABELS) as TypeTacheCoursier[];

export function TacheModelesPanel({ entityFilter, onClose }: { entityFilter: Entite | 'ALL'; onClose: () => void }) {
  const { showToast } = useToast();
  const { data: modeles, loading, refetch } = useResource<TacheCoursierModele[]>(`/api/taches/modeles${buildQuery({ entite: entityFilter })}`);
  const { data: clients } = useResource<ClientListItem[]>(`/api/clients${buildQuery({ entite: entityFilter, all: 'true' })}`);
  const [busy, setBusy] = useState(false);

  async function handleCreate(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const fd = new FormData(form);
    setBusy(true);
    try {
      await api.post('/api/taches/modeles', {
        clientId: fd.get('clientId'),
        type: fd.get('type'),
        jourDuMois: fd.get('jourDuMois'),
        label: fd.get('label') || undefined,
      });
      showToast('Tâche récurrente créée');
      form.reset();
      refetch();
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : 'Erreur');
    } finally {
      setBusy(false);
    }
  }

  async function toggleActif(m: TacheCoursierModele) {
    setBusy(true);
    try {
      await api.patch(`/api/taches/modeles/${m.id}`, { actif: !m.actif });
      refetch();
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : 'Erreur');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="modal-overlay open" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ width: 'min(640px, 92%)' }}>
        <h2 style={{ marginBottom: 4 }}>Tâches récurrentes</h2>
        <div style={{ color: 'var(--ink-soft)', fontSize: 12.5, marginBottom: 16 }}>
          Une tâche qui revient chaque mois (ex : relevé compteur imprimante le 5 de chaque mois) — l'instance du jour
          est générée automatiquement dans le planning, sans ressaisie.
        </div>

        <div className="section-title">Modèles</div>
        {loading || !modeles ? (
          <div>Chargement…</div>
        ) : modeles.length === 0 ? (
          <div style={{ fontSize: 12.5, color: 'var(--ink-soft)', marginBottom: 12 }}>Aucune tâche récurrente pour l'instant.</div>
        ) : (
          modeles.map((m) => (
            <div className="card-mini" key={m.id}>
              <div className="row">
                <div>
                  <strong>{m.client.nom}</strong>
                  <div style={{ fontSize: 12, color: 'var(--ink-soft)' }}>
                    {TACHE_TYPE_LABELS[m.type]}
                    {m.label ? ` — ${m.label}` : ''} · le {m.jourDuMois} de chaque mois
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span className="badge" data-tone={m.actif ? 'success' : 'danger'}>
                    {m.actif ? 'Actif' : 'Désactivé'}
                  </span>
                  <button style={{ padding: '3px 9px', fontSize: 11 }} disabled={busy} onClick={() => toggleActif(m)}>
                    {m.actif ? 'Désactiver' : 'Réactiver'}
                  </button>
                </div>
              </div>
            </div>
          ))
        )}

        <div className="section-title">Nouveau modèle récurrent</div>
        <form onSubmit={handleCreate} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div>
            <label>Client</label>
            <select name="clientId" required defaultValue="">
              <option value="" disabled>
                Choisir un client…
              </option>
              {(clients ?? []).map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nom} ({c.entite})
                </option>
              ))}
            </select>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <div style={{ flex: 2 }}>
              <label>Type de tâche</label>
              <select name="type" required defaultValue="">
                <option value="" disabled>
                  Choisir…
                </option>
                {TYPE_KEYS.map((t) => (
                  <option key={t} value={t}>
                    {TACHE_TYPE_LABELS[t]}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label>Jour du mois</label>
              <input type="number" name="jourDuMois" min={1} max={28} required style={{ width: 80 }} />
            </div>
          </div>
          <div>
            <label>Précision (optionnel)</label>
            <input type="text" name="label" placeholder="Ex : compteur n°2" />
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

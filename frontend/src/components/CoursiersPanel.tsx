import { FormEvent, useState } from 'react';
import { api, ApiError } from '../api/client';
import { Coursier } from '../api/types';
import { useResource } from '../hooks/useResource';
import { useToast } from '../hooks/useToast';

export function CoursiersPanel({ onClose }: { onClose: () => void }) {
  const { showToast } = useToast();
  const { data: coursiers, loading, refetch } = useResource<Coursier[]>('/api/taches/coursiers');
  const [busy, setBusy] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  function lienPersonnel(token: string): string {
    // Le lien coursier est servi par le frontend lui-même (route publique
    // /coursier/:token, cf. App.tsx) -- toujours la même origine que la
    // page courante, jamais celle de l'API backend.
    return `${window.location.origin}/coursier/${token}`;
  }

  async function handleCreate(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const nom = new FormData(form).get('nom');
    setBusy(true);
    try {
      await api.post('/api/taches/coursiers', { nom });
      showToast('Coursier ajouté');
      form.reset();
      refetch();
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : 'Erreur');
    } finally {
      setBusy(false);
    }
  }

  async function toggleActif(c: Coursier) {
    setBusy(true);
    try {
      await api.patch(`/api/taches/coursiers/${c.id}`, { actif: !c.actif });
      refetch();
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : 'Erreur');
    } finally {
      setBusy(false);
    }
  }

  async function regenerer(c: Coursier) {
    setBusy(true);
    try {
      await api.post(`/api/taches/coursiers/${c.id}/regenerate-token`);
      showToast('Lien régénéré — l’ancien lien ne fonctionne plus');
      refetch();
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : 'Erreur');
    } finally {
      setBusy(false);
    }
  }

  async function copierLien(c: Coursier) {
    await navigator.clipboard.writeText(lienPersonnel(c.token));
    setCopiedId(c.id);
    setTimeout(() => setCopiedId(null), 1500);
  }

  return (
    <div className="modal-overlay open" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ width: 'min(620px, 92%)' }}>
        <h2 style={{ marginBottom: 4 }}>Coursiers</h2>
        <div style={{ color: 'var(--ink-soft)', fontSize: 12.5, marginBottom: 16 }}>
          Chaque coursier a un lien personnel, sans mot de passe, qui affiche uniquement ses tâches du jour. À partager
          une fois — le regénérer invalide l'ancien lien (utile en cas de téléphone perdu).
        </div>

        <div className="section-title">Équipe</div>
        {loading || !coursiers ? (
          <div>Chargement…</div>
        ) : coursiers.length === 0 ? (
          <div style={{ fontSize: 12.5, color: 'var(--ink-soft)', marginBottom: 12 }}>Aucun coursier pour l'instant.</div>
        ) : (
          coursiers.map((c) => (
            <div className="card-mini" key={c.id}>
              <div className="row">
                <strong>{c.nom}</strong>
                <span className="badge" data-tone={c.actif ? 'success' : 'danger'}>
                  {c.actif ? 'Actif' : 'Désactivé'}
                </span>
              </div>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 8, flexWrap: 'wrap' }}>
                <button type="button" style={{ padding: '3px 9px', fontSize: 11 }} disabled={busy} onClick={() => copierLien(c)}>
                  {copiedId === c.id ? 'Copié !' : 'Copier le lien'}
                </button>
                <button type="button" style={{ padding: '3px 9px', fontSize: 11 }} disabled={busy} onClick={() => regenerer(c)}>
                  Régénérer le lien
                </button>
                <button type="button" style={{ padding: '3px 9px', fontSize: 11 }} disabled={busy} onClick={() => toggleActif(c)}>
                  {c.actif ? 'Désactiver' : 'Réactiver'}
                </button>
              </div>
            </div>
          ))
        )}

        <div className="section-title">Nouveau coursier</div>
        <form onSubmit={handleCreate} style={{ display: 'flex', gap: 8 }}>
          <input type="text" name="nom" placeholder="Nom du coursier" required style={{ flex: 1 }} />
          <button className="primary" type="submit" disabled={busy}>
            Ajouter
          </button>
        </form>

        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 16 }}>
          <button onClick={onClose}>Fermer</button>
        </div>
      </div>
    </div>
  );
}

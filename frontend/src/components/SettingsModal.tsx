import { FormEvent, useState } from 'react';
import { api, ApiError } from '../api/client';
import { PalierConfig } from '../api/types';
import { useResource } from '../hooks/useResource';
import { useToast } from '../hooks/useToast';
import { PALIERS } from '../lib/constants';

export function SettingsModal({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const { showToast } = useToast();
  const { data: config, loading } = useResource<PalierConfig>('/api/config');
  const [busy, setBusy] = useState(false);

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const patch: Record<string, number> = {};
    for (const p of PALIERS) {
      if (!p.key) continue;
      const v = parseInt(String(form.get(p.key)), 10);
      if (v > 0) patch[p.key] = v;
    }
    setBusy(true);
    try {
      await api.put('/api/config', patch);
      showToast('Paramètres enregistrés');
      onSaved();
      onClose();
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : 'Erreur');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="modal-overlay open" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal">
        <h2 style={{ marginBottom: 4 }}>Paramètres des paliers</h2>
        <div style={{ color: 'var(--ink-soft)', fontSize: 12.5, marginBottom: 14 }}>
          Nombre de jours de retard déclenchant chaque palier (structure commune SORAM / SIS / IRIS).
        </div>
        {loading || !config ? (
          <div>Chargement…</div>
        ) : (
          <form onSubmit={handleSubmit}>
            {PALIERS.filter((p) => p.key).map((p) => (
              <div className="threshold-row" key={p.key}>
                <label>
                  {p.label} <span style={{ color: 'var(--ink-soft)' }}>({p.desc})</span>
                </label>
                <input type="number" min={1} name={p.key} defaultValue={config[p.key!]} />
              </div>
            ))}
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 20 }}>
              <button type="button" onClick={onClose}>
                Annuler
              </button>
              <button className="primary" type="submit" disabled={busy}>
                Enregistrer
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

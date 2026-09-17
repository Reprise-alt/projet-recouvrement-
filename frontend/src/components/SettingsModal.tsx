import { useEffect, useState } from 'react';
import { api, ApiError } from '../api/client';
import { ReglagePalier } from '../api/types';
import { useResource } from '../hooks/useResource';
import { useToast } from '../hooks/useToast';
import { usePaliersConfig } from '../lib/paliersConfig';
import { PALIERS } from '../lib/constants';

// État éditable local d'un palier (chaînes pour les champs de saisie).
interface Ligne {
  palier: number;
  actif: boolean;
  libelle: string;
  jours: string;
}

export function SettingsModal({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const { showToast } = useToast();
  const { refetch: refetchPaliers } = usePaliersConfig();
  const { data: reglages, loading } = useResource<ReglagePalier[]>('/api/config/paliers');
  const [lignes, setLignes] = useState<Ligne[]>([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!reglages) return;
    setLignes(
      reglages.map((r) => ({
        palier: r.palier,
        actif: r.actif,
        libelle: r.libelle ?? '',
        jours: String(r.jours),
      })),
    );
  }, [reglages]);

  function maj(palier: number, patch: Partial<Ligne>) {
    setLignes((ls) => ls.map((l) => (l.palier === palier ? { ...l, ...patch } : l)));
  }

  async function handleSubmit() {
    const payload = lignes.map((l) => {
      const jours = parseInt(l.jours, 10);
      return {
        palier: l.palier,
        actif: l.actif,
        libelle: l.libelle.trim() ? l.libelle.trim() : null,
        ...(jours > 0 ? { jours } : {}),
      };
    });
    setBusy(true);
    try {
      await api.put('/api/config/paliers', payload);
      refetchPaliers();
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
      <div className="modal" style={{ maxWidth: 640 }}>
        <h2 style={{ marginBottom: 4 }}>Paramètres des paliers</h2>
        <div style={{ color: 'var(--ink-soft)', fontSize: 12.5, marginBottom: 14 }}>
          Pour chaque palier : le nombre de jours de retard qui le déclenche, son activation dans la
          séquence de relance, et un libellé personnalisé. Un palier désactivé est sauté (aucune
          relance ne part à ce niveau).
        </div>
        {loading || !lignes.length ? (
          <div>Chargement…</div>
        ) : (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleSubmit();
            }}
          >
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {lignes.map((l) => {
                const def = PALIERS[l.palier];
                return (
                  <div
                    key={l.palier}
                    style={{
                      display: 'grid',
                      gridTemplateColumns: 'auto 1fr 92px',
                      gap: 10,
                      alignItems: 'center',
                      opacity: l.actif ? 1 : 0.55,
                      borderTop: '1px solid var(--line)',
                      paddingTop: 10,
                    }}
                  >
                    <label style={{ display: 'flex', alignItems: 'center', gap: 6, whiteSpace: 'nowrap' }}>
                      <input
                        type="checkbox"
                        checked={l.actif}
                        onChange={(e) => maj(l.palier, { actif: e.target.checked })}
                        aria-label={`Activer le palier ${def?.label ?? l.palier}`}
                      />
                      <span data-tone={def?.tone} className="badge" style={{ fontSize: 11 }}>
                        {def?.label ?? `Palier ${l.palier}`}
                      </span>
                    </label>
                    <input
                      type="text"
                      value={l.libelle}
                      placeholder={def?.label ?? ''}
                      onChange={(e) => maj(l.palier, { libelle: e.target.value })}
                      aria-label={`Libellé personnalisé du palier ${def?.label ?? l.palier}`}
                    />
                    <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                      <input
                        type="number"
                        min={1}
                        value={l.jours}
                        onChange={(e) => maj(l.palier, { jours: e.target.value })}
                        aria-label={`Jours de retard du palier ${def?.label ?? l.palier}`}
                        style={{ width: 60 }}
                      />
                      <span style={{ fontSize: 12, color: 'var(--ink-soft)' }}>j</span>
                    </div>
                  </div>
                );
              })}
            </div>
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

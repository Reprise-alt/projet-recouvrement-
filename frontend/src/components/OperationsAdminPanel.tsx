import { FormEvent, useState } from 'react';
import { X } from 'lucide-react';
import { api, ApiError } from '../api/client';
import { ConfigOperations, EtapeDemarrageConfig, FenetreSaisonniere } from '../api/types';
import { useResource } from '../hooks/useResource';
import { useToast } from '../hooks/useToast';
import { SECTEUR_LABELS } from '../lib/operationsConstants';

const CONFIG_FIELDS: { key: keyof ConfigOperations; label: string }[] = [
  { key: 'contactStdVigilance', label: 'Contact standard — vigilance (j)' },
  { key: 'contactStdRisque', label: 'Contact standard — risque (j)' },
  { key: 'contactVipVigilance', label: 'Contact VIP — vigilance (j)' },
  { key: 'contactVipRisque', label: 'Contact VIP — risque (j)' },
  { key: 'problemeVigilanceJours', label: 'Problème ouvert — vigilance (j)' },
  { key: 'problemeRisqueJours', label: 'Problème ouvert — risque (j)' },
  { key: 'problemeBloquantRisqueJours', label: 'Problème bloquant — risque (j)' },
  { key: 'demarrageRisqueRetardJours', label: 'Étape de démarrage — risque si retard (j)' },
];

// Réservé à direction_generale (cahier §7 : "administration des seuils et
// nomenclatures") -- OperationsView ne monte ce panneau que pour ce rôle,
// mais les routes sous-jacentes sont elles-mêmes gardées côté serveur.
export function OperationsAdminPanel({ onClose }: { onClose: () => void }) {
  const { showToast } = useToast();
  const [tab, setTab] = useState<'seuils' | 'etapes' | 'saisons'>('seuils');
  const { data: config, refetch: refetchConfig } = useResource<ConfigOperations>('/api/operations/config');
  const { data: etapes, refetch: refetchEtapes } = useResource<EtapeDemarrageConfig[]>('/api/operations/etapes-demarrage');
  const { data: fenetres, refetch: refetchFenetres } = useResource<FenetreSaisonniere[]>('/api/operations/fenetres-saisonnieres');
  const [busy, setBusy] = useState(false);

  async function handleConfigSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const patch: Record<string, number> = {};
    for (const f of CONFIG_FIELDS) {
      const v = parseInt(String(form.get(f.key)), 10);
      if (v > 0) patch[f.key] = v;
    }
    setBusy(true);
    try {
      await api.patch('/api/operations/config', patch);
      showToast('Seuils enregistrés');
      refetchConfig();
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : 'Erreur');
    } finally {
      setBusy(false);
    }
  }

  async function saveEtape(id: string, delaiJours: number) {
    setBusy(true);
    try {
      await api.patch(`/api/operations/etapes-demarrage/${id}`, { delaiJours });
      refetchEtapes();
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : 'Erreur');
    } finally {
      setBusy(false);
    }
  }

  async function saveFenetre(secteur: string, patch: Record<string, number>) {
    setBusy(true);
    try {
      await api.patch(`/api/operations/fenetres-saisonnieres/${secteur}`, patch);
      refetchFenetres();
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : 'Erreur');
    } finally {
      setBusy(false);
    }
  }

  async function reinitialiserAlertes() {
    setBusy(true);
    try {
      const res = await api.post<{ contactInitialise: number; copilInitialise: number }>('/api/operations/alertes/reinitialiser-depart', {});
      showToast(`Point de départ posé sur ${res.contactInitialise} compte(s)${res.copilInitialise ? ` et ${res.copilInitialise} COPIL` : ''}`);
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : 'Erreur');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="modal-overlay open" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ width: 'min(620px,94%)', maxHeight: '88vh' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <h2 style={{ marginBottom: 4 }}>Administration — Opérations</h2>
          <button onClick={onClose} aria-label="Fermer" style={{ background: 'none', border: 'none' }}>
            <X size={16} />
          </button>
        </div>
        <div style={{ color: 'var(--ink-soft)', fontSize: 12.5, marginBottom: 16 }}>
          Seuils, étapes de démarrage et fenêtres saisonnières — paramétrables plutôt que codés en dur (cahier §10).
        </div>

        <div className="entity-toggle" style={{ display: 'inline-flex', marginBottom: 16 }}>
          <button className={tab === 'seuils' ? 'active' : ''} onClick={() => setTab('seuils')}>
            Seuils d'alerte
          </button>
          <button className={tab === 'etapes' ? 'active' : ''} onClick={() => setTab('etapes')}>
            Étapes de démarrage
          </button>
          <button className={tab === 'saisons' ? 'active' : ''} onClick={() => setTab('saisons')}>
            Fenêtres saisonnières
          </button>
        </div>

        {tab === 'seuils' && config && (
          <form onSubmit={handleConfigSubmit}>
            {CONFIG_FIELDS.map((f) => (
              <div key={f.key} className="threshold-row">
                <label>{f.label}</label>
                <input type="number" name={f.key} min={1} defaultValue={config[f.key]} />
              </div>
            ))}
            <button className="primary" type="submit" disabled={busy} style={{ marginTop: 14 }}>
              Enregistrer les seuils
            </button>
          </form>
        )}

        {tab === 'seuils' && config && (
          <div style={{ marginTop: 24, paddingTop: 16, borderTop: '1px solid var(--paper-2)' }}>
            <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 4 }}>Repartir de zéro sur les alertes</div>
            <div style={{ fontSize: 12.5, color: 'var(--ink-soft)', marginBottom: 10 }}>
              Un compte repris par import n'a pas d'historique de contact ni de COPIL : sans action, il alerte "aucun contact" dès aujourd'hui comme s'il avait été
              négligé pendant des mois. Pose la date du jour comme point de départ, uniquement sur les comptes qui n'ont encore aucune date enregistrée — ne touche
              jamais un compte déjà suivi.
            </div>
            <button type="button" onClick={reinitialiserAlertes} disabled={busy}>
              Poser le point de départ à aujourd'hui
            </button>
          </div>
        )}

        {tab === 'etapes' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {(['SORAM', 'IRIS'] as const).map((entite) => (
              <div key={entite} style={{ marginBottom: 10 }}>
                <div style={{ fontWeight: 600, fontSize: 13, margin: '10px 0 4px' }}>{entite}</div>
                {(etapes ?? [])
                  .filter((e) => e.entite === entite)
                  .sort((a, b) => a.ordre - b.ordre)
                  .map((e) => (
                    <div key={e.id} className="threshold-row">
                      <label style={{ textTransform: 'none', fontSize: 12.5 }}>{e.libelle}</label>
                      <input
                        type="number"
                        min={1}
                        defaultValue={e.delaiJours}
                        onBlur={(ev) => {
                          const v = parseInt(ev.currentTarget.value, 10);
                          if (v > 0 && v !== e.delaiJours) saveEtape(e.id, v);
                        }}
                      />
                    </div>
                  ))}
              </div>
            ))}
          </div>
        )}

        {tab === 'saisons' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {(fenetres ?? []).map((f) => (
              <div key={f.secteur} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 0', borderBottom: '1px solid var(--paper-2)' }}>
                <div style={{ flex: 1, fontSize: 13 }}>{SECTEUR_LABELS[f.secteur]}</div>
                <input
                  type="number"
                  min={1}
                  max={12}
                  defaultValue={f.mois}
                  title="Mois"
                  style={{ width: 50 }}
                  onBlur={(ev) => {
                    const v = parseInt(ev.currentTarget.value, 10);
                    if (v >= 1 && v <= 12 && v !== f.mois) saveFenetre(f.secteur, { mois: v });
                  }}
                />
                <input
                  type="number"
                  min={1}
                  max={31}
                  defaultValue={f.jour}
                  title="Jour"
                  style={{ width: 50 }}
                  onBlur={(ev) => {
                    const v = parseInt(ev.currentTarget.value, 10);
                    if (v >= 1 && v <= 31 && v !== f.jour) saveFenetre(f.secteur, { jour: v });
                  }}
                />
                <input
                  type="number"
                  min={1}
                  defaultValue={f.anticipationJours}
                  title="Anticipation (jours)"
                  style={{ width: 60 }}
                  onBlur={(ev) => {
                    const v = parseInt(ev.currentTarget.value, 10);
                    if (v > 0 && v !== f.anticipationJours) saveFenetre(f.secteur, { anticipationJours: v });
                  }}
                />
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

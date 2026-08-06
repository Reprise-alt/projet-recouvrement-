import { ChangeEvent, FormEvent, useRef, useState } from 'react';
import { X } from 'lucide-react';
import { api, ApiError, buildQuery } from '../api/client';
import { ClientListItem, Entite, Entreprise, TacheCoursierModele, TypeTacheCoursier } from '../api/types';
import { useResource } from '../hooks/useResource';
import { useToast } from '../hooks/useToast';
import { TACHE_TYPE_LABELS } from '../lib/constants';

const TYPE_KEYS = Object.keys(TACHE_TYPE_LABELS) as TypeTacheCoursier[];

interface ImportSummaryTaches {
  total: number;
  created: number;
  dejaExistant: number;
}

export function TacheModelesPanel({ entityFilter, onClose }: { entityFilter: Entite | 'ALL'; onClose: () => void }) {
  const { showToast } = useToast();
  const { data: modeles, loading, refetch } = useResource<TacheCoursierModele[]>(`/api/taches/modeles${buildQuery({ entite: entityFilter })}`);
  const { data: clients } = useResource<ClientListItem[]>(`/api/clients${buildQuery({ entite: entityFilter, all: 'true' })}`);
  const { data: entreprises } = useResource<Entreprise[]>('/api/entreprises');
  const entreprisesSelectionnables = (entreprises ?? []).filter((e) => e.actif && !e.estCommun);
  const [busy, setBusy] = useState(false);
  const [showManual, setShowManual] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [importEntite, setImportEntite] = useState(entityFilter !== 'ALL' ? entityFilter : '');
  const [importType, setImportType] = useState<TypeTacheCoursier>('releve_compteur');
  const [importResult, setImportResult] = useState<ImportSummaryTaches | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

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
        intervalleMois: fd.get('intervalleMois') || 1,
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

  async function handleImportFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || !importEntite) return;
    const formData = new FormData();
    formData.append('file', file);
    formData.append('entite', importEntite);
    formData.append('type', importType);
    setBusy(true);
    setImportResult(null);
    try {
      const res = await api.upload<ImportSummaryTaches>('/api/taches/modeles/import', formData);
      setImportResult(res);
      refetch();
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : "Échec de l'import");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="modal-overlay open" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ width: 'min(640px, 92%)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <h2 style={{ marginBottom: 4 }}>Tâches récurrentes</h2>
          <button onClick={onClose} aria-label="Fermer" style={{ background: 'none', border: 'none' }}>
            <X size={16} />
          </button>
        </div>
        <div style={{ color: 'var(--ink-soft)', fontSize: 12.5, marginBottom: 16 }}>
          Une tâche qui revient chaque mois (ex : relevé compteur imprimante le 5 de chaque mois), ou tous les N mois pour
          un client facturé moins souvent — l'instance du jour est générée automatiquement dans le planning, sans
          ressaisie. Si le jour choisi tombe un samedi ou un dimanche, la tâche est automatiquement reportée au lundi
          suivant.
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
                    {m.label ? ` — ${m.label}` : ''} · le {m.jourDuMois} {m.intervalleMois > 1 ? `de tous les ${m.intervalleMois} mois` : 'de chaque mois'}
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

        <div className="section-title" style={{ marginTop: 8 }}>
          Importer un historique
        </div>
        {!showImport ? (
          <button type="button" onClick={() => setShowImport(true)}>
            Importer depuis un fichier
          </button>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={{ fontSize: 12.5, color: 'var(--ink-soft)' }}>
              Fichier avec le jour du mois en colonne A (une fois par bloc de clients), la raison sociale en colonne B, et
              une fréquence optionnelle en colonne C ("Tous les 3 mois", etc. — vide = mensuel). Un client déjà présent
              dans la base est rattaché plutôt que dupliqué ; un modèle déjà créé pour ce client/jour/type n'est jamais
              recréé.
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <div style={{ flex: 1 }}>
                <label>Entreprise</label>
                {entityFilter !== 'ALL' ? (
                  <div style={{ padding: '9px 0', fontWeight: 600 }}>{entityFilter}</div>
                ) : (
                  <select value={importEntite} onChange={(e) => setImportEntite(e.target.value)} required>
                    <option value="" disabled>
                      Choisir…
                    </option>
                    {entreprisesSelectionnables.map((e) => (
                      <option key={e.id} value={e.code}>
                        {e.code}
                      </option>
                    ))}
                  </select>
                )}
              </div>
              <div style={{ flex: 1 }}>
                <label>Type de tâche</label>
                <select value={importType} onChange={(e) => setImportType(e.target.value as TypeTacheCoursier)}>
                  {TYPE_KEYS.map((t) => (
                    <option key={t} value={t}>
                      {TACHE_TYPE_LABELS[t]}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div>
              <button type="button" onClick={() => fileInputRef.current?.click()} disabled={busy || !importEntite}>
                {busy ? 'Import en cours…' : 'Choisir un fichier'}
              </button>
              <input type="file" ref={fileInputRef} accept=".xlsx,.xls" style={{ display: 'none' }} onChange={handleImportFile} />
            </div>
            {importResult && (
              <div className="card-mini">
                Import terminé — {importResult.created} modèle{importResult.created !== 1 ? 's' : ''} créé
                {importResult.created !== 1 ? 's' : ''}
                {importResult.dejaExistant > 0 ? `, ${importResult.dejaExistant} déjà existant${importResult.dejaExistant !== 1 ? 's' : ''}` : ''} sur{' '}
                {importResult.total} ligne{importResult.total !== 1 ? 's' : ''} lue{importResult.total !== 1 ? 's' : ''}.
              </div>
            )}
          </div>
        )}

        <div className="section-title" style={{ marginTop: 16 }}>
          Ajouter un modèle manuellement
        </div>
        {!showManual ? (
          <button type="button" onClick={() => setShowManual(true)}>
            + Ajouter un modèle
          </button>
        ) : (
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
                <input type="number" name="jourDuMois" min={1} max={31} required style={{ width: 80 }} />
              </div>
              <div>
                <label>Tous les combien de mois</label>
                <input type="number" name="intervalleMois" min={1} max={12} defaultValue={1} style={{ width: 80 }} />
              </div>
            </div>
            <div>
              <label>Précision (optionnel)</label>
              <input type="text" name="label" placeholder="Ex : compteur n°2" />
            </div>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 8 }}>
              <button type="button" onClick={() => setShowManual(false)}>
                Annuler
              </button>
              <button className="primary" type="submit" disabled={busy}>
                Créer
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

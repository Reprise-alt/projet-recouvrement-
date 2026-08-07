import { ChangeEvent, FormEvent, useRef, useState } from 'react';
import { FileDown, Upload, X } from 'lucide-react';
import { api, ApiError, downloadFile } from '../api/client';
import {
  ActionCopil,
  ArtisImportResult,
  EquipementParc,
  InterventionParc,
  InterventionsResponse,
  LivraisonConsommable,
  ParcSynthese,
  PrioriteActionCopil,
  ReleveVolumetrie,
  StatutActionCopil,
  StatutEquipement,
} from '../api/types';
import { useResource } from '../hooks/useResource';
import { useToast } from '../hooks/useToast';
import { fmtDate } from '../lib/constants';

type ParcTab = 'synthese' | 'equipements' | 'interventions' | 'volumetrie' | 'consommables' | 'actions';

const TAB_LABELS: Record<ParcTab, string> = {
  synthese: 'Synthèse',
  equipements: 'Inventaire',
  interventions: 'Interventions',
  volumetrie: 'Volumétrie',
  consommables: 'Consommables',
  actions: "Plan d'action",
};

const PRIORITE_LABELS: Record<PrioriteActionCopil, string> = { p1: 'P1', p2: 'P2', p3: 'P3' };
const STATUT_ACTION_LABELS: Record<StatutActionCopil, string> = { planifie: 'Planifié', en_cours: 'En cours', fait: 'Fait', bloque: 'Bloqué' };
const STATUT_EQUIPEMENT_LABELS: Record<StatutEquipement, string> = { actif: 'Actif', retire: 'Retiré', introuvable: 'Introuvable' };

interface TabProps {
  clientOperationsId: string;
  canEdit: boolean;
  reloadKey: unknown;
  onChanged: () => void;
}

export function ParcImpressionModal({
  clientOperationsId,
  clientNom,
  canEdit,
  onClose,
}: {
  clientOperationsId: string;
  clientNom: string;
  canEdit: boolean;
  onClose: () => void;
}) {
  const [tab, setTab] = useState<ParcTab>('synthese');
  const [reloadKey, setReloadKey] = useState(0);
  const bump = () => setReloadKey((v) => v + 1);
  const { showToast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [importBusy, setImportBusy] = useState(false);
  const [rapportBusy, setRapportBusy] = useState(false);

  async function handleImportFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    const formData = new FormData();
    formData.append('fichier', file);
    setImportBusy(true);
    try {
      const result = await api.upload<ArtisImportResult>(`/api/parc/clients/${clientOperationsId}/import`, formData);
      if (result.type === 'biens') showToast(`Import ARTIS — ${result.traites ?? 0} équipement(s) traité(s).`);
      else if (result.type === 'interventions') showToast(`Import ARTIS — ${result.traites ?? 0} intervention(s) traitée(s).`);
      else showToast(`Import ARTIS — ${result.consommablesTraites ?? 0} consommable(s), ${result.periodesVolumetrie ?? 0} période(s) de volumétrie.`);
      bump();
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : "Échec de l'import ARTIS");
    } finally {
      setImportBusy(false);
    }
  }

  async function handleGenererRapport() {
    setRapportBusy(true);
    try {
      const nomFichier = `COPIL_${clientNom.replace(/[^a-zA-Z0-9]+/g, '_')}.pptx`;
      await downloadFile(`/api/parc/clients/${clientOperationsId}/rapport-copil.pptx`, nomFichier);
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : 'Échec de la génération du rapport');
    } finally {
      setRapportBusy(false);
    }
  }

  return (
    <div className="modal-overlay open" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ width: 'min(880px, 95%)', maxHeight: '90vh', display: 'flex', flexDirection: 'column' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <h2 style={{ marginBottom: 2 }}>Parc d'impression</h2>
            <div style={{ fontSize: 12.5, color: 'var(--ink-soft)' }}>{clientNom}</div>
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <button
              type="button"
              className="primary"
              style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12.5 }}
              disabled={rapportBusy}
              onClick={handleGenererRapport}
            >
              <FileDown size={14} />
              {rapportBusy ? 'Génération…' : 'Générer le rapport COPIL'}
            </button>
            {canEdit && (
              <>
                <input ref={fileInputRef} type="file" accept=".xlsx,.xls" hidden onChange={handleImportFile} />
                <button
                  type="button"
                  style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12.5 }}
                  disabled={importBusy}
                  onClick={() => fileInputRef.current?.click()}
                >
                  <Upload size={14} />
                  {importBusy ? 'Import…' : 'Importer depuis ARTIS'}
                </button>
              </>
            )}
            <button onClick={onClose} aria-label="Fermer" style={{ background: 'none', border: 'none' }}>
              <X size={16} />
            </button>
          </div>
        </div>

        <div className="entity-toggle" style={{ display: 'inline-flex', margin: '14px 0', flexWrap: 'wrap' }}>
          {(Object.keys(TAB_LABELS) as ParcTab[]).map((t) => (
            <button key={t} className={tab === t ? 'active' : ''} onClick={() => setTab(t)}>
              {TAB_LABELS[t]}
            </button>
          ))}
        </div>

        <div style={{ overflowY: 'auto', flex: 1 }}>
          {tab === 'synthese' && <SyntheseTab clientOperationsId={clientOperationsId} reloadKey={reloadKey} />}
          {tab === 'equipements' && <EquipementsTab clientOperationsId={clientOperationsId} canEdit={canEdit} reloadKey={reloadKey} onChanged={bump} />}
          {tab === 'interventions' && <InterventionsTab clientOperationsId={clientOperationsId} canEdit={canEdit} reloadKey={reloadKey} onChanged={bump} />}
          {tab === 'volumetrie' && <VolumetrieTab clientOperationsId={clientOperationsId} canEdit={canEdit} reloadKey={reloadKey} onChanged={bump} />}
          {tab === 'consommables' && <ConsommablesTab clientOperationsId={clientOperationsId} canEdit={canEdit} reloadKey={reloadKey} onChanged={bump} />}
          {tab === 'actions' && <ActionsTab clientOperationsId={clientOperationsId} canEdit={canEdit} reloadKey={reloadKey} onChanged={bump} />}
        </div>
      </div>
    </div>
  );
}

function SyntheseTab({ clientOperationsId, reloadKey }: { clientOperationsId: string; reloadKey: unknown }) {
  const { data, loading } = useResource<ParcSynthese>(`/api/parc/clients/${clientOperationsId}/synthese`, reloadKey);
  if (loading || !data) return <div>Chargement…</div>;

  const heures = (h: number | null) => (h == null ? '—' : `${Math.round(h)} h`);

  return (
    <div className="kpis">
      <div className="kpi">
        <div className="kpi-label">Imprimantes actives</div>
        <div className="kpi-value">{data.equipementsActifs}</div>
        {data.equipementsIntrouvables > 0 && <div className="kpi-sub">{data.equipementsIntrouvables} introuvable(s)</div>}
      </div>
      <div className="kpi">
        <div className="kpi-label">Interventions</div>
        <div className="kpi-value">{data.interventionsTotal}</div>
        <div className="kpi-sub">{data.interventionsPreventives} préventives</div>
      </div>
      <div className="kpi">
        <div className="kpi-label">Taux de clôture SLA</div>
        <div className="kpi-value">{data.sla.tauxCloture}%</div>
        <div className="kpi-sub">{data.sla.ouverts} ticket(s) ouvert(s)</div>
      </div>
      <div className="kpi">
        <div className="kpi-label">Délai moyen urgent</div>
        <div className="kpi-value">{heures(data.sla.delaiMoyenUrgenteHeures)}</div>
      </div>
      <div className="kpi">
        <div className="kpi-label">Délai moyen standard</div>
        <div className="kpi-value">{heures(data.sla.delaiMoyenStandardHeures)}</div>
      </div>
      <div className="kpi">
        <div className="kpi-label">Consommables livrés</div>
        <div className="kpi-value">{data.consommablesLivres}</div>
      </div>
      <div className="kpi">
        <div className="kpi-label">Copies N&B</div>
        <div className="kpi-value">{data.copiesNBTotal.toLocaleString('fr-FR')}</div>
      </div>
      <div className="kpi">
        <div className="kpi-label">Copies couleur</div>
        <div className="kpi-value">{data.copiesCouleurTotal.toLocaleString('fr-FR')}</div>
      </div>
    </div>
  );
}

function EquipementsTab({ clientOperationsId, canEdit, reloadKey, onChanged }: TabProps) {
  const { showToast } = useToast();
  const { data, loading, refetch } = useResource<EquipementParc[]>(`/api/parc/clients/${clientOperationsId}/equipements`, reloadKey);
  const [busy, setBusy] = useState(false);

  async function handleAdd(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const fd = new FormData(form);
    setBusy(true);
    try {
      await api.post(`/api/parc/clients/${clientOperationsId}/equipements`, {
        site: fd.get('site'),
        modele: fd.get('modele'),
        numeroSerie: fd.get('numeroSerie'),
        dateInstallation: fd.get('dateInstallation') || undefined,
      });
      form.reset();
      refetch();
      onChanged();
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : 'Erreur');
    } finally {
      setBusy(false);
    }
  }

  async function changerStatut(eq: EquipementParc, statut: StatutEquipement) {
    setBusy(true);
    try {
      await api.patch(`/api/parc/equipements/${eq.id}`, { statut });
      refetch();
      onChanged();
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : 'Erreur');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      {loading || !data ? (
        <div>Chargement…</div>
      ) : data.length === 0 ? (
        <p style={{ fontSize: 13, color: 'var(--ink-soft)' }}>Aucun équipement enregistré.</p>
      ) : (
        <table style={{ marginBottom: 14 }}>
          <thead>
            <tr>
              <th>Site</th>
              <th>Modèle</th>
              <th>N° série</th>
              <th>Statut</th>
              {canEdit && <th></th>}
            </tr>
          </thead>
          <tbody>
            {data.map((eq) => (
              <tr key={eq.id}>
                <td>{eq.site}</td>
                <td>{eq.modele}</td>
                <td className="mono">{eq.numeroSerie}</td>
                <td>
                  <span className="badge" data-tone={eq.statut === 'actif' ? 'success' : eq.statut === 'introuvable' ? 'danger' : 'amber'}>
                    {STATUT_EQUIPEMENT_LABELS[eq.statut]}
                  </span>
                </td>
                {canEdit && (
                  <td>
                    <select value={eq.statut} disabled={busy} onChange={(e) => changerStatut(eq, e.target.value as StatutEquipement)}>
                      {(Object.keys(STATUT_EQUIPEMENT_LABELS) as StatutEquipement[]).map((s) => (
                        <option key={s} value={s}>
                          {STATUT_EQUIPEMENT_LABELS[s]}
                        </option>
                      ))}
                    </select>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {canEdit && (
        <form onSubmit={handleAdd} style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <div>
            <label>Site</label>
            <input type="text" name="site" required />
          </div>
          <div>
            <label>Modèle</label>
            <input type="text" name="modele" required />
          </div>
          <div>
            <label>N° série</label>
            <input type="text" name="numeroSerie" required />
          </div>
          <div>
            <label>Date d'installation</label>
            <input type="date" name="dateInstallation" />
          </div>
          <button className="primary" type="submit" disabled={busy}>
            Ajouter
          </button>
        </form>
      )}
    </div>
  );
}

function InterventionsTab({ clientOperationsId, canEdit, reloadKey, onChanged }: TabProps) {
  const { showToast } = useToast();
  const { data, loading, refetch } = useResource<InterventionsResponse>(`/api/parc/clients/${clientOperationsId}/interventions`, reloadKey);
  const [busy, setBusy] = useState(false);

  async function handleAdd(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const fd = new FormData(form);
    setBusy(true);
    try {
      await api.post(`/api/parc/clients/${clientOperationsId}/interventions`, {
        site: fd.get('site'),
        type: fd.get('type'),
        urgence: fd.get('urgence'),
        panne: fd.get('panne') || undefined,
        dateDeclaration: fd.get('dateDeclaration'),
      });
      form.reset();
      refetch();
      onChanged();
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : 'Erreur');
    } finally {
      setBusy(false);
    }
  }

  async function marquer(iv: InterventionParc, champ: 'datePriseEnCharge' | 'dateCloture') {
    setBusy(true);
    try {
      await api.patch(`/api/parc/interventions/${iv.id}`, { [champ]: new Date().toISOString() });
      refetch();
      onChanged();
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : 'Erreur');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      {loading || !data ? (
        <div>Chargement…</div>
      ) : data.interventions.length === 0 ? (
        <p style={{ fontSize: 13, color: 'var(--ink-soft)' }}>Aucune intervention enregistrée.</p>
      ) : (
        <table style={{ marginBottom: 14 }}>
          <thead>
            <tr>
              <th>Site</th>
              <th>Type</th>
              <th>Urgence</th>
              <th>Déclarée le</th>
              <th>Prise en charge</th>
              <th>Clôturée</th>
            </tr>
          </thead>
          <tbody>
            {data.interventions.map((iv) => (
              <tr key={iv.id}>
                <td>
                  {iv.site}
                  {iv.panne && <div style={{ fontSize: 11, color: 'var(--ink-soft)' }}>{iv.panne}</div>}
                </td>
                <td>{iv.type === 'preventive' ? 'Préventive' : 'Curative'}</td>
                <td>
                  <span className="badge" data-tone={iv.urgence === 'urgente' ? 'danger' : 'amber'}>
                    {iv.urgence === 'urgente' ? 'Urgente' : 'Standard'}
                  </span>
                </td>
                <td className="mono">{fmtDate(iv.dateDeclaration)}</td>
                <td className="mono">
                  {iv.datePriseEnCharge ? (
                    fmtDate(iv.datePriseEnCharge)
                  ) : canEdit ? (
                    <button style={{ padding: '2px 8px', fontSize: 11 }} disabled={busy} onClick={() => marquer(iv, 'datePriseEnCharge')}>
                      Marquer
                    </button>
                  ) : (
                    '—'
                  )}
                </td>
                <td className="mono">
                  {iv.dateCloture ? (
                    fmtDate(iv.dateCloture)
                  ) : canEdit ? (
                    <button style={{ padding: '2px 8px', fontSize: 11 }} disabled={busy} onClick={() => marquer(iv, 'dateCloture')}>
                      Clôturer
                    </button>
                  ) : (
                    '—'
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {canEdit && (
        <form onSubmit={handleAdd} style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <div>
            <label>Site</label>
            <input type="text" name="site" required />
          </div>
          <div>
            <label>Type</label>
            <select name="type" defaultValue="curative">
              <option value="curative">Curative</option>
              <option value="preventive">Préventive</option>
            </select>
          </div>
          <div>
            <label>Urgence</label>
            <select name="urgence" defaultValue="standard">
              <option value="standard">Standard</option>
              <option value="urgente">Urgente</option>
            </select>
          </div>
          <div>
            <label>Déclarée le</label>
            <input type="datetime-local" name="dateDeclaration" required />
          </div>
          <div style={{ flex: '1 1 160px' }}>
            <label>Panne (optionnel)</label>
            <input type="text" name="panne" />
          </div>
          <button className="primary" type="submit" disabled={busy}>
            Déclarer
          </button>
        </form>
      )}
    </div>
  );
}

function VolumetrieTab({ clientOperationsId, canEdit, reloadKey, onChanged }: TabProps) {
  const { showToast } = useToast();
  const { data, loading, refetch } = useResource<ReleveVolumetrie[]>(`/api/parc/clients/${clientOperationsId}/volumetrie`, reloadKey);
  const [busy, setBusy] = useState(false);

  async function handleSave(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const fd = new FormData(form);
    setBusy(true);
    try {
      await api.post(`/api/parc/clients/${clientOperationsId}/volumetrie`, {
        periode: fd.get('periode'),
        copiesNB: fd.get('copiesNB'),
        copiesCouleur: fd.get('copiesCouleur'),
      });
      form.reset();
      refetch();
      onChanged();
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : 'Erreur');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      {loading || !data ? (
        <div>Chargement…</div>
      ) : data.length === 0 ? (
        <p style={{ fontSize: 13, color: 'var(--ink-soft)' }}>Aucun relevé enregistré.</p>
      ) : (
        <table style={{ marginBottom: 14 }}>
          <thead>
            <tr>
              <th>Période</th>
              <th className="num">Copies N&B</th>
              <th className="num">Copies couleur</th>
            </tr>
          </thead>
          <tbody>
            {data.map((r) => (
              <tr key={r.id}>
                <td className="mono">{r.periode}</td>
                <td className="mono num">{r.copiesNB.toLocaleString('fr-FR')}</td>
                <td className="mono num">{r.copiesCouleur.toLocaleString('fr-FR')}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {canEdit && (
        <form onSubmit={handleSave} style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <div>
            <label>Période (mois)</label>
            <input type="month" name="periode" required />
          </div>
          <div>
            <label>Copies N&B</label>
            <input type="number" name="copiesNB" min={0} defaultValue={0} />
          </div>
          <div>
            <label>Copies couleur</label>
            <input type="number" name="copiesCouleur" min={0} defaultValue={0} />
          </div>
          <button className="primary" type="submit" disabled={busy}>
            Enregistrer
          </button>
        </form>
      )}
    </div>
  );
}

function ConsommablesTab({ clientOperationsId, canEdit, reloadKey, onChanged }: TabProps) {
  const { showToast } = useToast();
  const { data, loading, refetch } = useResource<LivraisonConsommable[]>(`/api/parc/clients/${clientOperationsId}/consommables`, reloadKey);
  const [busy, setBusy] = useState(false);

  async function handleAdd(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const fd = new FormData(form);
    setBusy(true);
    try {
      await api.post(`/api/parc/clients/${clientOperationsId}/consommables`, {
        date: fd.get('date'),
        reference: fd.get('reference'),
        quantite: fd.get('quantite'),
      });
      form.reset();
      refetch();
      onChanged();
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : 'Erreur');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      {loading || !data ? (
        <div>Chargement…</div>
      ) : data.length === 0 ? (
        <p style={{ fontSize: 13, color: 'var(--ink-soft)' }}>Aucune livraison enregistrée.</p>
      ) : (
        <table style={{ marginBottom: 14 }}>
          <thead>
            <tr>
              <th>Date</th>
              <th>Référence</th>
              <th className="num">Quantité</th>
            </tr>
          </thead>
          <tbody>
            {data.map((l) => (
              <tr key={l.id}>
                <td className="mono">{fmtDate(l.date)}</td>
                <td>{l.reference}</td>
                <td className="mono num">{l.quantite}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {canEdit && (
        <form onSubmit={handleAdd} style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <div>
            <label>Date</label>
            <input type="date" name="date" required />
          </div>
          <div>
            <label>Référence</label>
            <input type="text" name="reference" required />
          </div>
          <div>
            <label>Quantité</label>
            <input type="number" name="quantite" min={1} defaultValue={1} />
          </div>
          <button className="primary" type="submit" disabled={busy}>
            Ajouter
          </button>
        </form>
      )}
    </div>
  );
}

function ActionsTab({ clientOperationsId, canEdit, reloadKey, onChanged }: TabProps) {
  const { showToast } = useToast();
  const { data, loading, refetch } = useResource<ActionCopil[]>(`/api/parc/clients/${clientOperationsId}/actions`, reloadKey);
  const [busy, setBusy] = useState(false);

  async function handleAdd(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const fd = new FormData(form);
    setBusy(true);
    try {
      await api.post(`/api/parc/clients/${clientOperationsId}/actions`, {
        priorite: fd.get('priorite'),
        action: fd.get('action'),
        responsable: fd.get('responsable') || undefined,
        echeance: fd.get('echeance') || undefined,
      });
      form.reset();
      refetch();
      onChanged();
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : 'Erreur');
    } finally {
      setBusy(false);
    }
  }

  async function changerStatut(a: ActionCopil, statut: StatutActionCopil) {
    setBusy(true);
    try {
      await api.patch(`/api/parc/actions/${a.id}`, { statut });
      refetch();
      onChanged();
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : 'Erreur');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      {loading || !data ? (
        <div>Chargement…</div>
      ) : data.length === 0 ? (
        <p style={{ fontSize: 13, color: 'var(--ink-soft)' }}>Aucune action planifiée.</p>
      ) : (
        <table style={{ marginBottom: 14 }}>
          <thead>
            <tr>
              <th>Priorité</th>
              <th>Action</th>
              <th>Responsable</th>
              <th>Échéance</th>
              <th>Statut</th>
            </tr>
          </thead>
          <tbody>
            {data.map((a) => (
              <tr key={a.id}>
                <td>
                  <span className="badge" data-tone={a.priorite === 'p1' ? 'danger' : a.priorite === 'p2' ? 'amber' : 'success'}>
                    {PRIORITE_LABELS[a.priorite]}
                  </span>
                </td>
                <td>{a.action}</td>
                <td>{a.responsable || '—'}</td>
                <td className="mono">{fmtDate(a.echeance)}</td>
                <td>
                  {canEdit ? (
                    <select value={a.statut} disabled={busy} onChange={(e) => changerStatut(a, e.target.value as StatutActionCopil)}>
                      {(Object.keys(STATUT_ACTION_LABELS) as StatutActionCopil[]).map((s) => (
                        <option key={s} value={s}>
                          {STATUT_ACTION_LABELS[s]}
                        </option>
                      ))}
                    </select>
                  ) : (
                    STATUT_ACTION_LABELS[a.statut]
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {canEdit && (
        <form onSubmit={handleAdd} style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <div>
            <label>Priorité</label>
            <select name="priorite" defaultValue="p2">
              <option value="p1">P1</option>
              <option value="p2">P2</option>
              <option value="p3">P3</option>
            </select>
          </div>
          <div style={{ flex: '1 1 220px' }}>
            <label>Action</label>
            <input type="text" name="action" required />
          </div>
          <div>
            <label>Responsable</label>
            <input type="text" name="responsable" />
          </div>
          <div>
            <label>Échéance</label>
            <input type="date" name="echeance" />
          </div>
          <button className="primary" type="submit" disabled={busy}>
            Ajouter
          </button>
        </form>
      )}
    </div>
  );
}

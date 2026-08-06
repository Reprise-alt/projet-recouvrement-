import { FormEvent, useState } from 'react';
import { AlertTriangle, PlusCircle, Search, Settings, ShieldAlert, Users } from 'lucide-react';
import { api, ApiError, buildQuery } from '../api/client';
import { useResource } from '../hooks/useResource';
import {
  Campagne,
  CampagneDetail,
  CockpitResponse,
  ClientOperationsRow,
  CopilEntry,
  CurrentUser,
  Entite,
  ReleveFileEntry,
  ResiliationsReport,
  Secteur,
} from '../api/types';
import { fmtDate } from '../lib/constants';
import { CRITICITE_LABELS, MOTIF_RESILIATION_LABELS, SECTEUR_LABELS, toneBg, toneColor } from '../lib/operationsConstants';
import { useToast } from '../hooks/useToast';
import { EntityLogo, entityAccent } from './EntityLogo';
import { ScoreGauge } from './ScoreGauge';
import { ClientOperationsDrawer } from './ClientOperationsDrawer';
import { OperationsAdminPanel } from './OperationsAdminPanel';

interface Props {
  entityFilter: Entite | 'ALL';
  user: CurrentUser;
  reloadKey: unknown;
}

type OpsTab = 'cockpit' | 'portefeuille' | 'releve' | 'campagnes' | 'copil' | 'resiliations';

export function OperationsView({ entityFilter, user, reloadKey }: Props) {
  const [tab, setTab] = useState<OpsTab>('cockpit');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [adminOpen, setAdminOpen] = useState(false);
  const [localReload, setLocalReload] = useState(0);
  const bump = () => setLocalReload((v) => v + 1);
  const combinedReload = `${String(reloadKey)}:${localReload}`;

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 22 }}>
        <div className="entity-toggle" style={{ display: 'inline-flex' }}>
          <button className={tab === 'cockpit' ? 'active' : ''} onClick={() => setTab('cockpit')}>
            Cockpit
          </button>
          <button className={tab === 'portefeuille' ? 'active' : ''} onClick={() => setTab('portefeuille')}>
            Portefeuille
          </button>
          <button className={tab === 'releve' ? 'active' : ''} onClick={() => setTab('releve')}>
            Relevé hebdo
          </button>
          <button className={tab === 'campagnes' ? 'active' : ''} onClick={() => setTab('campagnes')}>
            Campagnes
          </button>
          <button className={tab === 'copil' ? 'active' : ''} onClick={() => setTab('copil')}>
            COPIL grands comptes
          </button>
          <button className={tab === 'resiliations' ? 'active' : ''} onClick={() => setTab('resiliations')}>
            Résiliations
          </button>
        </div>
        {user.roleOperations === 'direction_generale' && (
          <button onClick={() => setAdminOpen(true)}>
            <Settings size={13} /> Administration
          </button>
        )}
      </div>

      {tab === 'cockpit' && <CockpitTab entityFilter={entityFilter} reloadKey={combinedReload} onSelect={setSelectedId} />}
      {tab === 'portefeuille' && <PortefeuilleTab entityFilter={entityFilter} reloadKey={combinedReload} onSelect={setSelectedId} />}
      {tab === 'releve' && <ReleveTab entityFilter={entityFilter} reloadKey={combinedReload} onSelect={setSelectedId} />}
      {tab === 'campagnes' && <CampagnesTab entityFilter={entityFilter} reloadKey={combinedReload} user={user} onSelect={setSelectedId} onChanged={bump} />}
      {tab === 'copil' && <CopilTab entityFilter={entityFilter} reloadKey={combinedReload} onSelect={setSelectedId} />}
      {tab === 'resiliations' && <ResiliationsTab entityFilter={entityFilter} reloadKey={combinedReload} onSelect={setSelectedId} />}

      {selectedId && <ClientOperationsDrawer id={selectedId} user={user} onClose={() => setSelectedId(null)} onChanged={bump} />}
      {adminOpen && <OperationsAdminPanel onClose={() => setAdminOpen(false)} />}
    </div>
  );
}

function CockpitTab({ entityFilter, reloadKey, onSelect }: { entityFilter: Entite | 'ALL'; reloadKey: unknown; onSelect: (id: string) => void }) {
  const { data, loading, error } = useResource<CockpitResponse>(`/api/operations/cockpit${buildQuery({ entite: entityFilter })}`, reloadKey);

  if (loading) return <div className="empty-state">Chargement…</div>;
  if (error || !data) return <div className="empty-state"><h3>Erreur</h3><p>{error}</p></div>;

  const c = data.compteurs;
  return (
    <div>
      <div className="kpis">
        <div className="kpi">
          <div className="kpi-label">
            <AlertTriangle size={13} /> Problèmes ouverts
          </div>
          <div className="kpi-value">{c.problemesOuverts}</div>
        </div>
        <div className="kpi">
          <div className="kpi-label">
            <Users size={13} /> Hors règle de contact
          </div>
          <div className="kpi-value">{c.horsRegleContact}</div>
        </div>
        <div className="kpi">
          <div className="kpi-label">
            <ShieldAlert size={13} /> COPIL du mois tenus
          </div>
          <div className="kpi-value">{c.copilDuMois}</div>
        </div>
        <div className="kpi">
          <div className="kpi-label">Engagements en retard</div>
          <div className="kpi-value">{c.engagementsEnRetard}</div>
        </div>
        <div className="kpi">
          <div className="kpi-label">Relevés de la semaine</div>
          <div className="kpi-value">
            {c.releveDeLaSemaine}/{c.totalPortefeuille}
          </div>
        </div>
        <div className="kpi">
          <div className="kpi-label">Portefeuille actif</div>
          <div className="kpi-value">{c.totalPortefeuille}</div>
        </div>
      </div>

      <div className="table-card">
        <div className="table-head">
          <div style={{ fontWeight: 600, fontSize: 14 }}>Alertes</div>
        </div>
        {data.alertes.length === 0 ? (
          <div className="empty-state">
            <h3>Aucune alerte</h3>
            <p>Le portefeuille est à jour sur tous les fronts suivis.</p>
          </div>
        ) : (
          <div>
            {data.alertes.map((a, i) => (
              <div
                key={i}
                className="row-hover"
                onClick={() => onSelect(a.clientId)}
                style={{ display: 'flex', gap: 12, alignItems: 'center', padding: '12px 20px', borderBottom: '1px solid var(--line-soft)', cursor: 'pointer' }}
              >
                <span className="badge" data-tone={a.niveau === 'risque' ? 'danger' : 'amber'} style={{ flexShrink: 0 }}>
                  {a.niveau === 'risque' ? 'Risque' : 'Vigilance'}
                </span>
                <div style={{ flex: 1 }}>
                  <strong>{a.titre}</strong>
                  <div style={{ fontSize: 12.5, color: 'var(--ink-soft)' }}>
                    {a.clientNom} {a.vip && '· VIP'} · {a.detail}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {data.demarragesEnCours.length > 0 && (
        <div className="table-card" style={{ marginTop: 20 }}>
          <div className="table-head">
            <div style={{ fontWeight: 600, fontSize: 14 }}>Démarrages en cours</div>
          </div>
          <div>
            {data.demarragesEnCours.map(({ id, client, etat }) => (
              <div
                key={id}
                className="row-hover"
                onClick={() => onSelect(id)}
                style={{ display: 'flex', gap: 12, alignItems: 'center', padding: '12px 20px', borderBottom: '1px solid var(--line-soft)', cursor: 'pointer' }}
              >
                <EntityLogo entite={client.entite} size={14} />
                <div style={{ flex: 1 }}>
                  <strong>{client.nom}</strong>
                  <div style={{ fontSize: 12.5, color: 'var(--ink-soft)' }}>
                    {etat.nbFaits}/{etat.total} étapes bouclées — J+{etat.age} sur 90 {etat.retard.length > 0 && `· ${etat.retard.length} en retard`}
                  </div>
                </div>
                <div style={{ width: 100, height: 6, background: 'var(--line-soft)', borderRadius: 3, overflow: 'hidden' }}>
                  <div style={{ width: `${etat.pct}%`, height: '100%', background: 'var(--accent)' }} />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function PortefeuilleTab({ entityFilter, reloadKey, onSelect }: { entityFilter: Entite | 'ALL'; reloadKey: unknown; onSelect: (id: string) => void }) {
  const [search, setSearch] = useState('');
  const [onlyVip, setOnlyVip] = useState(false);
  const [onlyResilie, setOnlyResilie] = useState(false);
  const [creating, setCreating] = useState(false);
  const { data, loading, error, refetch } = useResource<ClientOperationsRow[]>(`/api/operations/portefeuille${buildQuery({ entite: entityFilter })}`, reloadKey);

  const filtered = (data ?? []).filter(
    (r) => r.client.nom.toLowerCase().includes(search.trim().toLowerCase()) && (!onlyVip || r.vip) && (onlyResilie ? r.resilie : !r.resilie),
  );

  return (
    <div className="table-card">
      <div className="table-head">
        <div style={{ fontWeight: 600, fontSize: 14 }}>Portefeuille ({filtered.length})</div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, textTransform: 'none' }}>
            <input type="checkbox" checked={onlyVip} onChange={(e) => setOnlyVip(e.target.checked)} /> VIP
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, textTransform: 'none' }}>
            <input type="checkbox" checked={onlyResilie} onChange={(e) => setOnlyResilie(e.target.checked)} /> Résiliés
          </label>
          <input type="text" placeholder="Rechercher un client…" value={search} onChange={(e) => setSearch(e.target.value)} style={{ width: 200 }} />
          <button onClick={() => setCreating(true)}>
            <PlusCircle size={13} /> Nouveau compte
          </button>
        </div>
      </div>
      {loading ? (
        <div className="empty-state">Chargement…</div>
      ) : error ? (
        <div className="empty-state">
          <h3>Erreur</h3>
          <p>{error}</p>
        </div>
      ) : !filtered.length ? (
        <div className="empty-state">
          <h3>Aucun compte</h3>
          <p>Essayez un autre filtre, ou ajoutez un compte depuis la fiche client.</p>
        </div>
      ) : (
        <table>
          <thead>
            <tr>
              <th>Client</th>
              <th>Entité</th>
              <th>Secteur</th>
              <th>Criticité</th>
              <th>Problèmes</th>
              <th>Dernier contact</th>
              <th>Score</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((r) => (
              <tr key={r.id} className="row-hover" onClick={() => onSelect(r.id)}>
                <td>
                  {r.client.nom}
                  {r.vip && (
                    <span className="badge" data-tone="amber" style={{ marginLeft: 8 }}>
                      VIP
                    </span>
                  )}
                  {r.resilie && (
                    <span className="badge" data-tone="danger" style={{ marginLeft: 8 }}>
                      Résilié
                    </span>
                  )}
                </td>
                <td>
                  <span className="entity-tag" style={{ borderLeftColor: entityAccent(r.client.entite), borderLeftWidth: 3 }}>
                    <EntityLogo entite={r.client.entite} size={12} />
                    {r.client.entite}
                  </span>
                </td>
                <td>{SECTEUR_LABELS[r.secteur]}</td>
                <td>{CRITICITE_LABELS[r.criticite]}</td>
                <td>
                  {r.problemesOuverts === 0 ? (
                    <span style={{ color: 'var(--ink-soft)' }}>—</span>
                  ) : (
                    <span style={{ color: r.problemesBloquants ? 'var(--danger)' : 'var(--ink)' }}>
                      {r.problemesOuverts} {r.problemesBloquants > 0 && `(${r.problemesBloquants} bloquant${r.problemesBloquants > 1 ? 's' : ''})`}
                    </span>
                  )}
                </td>
                <td>{fmtDate(r.dernierContact)}</td>
                <td>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <ScoreGauge scores={r.scores} />
                    <span className="badge" data-tone={r.tone} style={{ fontFamily: 'var(--font-mono)' }}>
                      {r.scores.global}
                    </span>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {creating && (
        <NouveauCompteModal
          entityFilter={entityFilter}
          onClose={() => setCreating(false)}
          onCreated={() => {
            setCreating(false);
            refetch();
          }}
        />
      )}
    </div>
  );
}

function NouveauCompteModal({ entityFilter, onClose, onCreated }: { entityFilter: Entite | 'ALL'; onClose: () => void; onCreated: () => void }) {
  const { showToast } = useToast();
  const [busy, setBusy] = useState(false);

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    setBusy(true);
    try {
      await api.post('/api/operations/clients', {
        nom: form.get('nom'),
        entite: form.get('entite'),
        codeClient: form.get('codeClient') || undefined,
        secteur: form.get('secteur'),
        criticite: form.get('criticite'),
        vip: form.get('vip') === 'on',
        demarrerSuivi: form.get('demarrerSuivi') === 'on',
      });
      showToast('Compte créé');
      onCreated();
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : 'Erreur');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="modal-overlay open" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal">
        <h2 style={{ marginBottom: 4 }}>Nouveau compte Opérations</h2>
        <div style={{ color: 'var(--ink-soft)', fontSize: 12.5, marginBottom: 16 }}>
          Rattaché automatiquement à la fiche client existante si le nom et l'entité correspondent, sinon une nouvelle fiche est créée.
        </div>
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div>
            <label>Nom du client</label>
            <input type="text" name="nom" required />
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
            <div style={{ flex: 1 }}>
              <label>Entité</label>
              <select name="entite" defaultValue={entityFilter !== 'ALL' ? entityFilter : 'SORAM'} required>
                <option value="SORAM">SORAM</option>
                <option value="IRIS">IRIS</option>
              </select>
            </div>
            <div style={{ flex: 1 }}>
              <label>Code client (optionnel)</label>
              <input type="text" name="codeClient" placeholder="Rapprochement recouvrement" />
            </div>
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
            <div style={{ flex: 1 }}>
              <label>Secteur</label>
              <select name="secteur" required defaultValue="autre">
                {(Object.keys(SECTEUR_LABELS) as Secteur[]).map((s) => (
                  <option key={s} value={s}>
                    {SECTEUR_LABELS[s]}
                  </option>
                ))}
              </select>
            </div>
            <div style={{ flex: 1 }}>
              <label>Criticité</label>
              <select name="criticite" defaultValue="C">
                {(['A', 'B', 'C'] as const).map((c) => (
                  <option key={c} value={c}>
                    {CRITICITE_LABELS[c]}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, textTransform: 'none', fontSize: 13 }}>
            <input type="checkbox" name="vip" /> Grand compte (VIP)
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, textTransform: 'none', fontSize: 13 }}>
            <input type="checkbox" name="demarrerSuivi" /> Nouveau contrat — démarrer le suivi des 90 premiers jours
          </label>
          <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
            <button className="primary" type="submit" disabled={busy}>
              Créer le compte
            </button>
            <button type="button" onClick={onClose}>
              Annuler
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function ReleveTab({ entityFilter, reloadKey, onSelect }: { entityFilter: Entite | 'ALL'; reloadKey: unknown; onSelect: (id: string) => void }) {
  const { data, loading, error } = useResource<ReleveFileEntry[]>(`/api/operations/releve-file${buildQuery({ entite: entityFilter })}`, reloadKey);
  const restants = (data ?? []).filter((r) => !r.releveFait);

  return (
    <div className="table-card">
      <div className="table-head">
        <div style={{ fontWeight: 600, fontSize: 14 }}>
          File du relevé hebdomadaire — {restants.length} restant{restants.length !== 1 ? 's' : ''} sur {data?.length ?? 0}
        </div>
      </div>
      {loading ? (
        <div className="empty-state">Chargement…</div>
      ) : error ? (
        <div className="empty-state">
          <h3>Erreur</h3>
          <p>{error}</p>
        </div>
      ) : !data?.length ? (
        <div className="empty-state">
          <h3>Portefeuille vide</h3>
        </div>
      ) : (
        <div>
          {data.map((r) => (
            <div
              key={r.id}
              className="row-hover"
              onClick={() => onSelect(r.id)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                padding: '11px 20px',
                borderBottom: '1px solid var(--line-soft)',
                cursor: 'pointer',
                opacity: r.releveFait ? 0.55 : 1,
              }}
            >
              <Search size={14} style={{ color: 'var(--ink-soft)', flexShrink: 0 }} />
              <div style={{ flex: 1 }}>
                <strong>{r.client.nom}</strong>
                {r.vip && (
                  <span className="badge" data-tone="amber" style={{ marginLeft: 8 }}>
                    VIP
                  </span>
                )}
              </div>
              <ScoreGauge scores={r.scores} />
              <span
                className="badge"
                data-tone={r.releveFait ? 'success' : 'amber'}
                style={{ minWidth: 90, textAlign: 'center', background: r.releveFait ? undefined : toneBg('amber'), color: r.releveFait ? undefined : toneColor('amber') }}
              >
                {r.releveFait ? 'Relevé fait' : 'À relever'}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function CampagnesTab({
  entityFilter,
  reloadKey,
  user,
  onSelect,
  onChanged,
}: {
  entityFilter: Entite | 'ALL';
  reloadKey: unknown;
  user: CurrentUser;
  onSelect: (id: string) => void;
  onChanged: () => void;
}) {
  const { showToast } = useToast();
  const [creating, setCreating] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const { data, loading, error, refetch } = useResource<Campagne[]>('/api/operations/campagnes', reloadKey);
  const detail = useResource<CampagneDetail>(openId ? `/api/operations/campagnes/${openId}` : null, reloadKey);
  const canCreate = user.roleOperations === 'directrice_operations' || user.roleOperations === 'direction_generale';

  const visibles = (data ?? []).filter((c) => c.entite === 'GROUPE' || entityFilter === 'ALL' || c.entite === entityFilter);

  async function handleCreate(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const secteurs = Array.from(form.getAll('secteurs')) as string[];
    if (!secteurs.length) {
      showToast('Choisissez au moins un secteur');
      return;
    }
    setBusy(true);
    try {
      await api.post('/api/operations/campagnes', {
        nom: form.get('nom'),
        objectif: form.get('objectif'),
        secteurs,
        entite: form.get('entite'),
        echeance: form.get('echeance'),
      });
      setCreating(false);
      refetch();
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : 'Erreur');
    } finally {
      setBusy(false);
    }
  }

  async function marquerTraite(clientOperationsId: string) {
    if (!openId) return;
    setBusy(true);
    try {
      await api.post(`/api/operations/campagnes/${openId}/faits`, { clientOperationsId });
      detail.refetch();
      refetch();
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : 'Erreur');
    } finally {
      setBusy(false);
    }
  }

  async function cloturer(id: string) {
    setBusy(true);
    try {
      await api.post(`/api/operations/campagnes/${id}/cloturer`, {});
      showToast('Campagne clôturée');
      refetch();
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : 'Erreur');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="table-card">
      <div className="table-head">
        <div style={{ fontWeight: 600, fontSize: 14 }}>Campagnes sectorielles</div>
        {canCreate && <button onClick={() => setCreating(true)}><PlusCircle size={13} /> Nouvelle campagne</button>}
      </div>
      {loading ? (
        <div className="empty-state">Chargement…</div>
      ) : error ? (
        <div className="empty-state"><h3>Erreur</h3><p>{error}</p></div>
      ) : !visibles.length ? (
        <div className="empty-state"><h3>Aucune campagne</h3><p>Créez-en une pour traiter plusieurs comptes d'un même secteur en une opération.</p></div>
      ) : (
        <div>
          {visibles.map((c) => (
            <div key={c.id} style={{ borderBottom: '1px solid var(--line-soft)' }}>
              <div
                className="row-hover"
                onClick={() => setOpenId(openId === c.id ? null : c.id)}
                style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 20px', cursor: 'pointer' }}
              >
                <div style={{ flex: 1 }}>
                  <strong>{c.nom}</strong>
                  {c.cloturee && (
                    <span className="badge" data-tone="success" style={{ marginLeft: 8 }}>Clôturée</span>
                  )}
                  <div style={{ fontSize: 12.5, color: 'var(--ink-soft)' }}>
                    {c.secteurs.map((s) => SECTEUR_LABELS[s]).join(', ')} · {c.entite} · échéance {fmtDate(c.echeance)}
                  </div>
                </div>
                <div style={{ width: 140 }}>
                  <div style={{ fontSize: 12, color: 'var(--ink-soft)', marginBottom: 3 }}>
                    {c.traitesCount}/{c.ciblesCount} traités
                  </div>
                  <div style={{ height: 6, background: 'var(--line-soft)', borderRadius: 3, overflow: 'hidden' }}>
                    <div style={{ width: `${c.ciblesCount ? (c.traitesCount / c.ciblesCount) * 100 : 0}%`, height: '100%', background: 'var(--accent)' }} />
                  </div>
                </div>
              </div>
              {openId === c.id && (
                <div style={{ padding: '4px 20px 16px 20px', background: 'var(--paper-2)' }}>
                  {!c.cloturee && canCreate && (
                    <button onClick={() => cloturer(c.id)} disabled={busy} style={{ marginBottom: 10 }}>
                      Clôturer la campagne
                    </button>
                  )}
                  {detail.loading ? (
                    <div style={{ fontSize: 13 }}>Chargement des cibles…</div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                      {(detail.data?.cibles ?? []).map((cible) => (
                        <div key={cible.clientOperationsId} style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 13 }}>
                          <input
                            type="checkbox"
                            checked={cible.traite}
                            disabled={cible.traite || busy || !canCreate}
                            onChange={() => marquerTraite(cible.clientOperationsId)}
                          />
                          <span
                            style={{ flex: 1, cursor: 'pointer', textDecoration: cible.traite ? 'line-through' : undefined, color: cible.traite ? 'var(--ink-soft)' : 'var(--ink)' }}
                            onClick={() => onSelect(cible.clientOperationsId)}
                          >
                            {cible.client.nom}
                          </span>
                          <EntityLogo entite={cible.client.entite} size={12} />
                        </div>
                      ))}
                      {!detail.data?.cibles.length && <div style={{ fontSize: 13, color: 'var(--ink-soft)' }}>Aucun compte actif dans ce secteur pour l'instant.</div>}
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
      {creating && (
        <div className="modal-overlay open" onClick={(e) => e.target === e.currentTarget && setCreating(false)}>
          <div className="modal">
            <h2 style={{ marginBottom: 16 }}>Nouvelle campagne</h2>
            <form onSubmit={handleCreate} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div>
                <label>Intitulé</label>
                <input type="text" name="nom" placeholder="Ex. Rentrée scolaire 2026" required />
              </div>
              <div>
                <label>Objectif</label>
                <input type="text" name="objectif" placeholder="Ce qu'on va dire ou vérifier chez chaque client" />
              </div>
              <div>
                <label>Entité</label>
                <select name="entite" defaultValue={entityFilter !== 'ALL' ? entityFilter : 'SORAM'}>
                  <option value="SORAM">SORAM</option>
                  <option value="IRIS">IRIS</option>
                  <option value="GROUPE">Groupe (les deux)</option>
                </select>
              </div>
              <div>
                <label>Échéance</label>
                <input type="date" name="echeance" required />
              </div>
              <div>
                <label>Secteurs ciblés</label>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 4, maxHeight: 160, overflowY: 'auto', border: '1px solid var(--line)', borderRadius: 8, padding: 8 }}>
                  {(Object.keys(SECTEUR_LABELS) as Secteur[]).map((s) => (
                    <label key={s} style={{ display: 'flex', alignItems: 'center', gap: 5, textTransform: 'none', fontSize: 12.5 }}>
                      <input type="checkbox" name="secteurs" value={s} /> {SECTEUR_LABELS[s]}
                    </label>
                  ))}
                </div>
              </div>
              <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
                <button className="primary" type="submit" disabled={busy}>Créer la campagne</button>
                <button type="button" onClick={() => setCreating(false)}>Annuler</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

function CopilTab({ entityFilter, reloadKey, onSelect }: { entityFilter: Entite | 'ALL'; reloadKey: unknown; onSelect: (id: string) => void }) {
  const { data, loading, error } = useResource<CopilEntry[]>(`/api/operations/copil${buildQuery({ entite: entityFilter })}`, reloadKey);

  return (
    <div className="table-card">
      <div className="table-head">
        <div style={{ fontWeight: 600, fontSize: 14 }}>Grands comptes ({data?.length ?? 0})</div>
      </div>
      {loading ? (
        <div className="empty-state">Chargement…</div>
      ) : error ? (
        <div className="empty-state"><h3>Erreur</h3><p>{error}</p></div>
      ) : !data?.length ? (
        <div className="empty-state"><h3>Aucun grand compte</h3><p>Marquez un compte VIP depuis sa fiche pour le faire apparaître ici.</p></div>
      ) : (
        <table>
          <thead>
            <tr>
              <th>Client</th>
              <th>Entité</th>
              <th>Dernier COPIL</th>
              <th>Problèmes ouverts</th>
              <th>Enjeux</th>
              <th>Score</th>
            </tr>
          </thead>
          <tbody>
            {data.map((c) => (
              <tr key={c.id} className="row-hover" onClick={() => onSelect(c.id)}>
                <td>
                  {c.client.nom}
                  {!c.copilFaitCeMois && (
                    <span className="badge" data-tone="danger" style={{ marginLeft: 8 }}>COPIL du mois non tenu</span>
                  )}
                </td>
                <td>
                  <span className="entity-tag" style={{ borderLeftColor: entityAccent(c.client.entite), borderLeftWidth: 3 }}>
                    <EntityLogo entite={c.client.entite} size={12} />
                    {c.client.entite}
                  </span>
                </td>
                <td>{fmtDate(c.dernierCopil)}</td>
                <td>{c.problemesOuverts || <span style={{ color: 'var(--ink-soft)' }}>—</span>}</td>
                <td style={{ maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.enjeux || '—'}</td>
                <td>
                  <span className="badge" data-tone={c.tone} style={{ fontFamily: 'var(--font-mono)' }}>{c.scores.global}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

function ResiliationsTab({ entityFilter, reloadKey, onSelect }: { entityFilter: Entite | 'ALL'; reloadKey: unknown; onSelect: (id: string) => void }) {
  const { data, loading, error } = useResource<ResiliationsReport>(`/api/operations/resiliations${buildQuery({ entite: entityFilter })}`, reloadKey);
  const maxMois = Math.max(1, ...(data?.histogramme12Mois.map((m) => m.nombre) ?? [1]));

  if (loading) return <div className="empty-state">Chargement…</div>;
  if (error || !data) return <div className="empty-state"><h3>Erreur</h3><p>{error}</p></div>;

  return (
    <div>
      <div className="kpis">
        <div className="kpi">
          <div className="kpi-label">Résiliations totales</div>
          <div className="kpi-value">{data.compteurs.total}</div>
        </div>
        <div className="kpi">
          <div className="kpi-label">Ce mois-ci</div>
          <div className="kpi-value">{data.compteurs.moisCourant}</div>
        </div>
      </div>

      <div className="table-card" style={{ marginBottom: 20 }}>
        <div className="table-head">
          <div style={{ fontWeight: 600, fontSize: 14 }}>Sur 12 mois glissants</div>
        </div>
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 6, padding: '20px', height: 120 }}>
          {data.histogramme12Mois.map((m) => (
            <div key={m.mois} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
              <div style={{ width: '100%', height: 80, display: 'flex', alignItems: 'flex-end' }}>
                <div style={{ width: '100%', height: `${(m.nombre / maxMois) * 100}%`, minHeight: m.nombre ? 4 : 0, background: 'var(--danger)', borderRadius: '3px 3px 0 0' }} />
              </div>
              <div style={{ fontSize: 10, color: 'var(--ink-soft)', fontFamily: 'var(--font-mono)' }}>{m.mois.slice(5)}</div>
            </div>
          ))}
        </div>
      </div>

      <div className="table-card" style={{ marginBottom: 20 }}>
        <div className="table-head">
          <div style={{ fontWeight: 600, fontSize: 14 }}>Répartition par motif</div>
        </div>
        <div style={{ padding: '12px 20px', display: 'flex', flexDirection: 'column', gap: 8 }}>
          {data.parMotif.length === 0 && <div style={{ fontSize: 13, color: 'var(--ink-soft)' }}>Aucune résiliation.</div>}
          {data.parMotif.map((m) => (
            <div key={m.motif} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
              <span>{MOTIF_RESILIATION_LABELS[m.motif]}</span>
              <strong>{m.nombre}</strong>
            </div>
          ))}
        </div>
      </div>

      <div className="table-card">
        <div className="table-head">
          <div style={{ fontWeight: 600, fontSize: 14 }}>Liste détaillée</div>
        </div>
        {!data.liste.length ? (
          <div className="empty-state"><h3>Aucune résiliation</h3></div>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Client</th>
                <th>Date</th>
                <th>Motif</th>
                <th>Circonstances</th>
              </tr>
            </thead>
            <tbody>
              {data.liste.map((r) => (
                <tr key={r.id} className="row-hover" onClick={() => onSelect(r.id)}>
                  <td>{r.client.nom}</td>
                  <td>{fmtDate(r.dateResiliation)}</td>
                  <td>{r.motifResiliation ? MOTIF_RESILIATION_LABELS[r.motifResiliation] : '—'}</td>
                  <td style={{ maxWidth: 260, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.motifDetail || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

import { FormEvent, useState } from 'react';
import { AlertTriangle, PlusCircle, Search, ShieldAlert, Users } from 'lucide-react';
import { api, ApiError, buildQuery } from '../api/client';
import { useResource } from '../hooks/useResource';
import { CockpitResponse, ClientOperationsRow, CurrentUser, Entite, ReleveFileEntry, Secteur } from '../api/types';
import { fmtDate } from '../lib/constants';
import { CRITICITE_LABELS, SECTEUR_LABELS, toneBg, toneColor } from '../lib/operationsConstants';
import { useToast } from '../hooks/useToast';
import { EntityLogo, entityAccent } from './EntityLogo';
import { ScoreGauge } from './ScoreGauge';
import { ClientOperationsDrawer } from './ClientOperationsDrawer';

interface Props {
  entityFilter: Entite | 'ALL';
  user: CurrentUser;
  reloadKey: unknown;
}

type OpsTab = 'cockpit' | 'portefeuille' | 'releve';

export function OperationsView({ entityFilter, user, reloadKey }: Props) {
  const [tab, setTab] = useState<OpsTab>('cockpit');
  const [selectedId, setSelectedId] = useState<string | null>(null);

  return (
    <div>
      <div className="entity-toggle" style={{ display: 'inline-flex', marginBottom: 22 }}>
        <button className={tab === 'cockpit' ? 'active' : ''} onClick={() => setTab('cockpit')}>
          Cockpit
        </button>
        <button className={tab === 'portefeuille' ? 'active' : ''} onClick={() => setTab('portefeuille')}>
          Portefeuille
        </button>
        <button className={tab === 'releve' ? 'active' : ''} onClick={() => setTab('releve')}>
          Relevé hebdo
        </button>
      </div>

      {tab === 'cockpit' && <CockpitTab entityFilter={entityFilter} reloadKey={reloadKey} onSelect={setSelectedId} />}
      {tab === 'portefeuille' && <PortefeuilleTab entityFilter={entityFilter} reloadKey={reloadKey} onSelect={setSelectedId} />}
      {tab === 'releve' && <ReleveTab entityFilter={entityFilter} reloadKey={reloadKey} onSelect={setSelectedId} />}

      {selectedId && (
        <ClientOperationsDrawer
          id={selectedId}
          user={user}
          onClose={() => setSelectedId(null)}
          onChanged={() => {
            /* les onglets se rafraîchissent via reloadKey au niveau App si besoin ; ici un simple refetch local suffit au retour */
          }}
        />
      )}
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

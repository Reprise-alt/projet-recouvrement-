import { useState } from 'react';
import { buildQuery } from '../api/client';
import { useResource } from '../hooks/useResource';
import { ClientListItem, Entite, RecouvrementKpis, RoleUtilisateur } from '../api/types';
import { fmtDate, fmtFCFA, PALIERS } from '../lib/constants';
import { ClientDrawer } from './ClientDrawer';
import { BulkRelanceModal } from './BulkRelanceModal';
import { EntityLogo, entityAccent } from './EntityLogo';

interface Props {
  entityFilter: Entite | 'ALL';
  role: RoleUtilisateur;
  reloadKey: unknown;
}

function needsAction(c: ClientListItem): boolean {
  const actionStale = c.palier > 0 && (!c.derniereAction || c.derniereAction.palier < c.palier);
  const relanceOverdue = c.prochaineRelance ? new Date(c.prochaineRelance) < new Date() : false;
  return actionStale || relanceOverdue;
}

export function RecouvrementView({ entityFilter, role, reloadKey }: Props) {
  const [palierFilter, setPalierFilter] = useState<number | null>(null);
  const [sortKey, setSortKey] = useState<'nom' | 'encours' | 'joursRetard'>('joursRetard');
  const [sortDir, setSortDir] = useState<1 | -1>(-1);
  const [selectedClientId, setSelectedClientId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [onlyATraiter, setOnlyATraiter] = useState(false);
  const [bulkRelance, setBulkRelance] = useState(false);

  const kpisPath = `/api/clients/kpis${buildQuery({ entite: entityFilter })}`;
  const listPath = `/api/clients${buildQuery({
    entite: entityFilter,
    palier: palierFilter ?? undefined,
    sort: sortKey,
    dir: sortDir === 1 ? 'asc' : 'desc',
  })}`;

  const kpis = useResource<RecouvrementKpis>(kpisPath, reloadKey);
  const list = useResource<ClientListItem[]>(listPath, reloadKey);

  function refetchAll() {
    kpis.refetch();
    list.refetch();
  }

  function toggleSort(key: typeof sortKey) {
    if (sortKey === key) setSortDir((d) => (d === 1 ? -1 : 1));
    else {
      setSortKey(key);
      setSortDir(-1);
    }
  }

  const ladder = kpis.data?.ladder ?? {};
  const rep = kpis.data?.repartition;
  const pct = (n: number) => (rep && rep.total > 0 ? Math.round((n / rep.total) * 100) : 0);
  const aTraiter = list.data?.filter(needsAction) ?? [];
  const filtered = list.data?.filter((c) => c.nom.toLowerCase().includes(search.trim().toLowerCase()) && (!onlyATraiter || needsAction(c))) ?? [];
  const canBulkRelance = role === 'admin' || role === 'manager_entite';

  return (
    <div>
      {aTraiter.length > 0 && (
        <div
          className="digest-banner"
          onClick={() => {
            setOnlyATraiter((v) => !v);
            setPalierFilter(null);
          }}
        >
          ⚠ {aTraiter.length} client{aTraiter.length > 1 ? 's' : ''} à traiter aujourd'hui — palier atteint sans action correspondante, ou promesse de paiement dépassée.
          {onlyATraiter && <strong> Filtre actif — cliquer pour tout réafficher.</strong>}
        </div>
      )}

      <div className="kpis">
        <div className="kpi">
          <div className="kpi-label">Encours total</div>
          <div className="kpi-value">{kpis.data ? fmtFCFA(kpis.data.totalEncours) : '—'}</div>
        </div>
        <div className="kpi">
          <div className="kpi-label">Clients en retard</div>
          <div className="kpi-value amber">{kpis.data?.enRetard ?? '—'}</div>
        </div>
        <div className="kpi">
          <div className="kpi-label">En contentieux (palier ≥ 6)</div>
          <div className="kpi-value danger">{kpis.data ? fmtFCFA(kpis.data.contentieux) : '—'}</div>
        </div>
        <div className="kpi">
          <div className="kpi-label">Courriers formels à traiter</div>
          <div className="kpi-value amber">{kpis.data?.lettresAEnvoyer ?? '—'}</div>
        </div>
      </div>

      {rep && rep.total > 0 && (
        <div className="repartition-card">
          <div className="repartition-title">Répartition des clients actifs ({rep.total})</div>
          <div className="repartition-track">
            <div className="repartition-seg" style={{ width: `${pct(rep.dansLesClous)}%`, background: 'var(--success)' }} />
            <div className="repartition-seg" style={{ width: `${pct(rep.arretService)}%`, background: 'var(--amber)' }} />
            <div className="repartition-seg" style={{ width: `${pct(rep.litige)}%`, background: 'var(--danger)' }} />
          </div>
          <div className="repartition-legend">
            <span>
              <span className="dot" style={{ background: 'var(--success)' }} />
              Dans les clous — {pct(rep.dansLesClous)} % ({rep.dansLesClous})
            </span>
            <span>
              <span className="dot" style={{ background: 'var(--amber)' }} />
              Arrêt de service — {pct(rep.arretService)} % ({rep.arretService})
            </span>
            <span>
              <span className="dot" style={{ background: 'var(--danger)' }} />
              En litige — {pct(rep.litige)} % ({rep.litige})
            </span>
          </div>
        </div>
      )}

      <div className="ladder-card">
        <div className="ladder-title">Échelle de recouvrement</div>
        <div className="ladder-sub">
          Chaque client est positionné automatiquement selon ses jours de retard. La taille de chaque palier suit son nombre de
          clients — cliquer pour filtrer.
        </div>
        {(() => {
          const counts = PALIERS.map((p) => ladder[p.id] ?? 0);
          const maxCount = Math.max(1, ...counts);
          const MIN_SIZE = 22;
          const MAX_SIZE = 54;
          const colWidth = 100 / PALIERS.length;
          // Même regroupement business que le KPI "Répartition des clients actifs" :
          // paliers 0-3 dans les clous, 4 arrêt de service, 5-7 en litige.
          const zones = [
            { label: 'Dans les clous', color: 'var(--success)', bg: 'var(--success-soft)', from: 0, count: 4 },
            { label: 'Arrêt de service', color: 'var(--amber)', bg: 'var(--amber-soft)', from: 4, count: 1 },
            { label: 'En litige', color: 'var(--danger)', bg: 'var(--danger-soft)', from: 5, count: 3 },
          ];
          return (
            <div className="ladder-zones">
              {zones.map((z) => (
                <div key={z.label}>
                  <div
                    className="ladder-zoneband"
                    style={{ left: `${z.from * colWidth}%`, width: `${z.count * colWidth - 1.5}%`, background: z.bg }}
                  />
                  <div className="ladder-zonelabel" style={{ left: `${z.from * colWidth}%`, color: z.color }}>
                    {z.label}
                  </div>
                </div>
              ))}
              <div className="ladder-gradient-rail" />
              <div className="ladder-row">
                {PALIERS.map((p) => {
                  const count = ladder[p.id] ?? 0;
                  const size = count === 0 ? MIN_SIZE : MIN_SIZE + (count / maxCount) * (MAX_SIZE - MIN_SIZE);
                  return (
                    <button
                      key={p.id}
                      className={`rung${palierFilter === p.id ? ' sel' : ''}${count === 0 ? ' ghost' : ''}`}
                      data-tone={p.tone}
                      onClick={() => setPalierFilter((cur) => (cur === p.id ? null : p.id))}
                    >
                      <div className="rung-circle" style={{ width: size, height: size, fontSize: size > 34 ? 15 : 12 }}>
                        {count}
                        {p.desc && <div className="rung-tip">{p.desc}</div>}
                      </div>
                      <div className="rung-meta">
                        <div className="rung-label">{p.label}</div>
                        <div className="rung-days">{p.key && kpis.data ? `J+${kpis.data.config[p.key]}` : '—'}</div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })()}
        <div className="ladder-legend">
          <span>
            <span className="dot" style={{ background: 'var(--success)' }} />
            Dans les clous (paliers 0-3)
          </span>
          <span>
            <span className="dot" style={{ background: 'var(--amber)' }} />
            Arrêt de service (palier 4)
          </span>
          <span>
            <span className="dot" style={{ background: 'var(--danger)' }} />
            En litige (paliers 5-7)
          </span>
        </div>
      </div>

      <div className="table-card">
        <div className="table-head">
          <div style={{ fontWeight: 600, fontSize: 14 }}>
            {onlyATraiter ? 'À traiter aujourd\'hui' : palierFilter !== null ? `Palier — ${PALIERS[palierFilter].label}` : 'Tous les clients'}
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <input
              type="text"
              placeholder="Rechercher un client…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={{ width: 220 }}
            />
            {onlyATraiter && <button onClick={() => setOnlyATraiter(false)}>Afficher tous les clients</button>}
            {palierFilter !== null && <button onClick={() => setPalierFilter(null)}>Effacer le filtre</button>}
            {palierFilter !== null && palierFilter > 0 && canBulkRelance && filtered.length > 0 && (
              <button onClick={() => setBulkRelance(true)}>Relance groupée</button>
            )}
          </div>
        </div>
        <div>
          {(() => {
            if (list.loading) {
              return <div className="empty-state">Chargement…</div>;
            }
            if (list.error) {
              return (
                <div className="empty-state">
                  <h3>Erreur</h3>
                  <p>{list.error}</p>
                </div>
              );
            }
            if (!filtered.length) {
              return (
                <div className="empty-state">
                  <h3>Aucun client sur ce filtre</h3>
                  <p>{search.trim() ? 'Aucun résultat pour cette recherche.' : 'Essayez un autre palier ou une autre entité.'}</p>
                </div>
              );
            }
            return (
            <table>
              <thead>
                <tr>
                  <th onClick={() => toggleSort('nom')}>Client</th>
                  <th>Entité</th>
                  <th onClick={() => toggleSort('encours')}>Encours</th>
                  <th>Échéance la + ancienne</th>
                  <th onClick={() => toggleSort('joursRetard')}>Jours de retard</th>
                  <th>Palier</th>
                  <th>Dernière action</th>
                  <th>Prochaine relance</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((c) => {
                  const pal = PALIERS[c.palier];
                  return (
                    <tr key={c.id} className="row-hover" onClick={() => setSelectedClientId(c.id)}>
                      <td>
                        {c.nom}
                        {c.frequenceFacturation !== 'mensuelle' && (
                          <span className="entity-tag" style={{ marginLeft: 8, fontSize: 10 }} title="L'échelle de paliers est adaptée à ce rythme de facturation">
                            {c.frequenceFacturation === 'trimestrielle' ? 'Trimestriel' : 'Annuel'}
                          </span>
                        )}
                        {c.note && (
                          <div style={{ fontSize: 11, color: 'var(--ink-soft)', marginTop: 2, maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {c.note}
                          </div>
                        )}
                      </td>
                      <td>
                        <span className="entity-tag" style={{ borderLeftColor: entityAccent(c.entite), borderLeftWidth: 3 }}>
                          <EntityLogo entite={c.entite} size={12} />
                          {c.entite}
                        </span>
                      </td>
                      <td className="mono">{fmtFCFA(c.encours)}</td>
                      <td className="mono">{fmtDate(c.echeanceLaPlusAncienne)}</td>
                      <td className="mono">{c.joursRetard} j</td>
                      <td>
                        <span className="badge" data-tone={pal.tone}>
                          {pal.label}
                        </span>
                      </td>
                      <td style={{ fontSize: 12 }}>
                        {c.derniereAction ? (
                          <span style={{ color: c.derniereAction.palier < c.palier ? 'var(--amber)' : 'var(--ink-soft)' }}>
                            {c.derniereAction.palier < c.palier && '⚠ '}
                            {c.derniereAction.label} · {fmtDate(c.derniereAction.date)}
                          </span>
                        ) : c.palier > 0 ? (
                          <span style={{ color: 'var(--amber)' }}>Aucune action</span>
                        ) : (
                          <span style={{ color: 'var(--ink-soft)' }}>—</span>
                        )}
                      </td>
                      <td style={{ fontSize: 12 }}>
                        {c.prochaineRelance ? (
                          <span style={{ color: new Date(c.prochaineRelance) < new Date() ? 'var(--danger)' : 'var(--ink-soft)' }}>
                            {new Date(c.prochaineRelance) < new Date() && '⚠ '}
                            {fmtDate(c.prochaineRelance)}
                          </span>
                        ) : (
                          <span style={{ color: 'var(--ink-soft)' }}>—</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            );
          })()}
        </div>
      </div>

      {selectedClientId && (
        <ClientDrawer clientId={selectedClientId} role={role} onClose={() => setSelectedClientId(null)} onChanged={refetchAll} />
      )}

      {bulkRelance && palierFilter !== null && (
        <BulkRelanceModal
          palierId={palierFilter}
          clients={filtered}
          onClose={() => setBulkRelance(false)}
          onDone={refetchAll}
        />
      )}
    </div>
  );
}

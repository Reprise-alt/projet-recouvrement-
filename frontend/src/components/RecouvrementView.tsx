import { useState } from 'react';
import { buildQuery } from '../api/client';
import { useResource } from '../hooks/useResource';
import { ClientListItem, Entite, RecouvrementKpis, RoleUtilisateur } from '../api/types';
import { fmtDate, fmtFCFA, PALIERS } from '../lib/constants';
import { ClientDrawer } from './ClientDrawer';
import { EntityLogo, entityAccent } from './EntityLogo';

interface Props {
  entityFilter: Entite | 'ALL';
  role: RoleUtilisateur;
  reloadKey: unknown;
}

export function RecouvrementView({ entityFilter, role, reloadKey }: Props) {
  const [palierFilter, setPalierFilter] = useState<number | null>(null);
  const [sortKey, setSortKey] = useState<'nom' | 'encours' | 'joursRetard'>('joursRetard');
  const [sortDir, setSortDir] = useState<1 | -1>(-1);
  const [selectedClientId, setSelectedClientId] = useState<string | null>(null);

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

  return (
    <div>
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

      <div className="ladder-card">
        <div className="ladder-title">Échelle de recouvrement</div>
        <div className="ladder-sub">Chaque client est positionné automatiquement selon ses jours de retard. Cliquer un palier pour filtrer.</div>
        <div className="ladder-rail">
          {PALIERS.map((p) => (
            <button
              key={p.id}
              className={`rung${palierFilter === p.id ? ' sel' : ''}`}
              data-tone={p.tone}
              title={p.desc || ''}
              onClick={() => setPalierFilter((cur) => (cur === p.id ? null : p.id))}
            >
              <div className="rung-num">0{p.id}</div>
              <div className="rung-dot">{ladder[p.id] ?? 0}</div>
              <div className="rung-label">{p.label}</div>
              <div className="rung-days">{p.key && kpis.data ? `J+${kpis.data.config[p.key]}` : '—'}</div>
            </button>
          ))}
        </div>
      </div>

      <div className="table-card">
        <div className="table-head">
          <div style={{ fontWeight: 600, fontSize: 14 }}>
            {palierFilter !== null ? `Palier — ${PALIERS[palierFilter].label}` : 'Tous les clients'}
          </div>
          {palierFilter !== null && <button onClick={() => setPalierFilter(null)}>Effacer le filtre</button>}
        </div>
        <div>
          {list.loading ? (
            <div className="empty-state">Chargement…</div>
          ) : list.error ? (
            <div className="empty-state">
              <h3>Erreur</h3>
              <p>{list.error}</p>
            </div>
          ) : !list.data?.length ? (
            <div className="empty-state">
              <h3>Aucun client sur ce filtre</h3>
              <p>Essayez un autre palier ou une autre entité.</p>
            </div>
          ) : (
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
                </tr>
              </thead>
              <tbody>
                {list.data.map((c) => {
                  const pal = PALIERS[c.palier];
                  return (
                    <tr key={c.id} className="row-hover" onClick={() => setSelectedClientId(c.id)}>
                      <td>
                        {c.nom}
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
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {selectedClientId && (
        <ClientDrawer clientId={selectedClientId} role={role} onClose={() => setSelectedClientId(null)} onChanged={refetchAll} />
      )}
    </div>
  );
}

import { useState } from 'react';
import { buildQuery } from '../api/client';
import { useResource } from '../hooks/useResource';
import { ContractRow, ContractsKpis, Entite, RoleUtilisateur } from '../api/types';
import { CONTRACT_ALERTS, fmtDate } from '../lib/constants';
import { ContractDrawer } from './ContractDrawer';
import { EntityLogo } from './EntityLogo';

interface Props {
  entityFilter: Entite | 'ALL';
  role: RoleUtilisateur;
  reloadKey: unknown;
}

export function ContractsView({ entityFilter, role, reloadKey }: Props) {
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const kpisPath = `/api/contracts/kpis${buildQuery({ entite: entityFilter })}`;
  const listPath = `/api/contracts${buildQuery({ entite: entityFilter })}`;

  const kpis = useResource<ContractsKpis>(kpisPath, reloadKey);
  const list = useResource<ContractRow[]>(listPath, reloadKey);

  function refetchAll() {
    kpis.refetch();
    list.refetch();
  }

  return (
    <div>
      <div className="kpis">
        <div className="kpi">
          <div className="kpi-label">Contrats sous 90 jours</div>
          <div className="kpi-value amber">{kpis.data?.sous90 ?? '—'}</div>
        </div>
        <div className="kpi">
          <div className="kpi-label">Contrats échus non régularisés</div>
          <div className="kpi-value danger">{kpis.data?.echus ?? '—'}</div>
        </div>
        <div className="kpi">
          <div className="kpi-label">Avenants / contrats envoyés</div>
          <div className="kpi-value">{kpis.data?.envoisEnvoyes ?? '—'}</div>
        </div>
        <div className="kpi">
          <div className="kpi-label">Contrats suivis</div>
          <div className="kpi-value">{kpis.data?.contratsSuivis ?? '—'}</div>
        </div>
      </div>

      <div className="table-card">
        <div className="table-head">
          <div style={{ fontWeight: 600, fontSize: 14 }}>Échéances de contrats — renouvellement &amp; révision tarifaire</div>
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
              <h3>Aucun contrat sur ce filtre</h3>
            </div>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>Client</th>
                  <th>Entité</th>
                  <th>Contrat</th>
                  <th>Type</th>
                  <th>Échéance</th>
                  <th>Date</th>
                  <th>Jours restants</th>
                  <th>Statut</th>
                </tr>
              </thead>
              <tbody>
                {list.data.map((r) => {
                  const lvl = CONTRACT_ALERTS[r.alertLevel];
                  return (
                    <tr key={r.contratId} className="row-hover" onClick={() => setSelectedId(r.contratId)}>
                      <td>{r.clientNom}</td>
                      <td>
                        <span className="entity-tag">
                          <EntityLogo entite={r.entite} size={12} />
                          {r.entite}
                        </span>
                      </td>
                      <td className="mono">{r.numero}</td>
                      <td style={{ fontSize: 12, color: 'var(--ink-soft)' }}>{r.type || ''}</td>
                      <td>{r.echeanceType === 'revision_tarif' ? 'Révision tarifaire' : r.tacite ? 'Renouvellement (tacite)' : 'Renouvellement'}</td>
                      <td className="mono">{fmtDate(r.echeanceDate)}</td>
                      <td className="mono">{r.joursRestants}</td>
                      <td>
                        <span className="badge" data-tone={lvl.tone}>
                          {lvl.label}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {selectedId && <ContractDrawer contratId={selectedId} role={role} onClose={() => setSelectedId(null)} onChanged={refetchAll} />}
    </div>
  );
}

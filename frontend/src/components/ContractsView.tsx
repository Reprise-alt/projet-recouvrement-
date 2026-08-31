import { useState } from 'react';
import { buildQuery, downloadFile } from '../api/client';
import { useResource } from '../hooks/useResource';
import { AugmentationStatut, ContractRow, ContractsKpis, Entite, RoleUtilisateur } from '../api/types';
import { CONTRACT_ALERTS, fmtDate } from '../lib/constants';
import { ContractDrawer } from './ContractDrawer';
import { EntityLogo, entityAccent } from './EntityLogo';

// Normalise pour la recherche : minuscules, sans accents.
const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

type AugFilter = 'tous' | 'avec' | 'imminent' | 'depassee' | 'realisee';

// Pastille d'augmentation d'une ligne de contrat.
function augBadge(r: ContractRow): { label: string; tone: string } | null {
  const t = r.tauxAugmentation != null ? `${r.tauxAugmentation} %` : '';
  switch (r.augStatut) {
    case 'imminent':
      return { label: `${t} à appliquer${r.augJours != null ? ` (${r.augJours} j)` : ''}`, tone: 'amber' };
    case 'depassee':
      return { label: `${t} en retard`, tone: 'danger' };
    case 'realisee':
      return { label: `${t} réalisée`, tone: 'success' };
    case 'a_venir':
      return { label: `${t}/an`, tone: 'muted' };
    default:
      return null;
  }
}

// Durée compacte pour le tableau : « 3 ans », « 3 a 6 m », « 8 m ».
function fmtDureeCourt(mois: number | null): string {
  if (mois == null) return '—';
  const a = Math.floor(mois / 12);
  const m = mois % 12;
  return [a ? `${a} a` : '', m ? `${m} m` : ''].filter(Boolean).join(' ') || '0 m';
}

interface Props {
  entityFilter: Entite | 'ALL';
  role: RoleUtilisateur;
  reloadKey: unknown;
}

export function ContractsView({ entityFilter, role, reloadKey }: Props) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [q, setQ] = useState('');
  const [augFilter, setAugFilter] = useState<AugFilter>('tous');

  const kpisPath = `/api/contracts/kpis${buildQuery({ entite: entityFilter })}`;
  const listPath = `/api/contracts${buildQuery({ entite: entityFilter })}`;

  const kpis = useResource<ContractsKpis>(kpisPath, reloadKey);
  const list = useResource<ContractRow[]>(listPath, reloadKey);

  function refetchAll() {
    kpis.refetch();
    list.refetch();
  }

  const nq = norm(q.trim());
  const matchAug = (r: ContractRow) =>
    augFilter === 'tous' ? true : augFilter === 'avec' ? r.augStatut !== 'aucune' : r.augStatut === augFilter;
  const filtered = (list.data ?? []).filter(
    (r) => matchAug(r) && (!nq || [r.clientNom, r.numero, r.type ?? '', String(r.entite)].some((f) => norm(f).includes(nq))),
  );
  const toggleAug = (f: AugFilter) => setAugFilter((cur) => (cur === f ? 'tous' : f));

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

      {/* Tuiles augmentation — cliquables pour filtrer la liste. */}
      <div className="kpis" style={{ marginTop: 8 }}>
        {([
          ['imminent', 'Augmentation à appliquer (< 30 j)', kpis.data?.augImminentes, 'amber'],
          ['depassee', "Délai d'augmentation dépassé", kpis.data?.augDepassees, 'danger'],
          ['realisee', 'Augmentations réalisées (validées client)', kpis.data?.augRealisees, 'success'],
        ] as [AugFilter, string, number | undefined, string][]).map(([key, label, value, tone]) => (
          <button
            key={key}
            type="button"
            className="kpi"
            onClick={() => toggleAug(key)}
            title="Cliquer pour filtrer la liste"
            style={{ textAlign: 'left', cursor: 'pointer', outline: augFilter === key ? '2px solid var(--accent)' : 'none' }}
          >
            <div className="kpi-label">{label}</div>
            <div className={`kpi-value ${tone}`}>{value ?? '—'}</div>
          </button>
        ))}
      </div>

      {/* Filtre par état d'augmentation. */}
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', margin: '10px 0 0' }}>
        {([
          ['tous', 'Tous'],
          ['avec', 'Avec augmentation paramétrée'],
          ['imminent', 'À appliquer < 30 j'],
          ['depassee', 'En retard'],
          ['realisee', 'Réalisées'],
        ] as [AugFilter, string][]).map(([f, label]) => (
          <button
            key={f}
            type="button"
            onClick={() => setAugFilter(f)}
            style={{
              cursor: 'pointer', padding: '4px 12px', fontSize: 12, borderRadius: 999,
              border: augFilter === f ? '1px solid var(--accent)' : '1px solid var(--line)',
              background: augFilter === f ? 'var(--accent)' : 'transparent',
              color: augFilter === f ? '#fff' : 'var(--ink)',
            }}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="table-card" style={{ marginTop: 12 }}>
        <div className="table-head" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
          <div style={{ fontWeight: 600, fontSize: 14 }}>Échéances de contrats — renouvellement &amp; révision tarifaire</div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <button
              type="button"
              onClick={() =>
                downloadFile(
                  `/api/contracts/lettre-revision-generale/lot${buildQuery({ entite: entityFilter, sansAugmentation: 'true' })}`,
                  'lettres-revision-tarifaire.pdf',
                ).catch(() => alert('Génération impossible'))
              }
              title="Génère en un seul PDF les lettres de révision tarifaire (5,5 %) pour les clients du périmètre SANS augmentation contractuelle"
            >
              Lettres de révision (portefeuille)
            </button>
            <input
              type="search"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Rechercher un client, un contrat…"
              style={{ padding: '6px 10px', fontSize: 13, minWidth: 220, borderRadius: 6, border: '1px solid var(--line)' }}
            />
          </div>
        </div>
        <div>
          {list.loading ? (
            <div className="empty-state">Chargement…</div>
          ) : list.error ? (
            <div className="empty-state">
              <h3>Erreur</h3>
              <p>{list.error}</p>
            </div>
          ) : !filtered.length ? (
            <div className="empty-state">
              <h3>{nq ? `Aucun résultat pour « ${q.trim()} »` : 'Aucun contrat sur ce filtre'}</h3>
            </div>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>Client</th>
                  <th>Entité</th>
                  <th>Contrat</th>
                  <th>Type</th>
                  <th>Durée</th>
                  <th>Augmentation</th>
                  <th>Échéance</th>
                  <th>Date</th>
                  <th>Jours restants</th>
                  <th>Statut</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((r) => {
                  const lvl = CONTRACT_ALERTS[r.alertLevel];
                  return (
                    <tr key={r.contratId} className="row-hover" onClick={() => setSelectedId(r.contratId)}>
                      <td>{r.clientNom}</td>
                      <td>
                        <span className="entity-tag" style={{ borderLeftColor: entityAccent(r.entite), borderLeftWidth: 3 }}>
                          <EntityLogo entite={r.entite} size={12} />
                          {r.entite}
                        </span>
                      </td>
                      <td className="mono">{r.numero}</td>
                      <td style={{ fontSize: 12, color: 'var(--ink-soft)' }}>{r.type || ''}</td>
                      <td className="mono" style={{ fontSize: 12 }}>{fmtDureeCourt(r.dureeMois)}</td>
                      <td>
                        {(() => {
                          const b = augBadge(r);
                          if (!b) return <span style={{ color: 'var(--ink-soft)' }}>—</span>;
                          return b.tone === 'muted' ? (
                            <span style={{ fontSize: 12, color: 'var(--ink-soft)' }}>{b.label}</span>
                          ) : (
                            <span className="badge" data-tone={b.tone} style={{ fontSize: 11 }}>
                              {b.label}
                            </span>
                          );
                        })()}
                      </td>
                      <td>
                        {r.echeanceType === 'revision_tarif' ? (
                          <span>
                            Révision tarifaire
                            {r.surNotification && (
                              <span
                                className="badge"
                                data-tone={r.alertLevel >= 4 ? 'danger' : 'amber'}
                                style={{ marginLeft: 6, fontSize: 10.5, padding: '1px 6px' }}
                                title="À notifier au client avant la date — sinon la hausse est perdue"
                              >
                                sur notification
                              </span>
                            )}
                          </span>
                        ) : r.tacite ? (
                          'Renouvellement (tacite)'
                        ) : (
                          'Renouvellement'
                        )}
                      </td>
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

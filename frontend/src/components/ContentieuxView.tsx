import { useEffect, useMemo, useState } from 'react';
import { Bell, Clock, FilePlus2, Loader2, MessageSquare, Scale, Search } from 'lucide-react';
import { api, ApiError } from '../api/client';
import { useResource } from '../hooks/useResource';
import { useToast } from '../hooks/useToast';
import { fmtDate, fmtFCFA } from '../lib/constants';
import { EntityLogo } from './EntityLogo';
import { ContentieuxDrawer } from './ContentieuxDrawer';
import {
  ClientDetail,
  ClientListItem,
  DossierContentieuxListItem,
  StatutDossierContentieux,
  VerdictRecevabilite,
} from '../api/types';

const STATUT_LABEL: Record<StatutDossierContentieux, string> = {
  ouvert: 'Ouvert',
  analyse: 'Analysé',
  pret: 'Prêt',
  transmis: 'Transmis',
  depose: 'Déposé',
  clos: 'Clos',
};

const VERDICT: Record<VerdictRecevabilite, { label: string; color: string; bg: string }> = {
  non_evalue: { label: 'À analyser', color: 'var(--ink-soft)', bg: 'var(--line-soft)' },
  pret: { label: 'Prêt à agir', color: 'var(--accent-dark)', bg: 'var(--accent-soft)' },
  a_completer: { label: 'À compléter', color: 'var(--amber-dark)', bg: 'var(--amber-soft)' },
  risque: { label: 'Risque', color: 'var(--danger)', bg: 'var(--danger-soft)' },
};

function Badge({ v }: { v: VerdictRecevabilite }) {
  const c = VERDICT[v];
  return (
    <span className="badge" style={{ color: c.color, background: c.bg }}>
      {c.label}
    </span>
  );
}

export function ContentieuxView({ entityFilter, avocat = false }: { entityFilter: string; role?: string; avocat?: boolean }) {
  const { data: dossiers, loading, error, refetch } = useResource<DossierContentieuxListItem[]>(
    '/api/contentieux/dossiers',
  );
  const [selected, setSelected] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [q, setQ] = useState('');
  const [verdictFilter, setVerdictFilter] = useState<VerdictRecevabilite | 'ALL'>('ALL');
  const [statutFilter, setStatutFilter] = useState<StatutDossierContentieux | 'ALL'>('ALL');

  const visibles = useMemo(() => {
    if (!dossiers) return [];
    const terme = q.trim().toLowerCase();
    return dossiers.filter((d) => {
      if (entityFilter !== 'ALL' && d.client.entite !== entityFilter) return false;
      if (verdictFilter !== 'ALL' && d.verdict !== verdictFilter) return false;
      if (statutFilter !== 'ALL' && d.statut !== statutFilter) return false;
      if (terme && !`${d.client.nom} ${d.reference}`.toLowerCase().includes(terme)) return false;
      return true;
    });
  }, [dossiers, entityFilter, q, verdictFilter, statutFilter]);

  const totalVisibleSansRecherche = useMemo(
    () => (dossiers ?? []).filter((d) => entityFilter === 'ALL' || d.client.entite === entityFilter).length,
    [dossiers, entityFilter],
  );

  // Alerte : nombre de dossiers (dans le périmètre) avec au moins une
  // proposition débiteur en attente de traitement.
  const dossiersAvecProposition = useMemo(
    () =>
      (dossiers ?? []).filter(
        (d) => (entityFilter === 'ALL' || d.client.entite === entityFilter) && d.nbPropositionsEnAttente > 0,
      ),
    [dossiers, entityFilter],
  );

  return (
    <>
      {dossiersAvecProposition.length > 0 && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            marginBottom: 12,
            padding: '11px 16px',
            borderRadius: 10,
            border: '1px solid var(--amber)',
            background: 'var(--amber-soft)',
            color: 'var(--amber-dark)',
            fontSize: 13,
          }}
        >
          <Bell size={17} />
          <div style={{ flex: 1 }}>
            <strong>
              {dossiersAvecProposition.length} dossier{dossiersAvecProposition.length > 1 ? 's' : ''} avec une proposition de
              règlement en attente
            </strong>{' '}
            — un débiteur vous a répondu via le portail.
          </div>
          {(q || verdictFilter !== 'ALL' || statutFilter !== 'ALL') && (
            <button
              onClick={() => {
                setQ('');
                setVerdictFilter('ALL');
                setStatutFilter('ALL');
              }}
              style={{ whiteSpace: 'nowrap' }}
            >
              Voir tout
            </button>
          )}
        </div>
      )}
      <div className="table-card">
        <div className="table-head">
          <div>
            <h3 style={{ margin: 0 }}>Dossiers contentieux</h3>
            <div style={{ fontSize: 12, color: 'var(--ink-soft)', marginTop: 2 }}>
              {avocat
                ? 'Dossiers qui vous sont assignés : consultez les pièces, validez et déposez la version signée des actes.'
                : 'Dépôt d’un dossier judiciaire, analyse de recevabilité (OHADA) et génération de projets d’actes pour huissier / avocat.'}
            </div>
          </div>
          {!avocat && (
            <button className="primary" onClick={() => setCreating(true)}>
              <FilePlus2 size={14} /> Nouveau dossier
            </button>
          )}
        </div>

        {totalVisibleSansRecherche > 0 && (
          <div
            style={{
              display: 'flex',
              gap: 8,
              flexWrap: 'wrap',
              alignItems: 'center',
              padding: '10px 22px',
              borderTop: '1px solid var(--line-soft)',
            }}
          >
            <div style={{ position: 'relative', flex: '1 1 220px', minWidth: 0 }}>
              <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', opacity: 0.5 }} />
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Rechercher (client, référence CONT-…)"
                style={{ width: '100%', paddingLeft: 30 }}
              />
            </div>
            <select value={verdictFilter} onChange={(e) => setVerdictFilter(e.target.value as VerdictRecevabilite | 'ALL')} style={{ width: 'auto' }}>
              <option value="ALL">Toute recevabilité</option>
              <option value="pret">Prêt à agir</option>
              <option value="a_completer">À compléter</option>
              <option value="risque">Risque</option>
              <option value="non_evalue">À analyser</option>
            </select>
            <select value={statutFilter} onChange={(e) => setStatutFilter(e.target.value as StatutDossierContentieux | 'ALL')} style={{ width: 'auto' }}>
              <option value="ALL">Tout statut</option>
              {Object.entries(STATUT_LABEL).map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </select>
            <span style={{ fontSize: 12, color: 'var(--ink-soft)', marginLeft: 'auto' }}>
              {visibles.length} / {totalVisibleSansRecherche}
            </span>
          </div>
        )}

        {loading ? (
          <div style={{ padding: 40, textAlign: 'center', color: 'var(--ink-soft)' }}>Chargement…</div>
        ) : error ? (
          <div style={{ padding: 40, textAlign: 'center', color: 'var(--danger)' }}>{error}</div>
        ) : visibles.length === 0 ? (
          <div className="empty-state">
            <Scale size={26} style={{ opacity: 0.4, marginBottom: 10 }} />
            {totalVisibleSansRecherche > 0 ? (
              <>
                <h3>Aucun dossier ne correspond</h3>
                <p>Aucun dossier ne correspond à votre recherche ou à vos filtres.</p>
              </>
            ) : (
              <>
                <h3>{avocat ? 'Aucun dossier ne vous est assigné' : 'Aucun dossier contentieux'}</h3>
                <p>
                  {avocat
                    ? 'Les dossiers que le recouvrement vous confie apparaîtront ici.'
                    : 'Ouvrez un dossier à partir d’un client débiteur pour rassembler ses pièces, vérifier la recevabilité et préparer les actes.'}
                </p>
              </>
            )}
          </div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ textAlign: 'left', fontSize: 11, color: 'var(--ink-soft)', textTransform: 'uppercase' }}>
                <th style={{ padding: '10px 22px' }}>Client</th>
                <th style={{ padding: '10px 12px' }}>Recevabilité</th>
                <th style={{ padding: '10px 12px' }}>Statut</th>
                {!avocat && <th style={{ padding: '10px 12px' }}>Avocat</th>}
                <th style={{ padding: '10px 12px', textAlign: 'right' }}>Montant</th>
                <th style={{ padding: '10px 12px', textAlign: 'right' }}>Pièces</th>
                <th style={{ padding: '10px 22px', textAlign: 'right' }}>Ouvert le</th>
              </tr>
            </thead>
            <tbody>
              {visibles.map((d) => (
                <tr
                  key={d.id}
                  className="row-hover"
                  onClick={() => setSelected(d.id)}
                  style={{ cursor: 'pointer', borderTop: '1px solid var(--line-soft)' }}
                >
                  <td style={{ padding: '13px 22px' }}>
                    <div style={{ fontWeight: 600 }}>{d.client.nom}</div>
                    <div className="mono" style={{ fontSize: 11, color: 'var(--ink-soft)', marginTop: 1 }}>{d.reference}</div>
                    <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginTop: 3, flexWrap: 'wrap' }}>
                      <span className="entity-tag">
                        <EntityLogo entite={d.client.entite} size={11} /> {d.client.entite}
                      </span>
                      {d.nbPropositionsEnAttente > 0 && (
                        <span
                          className="badge"
                          title="Proposition de règlement du débiteur en attente"
                          style={{ color: 'var(--amber-dark)', background: 'var(--amber-soft)' }}
                        >
                          <MessageSquare size={10} style={{ verticalAlign: -1, marginRight: 3 }} />
                          {d.nbPropositionsEnAttente} propo.
                        </span>
                      )}
                      {d.statut !== 'clos' && d.prescription && d.prescription.joursRestants <= 180 && (
                        <span
                          className="badge"
                          title={`Prescription au plus tard le ${fmtDate(d.prescription.dateLimite)}`}
                          style={
                            d.prescription.joursRestants <= 0
                              ? { color: 'var(--danger)', background: 'var(--danger-soft)' }
                              : { color: 'var(--amber-dark)', background: 'var(--amber-soft)' }
                          }
                        >
                          <Clock size={10} style={{ verticalAlign: -1, marginRight: 3 }} />
                          {d.prescription.joursRestants <= 0 ? 'Prescrit' : `Prescr. ${d.prescription.joursRestants} j`}
                        </span>
                      )}
                    </div>
                  </td>
                  <td style={{ padding: '13px 12px' }}>
                    <Badge v={d.verdict} />
                  </td>
                  <td style={{ padding: '13px 12px', fontSize: 12.5 }}>{STATUT_LABEL[d.statut]}</td>
                  {!avocat && (
                    <td style={{ padding: '13px 12px', fontSize: 12.5, color: d.avocat ? 'var(--ink)' : 'var(--ink-soft)' }}>
                      {d.avocat ? d.avocat.nom : '—'}
                    </td>
                  )}
                  <td className="mono" style={{ padding: '13px 12px', textAlign: 'right', whiteSpace: 'nowrap' }}>
                    {d.montantReclame != null ? fmtFCFA(d.montantReclame) : '—'}
                  </td>
                  <td className="mono" style={{ padding: '13px 12px', textAlign: 'right' }}>
                    {d._count.pieces} · {d._count.factures} fact.
                  </td>
                  <td style={{ padding: '13px 22px', textAlign: 'right', fontSize: 12, color: 'var(--ink-soft)' }}>
                    {fmtDate(d.createdAt)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {creating && (
        <NouveauDossierModal
          entityFilter={entityFilter}
          onClose={() => setCreating(false)}
          onCreated={(id) => {
            setCreating(false);
            refetch();
            setSelected(id);
          }}
        />
      )}

      {selected && (
        <ContentieuxDrawer dossierId={selected} avocat={avocat} onClose={() => setSelected(null)} onChanged={refetch} />
      )}
    </>
  );
}

// ---------------------------------------------------- Modal « Nouveau dossier »
function NouveauDossierModal({
  entityFilter,
  onClose,
  onCreated,
}: {
  entityFilter: string;
  onClose: () => void;
  onCreated: (id: string) => void;
}) {
  const { showToast } = useToast();
  const query = entityFilter === 'ALL' ? '' : `?entite=${encodeURIComponent(entityFilter)}`;
  const { data: clients, loading } = useResource<ClientListItem[]>(`/api/clients${query}`);
  const [clientId, setClientId] = useState<string>('');
  const [factureIds, setFactureIds] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);

  // Charge les factures du client sélectionné (impayées cochées par défaut).
  const { data: detail } = useResource<ClientDetail>(clientId ? `/api/clients/${clientId}` : null);
  const impayees = useMemo(() => (detail?.factures ?? []).filter((f) => f.statut === 'impayee'), [detail]);

  // Sélectionne toutes les impayées dès qu'on change de client.
  const impayeesKey = impayees.map((f) => f.id).join(',');
  useEffect(() => {
    setFactureIds(impayees.map((f) => f.id));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [impayeesKey]);

  function toggle(id: string) {
    setFactureIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  async function submit() {
    if (!clientId) return;
    setSubmitting(true);
    try {
      const dossier = await api.post<{ id: string }>('/api/contentieux/dossiers', { clientId, factureIds });
      showToast('Dossier ouvert');
      onCreated(dossier.id);
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : "Échec de l'ouverture");
      setSubmitting(false);
    }
  }

  return (
    <div className="modal-overlay open" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ width: 'min(520px, 92%)' }}>
        <h2 style={{ marginBottom: 4 }}>Nouveau dossier contentieux</h2>
        <div style={{ color: 'var(--ink-soft)', fontSize: 12.5, marginBottom: 18 }}>
          Choisissez le client débiteur et les factures impayées à rattacher. Les pièces (contrat, bons, mises en
          demeure…) s’ajoutent ensuite dans le dossier.
        </div>

        <label style={{ display: 'block', marginBottom: 14 }}>
          <span style={{ display: 'block', fontSize: 11, color: 'var(--ink-soft)', marginBottom: 4 }}>Client</span>
          <select value={clientId} onChange={(e) => setClientId(e.target.value)} style={{ width: '100%' }} disabled={loading}>
            <option value="">{loading ? 'Chargement…' : '— Sélectionner un client —'}</option>
            {(clients ?? [])
              .slice()
              .sort((a, b) => b.encours - a.encours)
              .map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nom} — {fmtFCFA(c.encours)} en cours
                </option>
              ))}
          </select>
        </label>

        {clientId && (
          <>
            <div className="section-title">Factures impayées à rattacher</div>
            {impayees.length === 0 ? (
              <p style={{ color: 'var(--ink-soft)', fontSize: 12.5 }}>
                Aucune facture impayée pour ce client. Vous pourrez tout de même ouvrir le dossier et déposer des pièces.
              </p>
            ) : (
              <div style={{ maxHeight: 240, overflowY: 'auto', marginBottom: 6 }}>
                {impayees.map((f) => (
                  <label
                    key={f.id}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 10,
                      padding: '8px 0',
                      borderBottom: '1px solid var(--line-soft)',
                      fontSize: 12.5,
                      cursor: 'pointer',
                    }}
                  >
                    <input type="checkbox" checked={factureIds.includes(f.id)} onChange={() => toggle(f.id)} />
                    <span style={{ flex: 1 }}>
                      <span className="mono">{f.numero}</span> · éch. {fmtDate(f.dateEcheance)}
                    </span>
                    <span className="mono">{fmtFCFA(f.montant)}</span>
                  </label>
                ))}
              </div>
            )}
          </>
        )}

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 18 }}>
          <button onClick={onClose}>Annuler</button>
          <button className="primary" onClick={submit} disabled={!clientId || submitting}>
            {submitting ? <Loader2 size={14} className="spin" /> : <FilePlus2 size={14} />} Ouvrir le dossier
          </button>
        </div>
      </div>
    </div>
  );
}

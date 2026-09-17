import { useState } from 'react';
import { api, ApiError } from '../api/client';
import { AbonnementInfo } from '../api/types';
import { useResource } from '../hooks/useResource';
import { useToast } from '../hooks/useToast';
import { fmtDate } from '../lib/constants';

interface OrgAdmin {
  id: string;
  raisonSociale: string;
  pays: string;
  statut: string;
  formule: string;
  dateFinEssai: string | null;
  createdAt: string;
  emailProprietaire: string | null;
  nbClients: number;
  abonnement: AbonnementInfo;
}

const ETAT_LABEL: Record<string, { label: string; tone: string }> = {
  actif: { label: 'Actif', tone: 'success' },
  essai: { label: 'Essai', tone: 'amber' },
  essai_expire: { label: 'Essai expiré', tone: 'danger' },
  suspendu: { label: 'Suspendu', tone: 'danger' },
};

const FORMULES = [
  { v: 'petite', l: 'Petite' },
  { v: 'pme', l: 'PME' },
  { v: 'grands_comptes', l: 'Grands comptes' },
];

// Back-office exploitant : liste toutes les organisations et permet de les
// activer / suspendre / prolonger l'essai / changer la formule (après paiement).
export function SuperAdminPanel({ onClose }: { onClose: () => void }) {
  const { showToast } = useToast();
  const { data: orgs, loading, refetch } = useResource<OrgAdmin[]>('/api/admin/organisations');
  const [busyId, setBusyId] = useState<string | null>(null);

  async function patch(id: string, body: Record<string, unknown>, msg: string) {
    setBusyId(id);
    try {
      await api.patch(`/api/admin/organisations/${id}`, body);
      showToast(msg);
      refetch();
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : 'Erreur');
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="modal-overlay open" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ width: 'min(880px, 96%)' }}>
        <h2 style={{ marginBottom: 4 }}>Espace exploitant — organisations</h2>
        <div style={{ color: 'var(--ink-soft)', fontSize: 12.5, marginBottom: 16 }}>
          Toutes les organisations inscrites. Activez un compte après paiement, suspendez-le, ou prolongez son essai.
        </div>

        {loading || !orgs ? (
          <div>Chargement…</div>
        ) : orgs.length === 0 ? (
          <div className="empty-state">
            <p>Aucune organisation pour le moment.</p>
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ minWidth: 780 }}>
              <thead>
                <tr>
                  <th>Organisation</th>
                  <th>État</th>
                  <th>Formule</th>
                  <th>Clients</th>
                  <th>Essai / inscrit</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {orgs.map((o) => {
                  const et = ETAT_LABEL[o.abonnement.etat] ?? { label: o.abonnement.etat, tone: 'amber' };
                  const busy = busyId === o.id;
                  return (
                    <tr key={o.id}>
                      <td>
                        <strong>{o.raisonSociale}</strong>
                        <div style={{ fontSize: 11.5, color: 'var(--ink-soft)' }}>{o.emailProprietaire ?? '—'}</div>
                      </td>
                      <td>
                        <span className="badge" data-tone={et.tone}>
                          {et.label}
                          {o.abonnement.etat === 'essai' && o.abonnement.joursRestants != null
                            ? ` (${o.abonnement.joursRestants} j)`
                            : ''}
                        </span>
                      </td>
                      <td>
                        <select
                          value={o.formule}
                          disabled={busy}
                          onChange={(e) => patch(o.id, { formule: e.target.value }, 'Formule mise à jour')}
                          style={{ fontSize: 12, padding: '2px 6px', width: 'auto' }}
                        >
                          {FORMULES.map((f) => (
                            <option key={f.v} value={f.v}>
                              {f.l}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="mono">{o.nbClients}</td>
                      <td style={{ fontSize: 11.5, color: 'var(--ink-soft)' }}>
                        {o.dateFinEssai ? `fin ${fmtDate(o.dateFinEssai)}` : '—'}
                        <div>le {fmtDate(o.createdAt)}</div>
                      </td>
                      <td>
                        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                          {o.statut !== 'actif' && (
                            <button
                              className="primary"
                              style={{ padding: '3px 9px', fontSize: 11 }}
                              disabled={busy}
                              onClick={() => patch(o.id, { statut: 'actif' }, 'Compte activé')}
                            >
                              Activer
                            </button>
                          )}
                          {o.statut !== 'coupe' && (
                            <button
                              style={{ padding: '3px 9px', fontSize: 11 }}
                              disabled={busy}
                              onClick={() => patch(o.id, { statut: 'coupe' }, 'Compte suspendu')}
                            >
                              Suspendre
                            </button>
                          )}
                          <button
                            style={{ padding: '3px 9px', fontSize: 11 }}
                            disabled={busy}
                            onClick={() => patch(o.id, { prolongerJours: 14 }, 'Essai prolongé de 14 jours')}
                          >
                            +14 j essai
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 16 }}>
          <button onClick={onClose}>Fermer</button>
        </div>
      </div>
    </div>
  );
}

import { useState, type CSSProperties, type ReactNode } from 'react';
import { BadgeCheck, Building2, Clock, Inbox, LogOut } from 'lucide-react';
import { api, ApiError } from '../api/client';
import { AbonnementInfo } from '../api/types';
import { useResource } from '../hooks/useResource';
import { useToast } from '../hooks/useToast';
import { fmtDate } from '../lib/constants';
import { FeymaBrand } from './FeymaLogo';

// Espace EXPLOITANT — console autonome (transverse aux sociétés) pour la personne
// qui gère les nouvelles demandes et l'activation des comptes, SANS être rattachée
// à l'une des sociétés clientes. Vue limitée : file des demandes + activation, PAS
// les outils destructeurs (migration/suppression), qui restent au super-admin.

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

interface OrgAdmin {
  id: string;
  raisonSociale: string;
  pays: string;
  statut: string;
  formule: string;
  optionContentieux: boolean;
  dateFinEssai: string | null;
  createdAt: string;
  emailProprietaire: string | null;
  nbClients: number;
  abonnement: AbonnementInfo;
}

interface Demande {
  id: string;
  organisationId: string;
  raisonSociale: string;
  statutCompte: string;
  formuleActuelle: string;
  formule: string;
  formuleLabel: string;
  annuel: boolean;
  demandeurEmail: string;
  demandeurNom: string | null;
  statut: string;
  createdAt: string;
  traiteeLe: string | null;
}
interface DemandesResponse {
  nbNouvelles: number;
  demandes: Demande[];
}

export function OperateurConsole({ email, onLogout }: { email: string; onLogout: () => void }) {
  const [tab, setTab] = useState<'demandes' | 'societes'>('demandes');
  const demandesRes = useResource<DemandesResponse>('/api/exploitant/demandes?statut=toutes');
  const orgsRes = useResource<OrgAdmin[]>('/api/exploitant/organisations');
  const nbNouvelles = demandesRes.data?.nbNouvelles ?? 0;

  return (
    <div style={{ minHeight: '100vh', background: 'var(--paper-2, #f2f4f2)' }}>
      <header
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 14,
          padding: '14px 22px',
          background: '#0E1D33',
          color: '#fff',
        }}
      >
        {/* La marque prend l'accent menthe sur fond marine (îlot sombre) : on
            force localement les tokens (pièce menthe, « F » marine, nom blanc). */}
        <span
          style={{
            display: 'inline-flex',
            '--accent': '#4BD0A0',
            '--coin-ink': '#0E1D33',
            '--ink': '#fff',
          } as CSSProperties}
        >
          <FeymaBrand size={28} signature={false} />
        </span>
        <div style={{ lineHeight: 1.2, borderLeft: '1px solid rgba(255,255,255,.2)', paddingLeft: 14 }}>
          <div style={{ fontWeight: 700, fontSize: 14 }}>Espace exploitant</div>
          <div style={{ fontSize: 11.5, opacity: 0.7 }}>{email}</div>
        </div>
        <button
          onClick={onLogout}
          style={{
            marginLeft: 'auto',
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            background: 'transparent',
            border: '1px solid rgba(255,255,255,.25)',
            color: '#fff',
          }}
        >
          <LogOut size={14} /> Se déconnecter
        </button>
      </header>

      <main style={{ maxWidth: 1080, margin: '0 auto', padding: '24px 22px' }}>
        <div className="app-main-head" style={{ marginBottom: 16 }}>
          <h1 style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <Inbox size={22} /> Pilotage des comptes
          </h1>
          <div className="app-sub">
            Traitez les demandes d'abonnement et activez les comptes, toutes sociétés confondues.
          </div>
        </div>

        {/* Onglets */}
        <div style={{ display: 'flex', gap: 6, marginBottom: 18, borderBottom: '1px solid var(--line)' }}>
          <TabBtn active={tab === 'demandes'} onClick={() => setTab('demandes')} icon={<Inbox size={15} />} label="Demandes" badge={nbNouvelles} />
          <TabBtn active={tab === 'societes'} onClick={() => setTab('societes')} icon={<Building2 size={15} />} label="Sociétés" badge={orgsRes.data?.length ?? 0} badgeNeutral />
        </div>

        {tab === 'demandes' ? (
          <DemandesPanel res={demandesRes} onChanged={() => { demandesRes.refetch(); orgsRes.refetch(); }} />
        ) : (
          <SocietesPanel res={orgsRes} onChanged={() => { orgsRes.refetch(); demandesRes.refetch(); }} />
        )}
      </main>
    </div>
  );
}

function TabBtn({ active, onClick, icon, label, badge, badgeNeutral }: { active: boolean; onClick: () => void; icon: ReactNode; label: string; badge?: number; badgeNeutral?: boolean }) {
  return (
    <button
      onClick={onClick}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 7,
        border: 'none',
        borderBottom: active ? '2px solid var(--accent)' : '2px solid transparent',
        borderRadius: 0,
        background: 'transparent',
        color: active ? 'var(--ink)' : 'var(--ink-soft)',
        fontWeight: active ? 700 : 500,
        padding: '8px 12px',
        marginBottom: -1,
      }}
    >
      {icon}
      {label}
      {badge != null && badge > 0 && (
        <span
          className="mono"
          style={{
            fontSize: 11,
            fontWeight: 700,
            lineHeight: 1,
            padding: '3px 7px',
            borderRadius: 20,
            color: badgeNeutral ? 'var(--ink-soft)' : '#fff',
            background: badgeNeutral ? 'var(--line)' : 'var(--danger)',
          }}
        >
          {badge}
        </span>
      )}
    </button>
  );
}

const FORMULE_LABEL: Record<string, string> = { petite: 'Petite structure', pme: 'PME', grands_comptes: 'Grands comptes' };

function DemandesPanel({ res, onChanged }: { res: ReturnType<typeof useResource<DemandesResponse>>; onChanged: () => void }) {
  const { showToast } = useToast();
  const { data, loading, refetch } = res;
  const [busy, setBusy] = useState<string | null>(null);

  async function marquer(id: string, traitee: boolean) {
    setBusy(id);
    try {
      await api.post(`/api/exploitant/demandes/${id}/statut`, { traitee });
      showToast(traitee ? 'Demande classée' : 'Demande rouverte');
      refetch();
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : 'Erreur');
    } finally {
      setBusy(null);
    }
  }

  async function activer(id: string, orgId: string, formule: string) {
    setBusy(id);
    try {
      await api.patch(`/api/exploitant/organisations/${orgId}`, { statut: 'actif', formule });
      await api.post(`/api/exploitant/demandes/${id}/statut`, { traitee: true });
      showToast('Compte activé et demande classée');
      onChanged();
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : 'Erreur');
    } finally {
      setBusy(null);
    }
  }

  if (loading || !data) return <div className="empty-state">Chargement…</div>;
  const nouvelles = data.demandes.filter((d) => d.statut === 'nouvelle');
  const traitees = data.demandes.filter((d) => d.statut !== 'nouvelle');

  if (data.demandes.length === 0) {
    return (
      <div className="empty-state">
        <h3>Aucune demande pour l'instant</h3>
        <p>Quand un client choisit une formule depuis sa console, sa demande d'abonnement apparaît ici.</p>
      </div>
    );
  }

  return (
    <div style={{ display: 'grid', gap: 12 }}>
      {nouvelles.map((d) => (
        <DemandeCard key={d.id} d={d} busy={busy === d.id} onMarquer={() => marquer(d.id, true)} onActiver={() => activer(d.id, d.organisationId, d.formule)} />
      ))}

      {traitees.length > 0 && (
        <>
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.08em', textTransform: 'uppercase', color: 'var(--ink-soft)', margin: '10px 0 -2px' }}>
            Déjà traitées ({traitees.length})
          </div>
          {traitees.map((d) => (
            <DemandeCard key={d.id} d={d} busy={busy === d.id} traitee onMarquer={() => marquer(d.id, false)} onActiver={() => activer(d.id, d.organisationId, d.formule)} />
          ))}
        </>
      )}
    </div>
  );
}

function DemandeCard({ d, busy, traitee, onMarquer, onActiver }: { d: Demande; busy: boolean; traitee?: boolean; onMarquer: () => void; onActiver: () => void }) {
  const dejaActif = d.statutCompte === 'actif';
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'flex-start',
        gap: 14,
        padding: '14px 16px',
        borderRadius: 12,
        border: '1px solid var(--line)',
        borderLeft: traitee ? '3px solid var(--line)' : '3px solid var(--accent)',
        background: 'var(--surface, #fff)',
        opacity: traitee ? 0.72 : 1,
      }}
    >
      <div style={{ minWidth: 0, flex: 1 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <b style={{ fontSize: 14.5 }}>{d.raisonSociale}</b>
          <span className="badge" data-tone="accent">{d.formuleLabel}</span>
          <span className="badge" data-tone={d.annuel ? 'success' : undefined}>{d.annuel ? 'Annuel' : 'Mensuel'}</span>
          {dejaActif && <span className="badge" data-tone="success">Compte déjà actif</span>}
        </div>
        <div style={{ fontSize: 12.5, color: 'var(--ink-soft)', marginTop: 5 }}>
          {d.demandeurNom ? `${d.demandeurNom} · ` : ''}{d.demandeurEmail}
        </div>
        <div style={{ fontSize: 11.5, color: 'var(--ink-soft)', marginTop: 3, display: 'inline-flex', alignItems: 'center', gap: 5 }}>
          <Clock size={12} /> Demandé le {fmtDate(d.createdAt)}
          {d.formuleActuelle && d.formuleActuelle !== d.formule ? ` · formule actuelle : ${FORMULE_LABEL[d.formuleActuelle] ?? d.formuleActuelle}` : ''}
          {traitee && d.traiteeLe ? ` · classée le ${fmtDate(d.traiteeLe)}` : ''}
        </div>
      </div>
      <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap', justifyContent: 'flex-end', flex: 'none' }}>
        {!traitee && !dejaActif && (
          <button className="primary" disabled={busy} onClick={onActiver} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 12.5 }}>
            <BadgeCheck size={14} /> Activer ({d.formuleLabel})
          </button>
        )}
        <button disabled={busy} onClick={onMarquer} style={{ fontSize: 12.5 }}>
          {traitee ? 'Rouvrir' : 'Classer'}
        </button>
      </div>
    </div>
  );
}

function SocietesPanel({ res, onChanged }: { res: ReturnType<typeof useResource<OrgAdmin[]>>; onChanged: () => void }) {
  const { showToast } = useToast();
  const { data: orgs, loading, refetch } = res;
  const [busyId, setBusyId] = useState<string | null>(null);

  async function patch(id: string, body: Record<string, unknown>, msg: string) {
    setBusyId(id);
    try {
      await api.patch(`/api/exploitant/organisations/${id}`, body);
      showToast(msg);
      refetch();
      onChanged();
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : 'Erreur');
    } finally {
      setBusyId(null);
    }
  }

  if (loading || !orgs) return <div className="empty-state">Chargement…</div>;
  if (orgs.length === 0) return <div className="empty-state"><p>Aucune société inscrite.</p></div>;

  return (
    <div style={{ background: 'var(--surface, #fff)', border: '1px solid var(--line)', borderRadius: 14, overflowX: 'auto' }}>
      <table style={{ minWidth: 820 }}>
        <thead>
          <tr>
            <th>Société</th>
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
                    {o.abonnement.etat === 'essai' && o.abonnement.joursRestants != null ? ` (${o.abonnement.joursRestants} j)` : ''}
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
                      <option key={f.v} value={f.v}>{f.l}</option>
                    ))}
                  </select>
                  {o.formule !== 'grands_comptes' && (
                    <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, marginTop: 4, color: 'var(--ink-soft)', cursor: 'pointer' }}>
                      <input
                        type="checkbox"
                        checked={o.optionContentieux}
                        disabled={busy}
                        onChange={(e) => patch(o.id, { optionContentieux: e.target.checked }, 'Option contentieux mise à jour')}
                        style={{ width: 'auto' }}
                      />
                      Option contentieux
                    </label>
                  )}
                </td>
                <td className="mono">{o.nbClients}</td>
                <td style={{ fontSize: 11.5, color: 'var(--ink-soft)' }}>
                  {o.dateFinEssai ? `fin ${fmtDate(o.dateFinEssai)}` : '—'}
                  <div>le {fmtDate(o.createdAt)}</div>
                </td>
                <td>
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    {o.statut !== 'actif' && (
                      <button className="primary" style={{ padding: '3px 9px', fontSize: 11 }} disabled={busy} onClick={() => patch(o.id, { statut: 'actif' }, 'Compte activé')}>
                        Activer
                      </button>
                    )}
                    {o.statut !== 'coupe' && (
                      <button style={{ padding: '3px 9px', fontSize: 11 }} disabled={busy} onClick={() => patch(o.id, { statut: 'coupe' }, 'Compte suspendu')}>
                        Suspendre
                      </button>
                    )}
                    <button style={{ padding: '3px 9px', fontSize: 11 }} disabled={busy} onClick={() => patch(o.id, { prolongerJours: 14 }, 'Essai prolongé de 14 jours')}>
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
  );
}

import { useState } from 'react';
import { api, ApiError, setImpersonateOrg } from '../api/client';
import { AbonnementInfo } from '../api/types';
import { useResource } from '../hooks/useResource';
import { useToast } from '../hooks/useToast';
import { fmtDate, SECTEURS_ACTIVITE } from '../lib/constants';

interface OrgAdmin {
  id: string;
  raisonSociale: string;
  pays: string;
  statut: string;
  secteur: string | null;
  formule: string;
  optionContentieux: boolean;
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

  // Ouvrir la console d'une organisation « en tant qu'elle » (impersonation) :
  // pour la mettre en place à la place du prospect (import, logo…). Un bandeau
  // persistant rappelle l'identité empruntée et permet de revenir.
  async function ouvrirConsole(o: OrgAdmin) {
    setBusyId(o.id);
    try {
      const r = await api.post<{ raisonSociale?: string }>(`/api/admin/organisations/${o.id}/impersonation`, {});
      setImpersonateOrg(o.id, r?.raisonSociale ?? o.raisonSociale);
      window.location.reload();
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : 'Erreur');
      setBusyId(null);
    }
  }

  // Enregistre la config (paliers + e-mails) de cette org comme modèle de son secteur.
  async function enregistrerModele(o: OrgAdmin) {
    setBusyId(o.id);
    try {
      const r = await api.post<{ secteur: string; paliers: number; modeles: number }>(
        `/api/admin/organisations/${o.id}/enregistrer-modele-secteur`,
        {},
      );
      showToast(`Modèle « ${r.secteur} » enregistré (${r.paliers} paliers · ${r.modeles} e-mails)`);
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : 'Erreur');
    } finally {
      setBusyId(null);
    }
  }

  // Applique à cette org le modèle de son secteur (paliers + e-mails).
  async function appliquerModele(o: OrgAdmin) {
    setBusyId(o.id);
    try {
      await api.post(`/api/admin/organisations/${o.id}/appliquer-modele-secteur`, {});
      showToast('Modèle de secteur appliqué');
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

        <CreerConsoleProspect onDone={refetch} />

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
                        <select
                          value={o.secteur ?? ''}
                          disabled={busy}
                          onChange={(e) => {
                            const v = e.target.value;
                            if (v !== (o.secteur ?? '')) patch(o.id, { secteur: v }, 'Secteur mis à jour');
                          }}
                          style={{ fontSize: 11, padding: '2px 6px', marginTop: 4, width: 170 }}
                        >
                          <option value="">— secteur —</option>
                          {SECTEURS_ACTIVITE.map((s) => (
                            <option key={s} value={s}>
                              {s}
                            </option>
                          ))}
                          {o.secteur && !SECTEURS_ACTIVITE.includes(o.secteur) && (
                            <option value={o.secteur}>{o.secteur}</option>
                          )}
                        </select>
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
                        {/* Option contentieux (+10k) — sans objet pour Grands comptes (inclus). */}
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
                          <button
                            style={{ padding: '3px 9px', fontSize: 11 }}
                            disabled={busy}
                            title="Ouvrir cette console en tant que l'organisation (pour l'importer / la paramétrer)"
                            onClick={() => ouvrirConsole(o)}
                          >
                            Ouvrir la console
                          </button>
                          <button
                            style={{ padding: '3px 9px', fontSize: 11 }}
                            disabled={busy || !o.secteur}
                            title={o.secteur ? `Enregistrer les paliers + e-mails comme modèle du secteur « ${o.secteur} »` : 'Définissez d\'abord le secteur'}
                            onClick={() => enregistrerModele(o)}
                          >
                            Enregistrer modèle secteur
                          </button>
                          <button
                            style={{ padding: '3px 9px', fontSize: 11 }}
                            disabled={busy || !o.secteur}
                            title={o.secteur ? `Appliquer le modèle du secteur « ${o.secteur} » à cette org` : 'Définissez d\'abord le secteur'}
                            onClick={() => appliquerModele(o)}
                          >
                            Appliquer modèle secteur
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

        {orgs && orgs.length > 0 && <MigrationTenant orgs={orgs} onDone={refetch} />}
        {orgs && orgs.length > 0 && <NettoyageEntite orgs={orgs} onDone={refetch} />}

        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 16 }}>
          <button onClick={onClose}>Fermer</button>
        </div>
      </div>
    </div>
  );
}

interface RapportMigration {
  entite: string;
  cibleAvant: number;
  counts: {
    clients: number; contacts: number; factures: number; contrats: number; echeanciers: number;
    actions: number; dossiers: number; pieces: number; actes: number; fichiersMo: number;
  };
  refsRenommees: number;
  applied: boolean;
  vide: boolean;
  apres?: { clients: number; actions: number; dossiers: number };
  orgRaisonSociale?: string;
}

// Provisioning prospect : crée une console d'essai + son compte propriétaire pour
// un prospect qui n'a pas le temps de la paramétrer. Ensuite « Ouvrir la console »
// (impersonation) pour importer son fichier ; le prospect se connecte par OTP.
function CreerConsoleProspect({ onDone }: { onDone: () => void }) {
  const { showToast } = useToast();
  const [ouvert, setOuvert] = useState(false);
  const [raisonSociale, setRaisonSociale] = useState('');
  const [email, setEmail] = useState('');
  const [secteur, setSecteur] = useState('');
  const [busy, setBusy] = useState(false);

  async function creer() {
    if (!raisonSociale.trim() || !email.trim()) {
      showToast('Raison sociale et email requis');
      return;
    }
    setBusy(true);
    try {
      const r = await api.post<{ modeleSecteurApplique?: boolean }>('/api/admin/organisations', {
        raisonSociale: raisonSociale.trim(),
        email: email.trim(),
        secteur: secteur.trim() || undefined,
      });
      showToast(r?.modeleSecteurApplique ? 'Console créée — modèle de secteur appliqué' : 'Console prospect créée');
      setRaisonSociale('');
      setEmail('');
      setSecteur('');
      setOuvert(false);
      onDone();
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : 'Erreur');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ margin: '0 0 16px' }}>
      <button type="button" onClick={() => setOuvert((v) => !v)} style={{ fontSize: 12 }}>
        {ouvert ? '▾' : '▸'} Créer une console prospect
      </button>
      {ouvert && (
        <div
          style={{
            display: 'flex',
            gap: 10,
            flexWrap: 'wrap',
            alignItems: 'flex-end',
            marginTop: 10,
            padding: 12,
            background: '#f7f7f8',
            borderRadius: 8,
          }}
        >
          <label style={{ fontSize: 12 }}>
            Raison sociale
            <br />
            <input value={raisonSociale} onChange={(e) => setRaisonSociale(e.target.value)} placeholder="LCD Yeux" />
          </label>
          <label style={{ fontSize: 12 }}>
            Email du prospect
            <br />
            <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="prospect@exemple.com" type="email" />
          </label>
          <label style={{ fontSize: 12 }}>
            Secteur (optionnel)
            <br />
            <select value={secteur} onChange={(e) => setSecteur(e.target.value)}>
              <option value="">— Choisir —</option>
              {SECTEURS_ACTIVITE.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </label>
          <button type="button" className="primary" disabled={busy} onClick={creer}>
            Créer (essai 14 j)
          </button>
          <div style={{ flexBasis: '100%', fontSize: 11, color: 'var(--ink-soft)' }}>
            Si un <strong>modèle de secteur</strong> existe, ses paliers et e-mails sont appliqués automatiquement à la création.
          </div>
          <div style={{ flexBasis: '100%', fontSize: 11, color: 'var(--ink-soft)' }}>
            Crée la console + le compte propriétaire. Ensuite « Ouvrir la console » pour importer son fichier ; le prospect se
            connecte avec cet email (code reçu par mail).
          </div>
        </div>
      )}
    </div>
  );
}

// Outil de migration d'un tenant : reprend TOUT l'actif d'une entité de la
// console interne vers une organisation Feyma. Aperçu chiffré (dry-run) d'abord,
// migration réelle ensuite. Option « vider la cible » avant import.
function MigrationTenant({ orgs, onDone }: { orgs: OrgAdmin[]; onDone: () => void }) {
  const { showToast } = useToast();
  const [ouvert, setOuvert] = useState(false);
  const [entite, setEntite] = useState('SORAM');
  const [orgId, setOrgId] = useState('');
  const [vider, setVider] = useState(true);
  const [busy, setBusy] = useState(false);
  const [rapport, setRapport] = useState<RapportMigration | null>(null);

  async function lancer(apply: boolean) {
    if (!orgId) return showToast('Choisissez l’organisation cible');
    if (apply && !confirm(`Migrer « ${entite} » vers cette organisation ?${vider ? '\n\nLa cible sera VIDÉE au préalable.' : ''}\n\nCette action écrit réellement les données.`)) return;
    setBusy(true);
    try {
      const r = await api.post<RapportMigration>('/api/admin/migration', { entite, orgId, apply, vider });
      setRapport(r);
      showToast(apply ? 'Migration terminée' : 'Aperçu prêt');
      if (apply) onDone();
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : 'Erreur');
    } finally {
      setBusy(false);
    }
  }

  const c = rapport?.counts;
  return (
    <div style={{ marginTop: 22, border: '1px solid var(--line)', borderRadius: 12, padding: 14 }}>
      <button
        type="button"
        onClick={() => setOuvert((v) => !v)}
        style={{ background: 'none', border: 'none', padding: 0, font: 'inherit', cursor: 'pointer', fontWeight: 700, fontSize: 14 }}
      >
        {ouvert ? '▾' : '▸'} Migration depuis la console interne
      </button>
      {ouvert && (
        <div style={{ marginTop: 12 }}>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end' }}>
            <label style={{ fontSize: 12 }}>
              Entité source
              <input value={entite} onChange={(e) => setEntite(e.target.value.toUpperCase())} style={{ display: 'block', width: 140 }} />
            </label>
            <label style={{ fontSize: 12 }}>
              Organisation cible (Feyma)
              <select value={orgId} onChange={(e) => setOrgId(e.target.value)} style={{ display: 'block', width: 240 }}>
                <option value="">— Choisir —</option>
                {orgs.map((o) => (
                  <option key={o.id} value={o.id}>{o.raisonSociale} ({o.nbClients} clients)</option>
                ))}
              </select>
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12.5, cursor: 'pointer' }}>
              <input type="checkbox" checked={vider} onChange={(e) => setVider(e.target.checked)} style={{ width: 'auto' }} />
              Vider la cible d’abord
            </label>
          </div>

          <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
            <button type="button" disabled={busy} onClick={() => lancer(false)}>Aperçu (dry-run)</button>
            <button type="button" className="primary" disabled={busy || !rapport} onClick={() => lancer(true)}>
              Lancer la migration
            </button>
          </div>

          {rapport && c && (
            <div style={{ marginTop: 14, background: 'var(--paper-2, #f2f4f2)', borderRadius: 10, padding: 12, fontSize: 13 }}>
              <div style={{ fontWeight: 700, marginBottom: 6 }}>
                {rapport.applied ? '✅ Migration effectuée' : '🔎 Aperçu'} — {rapport.orgRaisonSociale}
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: '2px 16px' }}>
                <span>Clients : <b>{c.clients}</b></span>
                <span>Factures : <b>{c.factures}</b></span>
                <span>Contrats : <b>{c.contrats}</b></span>
                <span>Contacts : <b>{c.contacts}</b></span>
                <span>Échéanciers : <b>{c.echeanciers}</b></span>
                <span>Relances (histo.) : <b>{c.actions}</b></span>
                <span>Dossiers contentieux : <b>{c.dossiers}</b></span>
                <span>Pièces : <b>{c.pieces}</b> ({c.fichiersMo} Mo)</span>
                <span>Actes : <b>{c.actes}</b></span>
              </div>
              {rapport.refsRenommees > 0 && (
                <div style={{ marginTop: 6, color: 'var(--ink-soft)' }}>{rapport.refsRenommees} référence(s) de dossier renommée(s) (collision).</div>
              )}
              {rapport.cibleAvant > 0 && !rapport.applied && (
                <div style={{ marginTop: 6, color: 'var(--danger)' }}>
                  ⚠️ La cible contient déjà {rapport.cibleAvant} client(s). Cochez « Vider la cible » pour repartir propre.
                </div>
              )}
              {rapport.applied && rapport.apres && (
                <div style={{ marginTop: 6, color: 'var(--success, #177f5e)' }}>
                  Contrôle cible : {rapport.apres.clients} clients · {rapport.apres.actions} relances · {rapport.apres.dossiers} dossiers.
                  {rapport.vide ? ' (cible vidée avant import)' : ''}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

interface RapportNettoyage {
  apply: boolean;
  orgRaisonSociale: string;
  entite: string;
  nbClients: number;
  nbFactures: number;
  nbActions: number;
  nbDossiers: number;
  apercuClients: string[];
  supprimes?: number;
}

// Nettoyage d'une entité résiduelle : supprime les clients tagués d'une entité
// (et par cascade leurs factures / relances / dossiers) restés dans un tenant
// après une migration. Aperçu chiffré (dry-run) d'abord, suppression ensuite.
function NettoyageEntite({ orgs, onDone }: { orgs: OrgAdmin[]; onDone: () => void }) {
  const { showToast } = useToast();
  const [ouvert, setOuvert] = useState(false);
  const [entite, setEntite] = useState('SIS');
  const [orgId, setOrgId] = useState('');
  const [busy, setBusy] = useState(false);
  const [rapport, setRapport] = useState<RapportNettoyage | null>(null);

  async function lancer(apply: boolean) {
    if (!orgId) return showToast('Choisissez l’organisation');
    if (apply && !confirm(`Supprimer définitivement les clients « ${entite} » de cette organisation ?\n\nLeurs factures, relances et dossiers seront supprimés (cascade). Action irréversible.`)) return;
    setBusy(true);
    try {
      const r = await api.post<RapportNettoyage>(`/api/admin/organisations/${orgId}/nettoyer-entite`, { entite, apply });
      setRapport(r);
      showToast(apply ? 'Nettoyage effectué' : 'Aperçu prêt');
      if (apply) onDone();
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : 'Erreur');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ marginTop: 22, border: '1px solid var(--line)', borderRadius: 12, padding: 14 }}>
      <button
        type="button"
        onClick={() => setOuvert((v) => !v)}
        style={{ background: 'none', border: 'none', padding: 0, font: 'inherit', cursor: 'pointer', fontWeight: 700, fontSize: 14 }}
      >
        {ouvert ? '▾' : '▸'} Nettoyer une entité résiduelle
      </button>
      {ouvert && (
        <div style={{ marginTop: 12 }}>
          <div style={{ fontSize: 12.5, color: 'var(--ink-soft)', marginBottom: 10 }}>
            Retire les clients laissés par une migration (ex. des clients « SIS » restés dans le tenant SORAM). Aperçu d’abord, suppression ensuite.
          </div>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end' }}>
            <label style={{ fontSize: 12 }}>
              Entité à retirer
              <input value={entite} onChange={(e) => setEntite(e.target.value.toUpperCase())} style={{ display: 'block', width: 140 }} />
            </label>
            <label style={{ fontSize: 12 }}>
              Organisation
              <select value={orgId} onChange={(e) => setOrgId(e.target.value)} style={{ display: 'block', width: 240 }}>
                <option value="">— Choisir —</option>
                {orgs.map((o) => (
                  <option key={o.id} value={o.id}>{o.raisonSociale} ({o.nbClients} clients)</option>
                ))}
              </select>
            </label>
          </div>

          <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
            <button type="button" disabled={busy} onClick={() => lancer(false)}>Aperçu (dry-run)</button>
            <button type="button" className="danger-btn" disabled={busy || !rapport || rapport.nbClients === 0} onClick={() => lancer(true)}>
              Supprimer définitivement
            </button>
          </div>

          {rapport && (
            <div style={{ marginTop: 14, background: 'var(--paper-2, #f2f4f2)', borderRadius: 10, padding: 12, fontSize: 13 }}>
              <div style={{ fontWeight: 700, marginBottom: 6 }}>
                {rapport.apply ? '✅ Nettoyage effectué' : '🔎 Aperçu'} — {rapport.orgRaisonSociale} · entité « {rapport.entite} »
              </div>
              {rapport.apply ? (
                <div style={{ color: 'var(--success, #177f5e)' }}>{rapport.supprimes} client(s) supprimé(s), factures/relances/dossiers inclus.</div>
              ) : rapport.nbClients === 0 ? (
                <div style={{ color: 'var(--ink-soft)' }}>Aucun client « {rapport.entite} » dans cette organisation — rien à nettoyer.</div>
              ) : (
                <>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: '2px 16px' }}>
                    <span>Clients : <b>{rapport.nbClients}</b></span>
                    <span>Factures : <b>{rapport.nbFactures}</b></span>
                    <span>Relances : <b>{rapport.nbActions}</b></span>
                    <span>Dossiers : <b>{rapport.nbDossiers}</b></span>
                  </div>
                  {rapport.apercuClients.length > 0 && (
                    <div style={{ marginTop: 6, color: 'var(--ink-soft)' }}>
                      {rapport.apercuClients.slice(0, 12).join(', ')}{rapport.apercuClients.length > 12 ? '…' : ''}
                    </div>
                  )}
                </>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

import { useRef, useState } from 'react';
import { CheckCircle2, Download, Gavel, LogOut, Scale, Upload, X } from 'lucide-react';
import { api, ApiError, downloadFile } from '../api/client';
import { useResource } from '../hooks/useResource';
import { useToast } from '../hooks/useToast';
import { fmtDate, fmtFCFA } from '../lib/constants';
import { PartenaireDossierItem, StatutDossierContentieux } from '../api/types';

// Console du cabinet partenaire (avocat/huissier plateforme) — Phase 2 : lecture.
// Affiche les dossiers contentieux confiés par les sociétés clientes, toutes
// sociétés confondues, avec la société d'origine sur chaque ligne.
const STATUT_LABEL: Record<StatutDossierContentieux, string> = {
  ouvert: 'Ouvert',
  analyse: 'Analysé',
  pret: 'Prêt à transmettre',
  transmis: 'Transmis',
  depose: 'Déposé',
  clos: 'Clos',
};

interface DossiersResponse {
  total: number;
  dossiers: PartenaireDossierItem[];
}

export function PartenaireConsole({ nom, onLogout }: { nom: string; onLogout: () => void }) {
  const { data, loading, error } = useResource<DossiersResponse>('/api/partenaire/dossiers');
  const [selected, setSelected] = useState<string | null>(null);

  return (
    <div style={{ minHeight: '100vh', background: 'var(--paper-2, #f2f4f2)' }}>
      <header
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          padding: '14px 22px',
          background: '#0C120F',
          color: '#fff',
        }}
      >
        <Scale size={20} style={{ color: '#C6FB50' }} />
        <div style={{ lineHeight: 1.15 }}>
          <div style={{ fontWeight: 800, fontSize: 15 }}>{nom}</div>
          <div style={{ fontSize: 11.5, opacity: 0.7 }}>Espace partenaire · Feyma</div>
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
        <div className="app-main-head" style={{ marginBottom: 18 }}>
          <h1 style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <Gavel size={22} /> Dossiers confiés
          </h1>
          <div className="app-sub">Les dossiers contentieux que vos clients vous ont confiés, toutes sociétés confondues.</div>
        </div>

        {loading ? (
          <div className="empty-state">Chargement…</div>
        ) : error ? (
          <div className="empty-state">
            <h3>Erreur</h3>
            <p>{error}</p>
          </div>
        ) : !data || data.total === 0 ? (
          <div className="empty-state">
            <h3>Aucun dossier confié pour l’instant</h3>
            <p>Quand une société cliente vous confie un dossier contentieux, il apparaît ici.</p>
          </div>
        ) : (
          <div style={{ background: 'var(--paper, #fff)', border: '1px solid var(--line)', borderRadius: 14, overflow: 'hidden' }}>
            <table>
              <thead>
                <tr>
                  <th>Société</th>
                  <th>Débiteur</th>
                  <th>Référence</th>
                  <th>Statut</th>
                  <th>Montant réclamé</th>
                  <th>Confié le</th>
                </tr>
              </thead>
              <tbody>
                {data.dossiers.map((d) => (
                  <tr key={d.id} style={{ cursor: 'pointer' }} onClick={() => setSelected(d.id)}>
                    <td>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                        {d.societe.logoUrl && (
                          <img src={d.societe.logoUrl} alt="" height={16} style={{ maxHeight: 16, width: 'auto', objectFit: 'contain' }} />
                        )}
                        {d.societe.raisonSociale}
                      </span>
                    </td>
                    <td>{d.client.nom}</td>
                    <td className="mono" style={{ fontSize: 12.5 }}>{d.reference}</td>
                    <td><span className="badge">{STATUT_LABEL[d.statut] ?? d.statut}</span></td>
                    <td className="currency">{d.montantReclame != null ? fmtFCFA(d.montantReclame) : '—'}</td>
                    <td style={{ whiteSpace: 'nowrap' }}>{d.confieLe ? fmtDate(d.confieLe) : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </main>

      {selected && <PartenaireDossierDrawer dossierId={selected} onClose={() => setSelected(null)} />}
    </div>
  );
}

// Détail lecture seule d'un dossier confié.
interface DossierDetail {
  reference: string;
  statut: StatutDossierContentieux;
  montantReclame: number | null;
  client: { nom: string; entite: string; organisation?: { raisonSociale: string | null } | null };
  factures: { id: string; numero: string; montant: number; dateEcheance: string | null }[];
  decompte: { id: string; poste: string; montant: number }[];
  pieces: { id: string; nomFichier: string; type: string }[];
  actes: { id: string; type: string; statut: string; mimeTypeSigne?: string | null }[];
  analyse: { syntheseIa: string | null; competence: string | null; manquants: string[] } | null;
  propositions: { id: string; statut: string; createdAt: string }[];
}

function PartenaireDossierDrawer({ dossierId, onClose }: { dossierId: string; onClose: () => void }) {
  const { data: d, loading, error, refetch } = useResource<DossierDetail>(`/api/partenaire/dossiers/${dossierId}`);

  return (
    <div className="drawer-overlay" onClick={onClose}>
      <div className="drawer" onClick={(e) => e.stopPropagation()}>
        <button className="drawer-close" onClick={onClose} aria-label="Fermer" title="Fermer">
          <X size={18} />
        </button>
        {loading ? (
          <div className="empty-state">Chargement…</div>
        ) : error || !d ? (
          <div className="empty-state"><h3>Erreur</h3><p>{error ?? 'Dossier introuvable'}</p></div>
        ) : (
          <div style={{ padding: '8px 4px' }}>
            <div style={{ fontSize: 12, color: 'var(--ink-soft)' }}>
              {d.client.organisation?.raisonSociale ?? '—'} · <span className="mono">{d.reference}</span>
            </div>
            <h2 style={{ margin: '2px 0 4px' }}>{d.client.nom}</h2>
            <div style={{ display: 'flex', gap: 12, alignItems: 'baseline', marginBottom: 16 }}>
              <span className="badge">{STATUT_LABEL[d.statut] ?? d.statut}</span>
              {d.montantReclame != null && <b style={{ fontSize: 18 }}>{fmtFCFA(d.montantReclame)}</b>}
            </div>

            {d.analyse && (d.analyse.syntheseIa || d.analyse.competence) && (
              <section style={{ marginBottom: 16 }}>
                <div className="section-title">Analyse de recevabilité</div>
                {d.analyse.competence && <p style={{ margin: '4px 0', fontSize: 13 }}>Juridiction : {d.analyse.competence}</p>}
                {d.analyse.syntheseIa && <p style={{ margin: '4px 0', fontSize: 13, color: 'var(--ink-soft)', whiteSpace: 'pre-wrap' }}>{d.analyse.syntheseIa}</p>}
                {d.analyse.manquants?.length > 0 && (
                  <p style={{ margin: '4px 0', fontSize: 12.5, color: 'var(--danger)' }}>Pièces manquantes : {d.analyse.manquants.join(', ')}</p>
                )}
              </section>
            )}

            <section style={{ marginBottom: 16 }}>
              <div className="section-title">Décompte de la créance</div>
              {d.decompte.length === 0 ? (
                <p style={{ fontSize: 13, color: 'var(--ink-soft)' }}>Aucun décompte.</p>
              ) : (
                <table><tbody>
                  {d.decompte.map((l) => (
                    <tr key={l.id}><td>{l.poste}</td><td className="currency">{fmtFCFA(l.montant)}</td></tr>
                  ))}
                </tbody></table>
              )}
            </section>

            <section style={{ marginBottom: 16 }}>
              <div className="section-title">Factures ({d.factures.length})</div>
              {d.factures.map((f) => (
                <div key={f.id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, padding: '3px 0' }}>
                  <span className="mono">{f.numero}</span>
                  <span className="currency">{fmtFCFA(f.montant)}</span>
                </div>
              ))}
            </section>

            <section style={{ marginBottom: 16 }}>
              <div className="section-title">Pièces ({d.pieces.length})</div>
              {d.pieces.length === 0 ? (
                <p style={{ fontSize: 13, color: 'var(--ink-soft)' }}>Aucune pièce.</p>
              ) : (
                <ul style={{ margin: 0, padding: 0, listStyle: 'none', fontSize: 13, display: 'grid', gap: 6 }}>
                  {d.pieces.map((p) => (
                    <li key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 8, justifyContent: 'space-between' }}>
                      <span>{p.nomFichier}</span>
                      <button
                        type="button"
                        onClick={() => downloadFile(`/api/partenaire/dossiers/${dossierId}/pieces/${p.id}/fichier`, p.nomFichier)}
                        style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '4px 10px', fontSize: 12 }}
                      >
                        <Download size={13} /> Télécharger
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section>
              <div className="section-title">Actes ({d.actes.length})</div>
              {d.actes.length === 0 ? (
                <p style={{ fontSize: 13, color: 'var(--ink-soft)' }}>
                  Aucun acte généré. Le créancier prépare le projet d’acte, puis vous le relisez, validez et déposez la version signée.
                </p>
              ) : (
                <div style={{ display: 'grid', gap: 10 }}>
                  {d.actes.map((a) => (
                    <ActePartenaireRow key={a.id} dossierId={dossierId} acte={a} onChanged={refetch} />
                  ))}
                </div>
              )}
            </section>

            <p style={{ marginTop: 20, fontSize: 12, color: 'var(--ink-soft)' }}>
              Vous relisez le dossier, validez le projet d’acte et déposez la version signée. La génération des projets reste faite par le créancier.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

// Une ligne d'acte côté partenaire : télécharger le projet, valider, déposer la
// version signée, télécharger la version signée.
const ACTE_LABEL: Record<string, string> = {
  mise_en_demeure: 'Mise en demeure',
  commandement: 'Commandement de payer',
  commandement_societe: 'Commandement (société)',
  injonction: 'Injonction de payer',
  assignation: 'Assignation',
  protocole: 'Protocole d’accord',
};

function ActePartenaireRow({
  dossierId,
  acte,
  onChanged,
}: {
  dossierId: string;
  acte: { id: string; type: string; statut: string; mimeTypeSigne?: string | null };
  onChanged: () => void;
}) {
  const { showToast } = useToast();
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const signe = acte.statut === 'signe' || !!acte.mimeTypeSigne;
  const base = `/api/partenaire/dossiers/${dossierId}/actes/${acte.id}`;

  async function valider() {
    setBusy(true);
    try {
      await api.post(`${base}/valider`);
      showToast('Acte validé');
      onChanged();
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : 'Erreur');
    } finally {
      setBusy(false);
    }
  }

  async function deposerSigne(file: File) {
    setBusy(true);
    try {
      const fd = new FormData();
      fd.append('fichier', file);
      await api.upload(`${base}/signe`, fd);
      showToast('Version signée déposée');
      onChanged();
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : 'Erreur');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ border: '1px solid var(--line)', borderRadius: 10, padding: '10px 12px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8, flexWrap: 'wrap' }}>
        <b style={{ fontSize: 13.5 }}>{ACTE_LABEL[acte.type] ?? acte.type}</b>
        <span className="badge" data-tone={signe ? 'success' : 'amber'}>
          {signe ? 'Signé' : acte.statut === 'valide' ? 'Validé' : 'Projet'}
        </span>
      </div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <button
          type="button"
          onClick={() => downloadFile(`${base}/pdf`, `projet-${acte.type}.pdf`)}
          style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 12.5 }}
        >
          <Download size={13} /> Projet
        </button>
        {!signe && (
          <button type="button" onClick={valider} disabled={busy} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 12.5 }}>
            <CheckCircle2 size={13} /> Valider
          </button>
        )}
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          disabled={busy}
          className="primary"
          style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 12.5 }}
        >
          <Upload size={13} /> {signe ? 'Remplacer la signature' : 'Déposer la version signée'}
        </button>
        {signe && (
          <button
            type="button"
            onClick={() => downloadFile(`${base}/signe/pdf`, `signe-${acte.type}.pdf`)}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 12.5 }}
          >
            <Download size={13} /> Version signée
          </button>
        )}
        <input
          ref={fileRef}
          type="file"
          accept="application/pdf,image/*"
          style={{ display: 'none' }}
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) deposerSigne(f);
            e.target.value = '';
          }}
        />
      </div>
    </div>
  );
}

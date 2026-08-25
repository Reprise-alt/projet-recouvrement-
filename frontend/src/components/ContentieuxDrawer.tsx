import { useEffect, useRef, useState } from 'react';
import {
  AlertTriangle,
  Archive,
  Building2,
  Check,
  CheckCircle2,
  Clock,
  Download,
  FileText,
  Gavel,
  Loader2,
  RotateCcw,
  Scale,
  ShieldCheck,
  Sparkles,
  Stamp,
  Trash2,
  Upload,
  X,
  XCircle,
} from 'lucide-react';
import { api, ApiError, downloadFile } from '../api/client';
import { useResource } from '../hooks/useResource';
import { useToast } from '../hooks/useToast';
import { fmtDate, fmtFCFA } from '../lib/constants';
import {
  ActeContentieux,
  AnalyseResponse,
  Avocat,
  DossierContentieuxDetail,
  InfoPrescription,
  IssueDossier,
  MentionsLegales,
  PieceContentieux,
  StatutActe,
  StatutDossierContentieux,
  TypeActe,
  TypePiece,
  VerdictRecevabilite,
} from '../api/types';

const STATUT_LABEL: Record<StatutDossierContentieux, string> = {
  ouvert: 'Ouvert',
  analyse: 'Analysé',
  pret: 'Prêt à transmettre',
  transmis: 'Transmis',
  depose: 'Déposé',
  clos: 'Clos',
};

const VERDICT: Record<VerdictRecevabilite, { label: string; color: string; bg: string }> = {
  non_evalue: { label: 'Non évalué', color: 'var(--ink-soft)', bg: 'var(--line-soft)' },
  pret: { label: 'Prêt à agir', color: 'var(--accent-dark)', bg: 'var(--accent-soft)' },
  a_completer: { label: 'À compléter', color: 'var(--amber-dark)', bg: 'var(--amber-soft)' },
  risque: { label: 'Risque', color: 'var(--danger)', bg: 'var(--danger-soft)' },
};

const TYPE_PIECE_LABEL: Record<TypePiece, string> = {
  facture: 'Facture',
  bon_commande: 'Bon de commande',
  contrat: 'Contrat',
  mise_en_demeure: 'Mise en demeure',
  preuve_livraison: 'Preuve de livraison',
  echange: 'Correspondance',
  releve_de_compte: 'Relevé de compte',
  jugement: 'Décision de justice',
  autre: 'Autre',
};

const ISSUE: Record<IssueDossier, { label: string; positif: boolean }> = {
  recouvre: { label: 'Créance recouvrée (payée)', positif: true },
  transige: { label: 'Transaction / accord amiable', positif: true },
  resilie: { label: 'Clôturé (résiliation / abandon)', positif: true },
  jugement_favorable: { label: 'Jugement favorable', positif: true },
  jugement_defavorable: { label: 'Jugement défavorable', positif: false },
  irrecouvrable: { label: 'Irrécouvrable / passé en pertes', positif: false },
};

const TYPE_ACTE_LABEL: Record<TypeActe, string> = {
  mise_en_demeure: 'Mise en demeure',
  commandement_societe: 'Commandement de payer (société)',
  requete_injonction_de_payer: 'Requête en injonction de payer',
  commandement_de_payer: 'Commandement de payer (huissier)',
  assignation_en_paiement: 'Commandement valant assignation',
  decompte_de_creance: 'Décompte de créance',
  bordereau_de_pieces: 'Bordereau de pièces',
};

const STATUT_ACTE: Record<StatutActe, { label: string; color: string; bg: string }> = {
  brouillon: { label: 'Projet', color: 'var(--ink-soft)', bg: 'var(--line-soft)' },
  valide: { label: 'Validé', color: 'var(--accent-dark)', bg: 'var(--accent-soft)' },
  signe: { label: 'Signé', color: 'var(--accent-dark)', bg: 'var(--accent-soft)' },
};

function poids(o: number): string {
  return o < 1024 * 1024 ? `${Math.round(o / 1024)} Ko` : `${(o / 1024 / 1024).toFixed(1)} Mo`;
}

export function ContentieuxDrawer({
  dossierId,
  avocat = false,
  onClose,
  onChanged,
}: {
  dossierId: string;
  avocat?: boolean;
  onClose: () => void;
  onChanged: () => void;
}) {
  const { showToast } = useToast();
  const { data: dossier, loading, error, refetch } = useResource<DossierContentieuxDetail>(
    `/api/contentieux/dossiers/${dossierId}`,
  );
  const fileRef = useRef<HTMLInputElement>(null);
  const signeRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [analysing, setAnalysing] = useState(false);
  const [params, setParams] = useState({ tauxInteretAnnuel: '', penalite: '', frais: '' });
  const [openForm, setOpenForm] = useState<null | 'societe' | 'injonction' | 'commandement' | 'assignation'>(null);
  // Id de l'acte en cours de dépôt de version signée (déclenche le sélecteur de fichier).
  const [acteSigneCible, setActeSigneCible] = useState<string | null>(null);
  const jugementRef = useRef<HTMLInputElement>(null);
  const [cloturer, setCloturer] = useState(false);
  const [issueSel, setIssueSel] = useState<IssueDossier | ''>('');
  const [montantRec, setMontantRec] = useState('');
  const [noteClot, setNoteClot] = useState('');

  function refreshAll() {
    refetch();
    onChanged();
  }

  async function handleValider(acte: ActeContentieux) {
    if (!confirm(`Valider « ${TYPE_ACTE_LABEL[acte.type]} » ? Vous confirmez avoir relu ce projet.`)) return;
    try {
      await api.post(`/api/contentieux/dossiers/${dossierId}/actes/${acte.id}/valider`);
      showToast('Acte validé');
      refreshAll();
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : 'Erreur');
    }
  }

  async function handleDeposerSigne(files: FileList | null) {
    const acteId = acteSigneCible;
    setActeSigneCible(null);
    if (!files || !files.length || !acteId) return;
    try {
      const fd = new FormData();
      fd.append('fichier', files[0]);
      await api.upload(`/api/contentieux/dossiers/${dossierId}/actes/${acteId}/signe`, fd);
      showToast('Version signée déposée');
      refreshAll();
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : 'Échec du dépôt');
    } finally {
      if (signeRef.current) signeRef.current.value = '';
    }
  }

  // Dépôt du compte rendu de jugement (pièce typée « jugement »).
  async function handleUploadJugement(files: FileList | null) {
    if (!files || !files.length) return;
    try {
      const fd = new FormData();
      Array.from(files).forEach((f) => fd.append('fichiers', f));
      fd.append('type', 'jugement');
      await api.upload(`/api/contentieux/dossiers/${dossierId}/pieces`, fd);
      showToast('Décision de justice déposée');
      refreshAll();
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : 'Échec du dépôt');
    } finally {
      if (jugementRef.current) jugementRef.current.value = '';
    }
  }

  async function handleCloturer() {
    if (!issueSel) return;
    try {
      await api.post(`/api/contentieux/dossiers/${dossierId}/cloturer`, {
        issue: issueSel,
        montantRecouvre: montantRec ? Number(montantRec) : undefined,
        note: noteClot || undefined,
      });
      showToast('Dossier clôturé');
      setCloturer(false);
      setIssueSel('');
      setMontantRec('');
      setNoteClot('');
      refreshAll();
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : 'Échec de la clôture');
    }
  }

  async function handleRouvrir() {
    if (!confirm('Rouvrir ce dossier clôturé ?')) return;
    try {
      await api.post(`/api/contentieux/dossiers/${dossierId}/rouvrir`);
      showToast('Dossier rouvert');
      refreshAll();
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : 'Erreur');
    }
  }

  async function handleUpload(files: FileList | null) {
    if (!files || !files.length) return;
    setUploading(true);
    try {
      const fd = new FormData();
      Array.from(files).forEach((f) => fd.append('fichiers', f));
      await api.upload(`/api/contentieux/dossiers/${dossierId}/pieces`, fd);
      showToast(`${files.length} pièce(s) ajoutée(s)`);
      refreshAll();
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : 'Échec du dépôt');
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  }

  async function handleDeletePiece(piece: PieceContentieux) {
    if (!confirm(`Retirer « ${piece.nomFichier} » du dossier ?`)) return;
    try {
      await api.delete(`/api/contentieux/dossiers/${dossierId}/pieces/${piece.id}`);
      refreshAll();
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : 'Erreur');
    }
  }

  async function handleAnalyser() {
    setAnalysing(true);
    try {
      const body = {
        tauxInteretAnnuel: params.tauxInteretAnnuel ? Number(params.tauxInteretAnnuel) : undefined,
        penalite: params.penalite ? Number(params.penalite) : undefined,
        frais: params.frais ? Number(params.frais) : undefined,
      };
      const res = await api.post<AnalyseResponse>(`/api/contentieux/dossiers/${dossierId}/analyser`, body);
      showToast(res.iaUtilisee ? 'Analyse IA + recevabilité terminée' : "Analyse terminée (IA indisponible — décompte seul)");
      refreshAll();
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : "Échec de l'analyse");
    } finally {
      setAnalysing(false);
    }
  }

  async function genererActe(type: 'commandement-societe' | 'injonction' | 'commandement' | 'assignation', body: Record<string, unknown>) {
    try {
      await api.post<ActeContentieux>(`/api/contentieux/dossiers/${dossierId}/actes/${type}`, body);
      showToast('Projet d’acte généré');
      setOpenForm(null);
      refreshAll();
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : "Échec de la génération");
    }
  }

  return (
    <div className="overlay open" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="drawer" style={{ width: 'min(680px, 100%)' }}>
        <button className="drawer-close" onClick={onClose} aria-label="Fermer" title="Fermer">
          <X size={15} />
        </button>

        {loading || !dossier ? (
          <div style={{ paddingTop: 40 }}>{error || 'Chargement…'}</div>
        ) : (
          <>
            <h2 style={{ marginBottom: 2 }}>{dossier.client.nom}</h2>
            <div className="sub">
              Dossier contentieux · <span className="mono">{dossier.reference}</span> ·{' '}
              {STATUT_LABEL[dossier.statut]}
            </div>

            {/* ---------- Bandeau dossier clôturé ---------- */}
            {dossier.statut === 'clos' && dossier.issue && (
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  margin: '10px 0',
                  padding: '10px 14px',
                  borderRadius: 10,
                  border: `1px solid ${ISSUE[dossier.issue].positif ? 'var(--accent)' : 'var(--danger)'}`,
                  background: ISSUE[dossier.issue].positif ? 'var(--accent-soft)' : 'var(--danger-soft)',
                  color: ISSUE[dossier.issue].positif ? 'var(--accent-dark)' : 'var(--danger)',
                }}
              >
                {ISSUE[dossier.issue].positif ? <CheckCircle2 size={17} /> : <XCircle size={17} />}
                <div style={{ flex: 1, fontSize: 12.5 }}>
                  <strong>Dossier clôturé — {ISSUE[dossier.issue].label}</strong>
                  {dossier.clotureLe ? ` · le ${fmtDate(dossier.clotureLe)}` : ''}
                  {dossier.montantRecouvre != null ? ` · recouvré ${fmtFCFA(dossier.montantRecouvre)}` : ''}
                  {dossier.noteCloture ? <div style={{ color: 'var(--ink-soft)', marginTop: 3 }}>{dossier.noteCloture}</div> : null}
                </div>
                {!avocat && (
                  <button onClick={handleRouvrir} title="Rouvrir le dossier">
                    <RotateCcw size={13} /> Rouvrir
                  </button>
                )}
              </div>
            )}

            {/* ---------- Avocat assigné (interne) ---------- */}
            {!avocat && <AssignationAvocat dossierId={dossierId} avocatActuel={dossier.avocat} onChanged={refreshAll} />}

            {/* ---------- Verdict de recevabilité ---------- */}
            <VerdictBloc dossier={dossier} />

            {/* ---------- Alerte de prescription ---------- */}
            {dossier.statut !== 'clos' && <BandeauPrescription info={dossier.prescription} />}

            {/* ---------- Frise d'escalade ---------- */}
            <FriseEscalade dossier={dossier} />

            {/* ---------- Décompte ---------- */}
            {dossier.decompte.length > 0 && (
              <>
                <div className="section-title">Décompte de la créance</div>
                <div className="table-card" style={{ marginBottom: 20 }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                    <tbody>
                      {dossier.decompte.map((l) => (
                        <tr key={l.id} style={{ borderBottom: '1px solid var(--line-soft)' }}>
                          <td style={{ padding: '9px 14px' }}>{l.poste}</td>
                          <td className="mono" style={{ padding: '9px 14px', textAlign: 'right', whiteSpace: 'nowrap' }}>
                            {fmtFCFA(l.montant)}
                          </td>
                        </tr>
                      ))}
                      <tr style={{ fontWeight: 700 }}>
                        <td style={{ padding: '11px 14px' }}>Total réclamé</td>
                        <td className="mono" style={{ padding: '11px 14px', textAlign: 'right', whiteSpace: 'nowrap' }}>
                          {fmtFCFA(dossier.montantReclame ?? dossier.decompte.reduce((s, l) => s + l.montant, 0))}
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </>
            )}

            {/* ---------- Factures rattachées ---------- */}
            <div className="section-title">Factures rattachées ({dossier.factures.length})</div>
            {dossier.factures.length === 0 ? (
              <p style={{ color: 'var(--ink-soft)', fontSize: 12.5, margin: '0 0 16px' }}>
                Aucune facture rattachée. Le décompte et les actes nécessitent au moins une facture impayée.
              </p>
            ) : (
              <div style={{ marginBottom: 16 }}>
                {dossier.factures.map((f) => (
                  <div
                    key={f.id}
                    style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', fontSize: 12.5 }}
                  >
                    <span>
                      <span className="mono">{f.numero}</span> · éch. {fmtDate(f.dateEcheance)}
                    </span>
                    <span className="mono">{fmtFCFA(f.montant)}</span>
                  </div>
                ))}
              </div>
            )}

            {/* ---------- Pièces du dossier ---------- */}
            <div className="section-title">
              Pièces du dossier ({dossier.pieces.length})
              {!avocat && (
                <button onClick={() => fileRef.current?.click()} disabled={uploading}>
                  {uploading ? <Loader2 size={13} className="spin" /> : <Upload size={13} />} Ajouter
                </button>
              )}
            </div>
            <input
              ref={fileRef}
              type="file"
              multiple
              hidden
              accept=".pdf,image/*"
              onChange={(e) => handleUpload(e.target.files)}
            />
            {dossier.pieces.length === 0 ? (
              <div
                className="empty-state"
                style={{ padding: '28px 20px', border: '1px dashed var(--line)', borderRadius: 12, marginBottom: 18 }}
                onClick={avocat ? undefined : () => fileRef.current?.click()}
                role={avocat ? undefined : 'button'}
              >
                <FileText size={22} style={{ opacity: 0.5, marginBottom: 8 }} />
                <p style={{ margin: 0, fontSize: 12.5 }}>
                  {avocat
                    ? 'Aucune pièce déposée pour le moment.'
                    : 'Déposez ici toutes les pièces du dossier (factures, bons de commande, contrat, mises en demeure, preuves de livraison, échanges…). PDF ou images.'}
                </p>
              </div>
            ) : (
              <div style={{ marginBottom: 18 }}>
                {dossier.pieces.map((p) => (
                  <div
                    key={p.id}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 10,
                      padding: '8px 0',
                      borderBottom: '1px solid var(--line-soft)',
                    }}
                  >
                    <FileText size={15} style={{ opacity: 0.6, flexShrink: 0 }} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 12.5, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {p.nomFichier}
                      </div>
                      <div style={{ fontSize: 10.5, color: 'var(--ink-soft)' }}>
                        {TYPE_PIECE_LABEL[p.type]} · {poids(p.taille)}
                      </div>
                    </div>
                    <button
                      title="Télécharger"
                      onClick={() =>
                        downloadFile(
                          `/api/contentieux/dossiers/${dossierId}/pieces/${p.id}/fichier`,
                          p.nomFichier,
                        ).catch(() => showToast('Échec du téléchargement'))
                      }
                      style={{ padding: 6 }}
                    >
                      <Download size={13} />
                    </button>
                    {!avocat && (
                      <button className="danger-btn" title="Retirer" onClick={() => handleDeletePiece(p)} style={{ padding: 6 }}>
                        <Trash2 size={13} />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}

            {/* ---------- Analyse (interne uniquement) ---------- */}
            {!avocat && (
              <>
                <div className="section-title">Analyse</div>
                <div style={{ display: 'flex', gap: 8, marginBottom: 10, flexWrap: 'wrap' }}>
                  <input
                    type="number"
                    placeholder="Taux intérêt % / an"
                    value={params.tauxInteretAnnuel}
                    onChange={(e) => setParams({ ...params, tauxInteretAnnuel: e.target.value })}
                    style={{ flex: '1 1 120px', minWidth: 0 }}
                  />
                  <input
                    type="number"
                    placeholder="Pénalité (FCFA)"
                    value={params.penalite}
                    onChange={(e) => setParams({ ...params, penalite: e.target.value })}
                    style={{ flex: '1 1 120px', minWidth: 0 }}
                  />
                  <input
                    type="number"
                    placeholder="Frais (FCFA)"
                    value={params.frais}
                    onChange={(e) => setParams({ ...params, frais: e.target.value })}
                    style={{ flex: '1 1 120px', minWidth: 0 }}
                  />
                </div>
                <button className="primary" onClick={handleAnalyser} disabled={analysing} style={{ width: '100%' }}>
                  {analysing ? <Loader2 size={14} className="spin" /> : <Sparkles size={14} />}{' '}
                  {dossier.analyse ? 'Relancer l’analyse' : 'Analyser le dossier'}
                </button>
                {dossier.analyse?.syntheseIa && (
                  <div
                    style={{
                      marginTop: 12,
                      padding: '12px 14px',
                      background: 'var(--surface)',
                      border: '1px solid var(--line)',
                      borderRadius: 10,
                      fontSize: 12.5,
                      lineHeight: 1.55,
                    }}
                  >
                    <div className="mono" style={{ fontSize: 10, textTransform: 'uppercase', color: 'var(--ink-soft)', marginBottom: 6 }}>
                      Synthèse IA {dossier.analyse.modeleIa ? `· ${dossier.analyse.modeleIa}` : ''}
                    </div>
                    {dossier.analyse.syntheseIa}
                  </div>
                )}
              </>
            )}

            {/* ---------- Actes ---------- */}
            <div className="section-title" style={{ marginTop: 26 }}>
              {avocat ? 'Actes à valider / signer' : 'Projets d’actes'}
            </div>
            <div
              style={{
                fontSize: 11.5,
                color: 'var(--ink-soft)',
                background: 'var(--amber-soft)',
                border: '1px solid var(--amber)',
                borderRadius: 8,
                padding: '9px 12px',
                marginBottom: 12,
                lineHeight: 1.5,
              }}
            >
              <AlertTriangle size={13} style={{ verticalAlign: -2, marginRight: 5 }} />
              Documents générés en <strong>PROJET</strong>. Ils doivent être relus, validés et signés par un huissier ou
              un avocat avant tout dépôt. La plateforme ne dépose jamais d’acte.
            </div>

            {/* Génération : interne uniquement, dans l'ordre d'escalade. */}
            {!avocat && (
              <>
                <div style={{ fontSize: 10.5, color: 'var(--ink-soft)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.3 }}>
                  Escalade : ① société (≈ 90 j) → ② huissier → ③ assignation
                </div>
                <div style={{ display: 'flex', gap: 8, marginBottom: 8, flexWrap: 'wrap' }}>
                  <button
                    onClick={() => setOpenForm(openForm === 'societe' ? null : 'societe')}
                    disabled={dossier.factures.length === 0}
                    style={{ flex: '1 1 180px' }}
                  >
                    <Building2 size={14} /> ① Commandement société
                  </button>
                  <button
                    onClick={() => setOpenForm(openForm === 'commandement' ? null : 'commandement')}
                    disabled={dossier.factures.length === 0}
                    style={{ flex: '1 1 150px' }}
                  >
                    <Scale size={14} /> ② Huissier
                  </button>
                  <button
                    onClick={() => setOpenForm(openForm === 'assignation' ? null : 'assignation')}
                    disabled={dossier.factures.length === 0}
                    style={{ flex: '1 1 150px' }}
                  >
                    <Gavel size={14} /> ③ Assignation
                  </button>
                </div>
                <div style={{ fontSize: 10.5, color: 'var(--ink-soft)', margin: '2px 0 6px', textTransform: 'uppercase', letterSpacing: 0.3 }}>
                  Voie rapide (alternative au judiciaire long)
                </div>
                <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
                  <button
                    onClick={() => setOpenForm(openForm === 'injonction' ? null : 'injonction')}
                    disabled={dossier.factures.length === 0}
                    style={{ flex: 1 }}
                    title="Procédure simplifiée OHADA (AUPSRVE) : requête au président du tribunal → ordonnance d'injonction de payer"
                  >
                    <Sparkles size={14} /> ⚡ Injonction de payer (OHADA)
                  </button>
                </div>

                {openForm === 'societe' && (
                  <CommandementSocieteForm entite={dossier.client.entite} onGenerer={(b) => genererActe('commandement-societe', b)} />
                )}
                {openForm === 'injonction' && <InjonctionForm onGenerer={(b) => genererActe('injonction', b)} />}
                {openForm === 'commandement' && <CommandementForm onGenerer={(b) => genererActe('commandement', b)} />}
                {openForm === 'assignation' && <AssignationForm onGenerer={(b) => genererActe('assignation', b)} />}
              </>
            )}

            {/* Input caché : dépôt de la version signée. */}
            <input
              ref={signeRef}
              type="file"
              hidden
              accept=".pdf,image/*"
              onChange={(e) => handleDeposerSigne(e.target.files)}
            />

            {dossier.actes.length === 0 ? (
              <p style={{ color: 'var(--ink-soft)', fontSize: 12.5, marginTop: 4 }}>
                {avocat ? 'Aucun acte à traiter pour le moment.' : 'Aucun acte généré pour ce dossier.'}
              </p>
            ) : (
              <div style={{ marginTop: 8 }}>
                {dossier.actes.map((a) => {
                  const st = STATUT_ACTE[a.statut];
                  return (
                    <div
                      key={a.id}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 10,
                        padding: '10px 0',
                        borderBottom: '1px solid var(--line-soft)',
                        flexWrap: 'wrap',
                      }}
                    >
                      <Scale size={15} style={{ opacity: 0.6, flexShrink: 0 }} />
                      <div style={{ flex: '1 1 180px', minWidth: 0 }}>
                        <div style={{ fontSize: 12.5, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                          {TYPE_ACTE_LABEL[a.type]}
                          <span className="badge" style={{ color: st.color, background: st.bg }}>{st.label}</span>
                        </div>
                        <div style={{ fontSize: 10.5, color: 'var(--ink-soft)' }}>
                          {a.gabaritVersion} · {fmtDate(a.createdAt)}
                          {a.signeLe ? ` · signé le ${fmtDate(a.signeLe)}` : a.valideLe ? ` · validé le ${fmtDate(a.valideLe)}` : ''}
                        </div>
                      </div>
                      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                        <button
                          title="Télécharger le projet"
                          onClick={() =>
                            downloadFile(
                              `/api/contentieux/dossiers/${dossierId}/actes/${a.id}/pdf`,
                              `projet-${a.type}.pdf`,
                            ).catch(() => showToast('Échec du téléchargement'))
                          }
                        >
                          <Download size={13} /> Projet
                        </button>
                        {a.statut === 'brouillon' && (
                          <button className="primary" title="Valider (relu)" onClick={() => handleValider(a)}>
                            <ShieldCheck size={13} /> Valider
                          </button>
                        )}
                        {a.statut !== 'signe' && (
                          <button
                            title="Déposer la version signée"
                            onClick={() => {
                              setActeSigneCible(a.id);
                              signeRef.current?.click();
                            }}
                          >
                            <Stamp size={13} /> Déposer signé
                          </button>
                        )}
                        {a.aVersionSignee && (
                          <button
                            className="primary"
                            title="Télécharger la version signée"
                            onClick={() =>
                              downloadFile(
                                `/api/contentieux/dossiers/${dossierId}/actes/${a.id}/signe/pdf`,
                                `signe-${a.type}.pdf`,
                              ).catch(() => showToast('Échec du téléchargement'))
                            }
                          >
                            <Download size={13} /> Signé
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* ---------- Clôture du dossier (interne) ---------- */}
            {!avocat && dossier.statut !== 'clos' && (
              <>
                <div className="section-title" style={{ marginTop: 26 }}>Clôture du dossier</div>
                <input ref={jugementRef} type="file" hidden multiple accept=".pdf,image/*" onChange={(e) => handleUploadJugement(e.target.files)} />
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
                  <button onClick={() => jugementRef.current?.click()}>
                    <Gavel size={14} /> Déposer le compte rendu de jugement
                  </button>
                  {!cloturer && (
                    <button className="primary" onClick={() => setCloturer(true)}>
                      <Archive size={14} /> Clôturer le dossier
                    </button>
                  )}
                </div>

                {dossier.factures.length > 0 && dossier.factures.every((f) => f.statut === 'payee') && !cloturer && (
                  <div style={{ fontSize: 11.5, color: 'var(--accent-dark)', marginBottom: 8 }}>
                    ✓ Toutes les factures rattachées sont réglées — vous pouvez clôturer en « recouvré ».
                  </div>
                )}

                {cloturer && (
                  <div style={{ border: '1px solid var(--line)', borderRadius: 10, padding: 14 }}>
                    <label style={{ display: 'block', marginBottom: 9 }}>
                      <span style={{ display: 'block', fontSize: 11, color: 'var(--ink-soft)', marginBottom: 3 }}>Dénouement</span>
                      <select value={issueSel} onChange={(e) => setIssueSel(e.target.value as IssueDossier)} style={{ width: '100%' }}>
                        <option value="">— Choisir —</option>
                        {(Object.keys(ISSUE) as IssueDossier[]).map((k) => (
                          <option key={k} value={k}>
                            {ISSUE[k].label}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label style={{ display: 'block', marginBottom: 9 }}>
                      <span style={{ display: 'block', fontSize: 11, color: 'var(--ink-soft)', marginBottom: 3 }}>Montant recouvré (FCFA, optionnel)</span>
                      <input type="number" value={montantRec} onChange={(e) => setMontantRec(e.target.value)} style={{ width: '100%' }} />
                    </label>
                    <label style={{ display: 'block', marginBottom: 9 }}>
                      <span style={{ display: 'block', fontSize: 11, color: 'var(--ink-soft)', marginBottom: 3 }}>Note (optionnel)</span>
                      <textarea rows={2} value={noteClot} onChange={(e) => setNoteClot(e.target.value)} style={{ width: '100%', fontFamily: 'inherit', fontSize: 13, resize: 'vertical' }} />
                    </label>
                    {(issueSel === 'jugement_favorable' || issueSel === 'jugement_defavorable') && (
                      <div style={{ fontSize: 11.5, color: 'var(--amber-dark)', marginBottom: 8 }}>
                        Pensez à déposer le compte rendu de jugement (bouton ci-dessus) pour l’archiver dans le dossier.
                      </div>
                    )}
                    <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                      <button onClick={() => setCloturer(false)}>Annuler</button>
                      <button className="primary" disabled={!issueSel} onClick={handleCloturer}>
                        Confirmer la clôture
                      </button>
                    </div>
                  </div>
                )}
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}

// --------------------------------------------------------- Alerte prescription
function BandeauPrescription({ info }: { info: InfoPrescription | null }) {
  if (!info) return null;
  const j = info.joursRestants;
  // Rouge = prescrit ; ambre = échéance proche (≤ 180 j) ; gris = informatif (≤ 365 j) ; masqué au-delà.
  if (j > 365) return null;
  const prescrit = j <= 0;
  const proche = j > 0 && j <= 180;
  const couleur = prescrit ? 'var(--danger)' : proche ? 'var(--amber-dark)' : 'var(--ink-soft)';
  const fond = prescrit ? 'var(--danger-soft)' : proche ? 'var(--amber-soft)' : 'var(--surface)';
  const bord = prescrit ? 'var(--danger)' : proche ? 'var(--amber)' : 'var(--line)';
  const texte = prescrit
    ? `Créance PRESCRITE depuis ${Math.abs(j)} j (délai atteint le ${fmtDate(info.dateLimite)}).`
    : `Prescription dans ${j} j — au plus tard le ${fmtDate(info.dateLimite)}.${proche ? ' Agir sans tarder.' : ''}`;
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        margin: '2px 0 10px',
        padding: '9px 12px',
        borderRadius: 10,
        border: `1px solid ${bord}`,
        background: fond,
        color: couleur,
        fontSize: 12.5,
        fontWeight: prescrit || proche ? 600 : 400,
      }}
    >
      <Clock size={15} style={{ flexShrink: 0 }} />
      <span>{texte}</span>
    </div>
  );
}

// ------------------------------------------------------------- Frise d'escalade
function FriseEscalade({ dossier }: { dossier: DossierContentieuxDetail }) {
  const acte = (t: TypeActe) => dossier.actes.find((a) => a.type === t);
  const sousTitre = (a?: ActeContentieux) =>
    !a ? '' : a.signeLe ? `Signé · ${fmtDate(a.signeLe)}` : a.valideLe ? `Validé · ${fmtDate(a.valideLe)}` : `Projet · ${fmtDate(a.createdAt)}`;

  const cs = acte('commandement_societe');
  const ch = acte('commandement_de_payer');
  const as = acte('assignation_en_paiement');

  const etapes = [
    { label: 'Dossier ouvert', sub: fmtDate(dossier.createdAt), done: true },
    { label: '① Commandement société', sub: cs ? sousTitre(cs) : 'à préparer', done: !!cs },
    { label: '② Commandement huissier', sub: ch ? sousTitre(ch) : 'à venir', done: !!ch },
    { label: '③ Assignation en paiement', sub: as ? sousTitre(as) : 'à venir', done: !!as },
    dossier.statut === 'clos' && dossier.issue
      ? { label: 'Clôturé', sub: `${ISSUE[dossier.issue].label}${dossier.clotureLe ? ' · ' + fmtDate(dossier.clotureLe) : ''}`, done: true }
      : { label: 'Jugement & clôture', sub: 'à venir', done: false },
  ];
  const idxCourant = etapes.findIndex((e) => !e.done);

  return (
    <div style={{ margin: '4px 0 16px' }}>
      <div className="section-title" style={{ marginTop: 4 }}>Étapes du dossier</div>
      <div style={{ display: 'flex', flexDirection: 'column' }}>
        {etapes.map((e, i) => {
          const courant = i === idxCourant;
          const couleur = e.done ? 'var(--accent-dark)' : courant ? 'var(--amber-dark)' : 'var(--ink-soft)';
          return (
            <div key={i} style={{ display: 'flex', gap: 10, alignItems: 'stretch' }}>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                <div
                  style={{
                    width: 12,
                    height: 12,
                    borderRadius: '50%',
                    background: e.done ? 'var(--accent-dark)' : courant ? 'var(--amber)' : 'var(--line)',
                    border: courant ? '2px solid var(--amber-dark)' : 'none',
                    flexShrink: 0,
                    marginTop: 3,
                  }}
                />
                {i < etapes.length - 1 && (
                  <div style={{ width: 2, flex: 1, minHeight: 20, background: e.done ? 'var(--accent-dark)' : 'var(--line)' }} />
                )}
              </div>
              <div style={{ paddingBottom: 10 }}>
                <div style={{ fontSize: 12.5, fontWeight: e.done || courant ? 600 : 400, color: couleur }}>{e.label}</div>
                <div style={{ fontSize: 11, color: 'var(--ink-soft)' }}>{e.sub}</div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ Verdict
function VerdictBloc({ dossier }: { dossier: DossierContentieuxDetail }) {
  const v = VERDICT[dossier.verdict];
  const a = dossier.analyse;
  return (
    <div
      style={{
        border: `1px solid ${v.color}`,
        background: v.bg,
        borderRadius: 12,
        padding: '14px 16px',
        margin: '4px 0 8px',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: a ? 12 : 0 }}>
        <strong style={{ color: v.color }}>Recevabilité : {v.label}</strong>
        {dossier.montantReclame != null && <span className="mono" style={{ fontWeight: 700 }}>{fmtFCFA(dossier.montantReclame)}</span>}
      </div>
      {a && (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '6px 14px' }}>
            <Critere ok={a.certaine} label="Créance certaine" />
            <Critere ok={a.liquide} label="Créance liquide" />
            <Critere ok={a.exigible} label="Créance exigible" />
            <Critere ok={a.prescriptionOk} label="Non prescrite" />
          </div>
          {a.competence && (
            <div style={{ fontSize: 11.5, color: 'var(--ink-soft)', marginTop: 10 }}>
              Juridiction compétente : <strong>{a.competence}</strong>
            </div>
          )}
          {a.manquants.length > 0 && (
            <div style={{ marginTop: 10 }}>
              <div className="mono" style={{ fontSize: 10, textTransform: 'uppercase', color: v.color, marginBottom: 4 }}>
                Pièces / éléments manquants
              </div>
              <ul style={{ margin: 0, paddingLeft: 18, fontSize: 12, lineHeight: 1.55 }}>
                {a.manquants.map((m, i) => (
                  <li key={i}>{m}</li>
                ))}
              </ul>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function Critere({ ok, label }: { ok: boolean; label: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 12.5 }}>
      {ok ? (
        <Check size={15} style={{ color: 'var(--accent-dark)', flexShrink: 0 }} />
      ) : (
        <X size={15} style={{ color: 'var(--danger)', flexShrink: 0 }} />
      )}
      <span style={{ color: ok ? 'var(--ink)' : 'var(--danger)' }}>{label}</span>
    </div>
  );
}

// ------------------------------------------------------------- Formulaires
function Champ({
  label,
  value,
  onChange,
  type = 'text',
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  placeholder?: string;
}) {
  return (
    <label style={{ display: 'block', marginBottom: 9 }}>
      <span style={{ display: 'block', fontSize: 11, color: 'var(--ink-soft)', marginBottom: 3 }}>{label}</span>
      <input
        type={type}
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        style={{ width: '100%' }}
      />
    </label>
  );
}

// ------------------------------------------------- Assignation d'un avocat
function AssignationAvocat({
  dossierId,
  avocatActuel,
  onChanged,
}: {
  dossierId: string;
  avocatActuel: { id: string; nom: string } | null;
  onChanged: () => void;
}) {
  const { showToast } = useToast();
  const { data: avocats } = useResource<Avocat[]>('/api/contentieux/avocats');
  const [saving, setSaving] = useState(false);

  async function assigner(avocatId: string) {
    setSaving(true);
    try {
      await api.patch(`/api/contentieux/dossiers/${dossierId}/avocat`, { avocatId: avocatId || null });
      showToast(avocatId ? 'Avocat assigné' : 'Assignation retirée');
      onChanged();
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : 'Erreur');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        margin: '4px 0 10px',
        padding: '8px 12px',
        border: '1px solid var(--line)',
        borderRadius: 10,
        flexWrap: 'wrap',
      }}
    >
      <ShieldCheck size={14} style={{ opacity: 0.6 }} />
      <span style={{ fontSize: 12, color: 'var(--ink-soft)' }}>Avocat / huissier assigné</span>
      <select
        value={avocatActuel?.id || ''}
        disabled={saving}
        onChange={(e) => assigner(e.target.value)}
        style={{ flex: '1 1 160px', minWidth: 0 }}
      >
        <option value="">— Aucun —</option>
        {(avocats ?? []).map((a) => (
          <option key={a.id} value={a.id}>
            {a.nom}
          </option>
        ))}
      </select>
      {avocats && avocats.length === 0 && (
        <span style={{ fontSize: 10.5, color: 'var(--ink-soft)' }}>
          Aucun collaborateur juridique — activez « Accès Contentieux » sur un compte dans Utilisateurs.
        </span>
      )}
    </div>
  );
}

// --------------------------------- Commandement société (étape 1, entête)
function CommandementSocieteForm({
  entite,
  onGenerer,
}: {
  entite: string;
  onGenerer: (b: Record<string, unknown>) => void;
}) {
  const [f, setF] = useState({
    nom: entite || '',
    formeJuridique: '',
    adresse: '',
    rccm: '',
    ninea: '',
    tel: '',
    email: '',
    representant: '',
    debiteurAdresse: '',
    lieu: '',
    delaiJours: '8',
    signataireNom: '',
    signataireQualite: '',
  });
  // Pré-remplit l'entête depuis les mentions légales officielles de l'entité
  // (SORAM, IRIS…). Reste éditable. SIS renvoie null → rien à pré-remplir.
  const { data: mentions } = useResource<MentionsLegales | null>(
    entite ? `/api/contentieux/mentions/${encodeURIComponent(entite)}` : null,
  );
  useEffect(() => {
    if (!mentions) return;
    setF((prev) => ({
      ...prev,
      nom: mentions.nom || prev.nom,
      formeJuridique: prev.formeJuridique || mentions.formeJuridique || '',
      adresse: prev.adresse || mentions.adresse || '',
      rccm: prev.rccm || mentions.rccm || '',
      ninea: prev.ninea || mentions.ninea || '',
      tel: prev.tel || mentions.tel || '',
      email: prev.email || mentions.email || '',
      signataireNom: prev.signataireNom || mentions.signataireNom || '',
      signataireQualite: prev.signataireQualite || mentions.signataireQualite || '',
    }));
  }, [mentions]);
  const set = (k: keyof typeof f) => (v: string) => setF({ ...f, [k]: v });
  return (
    <div style={{ border: '1px solid var(--line)', borderRadius: 10, padding: 14, marginBottom: 12 }}>
      <div style={{ fontSize: 11, color: 'var(--ink-soft)', marginBottom: 8 }}>
        Entête de votre société — pré-remplie automatiquement (RCCM, NINEA…) et modifiable. Le logo est ajouté au PDF.
      </div>
      <Champ label="Société (nom sur l’entête)" value={f.nom} onChange={set('nom')} />
      <Champ label="Forme juridique / capital" value={f.formeJuridique} onChange={set('formeJuridique')} placeholder="SARL au capital de 10 000 000 FCFA" />
      <Champ label="Adresse du siège" value={f.adresse} onChange={set('adresse')} />
      <div style={{ display: 'flex', gap: 8 }}>
        <div style={{ flex: 1 }}><Champ label="RCCM" value={f.rccm} onChange={set('rccm')} /></div>
        <div style={{ flex: 1 }}><Champ label="NINEA" value={f.ninea} onChange={set('ninea')} /></div>
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        <div style={{ flex: 1 }}><Champ label="Téléphone" value={f.tel} onChange={set('tel')} /></div>
        <div style={{ flex: 1 }}><Champ label="Email" value={f.email} onChange={set('email')} /></div>
      </div>
      <Champ label="Adresse du débiteur" value={f.debiteurAdresse} onChange={set('debiteurAdresse')} />
      <div style={{ display: 'flex', gap: 8 }}>
        <div style={{ flex: 1 }}><Champ label="Lieu" value={f.lieu} onChange={set('lieu')} placeholder="Dakar" /></div>
        <div style={{ flex: 1 }}><Champ label="Délai de paiement (jours)" type="number" value={f.delaiJours} onChange={set('delaiJours')} /></div>
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        <div style={{ flex: 1 }}><Champ label="Signataire (nom)" value={f.signataireNom} onChange={set('signataireNom')} /></div>
        <div style={{ flex: 1 }}><Champ label="Qualité" value={f.signataireQualite} onChange={set('signataireQualite')} placeholder="Directeur du recouvrement" /></div>
      </div>
      <button
        className="primary"
        style={{ width: '100%', marginTop: 4 }}
        onClick={() =>
          onGenerer({
            societe: {
              nom: f.nom || undefined,
              formeJuridique: f.formeJuridique || undefined,
              adresse: f.adresse || undefined,
              rccm: f.rccm || undefined,
              ninea: f.ninea || undefined,
              tel: f.tel || undefined,
              email: f.email || undefined,
              representant: f.representant || undefined,
            },
            debiteurAdresse: f.debiteurAdresse || undefined,
            lieu: f.lieu || undefined,
            delaiJours: f.delaiJours ? Number(f.delaiJours) : undefined,
            signataireNom: f.signataireNom || undefined,
            signataireQualite: f.signataireQualite || undefined,
          })
        }
      >
        Générer le commandement (société)
      </button>
    </div>
  );
}

function CommandementForm({ onGenerer }: { onGenerer: (b: Record<string, unknown>) => void }) {
  const [f, setF] = useState({
    huissierNom: '',
    huissierEtude: '',
    lieu: '',
    demandeurRepresentant: '',
    debiteurAdresse: '',
    coutActe: '',
  });
  const set = (k: keyof typeof f) => (v: string) => setF({ ...f, [k]: v });
  return (
    <div style={{ border: '1px solid var(--line)', borderRadius: 10, padding: 14, marginBottom: 12 }}>
      <Champ label="Huissier (nom)" value={f.huissierNom} onChange={set('huissierNom')} placeholder="Maître ..." />
      <Champ label="Étude" value={f.huissierEtude} onChange={set('huissierEtude')} />
      <Champ label="Lieu de signification" value={f.lieu} onChange={set('lieu')} placeholder="Dakar" />
      <Champ label="Représentant du créancier" value={f.demandeurRepresentant} onChange={set('demandeurRepresentant')} />
      <Champ label="Adresse du débiteur" value={f.debiteurAdresse} onChange={set('debiteurAdresse')} />
      <Champ label="Coût de l’acte (FCFA)" type="number" value={f.coutActe} onChange={set('coutActe')} />
      <button
        className="primary"
        style={{ width: '100%', marginTop: 4 }}
        onClick={() =>
          onGenerer({
            huissier: { nom: f.huissierNom || undefined, etude: f.huissierEtude || undefined },
            lieu: f.lieu || undefined,
            demandeurRepresentant: f.demandeurRepresentant || undefined,
            debiteurAdresse: f.debiteurAdresse || undefined,
            coutActe: f.coutActe ? Number(f.coutActe) : undefined,
          })
        }
      >
        Générer le projet de commandement
      </button>
    </div>
  );
}

function AssignationForm({ onGenerer }: { onGenerer: (b: Record<string, unknown>) => void }) {
  const [f, setF] = useState({
    huissierNom: '',
    huissierEtude: '',
    lieu: '',
    debiteurAdresse: '',
    tribunal: '',
    dateComparution: '',
    heureComparution: '',
    exposeFaits: '',
    electionDomicile: '',
    coutActe: '',
  });
  const set = (k: keyof typeof f) => (v: string) => setF({ ...f, [k]: v });
  return (
    <div style={{ border: '1px solid var(--line)', borderRadius: 10, padding: 14, marginBottom: 12 }}>
      <Champ label="Huissier (nom)" value={f.huissierNom} onChange={set('huissierNom')} placeholder="Maître ..." />
      <Champ label="Étude" value={f.huissierEtude} onChange={set('huissierEtude')} />
      <Champ label="Lieu de signification" value={f.lieu} onChange={set('lieu')} placeholder="Dakar" />
      <Champ label="Adresse du débiteur" value={f.debiteurAdresse} onChange={set('debiteurAdresse')} />
      <Champ label="Tribunal" value={f.tribunal} onChange={set('tribunal')} placeholder="Tribunal de commerce de Dakar" />
      <div style={{ display: 'flex', gap: 8 }}>
        <div style={{ flex: 1 }}>
          <Champ label="Date de comparution" type="date" value={f.dateComparution} onChange={set('dateComparution')} />
        </div>
        <div style={{ flex: 1 }}>
          <Champ label="Heure" value={f.heureComparution} onChange={set('heureComparution')} placeholder="08h00" />
        </div>
      </div>
      <Champ label="Élection de domicile" value={f.electionDomicile} onChange={set('electionDomicile')} />
      <label style={{ display: 'block', marginBottom: 9 }}>
        <span style={{ display: 'block', fontSize: 11, color: 'var(--ink-soft)', marginBottom: 3 }}>
          Exposé des faits (optionnel — l’IA / le juriste peut compléter)
        </span>
        <textarea
          value={f.exposeFaits}
          onChange={(e) => setF({ ...f, exposeFaits: e.target.value })}
          rows={3}
          style={{ width: '100%', fontFamily: 'inherit', fontSize: 13, resize: 'vertical' }}
        />
      </label>
      <Champ label="Coût de l’acte (FCFA)" type="number" value={f.coutActe} onChange={set('coutActe')} />
      <button
        className="primary"
        style={{ width: '100%', marginTop: 4 }}
        onClick={() =>
          onGenerer({
            huissier: { nom: f.huissierNom || undefined, etude: f.huissierEtude || undefined },
            lieu: f.lieu || undefined,
            debiteurAdresse: f.debiteurAdresse || undefined,
            tribunal: f.tribunal || undefined,
            dateComparution: f.dateComparution || undefined,
            heureComparution: f.heureComparution || undefined,
            exposeFaits: f.exposeFaits || undefined,
            electionDomicile: f.electionDomicile || undefined,
            coutActe: f.coutActe ? Number(f.coutActe) : undefined,
          })
        }
      >
        Générer le projet d’assignation
      </button>
    </div>
  );
}

function InjonctionForm({ onGenerer }: { onGenerer: (b: Record<string, unknown>) => void }) {
  const [f, setF] = useState({
    tribunal: '',
    lieu: '',
    interets: '',
    fraisRecouvrement: '',
    fondement: '',
    debiteurAdresse: '',
    avocatNom: '',
  });
  const set = (k: keyof typeof f) => (v: string) => setF({ ...f, [k]: v });
  return (
    <div style={{ border: '1px solid var(--line)', borderRadius: 10, padding: 14, marginBottom: 12 }}>
      <div style={{ fontSize: 11, color: 'var(--ink-soft)', marginBottom: 8 }}>
        Requête au président du tribunal (voie rapide OHADA). L’entête et le signataire de votre société sont pré-remplis
        automatiquement.
      </div>
      <Champ label="Tribunal" value={f.tribunal} onChange={set('tribunal')} placeholder="Tribunal de Commerce Hors Classe de Dakar" />
      <Champ label="Adresse du débiteur" value={f.debiteurAdresse} onChange={set('debiteurAdresse')} />
      <Champ label="Fondement de la créance (optionnel)" value={f.fondement} onChange={set('fondement')} placeholder="résultant du contrat / des bons de commande du…" />
      <div style={{ display: 'flex', gap: 8 }}>
        <div style={{ flex: 1 }}><Champ label="Intérêts de droit (FCFA)" type="number" value={f.interets} onChange={set('interets')} /></div>
        <div style={{ flex: 1 }}><Champ label="Frais de recouvrement (FCFA)" type="number" value={f.fraisRecouvrement} onChange={set('fraisRecouvrement')} /></div>
      </div>
      <Champ label="Avocat / conseil (optionnel)" value={f.avocatNom} onChange={set('avocatNom')} placeholder="Maître …" />
      <Champ label="Lieu" value={f.lieu} onChange={set('lieu')} placeholder="Dakar" />
      <button
        className="primary"
        style={{ width: '100%', marginTop: 4 }}
        onClick={() =>
          onGenerer({
            tribunal: f.tribunal || undefined,
            debiteurAdresse: f.debiteurAdresse || undefined,
            fondement: f.fondement || undefined,
            interets: f.interets ? Number(f.interets) : undefined,
            fraisRecouvrement: f.fraisRecouvrement ? Number(f.fraisRecouvrement) : undefined,
            avocatNom: f.avocatNom || undefined,
            lieu: f.lieu || undefined,
          })
        }
      >
        Générer la requête en injonction de payer
      </button>
    </div>
  );
}

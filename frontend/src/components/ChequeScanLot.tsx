import { useEffect, useRef, useState } from 'react';
import { Camera, Check, CheckCheck, Sparkles, AlertTriangle } from 'lucide-react';
import { api, ApiError } from '../api/client';
import { useToast } from '../hooks/useToast';
import { fmtFCFA } from '../lib/constants';

// Scan d'un LOT de chèques : l'agent dépose les photos de la pile du jour, la
// plateforme lit montant + émetteur, identifie le client et propose la facture
// correspondante. L'agent relit et valide en un clic (par chèque, ou tout le lot).

interface FactureLite { id: string; numero: string; montant: number }
interface ClientLite { id: string; nom: string }

interface Proposition {
  fileIndex: number;
  page: number;
  pages: number;
  pdf: boolean;
  montant: number | null;
  banque: string | null;
  numeroCheque: string | null;
  dateCheque: string | null;
  tireur: string | null;
  dejaEnregistre: boolean;
  client: { id: string; nom: string; score: number } | null;
  facturesClient: FactureLite[];
  facturesProposees: string[];
  raison: string;
}

interface Ligne {
  file: File;
  apercu: string | null; // aperçu image ; null pour un PDF
  pdf: boolean;
  page: number;
  pages: number;
  montant: string;
  banque: string | null;
  numeroCheque: string | null;
  dateCheque: string | null;
  tireur: string | null;
  clientId: string | null;
  clientNom: string | null;
  score: number | null;
  facturesClient: FactureLite[];
  choisies: Set<string>;
  raison: string;
  dejaEnregistre: boolean;
  statut: 'attente' | 'encours' | 'ok';
  reglees: number;
  rechercheOuverte: boolean;
}

export function ChequeScanLot({ onEnregistre }: { onEnregistre?: () => void }) {
  const { showToast } = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const [analyse, setAnalyse] = useState(false);
  const [dispo, setDispo] = useState<boolean | null>(null);
  const [lignes, setLignes] = useState<Ligne[]>([]);
  const [clients, setClients] = useState<ClientLite[]>([]);
  const [recherche, setRecherche] = useState<Record<number, string>>({});
  const [diag, setDiag] = useState<{ model: string; ok: boolean; error?: string } | null>(null);
  const [diagEnCours, setDiagEnCours] = useState(false);

  async function verifierModele() {
    setDiagEnCours(true);
    setDiag(null);
    try {
      setDiag(await api.get<{ model: string; ok: boolean; error?: string }>('/api/cheques/scan/diagnostic'));
    } catch (err) {
      setDiag({ model: '?', ok: false, error: err instanceof ApiError ? err.message : 'Erreur' });
    } finally {
      setDiagEnCours(false);
    }
  }

  useEffect(() => {
    api.get<ClientLite[]>('/api/clients?all=true').then((l) => setClients(l.map((c) => ({ id: c.id, nom: c.nom })))).catch(() => {});
  }, []);

  function maj(i: number, patch: Partial<Ligne>) {
    setLignes((ls) => ls.map((l, idx) => (idx === i ? { ...l, ...patch } : l)));
  }

  async function analyserLot(files: File[]) {
    if (!files.length) return;
    // Aperçu image par fichier (les PDF n'ont pas de miniature <img>).
    const urls = files.map((f) => (f.type === 'application/pdf' ? null : URL.createObjectURL(f)));
    setLignes([]);
    setAnalyse(true);
    try {
      const fd = new FormData();
      files.forEach((f) => fd.append('files', f));
      const r = await api.upload<{ disponible: boolean; propositions: Proposition[] }>('/api/cheques/scan-lot', fd);
      setDispo(r.disponible);
      // Une proposition = un chèque (un PDF multi-pages en produit plusieurs).
      const ls: Ligne[] = r.propositions.map((p) => ({
        file: files[p.fileIndex],
        apercu: urls[p.fileIndex],
        pdf: p.pdf,
        page: p.page,
        pages: p.pages,
        montant: p.montant ? String(p.montant) : '',
        banque: p.banque, numeroCheque: p.numeroCheque, dateCheque: p.dateCheque, tireur: p.tireur,
        clientId: p.client?.id ?? null, clientNom: p.client?.nom ?? null, score: p.client?.score ?? null,
        facturesClient: p.facturesClient, choisies: new Set(p.facturesProposees),
        raison: p.raison, dejaEnregistre: p.dejaEnregistre, statut: 'attente', reglees: 0, rechercheOuverte: false,
      }));
      setLignes(ls);
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : "Échec de l'analyse du lot");
    } finally {
      setAnalyse(false);
    }
  }

  async function choisirClient(i: number, c: ClientLite) {
    maj(i, { clientId: c.id, clientNom: c.nom, score: null, rechercheOuverte: false, choisies: new Set(), facturesClient: [] });
    setRecherche((r) => ({ ...r, [i]: '' }));
    try {
      const detail = await api.get<{ factures: (FactureLite & { statut: string })[] }>(`/api/clients/${c.id}`);
      const impayees = (detail.factures ?? []).filter((f) => f.statut === 'impayee').map((f) => ({ id: f.id, numero: f.numero, montant: Math.round(f.montant) }));
      maj(i, { facturesClient: impayees });
    } catch { /* ignore */ }
  }

  async function valider(i: number) {
    const l = lignes[i];
    const m = Math.round(Number(l.montant));
    if (!Number.isFinite(m) || m <= 0) { showToast('Montant manquant sur ce chèque.'); return; }
    maj(i, { statut: 'encours' });
    try {
      const fd = new FormData();
      fd.append('file', l.file);
      fd.append('montant', String(m));
      if (l.banque) fd.append('banque', l.banque);
      if (l.numeroCheque) fd.append('numeroCheque', l.numeroCheque);
      if (l.dateCheque) fd.append('dateCheque', l.dateCheque);
      if (l.tireur) fd.append('tireur', l.tireur);
      if (l.clientId) fd.append('clientId', l.clientId);
      if (l.choisies.size) fd.append('factureIds', [...l.choisies].join(','));
      const r = await api.upload<{ facturesReglees: number }>('/api/cheques', fd);
      maj(i, { statut: 'ok', reglees: r.facturesReglees });
      onEnregistre?.();
    } catch (err) {
      maj(i, { statut: 'attente' });
      showToast(err instanceof ApiError ? err.message : 'Erreur');
    }
  }

  async function validerTout() {
    for (let i = 0; i < lignes.length; i++) {
      const l = lignes[i];
      if (l.statut === 'attente' && l.clientId && Number(l.montant) > 0) {
        // eslint-disable-next-line no-await-in-loop
        await valider(i);
      }
    }
  }

  const prets = lignes.filter((l) => l.statut === 'attente' && l.clientId && Number(l.montant) > 0).length;
  const faits = lignes.filter((l) => l.statut === 'ok').length;

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <div
        onClick={() => fileRef.current?.click()}
        style={{ padding: '22px', border: '1.5px dashed var(--line)', borderRadius: 12, textAlign: 'center', cursor: 'pointer', background: 'var(--surface, #fff)' }}
      >
        <Camera size={24} style={{ color: 'var(--accent)' }} />
        <div style={{ fontWeight: 600, marginTop: 8 }}>Déposez la pile de chèques du jour</div>
        <div style={{ fontSize: 12.5, color: 'var(--ink-soft)', marginTop: 3 }}>Photos ou <b>PDF scannés</b> (un PDF multi-pages = plusieurs chèques). La plateforme lit et rapproche automatiquement.</div>
        <input
          ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp,application/pdf" multiple style={{ display: 'none' }}
          onChange={(e) => { const fs = Array.from(e.target.files ?? []); if (fs.length) analyserLot(fs); e.target.value = ''; }}
        />
      </div>

      {/* Diagnostic du modèle : révèle l'erreur exacte si un modèle surchargé
          (ex. Sonnet) ne fonctionne pas et que l'extraction retombe sur Haiku. */}
      <div style={{ fontSize: 12, color: 'var(--ink-soft)' }}>
        <button type="button" onClick={verifierModele} disabled={diagEnCours} style={{ fontSize: 12, padding: '4px 10px' }}>
          {diagEnCours ? 'Vérification…' : 'Vérifier le modèle d’extraction'}
        </button>
        {diag && (
          <span style={{ marginLeft: 10 }}>
            {diag.ok ? (
              <span style={{ color: 'var(--success)' }}>✓ Modèle actif : <b>{diag.model}</b></span>
            ) : (
              <span style={{ color: 'var(--danger)' }}>✗ <b>{diag.model}</b> KO — {diag.error}</span>
            )}
          </span>
        )}
      </div>

      {analyse && (
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, color: 'var(--accent-dark)', fontSize: 13 }}>
          <Sparkles size={15} /> Lecture et rapprochement du lot en cours…
        </div>
      )}
      {dispo === false && (
        <div style={{ fontSize: 12.5, color: 'var(--amber)' }}>Extraction auto indisponible (clé API non configurée). Vous pouvez renseigner les champs à la main.</div>
      )}

      {lignes.length > 0 && !analyse && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <button className="primary" onClick={validerTout} disabled={!prets} style={{ display: 'inline-flex', alignItems: 'center', gap: 7 }}>
            <CheckCheck size={16} /> Tout valider ({prets} prêt{prets > 1 ? 's' : ''})
          </button>
          <span style={{ fontSize: 12.5, color: 'var(--ink-soft)' }}>{faits}/{lignes.length} enregistré{faits > 1 ? 's' : ''}</span>
        </div>
      )}

      <div style={{ display: 'grid', gap: 12 }}>
        {lignes.map((l, i) => {
          const matches = (recherche[i] ?? '').trim().length >= 2
            ? clients.filter((c) => c.nom.toLowerCase().includes((recherche[i] ?? '').trim().toLowerCase())).slice(0, 6)
            : [];
          return (
            <div key={i} style={{ display: 'flex', gap: 14, padding: 14, border: '1px solid var(--line)', borderRadius: 12, background: l.statut === 'ok' ? 'var(--accent-soft)' : 'var(--surface, #fff)', opacity: l.statut === 'ok' ? 0.85 : 1 }}>
              {l.apercu ? (
                <img src={l.apercu} alt="chèque" style={{ width: 108, height: 66, objectFit: 'cover', borderRadius: 8, flex: 'none', border: '1px solid var(--line)' }} />
              ) : (
                <div style={{ width: 108, height: 66, borderRadius: 8, flex: 'none', border: '1px solid var(--line)', background: 'var(--paper-2, #f1f3ef)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 2, color: 'var(--ink-soft)' }}>
                  <span style={{ fontSize: 11, fontWeight: 700, fontFamily: 'var(--font-mono, monospace)' }}>PDF</span>
                  {l.pages > 1 && <span style={{ fontSize: 10 }}>page {l.page + 1}/{l.pages}</span>}
                </div>
              )}
              <div style={{ flex: 1, minWidth: 0, display: 'grid', gap: 8 }}>
                {/* Ligne 1 : montant + tireur + statut */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                  <label style={{ fontSize: 11, color: 'var(--ink-soft)' }}>Montant</label>
                  <input type="number" value={l.montant} onChange={(e) => maj(i, { montant: e.target.value })} disabled={l.statut === 'ok'} style={{ width: 130 }} placeholder="FCFA" />
                  {l.tireur && <span style={{ fontSize: 12.5, color: 'var(--ink-soft)' }}>· émetteur : <b style={{ color: 'var(--ink)' }}>{l.tireur}</b></span>}
                  {l.dejaEnregistre && (
                    <span className="badge" data-tone="amber" title="Un chèque de ce numéro est déjà enregistré"><AlertTriangle size={11} /> Doublon possible</span>
                  )}
                  {l.statut === 'ok' && (
                    <span style={{ marginLeft: 'auto', color: 'var(--success)', fontSize: 12.5, fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                      <Check size={14} /> Enregistré{l.reglees ? ` · ${l.reglees} facture(s) réglée(s)` : ''}
                    </span>
                  )}
                </div>

                {l.statut !== 'ok' && (
                  <>
                    {/* Ligne 2 : client (proposé ou à choisir) */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                      {l.clientNom ? (
                        <>
                          <span className="badge" data-tone="accent">{l.clientNom}</span>
                          {l.score != null && <span style={{ fontSize: 11, color: 'var(--ink-soft)' }}>correspondance {l.score}%</span>}
                          <button type="button" onClick={() => maj(i, { rechercheOuverte: !l.rechercheOuverte })} style={{ fontSize: 12 }}>Changer</button>
                        </>
                      ) : (
                        <span style={{ fontSize: 12.5, color: 'var(--amber)', display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                          <AlertTriangle size={13} /> {l.raison} — choisissez le client
                        </span>
                      )}
                      {(l.rechercheOuverte || !l.clientNom) && (
                        <div style={{ position: 'relative', flex: 1, minWidth: 180 }}>
                          <input value={recherche[i] ?? ''} onChange={(e) => setRecherche((r) => ({ ...r, [i]: e.target.value }))} placeholder="Rechercher un client…" style={{ width: '100%' }} />
                          {matches.length > 0 && (
                            <div style={{ position: 'absolute', zIndex: 5, left: 0, right: 0, background: 'var(--surface, #fff)', border: '1px solid var(--line)', borderRadius: 8, marginTop: 2, maxHeight: 200, overflowY: 'auto', boxShadow: 'var(--shadow-md, 0 8px 24px rgba(0,0,0,.1))' }}>
                              {matches.map((c) => (
                                <button key={c.id} type="button" onClick={() => choisirClient(i, c)} style={{ display: 'block', width: '100%', textAlign: 'left', border: 'none', background: 'none', padding: '8px 12px', fontSize: 13, cursor: 'pointer' }}>{c.nom}</button>
                              ))}
                            </div>
                          )}
                        </div>
                      )}
                    </div>

                    {/* Ligne 3 : factures à régler */}
                    {l.facturesClient.length > 0 && (
                      <div style={{ fontSize: 11, color: 'var(--ink-soft)', marginTop: -2 }}>Cochez la facture réglée — le montant se remplit tout seul.</div>
                    )}
                    {l.facturesClient.length > 0 && (
                      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                        {l.facturesClient.map((f) => {
                          const on = l.choisies.has(f.id);
                          return (
                            <button
                              key={f.id} type="button"
                              onClick={() => {
                                const n = new Set(l.choisies);
                                on ? n.delete(f.id) : n.add(f.id);
                                // Remplit le montant du chèque avec la somme des factures cochées
                                // (le montant système fait foi ; l'agent peut corriger pour un règlement partiel).
                                const somme = l.facturesClient.filter((x) => n.has(x.id)).reduce((s, x) => s + x.montant, 0);
                                maj(i, { choisies: n, ...(n.size ? { montant: String(somme) } : {}) });
                              }}
                              style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '5px 10px', borderRadius: 8, fontSize: 12, border: on ? '1px solid var(--accent)' : '1px solid var(--line)', background: on ? 'var(--accent-soft)' : 'transparent', color: on ? 'var(--accent-dark)' : 'var(--ink)' }}
                            >
                              {on && <Check size={12} />} <span className="mono">{f.numero}</span> · {fmtFCFA(f.montant)}
                            </button>
                          );
                        })}
                      </div>
                    )}
                    {l.clientNom && l.facturesClient.length === 0 && (
                      <div style={{ fontSize: 12, color: 'var(--ink-soft)' }}>Aucune facture impayée pour ce client.</div>
                    )}

                    <div>
                      <button className="primary" onClick={() => valider(i)} disabled={l.statut === 'encours'} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                        <Check size={14} /> {l.statut === 'encours' ? 'Enregistrement…' : 'Valider ce chèque'}
                      </button>
                    </div>
                  </>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

import { useEffect, useState } from 'react';
import { AlertTriangle, CheckCircle2, Send } from 'lucide-react';
import { api, ApiError } from '../api/client';
import { fmtDate, fmtFCFA } from '../lib/constants';

// Réponse publique de l'Espace Assureur (GET /api/assureur-portail/:token).
interface FactureAssureur {
  id: string;
  numero: string;
  montant: number;
  dateEcheance: string | null;
  joursRetard: number;
}
interface MoyenPaiement {
  label: string;
  numero?: string | null;
  lien?: string | null;
  qrUrl?: string | null;
}
interface ReleveAssureur {
  assureurNom: string;
  assureurLogo: string | null;
  creancierNom: string;
  creancierLogoUrl: string | null;
  encours: number;
  nbFactures: number;
  factures: FactureAssureur[];
  paiement: { moyens: MoyenPaiement[]; instructions: string | null };
}

const TYPES = [
  { v: 'virement', label: 'Virement bancaire' },
  { v: 'cheque', label: 'Chèque' },
  { v: 'mobile', label: 'Mobile Money' },
  { v: 'espece', label: 'Espèces' },
];

// Page PUBLIQUE (sans authentification) présentée à un assureur (débiteur en
// tiers-payant) via un lien à token. Il consulte son relevé avec le créancier
// (opticien, clinique…) et signale ses règlements — co-brandée aux deux logos.
export function EspaceAssureurView({ token }: { token: string }) {
  const [data, setData] = useState<ReleveAssureur | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [type, setType] = useState('virement');
  const [montant, setMontant] = useState('');
  const [reference, setReference] = useState('');
  const [date, setDate] = useState('');
  const [envoi, setEnvoi] = useState(false);
  const [envoye, setEnvoye] = useState(false);
  // Factures cochées par l'assureur : leur total pré-remplit le montant et elles
  // sont transmises au créancier (rapprochement en un clic de son côté).
  const [selection, setSelection] = useState<Set<string>>(new Set());

  // Applique une nouvelle sélection et aligne le montant sur la somme cochée.
  function appliquerSelection(next: Set<string>) {
    setSelection(next);
    const total = (data?.factures ?? []).filter((f) => next.has(f.id)).reduce((s, f) => s + f.montant, 0);
    setMontant(next.size ? String(total) : '');
  }
  function toggleFacture(id: string) {
    const next = new Set(selection);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    appliquerSelection(next);
  }
  function toggleTout() {
    const toutes = data?.factures ?? [];
    appliquerSelection(selection.size === toutes.length ? new Set() : new Set(toutes.map((f) => f.id)));
  }

  function charger() {
    setLoading(true);
    api
      .get<ReleveAssureur>(`/api/assureur-portail/${token}`)
      .then((d) => setData(d))
      .catch((e) => setError(e instanceof ApiError ? e.message : 'Lien invalide ou expiré.'))
      .finally(() => setLoading(false));
  }
  useEffect(charger, [token]);

  async function signaler() {
    if (!montant) return;
    setEnvoi(true);
    try {
      await api.post(`/api/assureur-portail/${token}/reglement`, {
        type,
        montant: Number(montant),
        reference: reference.trim() || undefined,
        date: date || undefined,
        factureIds: selection.size ? [...selection] : undefined,
      });
      setEnvoye(true);
      setMontant('');
      setReference('');
      setDate('');
      setSelection(new Set());
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Échec de l'envoi.");
    } finally {
      setEnvoi(false);
    }
  }

  if (loading) return <Centre>Chargement…</Centre>;
  if (error && !data)
    return (
      <Centre>
        <AlertTriangle size={22} style={{ opacity: 0.5, marginBottom: 8 }} />
        <div>{error}</div>
      </Centre>
    );
  if (!data) return null;

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)', padding: '24px 16px' }}>
      <div style={{ maxWidth: 640, margin: '0 auto' }}>
        {/* Entête co-brandée : créancier ↔ assureur */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 18, flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            {data.creancierLogoUrl ? (
              <img src={data.creancierLogoUrl} alt={data.creancierNom} style={{ height: 34, maxWidth: 120, objectFit: 'contain' }} />
            ) : null}
            <div>
              <div style={{ fontWeight: 700, fontSize: 16 }}>{data.creancierNom}</div>
              <div style={{ fontSize: 12, color: 'var(--ink-soft)' }}>Espace assureur</div>
            </div>
          </div>
          {data.assureurLogo ? (
            <img src={data.assureurLogo} alt={data.assureurNom} style={{ height: 30, maxWidth: 120, objectFit: 'contain' }} />
          ) : (
            <div style={{ fontWeight: 600, fontSize: 13, color: 'var(--ink-soft)' }}>{data.assureurNom}</div>
          )}
        </div>

        <div className="table-card" style={{ padding: 20 }}>
          <div style={{ fontSize: 13, color: 'var(--ink-soft)' }}>Bonjour {data.assureurNom},</div>
          <div style={{ marginTop: 12, fontSize: 13, lineHeight: 1.5 }}>
            Voici le relevé de votre compte auprès de {data.creancierNom}. Solde restant dû à ce jour :
          </div>
          <div className="mono" style={{ fontSize: 30, fontWeight: 800, margin: '8px 0 4px', color: 'var(--danger)' }}>
            {fmtFCFA(data.encours)}
          </div>
          <div style={{ fontSize: 12, color: 'var(--ink-soft)' }}>
            {data.nbFactures} facture{data.nbFactures > 1 ? 's' : ''} en attente de règlement.
          </div>

          {data.factures.length > 0 && (
            <div style={{ marginTop: 16 }}>
              <div className="section-title">Factures en attente</div>
              <div style={{ fontSize: 12, color: 'var(--ink-soft)', marginBottom: 6 }}>
                Cochez la ou les factures que vous réglez : le montant se remplit automatiquement.
              </div>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
                  <thead>
                    <tr style={{ textAlign: 'left', color: 'var(--ink-soft)' }}>
                      <th style={{ padding: '6px 4px', width: 28 }}>
                        <input
                          type="checkbox"
                          checked={selection.size === data.factures.length && data.factures.length > 0}
                          onChange={toggleTout}
                          aria-label="Tout sélectionner"
                        />
                      </th>
                      <th style={{ padding: '6px 4px', fontWeight: 600 }}>N° facture</th>
                      <th style={{ padding: '6px 4px', fontWeight: 600 }}>Échéance</th>
                      <th style={{ padding: '6px 4px', fontWeight: 600, textAlign: 'right' }}>Retard</th>
                      <th style={{ padding: '6px 4px', fontWeight: 600, textAlign: 'right' }}>Montant</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.factures.map((f) => {
                      const coche = selection.has(f.id);
                      return (
                        <tr
                          key={f.id}
                          onClick={() => toggleFacture(f.id)}
                          style={{ borderTop: '1px solid var(--line-soft)', cursor: 'pointer', background: coche ? 'var(--accent-soft)' : undefined }}
                        >
                          <td style={{ padding: '6px 4px' }}>
                            <input type="checkbox" checked={coche} onChange={() => toggleFacture(f.id)} onClick={(e) => e.stopPropagation()} aria-label={`Sélectionner ${f.numero}`} />
                          </td>
                          <td className="mono" style={{ padding: '6px 4px' }}>{f.numero}</td>
                          <td style={{ padding: '6px 4px' }}>{f.dateEcheance ? fmtDate(f.dateEcheance) : '—'}</td>
                          <td style={{ padding: '6px 4px', textAlign: 'right', color: f.joursRetard > 0 ? 'var(--danger)' : 'var(--ink-soft)' }}>
                            {f.joursRetard > 0 ? `${f.joursRetard} j` : '—'}
                          </td>
                          <td className="mono" style={{ padding: '6px 4px', textAlign: 'right' }}>{fmtFCFA(f.montant)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              {selection.size > 0 && (
                <div style={{ marginTop: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 13, fontWeight: 600 }}>
                  <span>{selection.size} facture{selection.size > 1 ? 's' : ''} sélectionnée{selection.size > 1 ? 's' : ''}</span>
                  <span className="mono">{fmtFCFA(data.factures.filter((f) => selection.has(f.id)).reduce((s, f) => s + f.montant, 0))}</span>
                </div>
              )}
            </div>
          )}

          {(data.paiement.moyens.length > 0 || data.paiement.instructions) && (
            <PayerBlock paiement={data.paiement} montant={data.encours} />
          )}
        </div>

        {/* Signaler un règlement */}
        <div className="table-card" style={{ padding: 20, marginTop: 16 }}>
          <div style={{ fontWeight: 700, marginBottom: 4 }}>Signaler un règlement</div>
          <div style={{ fontSize: 12.5, color: 'var(--ink-soft)', marginBottom: 14 }}>
            Vous avez effectué un paiement ? Signalez-le ici : {data.creancierNom} le rapprochera de vos factures.
          </div>
          {envoye ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--accent-dark)' }}>
              <CheckCircle2 size={18} /> Votre règlement a bien été signalé. Merci — il sera vérifié puis rapproché.
              <button style={{ marginLeft: 'auto' }} onClick={() => setEnvoye(false)}>
                Signaler un autre
              </button>
            </div>
          ) : (
            <>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <label style={{ flex: '1 1 150px' }}>
                  <span style={{ display: 'block', fontSize: 11, color: 'var(--ink-soft)', marginBottom: 3 }}>Moyen de paiement</span>
                  <select value={type} onChange={(e) => setType(e.target.value)} style={{ width: '100%' }}>
                    {TYPES.map((t) => (
                      <option key={t.v} value={t.v}>{t.label}</option>
                    ))}
                  </select>
                </label>
                <label style={{ flex: '1 1 150px' }}>
                  <span style={{ display: 'block', fontSize: 11, color: 'var(--ink-soft)', marginBottom: 3 }}>Montant réglé (FCFA)</span>
                  <input type="number" value={montant} onChange={(e) => setMontant(e.target.value)} style={{ width: '100%' }} />
                </label>
              </div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 10 }}>
                <label style={{ flex: '1 1 150px' }}>
                  <span style={{ display: 'block', fontSize: 11, color: 'var(--ink-soft)', marginBottom: 3 }}>Référence (n° virement/chèque)</span>
                  <input type="text" value={reference} onChange={(e) => setReference(e.target.value)} style={{ width: '100%' }} />
                </label>
                <label style={{ flex: '1 1 150px' }}>
                  <span style={{ display: 'block', fontSize: 11, color: 'var(--ink-soft)', marginBottom: 3 }}>Date du règlement</span>
                  <input type="date" value={date} onChange={(e) => setDate(e.target.value)} style={{ width: '100%' }} />
                </label>
              </div>
              {error && <div style={{ color: 'var(--danger)', fontSize: 12.5, marginTop: 8 }}>{error}</div>}
              <button className="primary" style={{ marginTop: 12 }} disabled={envoi || !montant} onClick={signaler}>
                <Send size={14} /> Signaler mon règlement
              </button>
            </>
          )}
        </div>

        <div style={{ textAlign: 'center', fontSize: 11, color: 'var(--ink-soft)', marginTop: 18 }}>
          Lien sécurisé — {data.creancierNom}. Ne le partagez pas.
        </div>
      </div>
    </div>
  );
}

function Centre({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', textAlign: 'center', color: 'var(--ink-soft)', padding: 24 }}>
      <div>{children}</div>
    </div>
  );
}

// Coordonnées de paiement du créancier (Wave, Julaya, virement…).
function PayerBlock({ paiement, montant }: { paiement: ReleveAssureur['paiement']; montant: number }) {
  const moyens = paiement.moyens ?? [];
  const instructions = paiement.instructions?.trim();
  if (!moyens.length && !instructions) return null;
  return (
    <div style={{ marginTop: 16, padding: '16px 18px', borderRadius: 12, border: '1px solid var(--line)', background: 'var(--accent-soft)' }}>
      <div style={{ fontSize: 11.5, fontWeight: 700, letterSpacing: '.06em', textTransform: 'uppercase', color: 'var(--accent-dark)', marginBottom: 8 }}>
        Coordonnées de règlement
      </div>
      <div style={{ display: 'grid', gap: 14 }}>
        {moyens.map((m, i) => {
          const lien = m.lien?.trim() ? m.lien.trim().replace(/\{montant\}/g, String(Math.round(montant))) : null;
          const qr = m.qrUrl?.trim() || null;
          const num = m.numero?.trim() || null;
          return (
            <div key={i}>
              <div style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--ink)', marginBottom: 6 }}>{m.label}</div>
              {lien && (
                <a
                  href={lien}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ display: 'inline-flex', alignItems: 'center', gap: 7, background: 'var(--accent)', color: '#fff', fontWeight: 700, fontSize: 14, textDecoration: 'none', padding: '10px 18px', borderRadius: 10 }}
                >
                  Payer en ligne →
                </a>
              )}
              {num && <div style={{ fontSize: 13.5, marginTop: lien ? 8 : 0 }}><b className="mono">{num}</b></div>}
              {qr && (
                <div style={{ marginTop: lien || num ? 10 : 0 }}>
                  <img src={qr} alt={`QR ${m.label}`} width={150} height={150} style={{ width: 150, height: 150, border: '1px solid var(--line)', borderRadius: 10, background: '#fff', padding: 6 }} />
                </div>
              )}
            </div>
          );
        })}
      </div>
      {instructions && (
        <div style={{ marginTop: 14, fontSize: 12.5, color: 'var(--ink-soft)', lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>
          {instructions}
        </div>
      )}
    </div>
  );
}

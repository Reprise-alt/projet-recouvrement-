import { useEffect, useState } from 'react';
import { AlertTriangle, CheckCircle2, Download, FileText, Send } from 'lucide-react';
import { api, ApiError, downloadFile } from '../api/client';
import { PortailPublic } from '../api/types';
import { fmtDate, fmtFCFA } from '../lib/constants';
import { EntityLogo } from './EntityLogo';

// Page PUBLIQUE (aucune authentification) présentée au débiteur via un lien à
// token. Il consulte sa dette, télécharge le commandement, et propose un
// règlement / échéancier au créancier.
export function PortailDebiteurView({ token }: { token: string }) {
  const [data, setData] = useState<PortailPublic | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [message, setMessage] = useState('');
  const [montant, setMontant] = useState('');
  const [nbEch, setNbEch] = useState('');
  const [premier, setPremier] = useState('');
  const [envoi, setEnvoi] = useState(false);
  const [envoye, setEnvoye] = useState(false);

  function charger() {
    setLoading(true);
    api
      .get<PortailPublic>(`/api/contentieux-portail/${token}`)
      .then((d) => setData(d))
      .catch((e) => setError(e instanceof ApiError ? e.message : 'Lien invalide ou expiré.'))
      .finally(() => setLoading(false));
  }
  useEffect(charger, [token]);

  async function proposer() {
    if (!message.trim() && !montant && !nbEch) return;
    setEnvoi(true);
    try {
      await api.post(`/api/contentieux-portail/${token}/proposition`, {
        message: message.trim() || undefined,
        montantPropose: montant ? Number(montant) : undefined,
        nbEcheances: nbEch ? Number(nbEch) : undefined,
        premierPaiement: premier || undefined,
      });
      setEnvoye(true);
      setMessage('');
      setMontant('');
      setNbEch('');
      setPremier('');
      charger();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Échec de l'envoi.");
    } finally {
      setEnvoi(false);
    }
  }

  if (loading) return <Centre>Chargement…</Centre>;
  if (error && !data) return <Centre><AlertTriangle size={22} style={{ opacity: 0.5, marginBottom: 8 }} /><div>{error}</div></Centre>;
  if (!data) return null;

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)', padding: '24px 16px' }}>
      <div style={{ maxWidth: 620, margin: '0 auto' }}>
        {/* Entête créancier */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 18 }}>
          <EntityLogo entite={data.entite} size={34} />
          <div>
            <div style={{ fontWeight: 700, fontSize: 16 }}>{data.creancierNom}</div>
            <div style={{ fontSize: 12, color: 'var(--ink-soft)' }}>Espace de règlement — dossier {data.reference}</div>
          </div>
        </div>

        <div className="table-card" style={{ padding: 20 }}>
          <div style={{ fontSize: 13, color: 'var(--ink-soft)' }}>Bonjour {data.debiteurNom},</div>
          {data.clos ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--accent-dark)', marginTop: 12 }}>
              <CheckCircle2 size={18} /> Ce dossier est clôturé. Aucun règlement n’est attendu via cet espace.
            </div>
          ) : (
            <>
              {data.procedureEngagee && (
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    marginTop: 12,
                    padding: '9px 12px',
                    borderRadius: 8,
                    border: '1px solid var(--amber)',
                    background: 'var(--amber-soft)',
                    color: 'var(--amber-dark)',
                    fontSize: 12.5,
                  }}
                >
                  <AlertTriangle size={16} style={{ flexShrink: 0 }} />
                  Une procédure de recouvrement est engagée. Un règlement — même échelonné — reste possible et
                  mettrait fin à la procédure.
                </div>
              )}
              <div style={{ marginTop: 12, fontSize: 13, lineHeight: 1.5 }}>
                Nos écritures font apparaître à ce jour un solde impayé de :
              </div>
              <div className="mono" style={{ fontSize: 30, fontWeight: 800, margin: '8px 0 4px', color: 'var(--danger)' }}>
                {fmtFCFA(data.montantDu)}
              </div>

              {/* Payer maintenant (Mobile Money) */}
              {!data.clos && <PayerBlock paiement={data.paiement} montant={data.montantDu} reference={data.reference} />}

              {/* Factures */}
              {data.factures.length > 0 && (
                <div style={{ marginTop: 14 }}>
                  <div className="section-title">Factures concernées</div>
                  {data.factures.map((f) => (
                    <div key={f.numero} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid var(--line-soft)', fontSize: 12.5 }}>
                      <span>
                        <span className="mono">{f.numero}</span>
                        {f.dateEcheance ? ` · éch. ${fmtDate(f.dateEcheance)}` : ''}
                      </span>
                      <span className="mono">{fmtFCFA(f.montant)}</span>
                    </div>
                  ))}
                </div>
              )}

              {/* Commandement */}
              {data.commandementDisponible && (
                <button
                  style={{ marginTop: 16 }}
                  onClick={() => downloadFile(`/api/contentieux-portail/${token}/commandement`, `commandement-${data.reference}.pdf`).catch(() => setError('Téléchargement impossible.'))}
                >
                  <FileText size={14} /> Télécharger le commandement de payer
                </button>
              )}

              {/* Statut proposition précédente */}
              {data.derniereProposition && (
                <div style={{ marginTop: 16, fontSize: 12.5, padding: '9px 12px', borderRadius: 8, background: 'var(--surface)', border: '1px solid var(--line)' }}>
                  Votre dernière proposition ({fmtDate(data.derniereProposition.createdAt)}) :{' '}
                  <strong>
                    {data.derniereProposition.statut === 'acceptee' ? 'acceptée' : data.derniereProposition.statut === 'refusee' ? 'refusée' : 'en cours d’examen'}
                  </strong>
                  .
                </div>
              )}
            </>
          )}
        </div>

        {/* Formulaire de proposition */}
        {!data.clos && (
          <div className="table-card" style={{ padding: 20, marginTop: 16 }}>
            <div style={{ fontWeight: 700, marginBottom: 4 }}>
              {data.procedureEngagee ? 'Proposer un accord de règlement' : 'Régler ou proposer un échéancier'}
            </div>
            <div style={{ fontSize: 12.5, color: 'var(--ink-soft)', marginBottom: 14 }}>
              {data.procedureEngagee
                ? 'Proposez un règlement (immédiat ou échelonné). En cas d’accord, la procédure en cours sera arrêtée.'
                : 'Vous pouvez proposer un plan de paiement ou nous laisser un message. Notre équipe recouvrement vous recontactera.'}
            </div>
            {envoye ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--accent-dark)' }}>
                <CheckCircle2 size={18} /> Votre proposition a bien été transmise. Merci.
              </div>
            ) : (
              <>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <label style={{ flex: '1 1 150px' }}>
                    <span style={{ display: 'block', fontSize: 11, color: 'var(--ink-soft)', marginBottom: 3 }}>Montant proposé (FCFA)</span>
                    <input type="number" value={montant} onChange={(e) => setMontant(e.target.value)} style={{ width: '100%' }} />
                  </label>
                  <label style={{ flex: '1 1 120px' }}>
                    <span style={{ display: 'block', fontSize: 11, color: 'var(--ink-soft)', marginBottom: 3 }}>Nb. d’échéances</span>
                    <input type="number" value={nbEch} onChange={(e) => setNbEch(e.target.value)} style={{ width: '100%' }} />
                  </label>
                  <label style={{ flex: '1 1 150px' }}>
                    <span style={{ display: 'block', fontSize: 11, color: 'var(--ink-soft)', marginBottom: 3 }}>Premier paiement</span>
                    <input type="date" value={premier} onChange={(e) => setPremier(e.target.value)} style={{ width: '100%' }} />
                  </label>
                </div>
                <label style={{ display: 'block', marginTop: 10 }}>
                  <span style={{ display: 'block', fontSize: 11, color: 'var(--ink-soft)', marginBottom: 3 }}>Message (optionnel)</span>
                  <textarea rows={3} value={message} onChange={(e) => setMessage(e.target.value)} style={{ width: '100%', fontFamily: 'inherit', fontSize: 13, resize: 'vertical' }} />
                </label>
                {error && <div style={{ color: 'var(--danger)', fontSize: 12.5, marginTop: 8 }}>{error}</div>}
                <button className="primary" style={{ marginTop: 12 }} disabled={envoi || (!message.trim() && !montant && !nbEch)} onClick={proposer}>
                  <Send size={14} /> Envoyer ma proposition
                </button>
              </>
            )}
          </div>
        )}

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

// Bloc « Payer maintenant » — Mobile Money (Wave / Orange Money) avec le montant
// dû et la référence du dossier. Rien à afficher si le créancier n'a renseigné
// aucun moyen.
function PayerBlock({
  paiement,
  montant,
  reference,
}: {
  paiement: PortailPublic['paiement'];
  montant: number;
  reference: string;
}) {
  const wave = paiement?.waveLien?.trim();
  const qr = paiement?.waveQrUrl?.trim();
  const om = paiement?.orangeMoneyNumero?.trim();
  const instructions = paiement?.instructions?.trim();
  if (!wave && !qr && !om && !instructions) return null;
  const lienWave = wave ? wave.replace(/\{montant\}/g, String(Math.round(montant))) : null;

  return (
    <div style={{ marginTop: 16, padding: '16px 18px', borderRadius: 12, border: '1px solid var(--line)', background: 'var(--accent-soft)' }}>
      <div style={{ fontSize: 11.5, fontWeight: 700, letterSpacing: '.06em', textTransform: 'uppercase', color: 'var(--accent-dark)', marginBottom: 8 }}>
        Payer maintenant
      </div>
      <div style={{ fontSize: 12.5, color: 'var(--ink-soft)', marginBottom: 12 }}>
        Montant à régler : <b style={{ color: 'var(--ink)' }}>{fmtFCFA(montant)}</b> · Référence : <span className="mono">{reference}</span>
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center' }}>
        {lienWave && (
          <a
            href={lienWave}
            target="_blank"
            rel="noopener noreferrer"
            style={{ display: 'inline-flex', alignItems: 'center', gap: 7, background: 'var(--accent)', color: '#fff', fontWeight: 700, fontSize: 14, textDecoration: 'none', padding: '11px 20px', borderRadius: 10 }}
          >
            Payer en ligne →
          </a>
        )}
        {om && (
          <div style={{ fontSize: 13.5 }}>
            Orange&nbsp;Money : <b className="mono">{om}</b>
          </div>
        )}
      </div>
      {qr && (
        <div style={{ marginTop: 12 }}>
          <img
            src={qr}
            alt="QR de paiement"
            width={160}
            height={160}
            style={{ width: 160, height: 160, border: '1px solid var(--line)', borderRadius: 10, background: '#fff', padding: 6 }}
          />
          <div style={{ fontSize: 12, color: 'var(--ink-soft)', marginTop: 6 }}>
            Scannez ce code pour payer {fmtFCFA(montant)}.
          </div>
        </div>
      )}
      {instructions && (
        <div style={{ marginTop: 12, fontSize: 12.5, color: 'var(--ink-soft)', lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>
          {instructions}
        </div>
      )}
    </div>
  );
}

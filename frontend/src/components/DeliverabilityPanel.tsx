import { useEffect, useState } from 'react';
import { AlertTriangle, CheckCircle2, MailCheck, Search, XCircle } from 'lucide-react';
import { api, ApiError } from '../api/client';

// Vérificateur de délivrabilité e-mail : l'admin saisit son domaine, on affiche
// un diagnostic SPF / DKIM / DMARC / MX avec des conseils. Pur diagnostic.

type Etat = 'ok' | 'attention' | 'absent';

interface Report {
  domain: string;
  spf: { etat: Etat; record: string | null; detail: string };
  dmarc: { etat: Etat; record: string | null; politique: string | null; detail: string };
  dkim: { etat: Etat; selecteurs: string[]; detail: string };
  mx: { present: boolean; hotes: string[]; fournisseur: string | null };
  resume: { etat: Etat; message: string };
}

const COULEUR: Record<Etat, { bg: string; fg: string }> = {
  ok: { bg: 'var(--success-soft)', fg: 'var(--success)' },
  attention: { bg: 'var(--amber-soft)', fg: 'var(--amber)' },
  absent: { bg: 'var(--danger-soft)', fg: 'var(--danger)' },
};

function Icone({ etat, size = 18 }: { etat: Etat; size?: number }) {
  if (etat === 'ok') return <CheckCircle2 size={size} style={{ color: 'var(--success)' }} />;
  if (etat === 'attention') return <AlertTriangle size={size} style={{ color: 'var(--amber)' }} />;
  return <XCircle size={size} style={{ color: 'var(--danger)' }} />;
}

export function DeliverabilityPanel({ onClose, domaineInitial }: { onClose: () => void; domaineInitial?: string | null }) {
  const [domaine, setDomaine] = useState(domaineInitial ?? '');
  const [report, setReport] = useState<Report | null>(null);
  const [busy, setBusy] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);

  async function verifier(d?: string) {
    setBusy(true);
    setErreur(null);
    try {
      const q = (d ?? domaine).trim();
      const r = await api.get<Report>(`/api/organisation/deliverability${q ? `?domain=${encodeURIComponent(q)}` : ''}`);
      setReport(r);
      setDomaine(r.domain);
    } catch (err) {
      setErreur(err instanceof ApiError ? err.message : 'Vérification impossible');
    } finally {
      setBusy(false);
    }
  }

  // Vérification automatique au premier affichage (domaine de l'organisation).
  useEffect(() => {
    verifier(domaineInitial ?? '');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="modal-overlay open" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ width: 'min(640px, 96%)' }}>
        <h2 style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 4 }}>
          <MailCheck size={20} style={{ color: 'var(--accent)' }} /> Délivrabilité e-mail
        </h2>
        <div style={{ color: 'var(--ink-soft)', fontSize: 13, marginBottom: 16 }}>
          Vérifiez que votre domaine est configuré pour que vos relances arrivent en boîte de réception, pas en spam.
        </div>

        <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
          <input
            value={domaine}
            onChange={(e) => setDomaine(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && verifier()}
            placeholder="votre-domaine.sn"
            style={{ flex: 1 }}
          />
          <button className="primary" onClick={() => verifier()} disabled={busy} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, flex: 'none' }}>
            <Search size={14} /> {busy ? 'Analyse…' : 'Vérifier'}
          </button>
        </div>

        {erreur && <div style={{ color: 'var(--danger)', fontSize: 13, marginBottom: 12 }}>{erreur}</div>}

        {report && (
          <>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 14px', borderRadius: 10, background: COULEUR[report.resume.etat].bg, color: COULEUR[report.resume.etat].fg, marginBottom: 14, fontSize: 13.5, fontWeight: 600 }}>
              <Icone etat={report.resume.etat} /> {report.resume.message}
            </div>

            <div style={{ display: 'grid', gap: 10 }}>
              <Ligne titre="SPF" etat={report.spf.etat} detail={report.spf.detail} code={report.spf.record} />
              <Ligne titre="DKIM" etat={report.dkim.etat} detail={report.dkim.detail} />
              <Ligne
                titre="DMARC"
                etat={report.dmarc.etat}
                detail={report.dmarc.detail}
                code={report.dmarc.record}
              />
            </div>

            <div style={{ fontSize: 12, color: 'var(--ink-soft)', marginTop: 14 }}>
              {report.mx.present ? (
                <>
                  Messagerie détectée : <b>{report.mx.fournisseur ?? report.mx.hotes[0] ?? '—'}</b>. Le DKIM se configure chez ce
                  fournisseur.
                </>
              ) : (
                'Aucun serveur de messagerie (MX) détecté sur ce domaine.'
              )}
            </div>
          </>
        )}

        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 18 }}>
          <button onClick={onClose}>Fermer</button>
        </div>
      </div>
    </div>
  );
}

function Ligne({ titre, etat, detail, code }: { titre: string; etat: Etat; detail: string; code?: string | null }) {
  return (
    <div style={{ display: 'flex', gap: 12, padding: '12px 14px', borderRadius: 10, border: '1px solid var(--line)' }}>
      <div style={{ flex: 'none', marginTop: 1 }}>
        <Icone etat={etat} />
      </div>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontWeight: 700, fontSize: 13.5 }}>{titre}</div>
        <div style={{ fontSize: 12.5, color: 'var(--ink-soft)', marginTop: 2, lineHeight: 1.45 }}>{detail}</div>
        {code && (
          <div className="mono" style={{ fontSize: 11, color: 'var(--ink-soft)', marginTop: 6, wordBreak: 'break-all', background: 'var(--paper-2, #f2f4f2)', padding: '6px 8px', borderRadius: 6 }}>
            {code}
          </div>
        )}
      </div>
    </div>
  );
}

import { useState } from 'react';
import { useResource } from '../hooks/useResource';
import { api, ApiError } from '../api/client';
import { PALIERS } from '../lib/constants';

// Journal des relances (historique des envois/actions) — filtrable par période
// (jour / semaine / mois) et par palier, avec un récap en tête. Lecture seule.
interface JournalItem {
  id: string;
  date: string;
  clientNom: string;
  palier: number;
  palierLabel: string;
  note: string | null;
  // Vrai si le message exact envoyé a été archivé (chargeable à la demande).
  emailArchive?: boolean;
  // Vrai si, faute d'archive, l'aperçu peut être reconstitué (envoi antérieur).
  emailReconstituable?: boolean;
}
// Contenu de l'email archivé (ou reconstitué), chargé via /journal/:id/email.
interface EmailArchive {
  id: string;
  date: string;
  clientNom: string;
  palierLabel: string;
  sujet: string | null;
  to: string | null;
  cc: string | null;
  html: string | null;
  texte: string | null;
  // Vrai quand le contenu est une reconstitution (pas l'archive exacte).
  reconstitue?: boolean;
}
interface RecapItem {
  palier: number;
  palierLabel: string;
  count: number;
}
interface JournalResponse {
  periode: string;
  total: number;
  recap: RecapItem[];
  items: JournalItem[];
}

const PERIODES = [
  { v: 'jour', l: 'Jour' },
  { v: 'semaine', l: 'Semaine' },
  { v: 'mois', l: 'Mois' },
];

const fmtDateHeure = (iso: string) =>
  new Date(iso).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });

export function JournalRelances() {
  const [periode, setPeriode] = useState('semaine');
  const [palier, setPalier] = useState('');
  const path = `/api/relances/journal?periode=${periode}${palier ? `&palier=${palier}` : ''}`;
  const { data, loading } = useResource<JournalResponse>(path);

  // Aperçu de l'email archivé (modale). `chargement` distingue le clic en cours.
  const [apercu, setApercu] = useState<EmailArchive | null>(null);
  const [chargementId, setChargementId] = useState<string | null>(null);
  const [erreurApercu, setErreurApercu] = useState<string | null>(null);

  const ouvrirEmail = async (id: string) => {
    setChargementId(id);
    setErreurApercu(null);
    try {
      const email = await api.get<EmailArchive>(`/api/relances/journal/${id}/email`);
      setApercu(email);
    } catch (err) {
      setErreurApercu(err instanceof ApiError ? err.message : 'Impossible de charger l’email.');
    } finally {
      setChargementId(null);
    }
  };

  return (
    <div>
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', margin: '4px 0 14px' }}>
        <div style={{ display: 'inline-flex', border: '1px solid var(--line)', borderRadius: 999, overflow: 'hidden' }}>
          {PERIODES.map((p) => (
            <button
              key={p.v}
              type="button"
              onClick={() => setPeriode(p.v)}
              style={{
                border: 'none',
                cursor: 'pointer',
                padding: '6px 14px',
                fontSize: 12.5,
                fontWeight: 600,
                background: periode === p.v ? 'var(--accent, #177f5e)' : 'transparent',
                color: periode === p.v ? '#fff' : 'var(--ink)',
              }}
            >
              {p.l}
            </button>
          ))}
        </div>
        <select value={palier} onChange={(e) => setPalier(e.target.value)} style={{ width: 'auto' }}>
          <option value="">Tous les paliers</option>
          {PALIERS.map((p, i) => (p ? <option key={i} value={i}>{p.label}</option> : null))}
        </select>
      </div>

      {loading || !data ? (
        <div className="empty-state">Chargement…</div>
      ) : data.total === 0 ? (
        <div className="empty-state">
          <h3>Aucun envoi sur la période</h3>
          <p>Aucune relance enregistrée pour ce filtre. Élargissez la période ou activez l’envoi automatique.</p>
        </div>
      ) : (
        <>
          <div className="rv-summary" style={{ flexWrap: 'wrap' }}>
            <b>{data.total}</b> envoi{data.total > 1 ? 's' : ''} sur la période
            {data.recap.map((r) => (
              <span key={r.palier} className="badge" data-tone={PALIERS[r.palier]?.tone ?? 'amber'} style={{ marginLeft: 8 }}>
                {r.palierLabel} · {r.count}
              </span>
            ))}
          </div>
          {erreurApercu && (
            <div className="empty-state" style={{ color: 'var(--danger, #b42318)', padding: '8px 0' }}>{erreurApercu}</div>
          )}
          <table>
            <thead>
              <tr>
                <th>Date</th>
                <th>Client</th>
                <th>Palier</th>
                <th>Détail</th>
                <th>Email</th>
              </tr>
            </thead>
            <tbody>
              {data.items.map((it) => (
                <tr key={it.id}>
                  <td className="mono" style={{ whiteSpace: 'nowrap' }}>{fmtDateHeure(it.date)}</td>
                  <td>{it.clientNom}</td>
                  <td>
                    <span className="badge" data-tone={PALIERS[it.palier]?.tone ?? 'amber'}>
                      {it.palierLabel}
                    </span>
                  </td>
                  <td style={{ color: 'var(--ink-soft)', fontSize: 12.5 }}>{it.note ?? '—'}</td>
                  <td style={{ whiteSpace: 'nowrap' }}>
                    {it.emailArchive || it.emailReconstituable ? (
                      <button
                        type="button"
                        style={{ fontSize: 12, padding: '4px 10px' }}
                        disabled={chargementId === it.id}
                        onClick={() => ouvrirEmail(it.id)}
                        title={it.emailArchive ? 'Message exact envoyé' : 'Aperçu reconstitué (archive indisponible pour cet envoi)'}
                      >
                        {chargementId === it.id ? 'Chargement…' : it.emailArchive ? 'Voir l’email' : 'Voir l’aperçu'}
                      </button>
                    ) : (
                      <span style={{ color: 'var(--ink-soft)', fontSize: 12 }}>—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}

      {apercu && <EmailApercuModal email={apercu} onClose={() => setApercu(null)} />}
    </div>
  );
}

// Modale d'aperçu de l'email exact envoyé. Le HTML de marque est rendu dans une
// iframe `sandbox` (aucun script, isolée du DOM de l'app) ; à défaut, le corps
// texte est affiché en `<pre>`. Fenêtre en lecture seule (relecture / preuve).
const fmtDateHeurePleine = (iso: string) =>
  new Date(iso).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });

function EmailApercuModal({ email, onClose }: { email: EmailArchive; onClose: () => void }) {
  return (
    <div
      role="dialog"
      aria-modal="true"
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(14,29,51,.45)',
        display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '5vh 16px', overflow: 'auto',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: 'var(--surface, #fff)', color: 'var(--ink)', borderRadius: 14, width: 'min(720px, 100%)',
          boxShadow: '0 20px 60px rgba(0,0,0,.3)', overflow: 'hidden', display: 'flex', flexDirection: 'column',
        }}
      >
        <div style={{ padding: '16px 18px', borderBottom: '1px solid var(--line)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
            <div>
              <div style={{ fontWeight: 700, fontSize: 15 }}>{email.sujet || 'Email de relance'}</div>
              <div style={{ color: 'var(--ink-soft)', fontSize: 12.5, marginTop: 2 }}>
                {email.clientNom} · {email.palierLabel} · {fmtDateHeurePleine(email.date)}
              </div>
            </div>
            <button type="button" style={{ fontSize: 13, padding: '4px 10px' }} onClick={onClose}>
              Fermer
            </button>
          </div>
          <div style={{ fontSize: 12.5, color: 'var(--ink-soft)', marginTop: 10, lineHeight: 1.5 }}>
            <div><b>À :</b> {email.to || '—'}</div>
            {email.cc && <div><b>Copie :</b> {email.cc}</div>}
          </div>
          {email.reconstitue && (
            <div style={{
              marginTop: 10, fontSize: 12, lineHeight: 1.5, color: 'var(--ink-soft)',
              background: 'var(--paper-2)', border: '1px solid var(--line)', borderRadius: 8, padding: '8px 11px',
            }}>
              <b>Aperçu reconstitué.</b> Cet envoi est antérieur à l’archivage du contenu : le message est régénéré à l’identique par le moteur pour ce palier. Les envois postérieurs sont archivés au mot près.
            </div>
          )}
        </div>
        <div style={{ padding: email.html ? 0 : 18, maxHeight: '60vh', overflow: 'auto' }}>
          {email.html ? (
            <iframe
              title="Aperçu de l’email envoyé"
              sandbox=""
              srcDoc={email.html}
              style={{ width: '100%', height: '58vh', border: 'none', background: '#fff' }}
            />
          ) : (
            <pre style={{ margin: 0, whiteSpace: 'pre-wrap', fontFamily: 'inherit', fontSize: 13.5, lineHeight: 1.55 }}>
              {email.texte}
            </pre>
          )}
        </div>
      </div>
    </div>
  );
}

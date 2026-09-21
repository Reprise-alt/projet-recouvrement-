import { useEffect, useState } from 'react';
import { CheckCircle2, FileText } from 'lucide-react';
import { api, ApiError } from '../api/client';

// Page PUBLIQUE (lien à jeton dans une relance) : le débiteur signale qu'un chèque
// est disponible. Crée une alerte côté créancier. Aucune authentification.
export function DeclarationChequeView({ token }: { token: string }) {
  const [info, setInfo] = useState<{ clientNom: string; creancierNom: string } | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [montant, setMontant] = useState('');
  const [message, setMessage] = useState('');
  const [envoi, setEnvoi] = useState(false);
  const [envoye, setEnvoye] = useState(false);

  useEffect(() => {
    api
      .get<{ clientNom: string; creancierNom: string }>(`/api/cheque-public/${token}`)
      .then(setInfo)
      .catch((e) => setErreur(e instanceof ApiError ? e.message : 'Lien invalide ou expiré.'));
  }, [token]);

  async function declarer() {
    setEnvoi(true);
    try {
      await api.post(`/api/cheque-public/${token}/declarer`, {
        montantEstime: montant ? Number(montant) : undefined,
        message: message.trim() || undefined,
      });
      setEnvoye(true);
    } catch (e) {
      setErreur(e instanceof ApiError ? e.message : "Échec de l'envoi.");
    } finally {
      setEnvoi(false);
    }
  }

  if (erreur && !info) {
    return (
      <Centre>
        <FileText size={22} style={{ opacity: 0.5, marginBottom: 8 }} />
        <div>{erreur}</div>
      </Centre>
    );
  }
  if (!info) return <Centre>Chargement…</Centre>;

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg, #f2f4f2)', padding: '24px 16px' }}>
      <div style={{ maxWidth: 460, margin: '0 auto' }}>
        <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 2 }}>{info.creancierNom}</div>
        <div style={{ fontSize: 12, color: 'var(--ink-soft, #5B6469)', marginBottom: 18 }}>Déclaration de chèque</div>

        <div className="table-card" style={{ padding: 22, background: '#fff', border: '1px solid var(--line, #E4E7E3)', borderRadius: 14 }}>
          {envoye ? (
            <div style={{ textAlign: 'center', padding: '10px 0' }}>
              <CheckCircle2 size={34} style={{ color: 'var(--accent, #0E7C5A)', marginBottom: 10 }} />
              <h2 style={{ fontSize: 18, marginBottom: 6 }}>Merci !</h2>
              <p style={{ fontSize: 13.5, color: 'var(--ink-soft, #5B6469)', lineHeight: 1.5 }}>
                Nous avons bien noté qu'un chèque est disponible. Un agent de {info.creancierNom} vous recontactera pour
                l'enlèvement.
              </p>
            </div>
          ) : (
            <>
              <div style={{ fontSize: 13.5, lineHeight: 1.5, marginBottom: 16 }}>
                Bonjour {info.clientNom}, confirmez qu'un chèque est prêt à être récupéré. {info.creancierNom} organisera
                l'enlèvement.
              </div>
              <div style={{ marginBottom: 12 }}>
                <label style={{ fontSize: 12, color: 'var(--ink-soft, #5B6469)' }}>Montant du chèque (facultatif)</label>
                <input type="number" value={montant} onChange={(e) => setMontant(e.target.value)} placeholder="Ex. 250000" style={{ width: '100%', marginTop: 4 }} />
              </div>
              <div style={{ marginBottom: 16 }}>
                <label style={{ fontSize: 12, color: 'var(--ink-soft, #5B6469)' }}>Message (facultatif)</label>
                <textarea value={message} onChange={(e) => setMessage(e.target.value)} rows={2} placeholder="Ex. Disponible au bureau à partir de lundi." style={{ width: '100%', marginTop: 4, resize: 'vertical', fontFamily: 'inherit' }} />
              </div>
              <button className="primary" onClick={declarer} disabled={envoi} style={{ width: '100%' }}>
                {envoi ? 'Envoi…' : 'Un chèque est disponible'}
              </button>
              {erreur && <div style={{ color: 'var(--danger, #C0392B)', fontSize: 12.5, marginTop: 10 }}>{erreur}</div>}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function Centre({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', textAlign: 'center', color: 'var(--ink-soft, #5B6469)', padding: 24 }}>
      <div>{children}</div>
    </div>
  );
}

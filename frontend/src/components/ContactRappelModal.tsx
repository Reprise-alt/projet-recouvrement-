import { FormEvent, useState } from 'react';
import { api, ApiError } from '../api/client';

// Formulaire de rappel « grands comptes » (page vitrine, public). Plutôt que
// d'envoyer un prospect grand compte vers l'inscription self-service, on lui
// propose un engagement propre : être rappelé. La demande est envoyée à
// l'équipe (POST /api/contact, type « rappel »).
export function ContactRappelModal({ onClose }: { onClose: () => void }) {
  const [nom, setNom] = useState('');
  const [societe, setSociete] = useState('');
  const [telephone, setTelephone] = useState('');
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [envoye, setEnvoye] = useState(false);

  async function envoyer(e: FormEvent) {
    e.preventDefault();
    setErreur(null);
    setBusy(true);
    try {
      await api.post('/api/contact', {
        type: 'rappel',
        nom: nom.trim(),
        societe: societe.trim() || undefined,
        telephone: telephone.trim(),
        email: email.trim(),
        message: message.trim() || undefined,
      });
      setEnvoye(true);
    } catch (err) {
      setErreur(err instanceof ApiError ? err.message : 'Envoi impossible — réessayez.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="modal-overlay open" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ width: 'min(480px, 96%)' }}>
        {envoye ? (
          <div style={{ textAlign: 'center', padding: '8px 0' }}>
            <div style={{ fontSize: 40, marginBottom: 8 }}>✓</div>
            <h2 style={{ marginBottom: 8 }}>Demande envoyée</h2>
            <p style={{ color: 'var(--ink-soft)', fontSize: 14, lineHeight: 1.55 }}>
              Merci {nom.trim() || ''}. Notre équipe vous rappelle sous 24 h ouvrées au numéro indiqué.
            </p>
            <button className="primary" style={{ marginTop: 18 }} onClick={onClose}>
              Fermer
            </button>
          </div>
        ) : (
          <>
            <h2 style={{ marginBottom: 4 }}>Être rappelé — offre grands comptes</h2>
            <div style={{ color: 'var(--ink-soft)', fontSize: 13, marginBottom: 16, lineHeight: 1.5 }}>
              Laissez vos coordonnées : un conseiller vous rappelle pour cadrer vos besoins (multi-sociétés, volumes,
              contentieux) et établir un devis.
            </div>
            <form onSubmit={envoyer}>
              <div className="field">
                <label>Nom et prénom *</label>
                <input type="text" value={nom} onChange={(e) => setNom(e.target.value)} required maxLength={200} autoFocus />
              </div>
              <div className="field">
                <label>Société</label>
                <input type="text" value={societe} onChange={(e) => setSociete(e.target.value)} maxLength={200} placeholder="Votre entreprise" />
              </div>
              <div className="field">
                <label>Téléphone *</label>
                <input
                  type="tel"
                  value={telephone}
                  onChange={(e) => setTelephone(e.target.value)}
                  required
                  maxLength={40}
                  placeholder="+221 …"
                  autoComplete="tel"
                />
              </div>
              <div className="field">
                <label>Email *</label>
                <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required maxLength={320} autoComplete="email" />
              </div>
              <div className="field">
                <label>Votre besoin (facultatif)</label>
                <textarea
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  maxLength={5000}
                  rows={3}
                  placeholder="Nombre de sociétés, volume de débiteurs, échéance…"
                />
              </div>

              {erreur && <div className="login-error">{erreur}</div>}

              <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 8 }}>
                <button type="button" onClick={onClose} disabled={busy}>
                  Annuler
                </button>
                <button className="primary" type="submit" disabled={busy}>
                  {busy ? 'Envoi…' : 'Être rappelé'}
                </button>
              </div>
            </form>
          </>
        )}
      </div>
    </div>
  );
}

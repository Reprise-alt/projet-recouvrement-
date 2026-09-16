import { FormEvent, useState } from 'react';
import { useAuth } from '../auth/AuthContext';

// Inscription / connexion self-service par code email (addendum §4). Deux étapes :
//   1) saisie de l'email → envoi d'un code ;
//   2) saisie du code (+ nom de l'entreprise si c'est une première connexion) →
//      connexion, ou création du compte + de l'organisation.
export function InscriptionOtpPage() {
  const { requestOtp, verifyOtp, error } = useAuth();
  const [etape, setEtape] = useState<'email' | 'code'>('email');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [raisonSociale, setRaisonSociale] = useState('');
  const [busy, setBusy] = useState(false);
  const [renvoye, setRenvoye] = useState(false);

  async function envoyer(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await requestOtp(email.trim());
      setEtape('code');
    } catch {
      // erreur exposée via useAuth().error
    } finally {
      setBusy(false);
    }
  }

  async function valider(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await verifyOtp(email.trim(), code.trim(), raisonSociale.trim() || undefined);
      // Succès : AuthContext charge l'utilisateur et l'app bascule automatiquement.
    } catch {
      // erreur exposée via useAuth().error
    } finally {
      setBusy(false);
    }
  }

  async function renvoyer() {
    setBusy(true);
    try {
      await requestOtp(email.trim());
      setRenvoye(true);
      setTimeout(() => setRenvoye(false), 4000);
    } catch {
      /* idem */
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="login-wrap">
      <div className="login-brand">
        <span className="brand-mark">
          <svg viewBox="0 0 100 100" width="28" height="28" aria-hidden="true">
            <circle
              cx="50"
              cy="50"
              r="34"
              fill="none"
              stroke="var(--accent)"
              strokeWidth="13"
              strokeLinecap="round"
              strokeDasharray="168 46"
              transform="rotate(100 50 50)"
            />
          </svg>
        </span>
        <span className="brand-id">
          <b>OLU 360</b>
          <small>Recouvrement — reprenez la main sur vos impayés</small>
        </span>
      </div>

      <div className="login-card">
        {etape === 'email' ? (
          <>
            <h1>Commencer</h1>
            <div className="sub">Inscription ou connexion — un code vous est envoyé par email.</div>
            <form onSubmit={envoyer}>
              <div className="field">
                <label>Votre email professionnel</label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="vous@votre-entreprise.sn"
                  autoComplete="email"
                  required
                />
              </div>
              <button className="primary" type="submit" disabled={busy} style={{ width: '100%' }}>
                {busy ? 'Envoi…' : 'Recevoir mon code'}
              </button>
            </form>
            <div style={{ marginTop: 14, fontSize: 12, color: 'var(--ink-soft)' }}>
              14 jours d'essai gratuit, sans carte bancaire.
            </div>
          </>
        ) : (
          <>
            <h1>Votre code</h1>
            <div className="sub">
              Saisissez le code à 6 chiffres envoyé à <b>{email}</b>.
            </div>
            <form onSubmit={valider}>
              <div className="field">
                <label>Code de connexion</label>
                <input
                  inputMode="numeric"
                  pattern="[0-9]*"
                  maxLength={6}
                  value={code}
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
                  placeholder="000000"
                  autoFocus
                  required
                  style={{ letterSpacing: '.35em', fontFamily: 'monospace', fontSize: 20, textAlign: 'center' }}
                />
              </div>
              <div className="field">
                <label>
                  Nom de votre entreprise <span style={{ color: 'var(--ink-soft)' }}>(si première connexion)</span>
                </label>
                <input
                  type="text"
                  value={raisonSociale}
                  onChange={(e) => setRaisonSociale(e.target.value)}
                  placeholder="Ex. Alpha SA"
                />
              </div>
              <button className="primary" type="submit" disabled={busy} style={{ width: '100%' }}>
                {busy ? 'Vérification…' : 'Valider'}
              </button>
            </form>
            <div style={{ marginTop: 14, display: 'flex', justifyContent: 'space-between', fontSize: 12.5 }}>
              <button
                type="button"
                onClick={() => {
                  setEtape('email');
                  setCode('');
                }}
                style={{ background: 'none', border: 'none', color: 'var(--ink-soft)', cursor: 'pointer', padding: 0 }}
              >
                ← Changer d'email
              </button>
              <button
                type="button"
                onClick={renvoyer}
                disabled={busy}
                style={{ background: 'none', border: 'none', color: 'var(--accent)', cursor: 'pointer', padding: 0 }}
              >
                {renvoye ? 'Code renvoyé ✓' : 'Renvoyer le code'}
              </button>
            </div>
          </>
        )}

        {error && <div className="login-error">{error}</div>}
      </div>

      <div style={{ marginTop: 20, fontSize: 12.5 }}>
        <a href="/presentation" style={{ color: 'var(--ink-soft)' }}>
          Découvrir la plateforme →
        </a>
      </div>
    </div>
  );
}

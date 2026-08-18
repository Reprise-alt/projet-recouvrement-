import { FormEvent, useState } from 'react';
import { useAuth } from '../auth/AuthContext';

export function LoginPage() {
  const { loginWithPassword, loginDev, error, supabaseAvailable, devLoginAvailable } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [devEmail, setDevEmail] = useState('');
  const [busy, setBusy] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await loginWithPassword(email, password);
    } catch {
      // l'erreur est déjà exposée via useAuth().error
    } finally {
      setBusy(false);
    }
  }

  async function handleDevLogin(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await loginDev(devEmail);
    } catch {
      // idem
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
          <small>Écosystème IT du groupe</small>
        </span>
      </div>
      <div className="login-card">
        <h1>Connexion</h1>
        <div className="sub">SORAM · SIS · IRIS Afrique — écosystème IT</div>

        {supabaseAvailable ? (
          <form onSubmit={handleSubmit}>
            <div className="field">
              <label>Email</label>
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
            </div>
            <div className="field">
              <label>Mot de passe</label>
              <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
            </div>
            <button className="primary" type="submit" disabled={busy} style={{ width: '100%' }}>
              Se connecter
            </button>
          </form>
        ) : (
          <div style={{ color: 'var(--ink-soft)', fontSize: 12.5 }}>
            Aucun projet Supabase connecté (VITE_SUPABASE_URL/VITE_SUPABASE_ANON_KEY absents).
          </div>
        )}

        {devLoginAvailable && (
          <>
            <div className="login-divider">connexion de test</div>
            <form onSubmit={handleDevLogin}>
              <div className="field">
                <label>Email d'un compte déjà provisionné</label>
                <input type="email" value={devEmail} onChange={(e) => setDevEmail(e.target.value)} required />
              </div>
              <button type="submit" disabled={busy} style={{ width: '100%' }}>
                Connexion de test (sans Supabase)
              </button>
            </form>
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

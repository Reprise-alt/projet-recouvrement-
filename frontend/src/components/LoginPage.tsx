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
        <svg viewBox="0 0 100 100" width="30" height="30">
          <circle
            cx="50"
            cy="50"
            r="34"
            fill="none"
            stroke="#1D9E75"
            strokeWidth="13"
            strokeLinecap="round"
            strokeDasharray="168 46"
            transform="rotate(100 50 50)"
          />
        </svg>
        <div className="brand-wordmark">
          <span className="w-olu">OLU</span> <span className="w-360">360</span>
        </div>
      </div>
      <div className="login-card">
        <h1>Connexion</h1>
        <div className="sub">Suivi du recouvrement — SORAM · SIS · IRIS Afrique</div>

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
    </div>
  );
}

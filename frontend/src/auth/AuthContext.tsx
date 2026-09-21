import { createContext, ReactNode, useContext, useEffect, useMemo, useState } from 'react';
import { api, setAuthToken } from '../api/client';
import { CurrentUser } from '../api/types';
import { supabase } from './supabaseClient';
import { AUTH_MODE, redirigerVersHub } from './mode';

const TOKEN_STORAGE_KEY = 'recouvrement:token';

// Réponses de profilage à l'inscription (addendum §4.2). Toutes optionnelles.
export interface ProfilInscription {
  raisonSociale?: string;
  secteur?: string;
  trancheDebiteurs?: 'moins_50' | 'entre_50_500' | 'plus_500';
  outilFacturation?: string;
  codeParrainage?: string;
}

interface AuthState {
  user: CurrentUser | null;
  loading: boolean;
  error: string | null;
  devLoginAvailable: boolean;
  supabaseAvailable: boolean;
  loginWithPassword: (email: string, password: string) => Promise<void>;
  loginDev: (email: string) => Promise<void>;
  // SaaS self-service (OTP par email) : demande d'un code, puis vérification qui
  // connecte — ou inscrit si l'email est inconnu (création de l'organisation).
  requestOtp: (email: string) => Promise<void>;
  verifyOtp: (email: string, code: string, profil?: ProfilInscription) => Promise<{ inscription: boolean }>;
  logout: () => Promise<void>;
  // Recharge le profil /me (capacités, abonnement, formule…) sans reconnexion —
  // utile après un changement d'état côté serveur (ex. activation d'une option).
  refresh: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

async function fetchCurrentUser(): Promise<CurrentUser> {
  return api.get<CurrentUser>('/api/auth/me');
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<CurrentUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Mode SSO : pas de jeton local — la session vient du cookie partagé du
    // hub, envoyé automatiquement (credentials). On tente /moi ; un échec
    // (401) laisse user=null et l'app renverra vers le hub.
    if (AUTH_MODE === 'sso') {
      fetchCurrentUser()
        .then(setUser)
        .catch(() => setUser(null))
        .finally(() => setLoading(false));
      return;
    }

    const stored = localStorage.getItem(TOKEN_STORAGE_KEY);
    if (!stored) {
      setLoading(false);
      return;
    }
    setAuthToken(stored);
    fetchCurrentUser()
      .then(setUser)
      .catch(() => {
        localStorage.removeItem(TOKEN_STORAGE_KEY);
        setAuthToken(null);
      })
      .finally(() => setLoading(false));
  }, []);

  async function applyToken(token: string) {
    localStorage.setItem(TOKEN_STORAGE_KEY, token);
    setAuthToken(token);
    const me = await fetchCurrentUser();
    setUser(me);
  }

  async function loginWithPassword(email: string, password: string) {
    setError(null);
    if (!supabase) throw new Error('Supabase non configuré');
    const { data, error: supaError } = await supabase.auth.signInWithPassword({ email, password });
    if (supaError || !data.session) {
      setError(supaError?.message || 'Échec de connexion');
      throw supaError;
    }
    await applyToken(data.session.access_token);
  }

  async function loginDev(email: string) {
    setError(null);
    try {
      const { token } = await api.post<{ token: string }>('/api/auth/dev-token', { email });
      await applyToken(token);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Échec de connexion');
      throw err;
    }
  }

  async function requestOtp(email: string) {
    setError(null);
    try {
      await api.post('/api/auth/otp/request', { email });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Échec de l'envoi du code");
      throw err;
    }
  }

  async function verifyOtp(email: string, code: string, profil?: ProfilInscription) {
    setError(null);
    try {
      const res = await api.post<{ token: string; inscription: boolean }>('/api/auth/otp/verify', {
        email,
        code,
        raisonSociale: profil?.raisonSociale,
        secteur: profil?.secteur,
        trancheDebiteurs: profil?.trancheDebiteurs,
        outilFacturation: profil?.outilFacturation,
        codeParrainage: profil?.codeParrainage,
      });
      await applyToken(res.token);
      return { inscription: res.inscription };
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Code invalide ou expiré');
      throw err;
    }
  }

  async function refresh() {
    const me = await fetchCurrentUser();
    setUser(me);
  }

  async function logout() {
    // Mode SSO : la session est partagée (hub) — se déconnecter d'une console
    // seule n'aurait pas de sens. On renvoie au hub, où l'utilisateur ferme sa
    // session globale.
    if (AUTH_MODE === 'sso') {
      setUser(null);
      redirigerVersHub();
      return;
    }
    localStorage.removeItem(TOKEN_STORAGE_KEY);
    setAuthToken(null);
    setUser(null);
    if (supabase) await supabase.auth.signOut();
  }

  const value = useMemo<AuthState>(
    () => ({
      user,
      loading,
      error,
      devLoginAvailable: import.meta.env.VITE_ALLOW_DEV_LOGIN === 'true',
      supabaseAvailable: !!supabase,
      loginWithPassword,
      loginDev,
      requestOtp,
      verifyOtp,
      logout,
      refresh,
    }),
    [user, loading, error],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth doit être utilisé dans un AuthProvider');
  return ctx;
}

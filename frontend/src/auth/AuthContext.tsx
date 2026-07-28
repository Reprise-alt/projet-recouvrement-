import { createContext, ReactNode, useContext, useEffect, useMemo, useState } from 'react';
import { api, setAuthToken } from '../api/client';
import { CurrentUser } from '../api/types';
import { supabase } from './supabaseClient';

const TOKEN_STORAGE_KEY = 'recouvrement:token';

interface AuthState {
  user: CurrentUser | null;
  loading: boolean;
  error: string | null;
  devLoginAvailable: boolean;
  supabaseAvailable: boolean;
  loginWithPassword: (email: string, password: string) => Promise<void>;
  loginDev: (email: string) => Promise<void>;
  logout: () => Promise<void>;
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

  async function logout() {
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
      logout,
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

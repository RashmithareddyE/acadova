import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { authApi } from '../lib/api';

const AuthContext = createContext(null);

// status: 'loading' (checking session) | 'authenticated' | 'anonymous'
export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [status, setStatus] = useState('loading');

  // Restore the session on page load. The httpOnly cookie is sent automatically;
  // a 401 here simply means nobody is logged in.
  useEffect(() => {
    let cancelled = false;
    authApi
      .me()
      .then(({ user: current }) => {
        if (cancelled) return;
        setUser(current);
        setStatus('authenticated');
      })
      .catch(() => {
        if (cancelled) return;
        setUser(null);
        setStatus('anonymous');
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // After login/register the user is always read back from the protected /auth/me
  // endpoint, so the app state reflects what the server considers the current user.
  const loadCurrentUser = useCallback(async () => {
    const { user: current } = await authApi.me();
    setUser(current);
    setStatus('authenticated');
  }, []);

  const login = useCallback(
    async (credentials) => {
      await authApi.login(credentials);
      await loadCurrentUser();
    },
    [loadCurrentUser]
  );

  const register = useCallback(
    async (details) => {
      await authApi.register(details);
      await loadCurrentUser();
    },
    [loadCurrentUser]
  );

  const logout = useCallback(async () => {
    try {
      await authApi.logout();
    } finally {
      setUser(null);
      setStatus('anonymous');
    }
  }, []);

  const value = useMemo(
    () => ({ user, status, login, register, logout }),
    [user, status, login, register, logout]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}

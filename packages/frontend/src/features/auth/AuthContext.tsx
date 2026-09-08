import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { api } from '@/lib/api';

export type Role = 'ADMIN' | 'CASHIER' | 'TECHNICIAN';

export type SessionUser = {
  id: string;
  username: string;
  displayName: string;
  role: Role;
  avatarColor: string | null;
};

export type Capabilities = Record<string, boolean>;

type AuthState = {
  user: SessionUser | null;
  capabilities: Capabilities;
  ready: boolean;
  locked: boolean;
  loginWithPin: (pin: string, username?: string) => Promise<void>;
  logout: () => void;
  lock: () => void;
  refresh: () => Promise<void>;
  authError: string | null;
};

const SESSION_KEY = 'bm_session_token';

export function getSessionToken(): string | null {
  try {
    return window.localStorage.getItem(SESSION_KEY);
  } catch {
    return null;
  }
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [capabilities, setCapabilities] = useState<Capabilities>({});
  const [ready, setReady] = useState(false);
  const [locked, setLocked] = useState(true);
  const [authError, setAuthError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const token = getSessionToken();
    if (!token) {
      setUser(null);
      setCapabilities({});
      setLocked(true);
      setReady(true);
      return;
    }
    try {
      const res = await api.get<{ user: SessionUser | null; capabilities: Capabilities }>('/auth/current-user');
      if (res.user) {
        setUser(res.user);
        setCapabilities(res.capabilities ?? {});
        setLocked(false);
      } else {
        setUser(null);
        setCapabilities({});
        setLocked(true);
      }
    } catch {
      setUser(null);
      setCapabilities({});
      setLocked(true);
    } finally {
      setReady(true);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  // Cross-tab lock sync: locking out in one tab locks all.
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === SESSION_KEY && e.newValue === null) {
        setUser(null);
        setCapabilities({});
        setLocked(true);
      }
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  const loginWithPin = useCallback(async (pin: string, username?: string) => {
    setAuthError(null);
    try {
      const res = await api.post<{ token: string; user: SessionUser; capabilities: Capabilities }>('/auth/pin-login', {
        pin,
        ...(username ? { username } : {}),
      });
      try {
        window.localStorage.setItem(SESSION_KEY, res.token);
      } catch {
        /* session survives in memory for this tab */
      }
      setUser(res.user);
      setCapabilities(res.capabilities ?? {});
      setLocked(false);
    } catch (e) {
      throw e;
    }
  }, []);

  const logout = useCallback(() => {
    const token = getSessionToken();
    if (token) void api.post('/auth/logout', {}).catch(() => undefined);
    try {
      window.localStorage.removeItem(SESSION_KEY);
    } catch {
      /* noop */
    }
    setUser(null);
    setCapabilities({});
    setLocked(true);
  }, []);

  const lock = useCallback(() => {
    setLocked(true);
  }, []);

  const value = useMemo<AuthState>(
    () => ({ user, capabilities, ready, locked, loginWithPin, logout, lock, refresh, authError }),
    [user, capabilities, ready, locked, loginWithPin, logout, lock, refresh, authError],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}

export function useCapability(key: string): boolean {
  const { capabilities } = useAuth();
  return capabilities[key] ?? false;
}

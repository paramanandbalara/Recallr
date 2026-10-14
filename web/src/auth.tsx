import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { api, getToken, setToken, type Allowance, type User } from './api';

interface AuthState {
  user: User | null;
  allowance: Allowance | null;
  loading: boolean;
  signIn: (token: string) => Promise<void>;
  signOut: () => void;
  refresh: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [allowance, setAllowance] = useState<Allowance | null>(null);
  const [loading, setLoading] = useState(!!getToken());

  const refresh = useCallback(async () => {
    if (!getToken()) return;
    try {
      const me = await api<{ user: User; allowance: Allowance }>('/auth/me');
      setUser(me.user);
      setAllowance(me.allowance);
    } catch {
      setUser(null);
      setAllowance(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // Starting the request in an effect is fine; state is only set when it finishes
    const timer = setTimeout(refresh);
    return () => clearTimeout(timer);
  }, [refresh]);

  const signIn = async (token: string) => {
    setToken(token);
    setLoading(true);
    await refresh();
  };

  const signOut = () => {
    setToken(null);
    setUser(null);
    setAllowance(null);
  };

  return <AuthContext.Provider value={{ user, allowance, loading, signIn, signOut, refresh }}>{children}</AuthContext.Provider>;
};

export const useAuth = () => {
  const auth = useContext(AuthContext);
  if (!auth) throw new Error('useAuth must be used inside AuthProvider');
  return auth;
};

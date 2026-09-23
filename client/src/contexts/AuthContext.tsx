import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { api, type User } from "../lib/api";

const AuthContext = createContext<{
  user: User | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (name: string, email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
} | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.me().then(({ user: current }) => setUser(current)).catch(() => setUser(null)).finally(() => setLoading(false));
  }, []);

  const value = useMemo(() => ({
    user,
    loading,
    login: async (email: string, password: string) => setUser((await api.login({ email, password })).user),
    register: async (name: string, email: string, password: string) => setUser((await api.register({ name, email, password })).user),
    logout: async () => { await api.logout(); setUser(null); },
  }), [loading, user]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used inside AuthProvider");
  return context;
}

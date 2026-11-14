import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { api } from '../lib/api.ts';
import type { LandPlot, Project, Stats, User } from '../lib/types.ts';

/* ------------------------------------------------------------------ auth */

interface AuthValue {
  user: User | null;
  checked: boolean;
  isAdmin: boolean;
  login(email: string, password: string): Promise<void>;
  logout(): Promise<void>;
}

const AuthContext = createContext<AuthValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    api
      .me()
      .then((r) => setUser(r.user))
      .catch(() => setUser(null))
      .finally(() => setChecked(true));
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const r = await api.login(email, password);
    setUser(r.user);
  }, []);

  const logout = useCallback(async () => {
    await api.logout().catch(() => {});
    setUser(null);
  }, []);

  return (
    <AuthContext.Provider value={{ user, checked, isAdmin: user?.role === 'admin', login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const v = useContext(AuthContext);
  if (!v) throw new Error('useAuth must be used inside AuthProvider');
  return v;
}

/* ------------------------------------------------------------------ data */

export interface DataStore {
  projects: Project[];
  lands: LandPlot[];
  stats: Stats | null;
  loading: boolean;
  error: string | null;
  reload(): void;
  refreshStats(): void;
  upsertProject(p: Project): void;
  removeProject(id: string): void;
  upsertLand(l: LandPlot): void;
  removeLand(id: string): void;
}

/** Loads everything once (and again when the signed-in user changes, so contacts appear/disappear). */
export function useData(userKey: string | null, enabled: boolean): DataStore {
  const [projects, setProjects] = useState<Project[]>([]);
  const [lands, setLands] = useState<LandPlot[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);
  const req = useRef(0);

  useEffect(() => {
    if (!enabled) return;
    const id = ++req.current;
    setLoading(true);
    setError(null);
    Promise.all([api.listProjects(), api.listLand(), api.stats()])
      .then(([p, l, s]) => {
        if (id !== req.current) return;
        setProjects(p);
        setLands(l);
        setStats(s);
      })
      .catch((e: Error) => id === req.current && setError(e.message))
      .finally(() => id === req.current && setLoading(false));
  }, [userKey, enabled, nonce]);

  const refreshStats = useCallback(() => {
    api.stats().then(setStats).catch(() => {});
  }, []);

  const upsert = <T extends { id: string }>(list: T[], item: T) =>
    list.some((x) => x.id === item.id) ? list.map((x) => (x.id === item.id ? item : x)) : [item, ...list];

  return {
    projects,
    lands,
    stats,
    loading,
    error,
    reload: () => setNonce((n) => n + 1),
    refreshStats,
    upsertProject: (p) => setProjects((l) => upsert(l, p)),
    removeProject: (id) => setProjects((l) => l.filter((x) => x.id !== id)),
    upsertLand: (x) => setLands((l) => upsert(l, x)),
    removeLand: (id) => setLands((l) => l.filter((x) => x.id !== id)),
  };
}

/* ----------------------------------------------------------------- toasts */

interface Toast {
  id: number;
  text: string;
  tone: 'ok' | 'error';
}

const ToastContext = createContext<(text: string, tone?: Toast['tone']) => void>(() => {});

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const next = useRef(1);
  const push = useCallback((text: string, tone: Toast['tone'] = 'ok') => {
    const id = next.current++;
    setToasts((t) => [...t, { id, text, tone }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), tone === 'error' ? 7000 : 3500);
  }, []);
  return (
    <ToastContext.Provider value={push}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 bottom-6 z-[60] flex flex-col items-center gap-2 px-4" aria-live="polite">
        {toasts.map((t) => (
          <div
            key={t.id}
            role={t.tone === 'error' ? 'alert' : 'status'}
            className={`pointer-events-auto max-w-md rounded-md px-4 py-2.5 text-sm shadow-float ${
              t.tone === 'error' ? 'bg-signal text-white' : 'bg-ink text-white'
            }`}
          >
            {t.text}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export const useToast = () => useContext(ToastContext);

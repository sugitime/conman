import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { api } from "./api";

export type MeUser = {
  id: string;
  email: string;
  name: string;
  role: "CON_MANAGER" | "DEPARTMENT_LEAD" | "VOLUNTEER" | "GUEST";
  departmentMembers: {
    isLead: boolean;
    department: { id: string; name: string; color: string; features?: Record<string, boolean> };
  }[];
};

export type AppSettings = {
  conferenceName: string;
  hotelSoloNightLimit: number;
  hotelRoommateNightLimit: number;
  globalFeatures: Record<string, boolean>;
  featureCatalog: string[];
  smtpHost?: string | null;
  smtpPort?: number;
  smtpUser?: string | null;
  smtpFrom?: string | null;
  smtpSecure?: boolean;
  smtpPassword?: string | null;
};

type AuthState = {
  user: MeUser | null;
  settings: AppSettings | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
  refresh: () => Promise<void>;
  isFeatureEnabled: (key: string) => boolean;
  isConManager: boolean;
};

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<MeUser | null>(null);
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    const token = localStorage.getItem("conman_token");
    if (!token) {
      setUser(null);
      setSettings(null);
      setLoading(false);
      return;
    }
    try {
      const [me, s] = await Promise.all([
        api<MeUser>("/auth/me"),
        api<AppSettings>("/settings"),
      ]);
      setUser(me);
      setSettings(s);
    } catch {
      setUser(null);
      setSettings(null);
      localStorage.removeItem("conman_token");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const login = useCallback(
    async (email: string, password: string) => {
      const res = await api<{ accessToken: string }>("/auth/login", {
        method: "POST",
        body: JSON.stringify({ email, password }),
      });
      localStorage.setItem("conman_token", res.accessToken);
      setLoading(true);
      await refresh();
    },
    [refresh],
  );

  const logout = useCallback(() => {
    localStorage.removeItem("conman_token");
    setUser(null);
    setSettings(null);
  }, []);

  const isFeatureEnabled = useCallback(
    (key: string) => {
      if (user?.role === "CON_MANAGER") return true;
      if (!settings?.globalFeatures) return true;
      return settings.globalFeatures[key] !== false;
    },
    [settings, user],
  );

  const value = useMemo(
    () => ({
      user,
      settings,
      loading,
      login,
      logout,
      refresh,
      isFeatureEnabled,
      isConManager: user?.role === "CON_MANAGER",
    }),
    [user, settings, loading, login, logout, refresh, isFeatureEnabled],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth outside provider");
  return ctx;
}

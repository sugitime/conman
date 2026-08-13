import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { api, getConferenceId, setConferenceId } from "./api";

export type MeUser = {
  id: string;
  email: string;
  name: string;
  role: "CON_MANAGER" | "DEPARTMENT_LEAD" | "VOLUNTEER" | "GUEST";
  departmentMembers: {
    isLead: boolean;
    department: {
      id: string;
      name: string;
      color: string;
      features?: Record<string, boolean>;
    };
  }[];
};

export type ConferenceSummary = {
  id: string;
  name: string;
  slug: string;
  year?: number | null;
  description?: string | null;
  isArchived: boolean;
  _count?: { departments: number; members: number };
  members?: { role: string; isActive: boolean }[];
};

export type AppSettings = {
  conferenceName: string;
  conferenceId?: string | null;
  year?: number | null;
  slug?: string;
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
  isArchived?: boolean;
};

type AuthState = {
  user: MeUser | null;
  settings: AppSettings | null;
  conferences: ConferenceSummary[];
  activeConference: ConferenceSummary | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
  refresh: () => Promise<void>;
  switchConference: (id: string) => Promise<void>;
  isFeatureEnabled: (key: string) => boolean;
  isConManager: boolean;
};

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<MeUser | null>(null);
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [conferences, setConferences] = useState<ConferenceSummary[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    const token = localStorage.getItem("conman_token");
    if (!token) {
      setUser(null);
      setSettings(null);
      setConferences([]);
      setLoading(false);
      return;
    }
    try {
      const [me, cons] = await Promise.all([
        api<MeUser>("/auth/me"),
        api<ConferenceSummary[]>("/conferences"),
      ]);
      setUser(me);
      setConferences(cons);

      // Ensure a conference is selected
      let activeId = getConferenceId();
      if (!activeId || !cons.some((c) => c.id === activeId)) {
        const preferred =
          cons.find((c) => !c.isArchived) || cons[0] || null;
        activeId = preferred?.id || null;
        setConferenceId(activeId);
      }

      const s = await api<AppSettings>("/settings");
      setSettings(s);
    } catch {
      setUser(null);
      setSettings(null);
      setConferences([]);
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
    setConferenceId(null);
    setUser(null);
    setSettings(null);
    setConferences([]);
  }, []);

  const switchConference = useCallback(
    async (id: string) => {
      setConferenceId(id);
      setLoading(true);
      try {
        const s = await api<AppSettings>("/settings");
        setSettings(s);
        // Refresh me/departments in case memberships differ
        const me = await api<MeUser>("/auth/me");
        setUser(me);
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  const activeConference = useMemo(() => {
    const id = getConferenceId();
    return conferences.find((c) => c.id === id) || conferences[0] || null;
  }, [conferences, settings]);

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
      conferences,
      activeConference,
      loading,
      login,
      logout,
      refresh,
      switchConference,
      isFeatureEnabled,
      isConManager: user?.role === "CON_MANAGER",
    }),
    [
      user,
      settings,
      conferences,
      activeConference,
      loading,
      login,
      logout,
      refresh,
      switchConference,
      isFeatureEnabled,
    ],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth outside provider");
  return ctx;
}

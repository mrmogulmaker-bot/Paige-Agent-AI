import { createContext, useContext, useState, useEffect, ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";

type DashboardMode = "internal" | "client";

interface DashboardModeContextValue {
  mode: DashboardMode;
  setMode: (mode: DashboardMode) => void;
  isCoachOrAdmin: boolean;
  isAdmin: boolean;
  loading: boolean;
}

const DashboardModeContext = createContext<DashboardModeContextValue>({
  mode: "client",
  setMode: () => {},
  isCoachOrAdmin: false,
  isAdmin: false,
  loading: true,
});

export const useDashboardMode = () => useContext(DashboardModeContext);

export function DashboardModeProvider({ children }: { children: ReactNode }) {
  const [mode, setModeState] = useState<DashboardMode>("client");
  const [isCoachOrAdmin, setIsCoachOrAdmin] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    initMode();
  }, []);

  const initMode = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { setLoading(false); return; }

      // Fetch roles and profile mode preference in parallel
      const [rolesRes, profileRes] = await Promise.all([
        supabase.from("user_roles").select("role").eq("user_id", user.id),
        supabase.from("profiles").select("dashboard_mode").eq("user_id", user.id).maybeSingle(),
      ]);

      const roles = (rolesRes.data || []).map((r: any) => r.role);
      const admin = roles.includes("admin");
      const coachOrAdmin = admin || roles.includes("coach");

      setIsAdmin(admin);
      setIsCoachOrAdmin(coachOrAdmin);

      // Determine mode: use saved preference, or default to 'internal' for coach/admin
      const savedMode = (profileRes.data as any)?.dashboard_mode as DashboardMode | undefined;
      if (savedMode && (savedMode === "internal" || savedMode === "client")) {
        setModeState(savedMode);
      } else if (coachOrAdmin) {
        setModeState("internal");
        // Persist the default
        await supabase.from("profiles").update({ dashboard_mode: "internal" } as any).eq("user_id", user.id);
      }
    } catch (err) {
      console.error("Error initializing dashboard mode:", err);
    } finally {
      setLoading(false);
    }
  };

  const setMode = async (newMode: DashboardMode) => {
    setModeState(newMode);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        await supabase.from("profiles").update({ dashboard_mode: newMode } as any).eq("user_id", user.id);
      }
    } catch (err) {
      console.error("Error saving dashboard mode:", err);
    }
  };

  return (
    <DashboardModeContext.Provider value={{ mode, setMode, isCoachOrAdmin, isAdmin, loading }}>
      {children}
    </DashboardModeContext.Provider>
  );
}

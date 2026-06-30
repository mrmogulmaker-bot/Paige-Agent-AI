import { createContext, useContext, useEffect, useMemo, useState, ReactNode } from "react";
import { useUserRoles, type AppRole } from "@/hooks/useUserRoles";

/**
 * Lens lets a multi-hat user (e.g. Admin + Coach) scope the Admin UI
 * to one role at a time without losing their session or actual permissions.
 * It is purely a UI filter — RLS and route gates still enforce real access.
 */
export type RoleLens = "admin" | "coach";

const STORAGE_KEY = "paige_role_lens";

interface RoleLensContextValue {
  lens: RoleLens;
  setLens: (lens: RoleLens) => void;
  /** Roles the user actually has (subset of admin/coach). */
  availableLenses: RoleLens[];
  /** True when both admin and coach are present — chip should render. */
  canSwitch: boolean;
  loading: boolean;
}

const RoleLensContext = createContext<RoleLensContextValue>({
  lens: "admin",
  setLens: () => {},
  availableLenses: [],
  canSwitch: false,
  loading: true,
});

export const useRoleLens = () => useContext(RoleLensContext);

export function RoleLensProvider({ children }: { children: ReactNode }) {
  const { isAdmin, isCoach, loading } = useUserRoles();
  const [lens, setLensState] = useState<RoleLens>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved === "admin" || saved === "coach") return saved;
    } catch {}
    return "admin";
  });

  const availableLenses = useMemo<RoleLens[]>(() => {
    const out: RoleLens[] = [];
    if (isAdmin) out.push("admin");
    if (isCoach) out.push("coach");
    return out;
  }, [isAdmin, isCoach]);

  // Snap to a valid lens if the user only has one.
  useEffect(() => {
    if (loading) return;
    if (availableLenses.length === 0) return;
    if (!availableLenses.includes(lens)) {
      setLensState(availableLenses[0]);
    }
  }, [availableLenses, lens, loading]);

  const setLens = (next: RoleLens) => {
    setLensState(next);
    try { localStorage.setItem(STORAGE_KEY, next); } catch {}
  };

  return (
    <RoleLensContext.Provider
      value={{
        lens,
        setLens,
        availableLenses,
        canSwitch: availableLenses.length > 1,
        loading,
      }}
    >
      {children}
    </RoleLensContext.Provider>
  );
}

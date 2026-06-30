import { createContext, useCallback, useContext, useEffect, useMemo, useState, ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";

const STORAGE_KEY = "paige_impersonating_contact";

type Target = {
  contactId: string;
  targetUserId: string;
  targetName: string;
};

type Ctx = {
  target: Target | null;
  isImpersonating: boolean;
  /** Effective user id for client-scoped data — falls back to the signed-in user's own id. */
  effectiveUserId: (selfId: string | undefined | null) => string | undefined;
  start: (contactId: string) => Promise<Target>;
  stop: () => Promise<void>;
};

const ImpersonationCtx = createContext<Ctx | null>(null);

function readStored(): Target | null {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Target;
    if (parsed?.contactId && parsed?.targetUserId) return parsed;
  } catch {
    /* ignore */
  }
  return null;
}

export function ImpersonationProvider({ children }: { children: ReactNode }) {
  const [target, setTarget] = useState<Target | null>(() => readStored());

  // Cross-tab sync
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === STORAGE_KEY) setTarget(readStored());
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const start = useCallback(async (contactId: string) => {
    const { data, error } = await supabase.rpc("start_client_impersonation", { p_contact_id: contactId });
    if (error) throw error;
    const row = Array.isArray(data) ? data[0] : data;
    if (!row?.linked_user_id) throw new Error("Client has not accepted their invite yet.");
    const next: Target = {
      contactId: row.contact_id,
      targetUserId: row.linked_user_id,
      targetName: row.client_name || "Client",
    };
    try { sessionStorage.setItem(STORAGE_KEY, JSON.stringify(next)); } catch {}
    setTarget(next);
    return next;
  }, []);

  const stop = useCallback(async () => {
    const current = target;
    try { sessionStorage.removeItem(STORAGE_KEY); } catch {}
    setTarget(null);
    if (current?.contactId) {
      try { await supabase.rpc("end_client_impersonation", { p_contact_id: current.contactId }); } catch { /* best-effort */ }
    }
  }, [target]);

  const effectiveUserId = useCallback(
    (selfId: string | undefined | null) => target?.targetUserId ?? selfId ?? undefined,
    [target]
  );

  const value = useMemo<Ctx>(() => ({
    target,
    isImpersonating: !!target,
    effectiveUserId,
    start,
    stop,
  }), [target, effectiveUserId, start, stop]);

  return <ImpersonationCtx.Provider value={value}>{children}</ImpersonationCtx.Provider>;
}

export function useImpersonation(): Ctx {
  const ctx = useContext(ImpersonationCtx);
  if (!ctx) {
    // Soft fallback so components outside the provider don't crash.
    return {
      target: null,
      isImpersonating: false,
      effectiveUserId: (selfId) => selfId ?? undefined,
      start: async () => { throw new Error("ImpersonationProvider missing"); },
      stop: async () => {},
    };
  }
  return ctx;
}

import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { getScopedUserId, subscribeScopedUser } from "@/lib/scopedUser";

/**
 * Returns the effective user id for client-scoped queries.
 * Re-renders when impersonation starts/stops so dependent queries refetch.
 */
export function useScopedUserId(): string | null {
  const [authId, setAuthId] = useState<string | null>(null);
  const [scoped, setScoped] = useState<string | null>(getScopedUserId());

  useEffect(() => {
    let mounted = true;
    supabase.auth.getUser().then(({ data }) => {
      if (mounted) setAuthId(data.user?.id ?? null);
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, s) => {
      setAuthId(s?.user?.id ?? null);
    });
    const unsub = subscribeScopedUser((id) => setScoped(id));
    return () => { mounted = false; subscription.unsubscribe(); unsub(); };
  }, []);

  return scoped ?? authId;
}

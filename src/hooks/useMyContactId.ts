import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

/**
 * useMyContactId — resolve the signed-in CLIENT's own `clients.id` (their
 * contact_id) from `auth.uid()`.
 *
 * A portal client is authenticated but is NOT a tenant member, so the only clean
 * link back to their contact row is `clients.linked_user_id = auth.uid()` (the
 * same key `useMyActions` / `useClientPortalBrand` resolve on). RLS on `clients`
 * already scopes a client to their own row, so this single indexed lookup is safe
 * and returns null for anyone who isn't a linked client (staff, platform owner).
 *
 * Kept deliberately tiny and side-effect-free so any client surface that needs
 * "my own contact_id" (the activity rail, a portal widget, …) can reuse it
 * instead of re-querying `clients` inline.
 *
 * @param enabled  Pass false when the caller already has the contact_id (e.g. a
 *                 parent that loaded it via `useMyActions`) to skip the query.
 */
export function useMyContactId(enabled = true): { contactId: string | null; loading: boolean } {
  const [contactId, setContactId] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(enabled);

  useEffect(() => {
    if (!enabled) {
      setContactId(null);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    (async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (cancelled) return;
        if (!user) {
          setContactId(null);
          return;
        }
        const { data } = await supabase
          .from("clients")
          .select("id")
          .eq("linked_user_id", user.id)
          .maybeSingle();
        if (!cancelled) setContactId(data?.id ?? null);
      } catch {
        if (!cancelled) setContactId(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [enabled]);

  return { contactId, loading };
}

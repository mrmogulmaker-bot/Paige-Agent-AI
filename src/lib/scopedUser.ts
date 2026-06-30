// Module-level "effective user" scope used by client-data hooks so that
// staff "View as Client" impersonation can be honored without rewriting every
// hook signature. AppShell sets the scope when impersonation starts / ends.
//
// Read order in hooks:
//   1. explicit userId argument (e.g. useCreditFactors(userId))
//   2. scoped user from this module (impersonation target)
//   3. signed-in auth user
//
// Listeners let hooks rebind queries + Realtime channels when the scope flips.
import { supabase } from "@/integrations/supabase/client";

let scopedUserId: string | null = null;
const listeners = new Set<(id: string | null) => void>();

export function setScopedUserId(id: string | null) {
  if (scopedUserId === id) return;
  scopedUserId = id;
  for (const fn of listeners) {
    try { fn(id); } catch { /* ignore listener errors */ }
  }
}

export function getScopedUserId(): string | null {
  return scopedUserId;
}

export function subscribeScopedUser(fn: (id: string | null) => void): () => void {
  listeners.add(fn);
  return () => { listeners.delete(fn); };
}

/** Resolve the effective user id: scoped impersonation target wins, else the signed-in user. */
export async function getEffectiveUserId(): Promise<string | null> {
  if (scopedUserId) return scopedUserId;
  const { data: { user } } = await supabase.auth.getUser();
  return user?.id ?? null;
}

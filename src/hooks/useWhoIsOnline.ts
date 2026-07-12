import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

/**
 * A person currently present, as returned by `presence_list_online`.
 * Shared across the presence UI (roster widget, avatar stack, Paige tool).
 */
export type PresencePerson = {
  user_id: string;
  tenant_id: string | null;
  full_name: string | null;
  avatar_url: string | null;
  status: "online" | "away";
  last_seen: string;
};

export type UseWhoIsOnlineOptions = {
  /**
   * Platform-owner-only cross-tenant lens. For non-owners the DEFINER RPC
   * ignores this and pins to the caller's own tenant. `null` (default) means
   * own tenant for members, or platform-wide for the owner.
   */
  tenantId?: string | null;
  /** Liveness window in seconds. Must match the heartbeat cadence budget (default 75). */
  windowSeconds?: number;
  /** Poll cadence in ms (default 20000). */
  pollMs?: number;
  /** Gate the hook. When false it does not fetch or poll. */
  enabled?: boolean;
};

export type UseWhoIsOnlineResult = {
  /** Everyone online RIGHT NOW except the signed-in user (a "who else is here" roster). */
  people: PresencePerson[];
  /** Count of others online — equal to `people.length`. */
  othersCount: number;
  loading: boolean;
  error: string | null;
  refresh: () => void;
};

const STATUS_RANK: Record<PresencePerson["status"], number> = {
  online: 0,
  away: 1,
};

/**
 * Sort: online before away, then most-recent `last_seen` first.
 */
function sortPresence(rows: PresencePerson[]): PresencePerson[] {
  return [...rows].sort((a, b) => {
    const byStatus = STATUS_RANK[a.status] - STATUS_RANK[b.status];
    if (byStatus !== 0) return byStatus;
    // Descending last_seen (most recent first).
    return new Date(b.last_seen).getTime() - new Date(a.last_seen).getTime();
  });
}

/**
 * useWhoIsOnline — live roster of who is present right now.
 *
 * Task #148. `user_presence` is deny-all to the browser, so realtime channel
 * subscriptions return nothing. The secure, correct source of truth is the
 * SECURITY DEFINER `presence_list_online` RPC, which we POLL on an interval
 * (and refetch on window focus). This is by design — do not "upgrade" it to a
 * postgres_changes subscription; it would silently return empty.
 *
 * Robust by construction: never throws, sets an `error` string on failure, and
 * keeps the last good roster so a transient blip doesn't clear the UI.
 */
export function useWhoIsOnline(opts?: UseWhoIsOnlineOptions): UseWhoIsOnlineResult {
  const tenantId = opts?.tenantId ?? null;
  const windowSeconds = opts?.windowSeconds ?? 75;
  const pollMs = opts?.pollMs ?? 20_000;
  const enabled = opts?.enabled ?? true;

  const [people, setPeople] = useState<PresencePerson[]>([]);
  const [loading, setLoading] = useState<boolean>(enabled);
  const [error, setError] = useState<string | null>(null);

  // Cache the signed-in uid so we can filter self out of the roster without refetching.
  const selfIdRef = useRef<string | null>(null);
  // Guards against setState after unmount and drops stale in-flight responses.
  const mountedRef = useRef<boolean>(false);
  const requestSeqRef = useRef<number>(0);

  const fetchOnline = useCallback(async (): Promise<void> => {
    if (!enabled) return;
    const seq = ++requestSeqRef.current;

    try {
      if (selfIdRef.current === null) {
        const { data: userData } = await supabase.auth.getUser();
        selfIdRef.current = userData.user?.id ?? "";
      }

      const { data, error: rpcError } = await supabase.rpc(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        "presence_list_online" as any,
        { p_tenant_id: tenantId, p_window_seconds: windowSeconds }
      );

      // Drop if a newer request superseded this one, or we unmounted.
      if (!mountedRef.current || seq !== requestSeqRef.current) return;

      if (rpcError) {
        // Keep last good data; just surface the error.
        setError(rpcError.message);
        return;
      }

      // Exclude self: presence_list_online returns the caller too (their own
      // heartbeat keeps them live), but this is a "who ELSE is here" roster, so
      // people/othersCount/empty-state must all mean OTHERS.
      const selfId = selfIdRef.current;
      const rows = ((data as PresencePerson[] | null) ?? []).filter(
        (r) => !selfId || r.user_id !== selfId,
      );
      setPeople(sortPresence(rows));
      setError(null);
    } catch (err: unknown) {
      if (!mountedRef.current || seq !== requestSeqRef.current) return;
      setError(err instanceof Error ? err.message : "Failed to load presence");
    } finally {
      if (mountedRef.current && seq === requestSeqRef.current) {
        setLoading(false);
      }
    }
  }, [enabled, tenantId, windowSeconds]);

  const refresh = useCallback((): void => {
    void fetchOnline();
  }, [fetchOnline]);

  useEffect(() => {
    mountedRef.current = true;

    if (!enabled) {
      setLoading(false);
      return () => {
        mountedRef.current = false;
      };
    }

    setLoading(true);
    void fetchOnline();

    const interval = window.setInterval(() => {
      void fetchOnline();
    }, pollMs);

    const onFocus = (): void => {
      void fetchOnline();
    };
    window.addEventListener("focus", onFocus);

    return () => {
      mountedRef.current = false;
      window.clearInterval(interval);
      window.removeEventListener("focus", onFocus);
    };
  }, [enabled, pollMs, fetchOnline]);

  // `people` is already self-excluded at fetch time, so the count is just its length.
  const othersCount = people.length;

  return { people, othersCount, loading, error, refresh };
}

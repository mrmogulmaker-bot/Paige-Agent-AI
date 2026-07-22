import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { PresenceStatus } from "@/components/ui/page/PresenceDot";

/**
 * useEffectivePresence — the FULL team availability roster (IA slice 1c-ix).
 *
 * Sibling to useWhoIsOnline (Task #148), the same hard rule applies: `user_presence`
 * is deny-all to the browser, so a realtime channel returns nothing. The secure
 * source of truth is the SECURITY DEFINER `presence_list_effective` RPC, which we
 * POLL on an interval (+ refetch on focus). DO NOT "upgrade" this to postgres_changes.
 *
 * Difference from useWhoIsOnline: this is the whole roster (NOT self-excluded — the
 * Team floor shows everyone, including you), and it carries the effective/override
 * layer (a pinned "busy"/"off" wins over the live heartbeat until it ages out).
 *
 * Robust by construction: never throws, keeps the last-good roster on a transient
 * blip, and drops stale in-flight responses via a request-seq guard.
 */
export type EffectivePerson = {
  user_id: string;
  tenant_id: string | null;
  full_name: string | null;
  avatar_url: string | null;
  /** Raw heartbeat-derived status before an override is applied. */
  live_status: PresenceStatus;
  /** What to SHOW — an active override wins over live_status, else live_status. */
  effective_status: PresenceStatus;
  /** The pinned override status, or null when none is active. */
  override_status: PresenceStatus | null;
  /** Free-text reason paired with an override (e.g. "on PTO"). */
  override_reason: string | null;
  last_seen: string;
};

export type UseEffectivePresenceOptions = {
  /**
   * Platform-owner-only cross-tenant lens. For non-owners the DEFINER RPC ignores
   * this and pins to the caller's own tenant. `null` (default) means own tenant for
   * members, or platform-wide for the owner.
   */
  tenantId?: string | null;
  /** Liveness window in seconds — must match the heartbeat cadence budget (default 75). */
  windowSeconds?: number;
  /** Override TTL in seconds — a pin ages out after this (default 12h). */
  overrideTtlSeconds?: number;
  /** Poll cadence in ms (default 20000). */
  pollMs?: number;
  /** Gate the hook. When false it does not fetch or poll. */
  enabled?: boolean;
};

export type UseEffectivePresenceResult = {
  people: EffectivePerson[];
  loading: boolean;
  error: string | null;
  refresh: () => void;
};

// Sort weight so a group lists online → busy → away → offline.
const STATUS_RANK: Record<PresenceStatus, number> = {
  online: 0,
  busy: 1,
  away: 2,
  offline: 3,
};

export function presenceRank(status: PresenceStatus): number {
  return STATUS_RANK[status] ?? 9;
}

export function useEffectivePresence(opts?: UseEffectivePresenceOptions): UseEffectivePresenceResult {
  const tenantId = opts?.tenantId ?? null;
  const windowSeconds = opts?.windowSeconds ?? 75;
  const overrideTtlSeconds = opts?.overrideTtlSeconds ?? 43_200;
  const pollMs = opts?.pollMs ?? 20_000;
  const enabled = opts?.enabled ?? true;

  const [people, setPeople] = useState<EffectivePerson[]>([]);
  const [loading, setLoading] = useState<boolean>(enabled);
  const [error, setError] = useState<string | null>(null);

  const mountedRef = useRef<boolean>(false);
  const requestSeqRef = useRef<number>(0);

  const fetchPresence = useCallback(async (): Promise<void> => {
    if (!enabled) return;
    const seq = ++requestSeqRef.current;

    try {
      const { data, error: rpcError } = await supabase.rpc(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        "presence_list_effective" as any,
        {
          p_tenant_id: tenantId,
          p_window_seconds: windowSeconds,
          p_override_ttl_seconds: overrideTtlSeconds,
        },
      );

      if (!mountedRef.current || seq !== requestSeqRef.current) return;

      if (rpcError) {
        // Keep last-good roster; surface the error only.
        setError(rpcError.message);
        return;
      }

      const rows = ((data as EffectivePerson[] | null) ?? []).slice();
      rows.sort((a, b) => presenceRank(a.effective_status) - presenceRank(b.effective_status));
      setPeople(rows);
      setError(null);
    } catch (err: unknown) {
      if (!mountedRef.current || seq !== requestSeqRef.current) return;
      setError(err instanceof Error ? err.message : "Failed to load presence");
    } finally {
      if (mountedRef.current && seq === requestSeqRef.current) {
        setLoading(false);
      }
    }
  }, [enabled, tenantId, windowSeconds, overrideTtlSeconds]);

  const refresh = useCallback((): void => {
    void fetchPresence();
  }, [fetchPresence]);

  useEffect(() => {
    mountedRef.current = true;

    if (!enabled) {
      setLoading(false);
      return () => {
        mountedRef.current = false;
      };
    }

    setLoading(true);
    void fetchPresence();

    const interval = window.setInterval(() => {
      void fetchPresence();
    }, pollMs);

    const onFocus = (): void => {
      void fetchPresence();
    };
    window.addEventListener("focus", onFocus);

    return () => {
      mountedRef.current = false;
      window.clearInterval(interval);
      window.removeEventListener("focus", onFocus);
    };
  }, [enabled, pollMs, fetchPresence]);

  return { people, loading, error, refresh };
}

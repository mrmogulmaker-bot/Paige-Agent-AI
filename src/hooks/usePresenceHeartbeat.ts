import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";

/**
 * usePresenceHeartbeat — publishes the signed-in user's live presence.
 *
 * Task #148 — real-time presence ("who's online now"). This hook is pure
 * telemetry: it pings the SECURITY DEFINER `presence_heartbeat` RPC on an
 * interval so the caller's `user_presence` row stays fresh, flips to 'away'
 * when the tab is backgrounded, and best-effort clears the row on exit.
 *
 * Design notes (honor the DB layer):
 *  - The liveness window server-side is 75s; we heartbeat every 30s so a live
 *    user always sits comfortably inside the window with margin for a missed
 *    tick.
 *  - `user_presence` is deny-all to the browser (RLS on, grants revoked), so
 *    there is nothing to subscribe to — writes go exclusively through the
 *    DEFINER RPCs. Reads live in `useWhoIsOnline` via polling.
 *  - Errors are swallowed. Presence is not a user action; a failed ping must
 *    never surface to the app. `console.debug` at most.
 *
 * @param enabled  Gate the whole hook. When false it does nothing and tears
 *                 down any prior interval/listeners.
 */
export function usePresenceHeartbeat(enabled: boolean): void {
  useEffect(() => {
    if (!enabled) return;

    let cancelled = false;

    const beat = (status: "online" | "away"): void => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      void supabase
        .rpc("presence_heartbeat" as any, { p_status: status, p_meta: {} })
        .then(({ error }) => {
          if (error) console.debug("[presence] heartbeat failed", error.message);
        })
        // Defensive: the thenable can still reject on transport failure.
        .then(undefined, (err: unknown) => {
          console.debug("[presence] heartbeat threw", err);
        });
    };

    const goOffline = (): void => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      void supabase
        .rpc("presence_go_offline" as any, {})
        .then(({ error }) => {
          if (error) console.debug("[presence] go_offline failed", error.message);
        })
        .then(undefined, (err: unknown) => {
          console.debug("[presence] go_offline threw", err);
        });
    };

    // Fire immediately so the user shows up without waiting a full interval.
    beat("online");

    const interval = window.setInterval(() => {
      if (cancelled) return;
      // If the tab is hidden keep them 'away'; otherwise refresh 'online'.
      beat(document.visibilityState === "hidden" ? "away" : "online");
    }, 30_000);

    const onVisibilityChange = (): void => {
      if (cancelled) return;
      beat(document.visibilityState === "hidden" ? "away" : "online");
    };

    const onBeforeUnload = (): void => {
      // Best-effort; do not block unload. The 75s window ages the row out even
      // if this never lands.
      goOffline();
    };

    document.addEventListener("visibilitychange", onVisibilityChange);
    window.addEventListener("beforeunload", onBeforeUnload);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisibilityChange);
      window.removeEventListener("beforeunload", onBeforeUnload);
      // Clean exit on unmount (route change, logout, disable).
      goOffline();
    };
  }, [enabled]);
}

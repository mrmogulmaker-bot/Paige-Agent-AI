import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

/**
 * A single Paige Context Rail event as it arrives over Realtime.
 *
 * Mirrors the broadcast payload emitted server-side by `record_rail_event`
 * (SECURITY DEFINER) via `realtime.send(...)`. The shape is intentionally the
 * subset a subscribed surface needs to render a rail line — not the full DB row.
 */
export type RailEvent = {
  id: string;
  event_kind: string;
  surface: string;
  actor_type: string;
  audience: string;
  visibility: string;
  title: string;
  summary?: string | null;
  occurred_at: string;
  contact_id?: string | null;
};

export type UseRailEventsOptions =
  | { scope: "tenant"; tenantId: string | null }
  | { scope: "client"; contactId: string | null };

export type UseRailEventsResult = {
  /** Most-recent events first, capped at ~50. */
  events: RailEvent[];
  /** True once the private broadcast channel reports SUBSCRIBED. */
  connected: boolean;
};

/** How many recent events we retain in memory. */
const MAX_EVENTS = 50;

/** The single broadcast event name every rail write rides. */
const RAIL_BROADCAST_EVENT = "rail_event";

/**
 * Resolve the topic + the id it depends on for the given scope. Returns a null
 * `id` when the subscription must NOT be opened (missing/empty identifier).
 */
function resolveTopic(opts: UseRailEventsOptions): { topic: string | null; id: string | null } {
  if (opts.scope === "tenant") {
    const id = opts.tenantId && opts.tenantId.length > 0 ? opts.tenantId : null;
    return { topic: id ? `rail:tenant:${id}` : null, id };
  }
  const id = opts.contactId && opts.contactId.length > 0 ? opts.contactId : null;
  return { topic: id ? `rail:client:${id}` : null, id };
}

/**
 * Best-effort coercion of a broadcast payload into a `RailEvent`. Live telemetry
 * must never throw into the app, so a malformed frame is dropped (returns null)
 * rather than crashing the subscriber.
 */
function coerceRailEvent(raw: unknown): RailEvent | null {
  if (!raw || typeof raw !== "object") return null;
  const p = raw as Record<string, unknown>;
  if (typeof p.id !== "string" || typeof p.event_kind !== "string") return null;
  return {
    id: p.id,
    event_kind: p.event_kind,
    surface: typeof p.surface === "string" ? p.surface : "",
    actor_type: typeof p.actor_type === "string" ? p.actor_type : "",
    audience: typeof p.audience === "string" ? p.audience : "",
    visibility: typeof p.visibility === "string" ? p.visibility : "",
    title: typeof p.title === "string" ? p.title : "",
    summary: typeof p.summary === "string" ? p.summary : null,
    occurred_at: typeof p.occurred_at === "string" ? p.occurred_at : new Date().toISOString(),
    contact_id: typeof p.contact_id === "string" ? p.contact_id : null,
  };
}

/**
 * useRailEvents — live subscriber for the Paige Context Rail.
 *
 * Paige Context Rail STEP 2. A rail write in `record_rail_event` broadcasts,
 * server-side and as the DEFINER owner, onto one of two PRIVATE topic families:
 *   - `rail:tenant:<tenant_id>`  — staff receive EVERY event for the tenant.
 *   - `rail:client:<contact_id>` — the portal client receives ONLY the
 *     client-visible events (owner_internal is never broadcast to this topic).
 *
 * Isolation is enforced in the DB (a `realtime.messages` SELECT policy gated on
 * `realtime.topic()`), exactly like the presence layer
 * (`20260712170000_user_presence_realtime_topic_rls.sql`). This hook only
 * RECEIVES; clients never broadcast.
 *
 * Robust by construction:
 *  - No subscription when the scoped id is null/empty.
 *  - Tears down and re-opens the channel on id/scope change and on unmount
 *    (`supabase.removeChannel`), with no setState-after-unmount.
 *  - Never throws; a malformed frame is dropped, not surfaced.
 *
 * @param opts     `{ scope: 'tenant', tenantId }` for staff surfaces, or
 *                 `{ scope: 'client', contactId }` for the portal client.
 * @param onEvent  Optional per-event callback, fired for each live event.
 */
export function useRailEvents(
  opts: UseRailEventsOptions,
  onEvent?: (e: RailEvent) => void,
): UseRailEventsResult {
  const { topic, id } = resolveTopic(opts);

  const [events, setEvents] = useState<RailEvent[]>([]);
  const [connected, setConnected] = useState<boolean>(false);

  // Guards against setState after unmount / after the id changed.
  const mountedRef = useRef<boolean>(false);
  // Keep the latest callback without re-subscribing when only the callback
  // identity changes (callers often pass an inline function).
  const onEventRef = useRef<typeof onEvent>(onEvent);
  onEventRef.current = onEvent;

  useEffect(() => {
    mountedRef.current = true;

    // No id → nothing to subscribe to. Ensure a clean, disconnected state.
    if (!topic || !id) {
      setConnected(false);
      setEvents([]);
      return () => {
        mountedRef.current = false;
      };
    }

    // A fresh topic is a fresh stream — drop any events from the prior scope.
    setEvents([]);
    setConnected(false);

    // Private broadcast channel — receive-only. RLS on `realtime.messages`
    // decides what actually lands here (own tenant / own client-visible only).
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const channel = supabase.channel(topic, { config: { private: true } } as any);

    channel
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .on("broadcast" as any, { event: RAIL_BROADCAST_EVENT }, (msg: any) => {
        try {
          // realtime.send (server-side DB broadcast) can nest the app payload one
          // level deeper (msg.payload.payload) than a client channel.send frame —
          // accept both shapes so a shape mismatch never silently renders nothing.
          const event = coerceRailEvent(msg?.payload) ?? coerceRailEvent(msg?.payload?.payload);
          if (!event) {
            if (msg?.payload) console.debug("[rail] unrecognized frame shape", msg?.payload);
            return;
          }
          if (!mountedRef.current) return;
          setEvents((prev) => [event, ...prev].slice(0, MAX_EVENTS));
          onEventRef.current?.(event);
        } catch (err) {
          // Live telemetry: swallow. A bad frame must never break the app.
          console.debug("[rail] failed to handle event", err);
        }
      })
      .subscribe((status: string) => {
        if (!mountedRef.current) return;
        setConnected(status === "SUBSCRIBED");
      });

    return () => {
      mountedRef.current = false;
      // Removing the channel also unsubscribes; guard against transport throws.
      try {
        void supabase.removeChannel(channel);
      } catch (err) {
        console.debug("[rail] failed to remove channel", err);
      }
    };
    // Re-subscribe only when the actual topic/id changes, not on callback identity.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [topic, id]);

  return { events, connected };
}

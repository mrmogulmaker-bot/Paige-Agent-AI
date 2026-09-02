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
  /** Most-recent events first, capped at ~50. Backfilled history plus anything live since mount. */
  events: RailEvent[];
  /** True once the private broadcast channel reports SUBSCRIBED. */
  connected: boolean;
  /** False until the history read has settled — either way. */
  historyLoaded: boolean;
  /**
   * Why the history is missing, when it is. `null` means it loaded.
   *
   * §13 — AN EMPTY LIST IS NOT AN ANSWER ON ITS OWN. "nothing has happened" and "the read failed"
   * render identically as an empty feed, and the second one told the operator, with confidence,
   * that Paige had done nothing. A caller that wants to say "nothing yet" needs to know which of
   * the two it is looking at, so the distinction is exposed rather than flattened here.
   */
  historyError: string | null;
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
 * Which column scopes the history read.
 *
 * ── RETIRED FROM THE READ PATH BY #746, AND SAYING SO IS THE POINT. ──
 *
 * This is no longer called by anything but its own test. The history read no longer filters a
 * relation at all — it calls a per-scope SECURITY DEFINER resolver, and the isolation decision
 * this function used to carry is now made SERVER-SIDE, where a browser cannot reach it:
 * `get_client_rail` derives the tenant from the contact row, and `get_solo_rail_activity` takes
 * no tenant argument whatsoever. That is strictly stronger than choosing a column correctly.
 *
 * It is kept rather than deleted for two reasons, both temporary: PR #729 is in flight against
 * this exact file, and its test still documents the rule the resolvers now enforce. Deleting an
 * exported, tested symbol under an in-flight PR buys a merge conflict and no safety. Its removal
 * is filed as a parked follow-up rather than smuggled into a security repair.
 *
 * The original note, which explains WHY the rule exists, still stands:
 *
 * §9 — THIS WAS THE WHOLE ISOLATION DECISION FOR THE BACKFILL, so it is a named function rather
 * than a ternary buried in an effect. A client feed narrowed by `tenant_id` would show one portal
 * client every other client's events; a tenant feed narrowed by `contact_id` would show a staff
 * surface almost nothing. RLS would still refuse the first — `pce_client_read` requires the
 * contact be linked to the caller — but a filter that depends on RLS to correct it is one policy
 * change away from being the leak, and the mistake is a single word.
 */
export function railHistoryFilter(
  opts: UseRailEventsOptions,
  id: string,
): { column: "contact_id" | "tenant_id"; value: string } {
  return opts.scope === "client"
    ? { column: "contact_id", value: id }
    : { column: "tenant_id", value: id };
}

/**
 * Merge backfilled history UNDER whatever is already live, newest first, deduped by id, capped.
 *
 * History goes second on purpose: a frame that arrived while the read was in flight is newer than
 * every row it returns. Dedupe is by id because the SAME event reaches this both ways — it is
 * broadcast and persisted by one call in `record_rail_event` — and the two race either direction.
 * Without it the feed shows a doubled line for anything that happens while a surface is opening,
 * which is exactly when someone is most likely to be watching.
 */
export function mergeRailHistory(live: RailEvent[], history: RailEvent[], cap = MAX_EVENTS): RailEvent[] {
  const seen = new Set(live.map((e) => e.id));
  return [...live, ...history.filter((e) => !seen.has(e.id))].slice(0, cap);
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
  const [historyLoaded, setHistoryLoaded] = useState<boolean>(false);
  const [historyError, setHistoryError] = useState<string | null>(null);

  // Guards against setState after unmount / after the id changed.
  const mountedRef = useRef<boolean>(false);
  // Keep the latest callback without re-subscribing when only the callback
  // identity changes (callers often pass an inline function).
  const onEventRef = useRef<typeof onEvent>(onEvent);
  onEventRef.current = onEvent;

  useEffect(() => {
    mountedRef.current = true;

    // No id → nothing to subscribe to. Ensure a clean, disconnected state.
    //
    // §13 — `historyLoaded` SETTLES TRUE here, and that is a fix, not a tidy-up. It used to stay
    // false forever on this path, so a consumer asking "has the history finished loading?" was
    // told "still loading" for the lifetime of the surface. There is genuinely nothing to load
    // without a scope, and "no read was attempted" is a settled state, not a pending one. It was
    // only latent because nothing read the field; #746 makes both consumers read it, which turns
    // a dormant contract gap into a permanent spinner.
    if (!topic || !id) {
      setConnected(false);
      setEvents([]);
      setHistoryLoaded(true);
      setHistoryError(null);
      return () => {
        mountedRef.current = false;
      };
    }

    // A fresh topic is a fresh stream — drop any events from the prior scope.
    setEvents([]);
    setConnected(false);
    setHistoryLoaded(false);
    setHistoryError(null);

    // ── HISTORY. This hook used to subscribe and nothing else, so every rail surface started
    // EMPTY on every mount and showed only what happened to arrive while it was open. The durable
    // rows were already there — `record_rail_event` has been writing them all along — and no feed
    // read them. An operator who opened the page a minute after Paige acted saw nothing, which
    // reads as "she has done nothing" rather than "you were not watching".
    //
    // §9 — THE SCOPING IS THE SERVER'S. Read through a resolver, never the relation.
    //
    // This used to be `supabase.from("paige_client_events")`, and it could not execute at all:
    // `20260712190000:94` granted SELECT to `authenticated` and `20260712200000:25` revoked it,
    // so every history read returned `42501` BEFORE row-level security was consulted. The policies
    // this code reasoned about were never evaluated. Verified on production 2026-09-02:
    // `has_table_privilege('authenticated','public.paige_client_events','SELECT')` → false.
    //
    // The repair routes to a SECURITY DEFINER resolver per scope rather than re-granting the
    // table, because `useSoloActivityFeed` reads this same relation with NO filter at all — a
    // grant would make an unfiltered browser read of a cross-tenant activity table live — and
    // because PR #644 is revoking every remaining browser privilege here on its way to the same
    // RPC-only boundary. Each resolver re-enforces the caller's scope in its own body (§59); the
    // EXECUTE grant is not the guard.
    void (async () => {
      try {
        // `get_client_rail` already existed and is already granted — adopted, not rebuilt. It
        // resolves the tenant from the contact row and lens-redacts payload / actor ids for a
        // client caller. `get_solo_rail_activity` is the tenant-scoped sibling added by #746; it
        // takes NO tenant argument, so a caller cannot name a workspace.
        const { data, error } = opts.scope === "client"
          ? await supabase.rpc("get_client_rail", {
              p_contact_id: id,
              p_limit: MAX_EVENTS,
              p_lens: "client",
            })
          : await supabase.rpc("get_solo_rail_activity", { p_limit: MAX_EVENTS });
        if (!mountedRef.current) return;
        if (error) {
          // Never invent an empty history out of a failed read (§13).
          setHistoryError(error.message || "could not load activity history");
          setHistoryLoaded(true);
          return;
        }
        const history = (data ?? []).map(coerceRailEvent).filter((e): e is RailEvent => e !== null);
        // Merge UNDER anything already live: a frame that arrived while this was in flight is
        // newer than every backfilled row, and re-adding it would double it in the feed.
        setEvents((live) => mergeRailHistory(live, history));
        setHistoryLoaded(true);
      } catch (err) {
        if (!mountedRef.current) return;
        setHistoryError(err instanceof Error ? err.message : "could not load activity history");
        setHistoryLoaded(true);
      }
    })();

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
          // Dedupe by id: an event can reach this both live and through the history read, and the
          // two races either way round.
          setEvents((prev) => (prev.some((e) => e.id === event.id) ? prev : [event, ...prev].slice(0, MAX_EVENTS)));
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

  return { events, connected, historyLoaded, historyError };
}

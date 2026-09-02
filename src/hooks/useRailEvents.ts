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
 * §9 — THIS IS THE WHOLE ISOLATION DECISION FOR THE BACKFILL, so it is a named function rather
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

  // Which topic the events currently in state were read for.
  const [renderedTopic, setRenderedTopic] = useState<string | null>(topic);

  // ── THE PRIOR SCOPE IS DROPPED DURING RENDER, NOT AFTER PAINT. ──
  //
  // §9 — clearing in the effect was not enough, and independent review of the pushed diff caught
  // it. `useEffect` is passive: on a scope change React re-renders with the PREVIOUS scope's
  // events still in state, COMMITS that, and only then runs the effect that empties it. Neither
  // rail caller is keyed by scope, so nothing remounts to save it — the operator gets one painted
  // frame of another tenant's activity, and the portal client one of another client's.
  //
  // The effect-local `cancelled` flag below stops a superseded RESPONSE landing. This stops the
  // superseded STATE being shown. They are two different halves of the same rule, and the sibling
  // repair in `useSoloPendingActions` had already reasoned its way to this one.
  if (renderedTopic !== topic) {
    setRenderedTopic(topic);
    setEvents([]);
    setConnected(false);
    setHistoryLoaded(false);
    setHistoryError(null);
  }

  // Keep the latest callback without re-subscribing when only the callback identity changes
  // (callers often pass an inline function).
  //
  // §9 — UPDATED AFTER COMMIT, NOT DURING RENDER, and independent review of the pushed diff is why.
  // Assigning during render moved the ref forward BEFORE the old effect's cleanup ran, so in that
  // window a frame still arriving on the PREVIOUS scope's channel would have been handed to the NEW
  // render's callback — a prior-scope event delivered to a consumer that had already moved on. The
  // `setEvents` half self-heals; a caller's side effect does not. Latent today (neither rail
  // consumer passes `onEvent`) and closed anyway, because "no caller uses it yet" is a schedule,
  // not a guarantee.
  const onEventRef = useRef<typeof onEvent>(onEvent);
  useEffect(() => {
    onEventRef.current = onEvent;
  });

  useEffect(() => {
    // ── THE GUARD IS EFFECT-LOCAL, AND THAT IS THE WHOLE POINT. ──
    //
    // §9 — this used to be a component-lifetime ref, which CANNOT express "the scope that asked
    // for this is no longer the scope being looked at". On a tenant or contact switch React runs
    // the old effect's cleanup (which cleared the shared flag) and then the new effect's body
    // (which set it again) — both BEFORE the previous scope's history read resolves. The stale
    // response then read a flag that had been switched back on by the very effect that superseded
    // it, passed the check, and merged the PREVIOUS scope's rows into the new feed: one account's
    // activity rendered inside another's, one portal client's inside another's.
    //
    // RLS is not what failed here. It returned those rows legitimately, to the scope that asked
    // for them. WHICH SCOPE IS STILL ON SCREEN is this hook's to know, and only a flag owned by a
    // single effect run can know it — nothing that runs later can reach in and revive it.
    let cancelled = false;

    // No id → nothing to subscribe to. The render-time reset above has already emptied the
    // state, so there is nothing to do but decline to subscribe.
    if (!topic || !id) {
      return () => {
        cancelled = true;
      };
    }

    // ── HISTORY. This hook used to subscribe and nothing else, so every rail surface started
    // EMPTY on every mount and showed only what happened to arrive while it was open. The durable
    // rows were already there — `record_rail_event` has been writing them all along — and no feed
    // read them. An operator who opened the page a minute after Paige acted saw nothing, which
    // reads as "she has done nothing" rather than "you were not watching".
    //
    // §9 — the scoping is the TABLE's, not this query's. `pce_client_read` admits a row only when
    // it is audience client/both, `visibility='client_visible'`, and the contact is linked to the
    // caller; `pce_staff_read` requires the caller's active tenant plus a staff role. So the read
    // reproduces exactly what the broadcast topics already enforce — owner-internal events cannot
    // reach a portal client through this path any more than through the live one — and the filter
    // below narrows WITHIN that, it does not widen it.
    void (async () => {
      try {
        let q = supabase
          .from("paige_client_events")
          .select("id,event_kind,surface,actor_type,audience,visibility,title,summary,occurred_at,contact_id")
          .order("occurred_at", { ascending: false })
          .limit(MAX_EVENTS);
        const f = railHistoryFilter(opts, id);
        q = q.eq(f.column, f.value);
        const { data, error } = await q;
        // Superseded: this answer belongs to a scope nobody is looking at any more, so it is
        // dropped rather than merged — including its error, which is not the new scope's news.
        if (cancelled) return;
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
        if (cancelled) return;
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
          if (cancelled) return;
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
        if (cancelled) return;
        setConnected(status === "SUBSCRIBED");
      });

    return () => {
      cancelled = true;
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

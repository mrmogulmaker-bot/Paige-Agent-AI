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
  /**
   * The acting agent's tenant-safe display name, or null.
   *
   * Null is a real answer with three distinct meanings, and none of them is "PAIGE did it":
   * no agent acted; an agent acted but has no name a business owner should be shown (an
   * internal build-crew seat); or the agent is no longer in scope for this workspace. The
   * server withholds the label in each case. Render the absence — never substitute a
   * generic label, which would re-create exactly the collapse this field exists to end.
   */
  actor_agent?: string | null;
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

/**
 * The four answers a history read can give, and they are FOUR, not two.
 *
 * `loading`     — the read has not settled. Say nothing about what exists yet.
 * `ready`       — the read succeeded. An empty list here genuinely means nothing happened.
 * `forbidden`   — the DATABASE REFUSED (`RAIL_FORBIDDEN`, SQLSTATE 42501). The caller is not
 *                 entitled to this rail in this workspace. This is not an outage and it is
 *                 emphatically not "nothing happened".
 * `unavailable` — the read failed for some other reason (transport, timeout, an unexpected
 *                 server error). Also not "nothing happened".
 *
 * §13 — COLLAPSING THESE IS THE DEFECT. Until this slice, a refusal and an outage both left the
 * feed empty and every surface rendered the same "Nothing yet" copy, which told an operator with
 * confidence that Paige had done nothing. The four states are modelled here, once, so no consumer
 * has to reconstruct the distinction from a truthy check on an error string.
 */
export type RailHistoryStatus = "loading" | "ready" | "forbidden" | "unavailable";

export type UseRailEventsResult = {
  /** Most-recent events first, capped at ~50. Backfilled history plus anything live since mount. */
  events: RailEvent[];
  /** True once the private broadcast channel reports SUBSCRIBED. */
  connected: boolean;
  /** Which of the four answers the history read gave. */
  historyStatus: RailHistoryStatus;
  /** Convenience, DERIVED from `historyStatus` so the two can never disagree. */
  historyLoaded: boolean;
  /**
   * The failure detail, when there is one. `null` on `loading` and on `ready`.
   *
   * A message is never the state — `historyStatus` is. This carries the detail a diagnostic
   * needs; it must not be used to decide whether the feed is empty or refused.
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
export function coerceRailEvent(raw: unknown): RailEvent | null {
  if (!raw || typeof raw !== "object") return null;
  const p = raw as Record<string, unknown>;
  if (typeof p.id !== "string" || typeof p.event_kind !== "string") return null;
  return {
    id: p.id,
    event_kind: p.event_kind,
    surface: typeof p.surface === "string" ? p.surface : "",
    actor_type: typeof p.actor_type === "string" ? p.actor_type : "",
    // This coercion is a WHITELIST — it builds a new object rather than spreading — so a
    // field the server starts sending is dropped silently until it is named here. That is
    // the half-changed response contract §37 warns about: the write lands, the read looks
    // healthy, and the value never arrives.
    actor_agent: typeof p.actor_agent === "string" && p.actor_agent.length > 0 ? p.actor_agent : null,
    audience: typeof p.audience === "string" ? p.audience : "",
    visibility: typeof p.visibility === "string" ? p.visibility : "",
    title: typeof p.title === "string" ? p.title : "",
    summary: typeof p.summary === "string" ? p.summary : null,
    occurred_at: typeof p.occurred_at === "string" ? p.occurred_at : new Date().toISOString(),
    contact_id: typeof p.contact_id === "string" ? p.contact_id : null,
  };
}

/** The RPC a history read issues for a given scope, and the arguments it passes. */
export type RailHistoryRequest =
  | { fn: "get_solo_rail_activity"; args: { p_limit: number } }
  | { fn: "get_client_rail"; args: { p_contact_id: string; p_limit: number; p_lens: "client" } };

/**
 * Which DEPLOYED resolver answers this scope — the whole isolation decision for the backfill,
 * kept as a named function so it is graded on its own rather than buried in an effect.
 *
 * §9 — THE SCOPE IS NOW THE SERVER'S, NOT THIS QUERY'S. Both readers are `SECURITY DEFINER` and
 * both re-enforce the caller's scope in-body (§59): they resolve the workspace from
 * `current_user_tenant_id()` / the contact's own tenant, require an active `tenant_members` row of
 * that SAME workspace at owner/admin/coach, and otherwise `raise ... 42501 RAIL_FORBIDDEN`. A
 * caller cannot widen either one by passing a different id, because neither takes one:
 *
 *   • tenant scope → `get_solo_rail_activity(p_limit)`. Takes NO tenant argument at all. The
 *     `tenantId` this hook receives is used ONLY to key the subscription topic and to detect a
 *     workspace switch; it is never sent, so it cannot be used to read another workspace's rail.
 *   • client scope → `get_client_rail(p_contact_id, p_limit, p_lens)`, always at the CLIENT lens.
 *     The client lens is the narrower projection: the resolver nulls `actor_user_id`,
 *     `from_department`, `to_department`, `ref_table`, `ref_id` and returns `payload` as `{}`,
 *     and admits only `audience in ('client','both') and visibility = 'client_visible'`. This
 *     hook then selects the ten display fields below, so no raw payload or internal identifier
 *     reaches a surface on either lens.
 *
 * This replaces a direct `.from("paige_client_events").eq(...)` read that depended on RLS to
 * correct a client-vs-tenant column mix-up. A filter that depends on a policy to be safe is one
 * policy change away from being the leak; a resolver that refuses is not.
 */
export function railHistoryRequest(
  opts: UseRailEventsOptions,
  id: string,
  limit: number = MAX_EVENTS,
): RailHistoryRequest {
  return opts.scope === "client"
    ? { fn: "get_client_rail", args: { p_contact_id: id, p_limit: limit, p_lens: "client" } }
    : { fn: "get_solo_rail_activity", args: { p_limit: limit } };
}

/**
 * Refusal or outage — decided from SQLSTATE, never from prose.
 *
 * Both readers raise `42501` with the message `RAIL_FORBIDDEN`, which PostgREST surfaces as
 * `code: "42501"`. The message is checked too, because a transport that loses the code must not
 * silently downgrade a refusal into "the server is having trouble" — the two mean different
 * things to the person reading the surface.
 */
export function classifyRailReadError(
  error: { code?: string | null; message?: string | null } | null | undefined,
): Exclude<RailHistoryStatus, "loading" | "ready"> {
  const code = error?.code ?? "";
  const message = error?.message ?? "";
  return code === "42501" || message.includes("RAIL_FORBIDDEN") ? "forbidden" : "unavailable";
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
 * useRailEvents — live subscriber + history reader for the Paige Context Rail.
 *
 * Paige Context Rail STEP 2. A rail write in `record_rail_event` broadcasts,
 * server-side and as the DEFINER owner, onto one of two PRIVATE topic families:
 *   - `rail:tenant:<tenant_id>`  — staff receive EVERY event for the tenant.
 *   - `rail:client:<contact_id>` — the portal client receives ONLY the
 *     client-visible events (owner_internal is never broadcast to this topic).
 *
 * Live isolation is enforced in the DB (a `realtime.messages` SELECT policy gated on
 * `realtime.topic()`), exactly like the presence layer. History isolation is enforced by the
 * deployed resolvers named in `railHistoryRequest`. This hook only RECEIVES; clients never
 * broadcast.
 *
 * REQUEST SAFETY — an old answer must never paint under a new workspace. Two things change the
 * scope out from under an in-flight read: switching workspace, and opening a different client.
 * Both are handled by ONE monotonic counter:
 *   • the scope guard runs DURING RENDER, not in an effect. An effect is passive — React commits
 *     the frame before it runs — so resetting there shortens the stale frame instead of removing
 *     it, and the previous workspace's events are briefly painted under the new one's heading.
 *     Bumping the counter and clearing in render means that frame never exists.
 *   • every read captures the counter it was issued under and discards its own result if the
 *     counter has moved. So a slow response for workspace A cannot land after a switch to B, and
 *     a slow earlier response cannot overwrite a newer one within the same scope.
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
  const scopeKey = `${opts.scope}:${id ?? ""}`;

  const [events, setEvents] = useState<RailEvent[]>([]);
  const [connected, setConnected] = useState<boolean>(false);
  const [historyStatus, setHistoryStatus] = useState<RailHistoryStatus>(id ? "loading" : "ready");
  const [historyError, setHistoryError] = useState<string | null>(null);

  // Monotonic request counter. Bumped on a scope change (in render) and again per read (in the
  // effect); a response is honoured only while it still matches.
  const requestSeq = useRef(0);
  // Guards against setState after unmount.
  const mountedRef = useRef<boolean>(false);
  // Keep the latest callback without re-subscribing when only the callback
  // identity changes (callers often pass an inline function).
  const onEventRef = useRef<typeof onEvent>(onEvent);
  onEventRef.current = onEvent;

  // ── THE RENDER-TIME SCOPE GUARD. Deliberately not an effect; see the note above.
  const [renderedScope, setRenderedScope] = useState<string>(scopeKey);
  if (renderedScope !== scopeKey) {
    requestSeq.current += 1; // anything in flight for the old scope is now stale
    setRenderedScope(scopeKey);
    setEvents([]);
    setConnected(false);
    setHistoryStatus(id ? "loading" : "ready");
    setHistoryError(null);
  }

  useEffect(() => {
    mountedRef.current = true;

    // No id → nothing to subscribe to and nothing to read. `ready` with an empty list is the
    // honest answer: we were not refused, there is simply no scope yet.
    if (!topic || !id) {
      return () => {
        mountedRef.current = false;
      };
    }

    // ── HISTORY. This hook used to subscribe and nothing else, so every rail surface started
    // EMPTY on every mount and showed only what happened to arrive while it was open. The durable
    // rows were already there — `record_rail_event` has been writing them all along — and no feed
    // read them. An operator who opened the page a minute after Paige acted saw nothing, which
    // reads as "she has done nothing" rather than "you were not watching".
    const seq = ++requestSeq.current;
    const request = railHistoryRequest(opts, id);

    void (async () => {
      try {
        const { data, error } = await supabase.rpc(
          // `get_solo_rail_activity` post-dates the last `types.ts` regeneration, so its name is
          // not yet in the generated RPC union. Cast at the call site, as the codebase already
          // does elsewhere, rather than regenerate a shared 20k-line artifact inside a Rail slice.
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          request.fn as any,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          request.args as any,
        );
        if (!mountedRef.current || requestSeq.current !== seq) return;
        if (error) {
          // Never invent an empty history out of a refused or failed read (§13).
          setHistoryStatus(classifyRailReadError(error));
          setHistoryError(error.message || "could not load activity history");
          return;
        }
        const rows = Array.isArray(data) ? (data as unknown[]) : [];
        const history = rows
          .map((row) =>
            coerceRailEvent(
              // The client resolver does not return `contact_id` (it is the argument), and the
              // tenant resolver does not return it at all. Supply the one we asked for so a client
              // row still carries its own contact, and leave a tenant row's null — no consumer
              // reads it on that scope.
              opts.scope === "client" && row && typeof row === "object"
                ? { ...(row as Record<string, unknown>), contact_id: id }
                : row,
            ),
          )
          .filter((e): e is RailEvent => e !== null);
        // Merge UNDER anything already live: a frame that arrived while this was in flight is
        // newer than every backfilled row, and re-adding it would double it in the feed.
        setEvents((live) => mergeRailHistory(live, history));
        setHistoryStatus("ready");
        setHistoryError(null);
      } catch (err) {
        if (!mountedRef.current || requestSeq.current !== seq) return;
        setHistoryStatus("unavailable");
        setHistoryError(err instanceof Error ? err.message : "could not load activity history");
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
          if (!mountedRef.current || requestSeq.current !== seq) return;
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
        if (!mountedRef.current || requestSeq.current !== seq) return;
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

  return {
    events,
    connected,
    historyStatus,
    historyLoaded: historyStatus !== "loading",
    historyError,
  };
}

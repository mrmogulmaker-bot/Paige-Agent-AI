import { act, useLayoutEffect } from "react";
import { createRoot } from "react-dom/client";
import { describe, it, expect, vi, beforeEach } from "vitest";

// React only flushes effects inside `act` when it is told it is in a test environment.
// Without this the effect under test never runs and the suite would pass vacuously.
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

/**
 * A RAIL FEED MUST NEVER SHOW THE SCOPE IT IS NO LONGER ON.
 *
 * The history read is asynchronous, so a tenant or contact switch can land while the PREVIOUS
 * scope's rows are still in flight. Guarding that with a component-lifetime `mountedRef` cannot
 * work: React runs the old effect's cleanup (`mountedRef.current = false`) and then the new
 * effect's body (`mountedRef.current = true`) before the old promise resolves, so by the time the
 * stale response checks the flag it has been switched back on by the effect that superseded it.
 * The old rows then merge into the new feed.
 *
 * That is not a cosmetic staleness bug. `rail:tenant:<id>` carries EVERY event for a tenant and
 * `rail:client:<id>` one portal client's; rendering the prior scope's rows after a switch shows an
 * operator one account's activity inside another's, and a portal client another client's. RLS
 * still decides what the READ may return — it returned these rows legitimately, to the scope that
 * asked for them. Which scope is still being LOOKED AT is this hook's to get right.
 *
 * These tests drive the real hook and assert on what it returns. Each one fails against the
 * shared-ref guard: the stale event is present in `events` after the switch.
 */

type Resolver = (value: { data: unknown[] | null; error: { message: string } | null }) => void;

/** Every history read this test issued, keyed by the filter value it was scoped to. */
let pending: Array<{ column: string; value: string; resolve: Resolver }>;
let removed: string[];
/** Every channel the hook opened, by topic, so a test can fire a live frame down one of them. */
let channels: Map<string, { dispatch: (payload: unknown) => void }>;

vi.mock("@/integrations/supabase/client", () => {
  class Builder {
    private column = "";
    private value = "";
    select() { return this; }
    order() { return this; }
    limit() { return this; }
    eq(column: string, value: string) { this.column = column; this.value = value; return this; }
    // The hook awaits the builder itself, so the promise is created — and parked — here.
    then(onFulfilled: (v: never) => unknown, onRejected?: (e: unknown) => unknown) {
      return new Promise<never>((resolve) => {
        pending.push({ column: this.column, value: this.value, resolve: resolve as unknown as Resolver });
      }).then(onFulfilled, onRejected);
    }
  }
  return {
    supabase: {
      from: () => new Builder(),
      // The channel captures the hook's broadcast handler instead of discarding it, so a test can
      // deliver a real frame — including down a channel whose scope has already been superseded.
      channel: (topic: string) => {
        const ch = {
          topic,
          on: (_type: string, _filter: unknown, handler: (msg: unknown) => void) => {
            channels.set(topic, { dispatch: (payload: unknown) => handler({ payload }) });
            return ch;
          },
          subscribe: (cb: (s: string) => void) => { cb("SUBSCRIBED"); return ch; },
        };
        return ch;
      },
      removeChannel: (ch: { topic: string }) => { removed.push(ch.topic); },
    },
  };
});

const { useRailEvents } = await import("./useRailEvents");
type Opts = Parameters<typeof useRailEvents>[0];

function row(id: string, title: string) {
  return {
    id, event_kind: "owner.action_taken", surface: "your_paige", actor_type: "paige_agent",
    audience: "owner", visibility: "owner_internal", title, summary: null,
    occurred_at: "2026-09-02T10:00:00.000Z", contact_id: null,
  };
}

/**
 * Mount the hook and expose a way to change its scope, plus its latest result.
 *
 * Every step flushes microtasks: `await q` on a thenable calls `.then` in a microtask rather than
 * synchronously, so a read is not parked until the queue drains. Skipping the flush would leave
 * `pending` empty and the suite would "fail" on its own harness instead of on the hook.
 */
async function mountHook(initial: Opts, onEvent?: (e: { id: string; title: string }) => void) {
  const seen: Array<{ opts: Opts; result: ReturnType<typeof useRailEvents> }> = [];
  /**
   * COMMITTED frames only, which is the distinction the scope question turns on.
   *
   * A render that React discards — because state was adjusted during it — is never painted, so
   * recording every render would flag a frame nobody could see. `useLayoutEffect` runs after a
   * COMMIT and before paint, and never runs for a discarded render, so this records exactly the
   * frames a person could have been shown.
   */
  const committed: Array<{ opts: Opts; events: string[] }> = [];
  function Probe({ opts, cb }: { opts: Opts; cb?: (e: never) => void }) {
    const result = useRailEvents(opts, cb as never);
    seen.push({ opts, result });
    useLayoutEffect(() => {
      committed.push({ opts, events: result.events.map((e) => e.title) });
    });
    return null;
  }
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () => { root.render(<Probe opts={initial} cb={onEvent as never} />); await flush(); });
  return {
    latest: () => seen[seen.length - 1].result,
    /** Every render this hook performed, in order, with the scope each was for. */
    renders: () => seen,
    /** Every frame that was actually committed, with the scope each was for. */
    commits: () => committed,
    switchTo: async (opts: Opts) => {
      await act(async () => { root.render(<Probe opts={opts} cb={onEvent as never} />); await flush(); });
    },
  };
}

async function flush() {
  for (let i = 0; i < 4; i++) await Promise.resolve();
}

/** Resolve the parked read that was scoped to `value`. */
async function settle(value: string, rows: unknown[]) {
  const hit = pending.find((p) => p.value === value);
  if (!hit) throw new Error(`no parked read for ${value}; parked: ${pending.map((p) => p.value).join(", ")}`);
  await act(async () => { hit.resolve({ data: rows, error: null }); await flush(); });
}

beforeEach(() => { pending = []; removed = []; channels = new Map(); });

describe("useRailEvents — history may only land on the scope that asked for it", () => {
  it("does not merge the previous TENANT's history after a tenant switch", async () => {
    const h = await mountHook({ scope: "tenant", tenantId: "tenant-A" });
    expect(pending.map((p) => p.value)).toEqual(["tenant-A"]);

    // Switch before A's read has come back. B answers first, then A's stale response arrives.
    await h.switchTo({ scope: "tenant", tenantId: "tenant-B" });
    await settle("tenant-B", [row("b-1", "B activity")]);
    await settle("tenant-A", [row("a-1", "A activity")]);

    const titles = h.latest().events.map((e) => e.title);
    expect(titles).toContain("B activity");
    expect(titles).not.toContain("A activity");
  });

  it("scopes the read by tenant_id for a tenant feed and contact_id for a client feed", async () => {
    await mountHook({ scope: "tenant", tenantId: "tenant-A" });
    expect(pending[0].column).toBe("tenant_id");
    pending = [];
    await mountHook({ scope: "client", contactId: "contact-A" });
    expect(pending[0].column).toBe("contact_id");
  });

  it("does not merge the previous CONTACT's history after a contact switch", async () => {
    const h = await mountHook({ scope: "client", contactId: "contact-A" });
    await h.switchTo({ scope: "client", contactId: "contact-B" });
    await settle("contact-B", [row("b-1", "B client activity")]);
    await settle("contact-A", [row("a-1", "A client activity")]);

    const titles = h.latest().events.map((e) => e.title);
    expect(titles).toContain("B client activity");
    expect(titles).not.toContain("A client activity");
  });

  it("does not let the previous scope's FAILED read stamp an error on the new scope", async () => {
    const h = await mountHook({ scope: "tenant", tenantId: "tenant-A" });
    await h.switchTo({ scope: "tenant", tenantId: "tenant-B" });
    await settle("tenant-B", []);

    const failing = pending.find((p) => p.value === "tenant-A")!;
    await act(async () => { failing.resolve({ data: null, error: { message: "A's read blew up" } }); await flush(); });

    // B loaded cleanly. A's failure belongs to a feed nobody is looking at any more.
    expect(h.latest().historyError).toBeNull();
    expect(h.latest().historyLoaded).toBe(true);
  });

  it("still delivers history to the scope that is actually current", async () => {
    const h = await mountHook({ scope: "tenant", tenantId: "tenant-A" });
    await settle("tenant-A", [row("a-1", "A activity")]);
    expect(h.latest().events.map((e) => e.title)).toEqual(["A activity"]);
    expect(h.latest().historyLoaded).toBe(true);
    expect(h.latest().historyError).toBeNull();
  });

  it("never COMMITS a render carrying the previous scope's events", async () => {
    // §9 — the effect-local guard stops a superseded RESPONSE landing; it cannot stop the
    // superseded STATE being painted. `useEffect` is passive, so a reset that lives there runs
    // AFTER the commit: React renders the new scope with the old scope's events still in state,
    // shows that frame, and only then empties it. This asserts on the render itself rather than on
    // the settled result, because the settled result was already correct while the frame was not.
    const h = await mountHook({ scope: "tenant", tenantId: "tenant-A" });
    await settle("tenant-A", [row("a-1", "A activity")]);
    expect(h.latest().events).toHaveLength(1);

    await h.switchTo({ scope: "tenant", tenantId: "tenant-B" });

    const atB = h.commits().filter((c) => c.opts.scope === "tenant" && c.opts.tenantId === "tenant-B");
    expect(atB.length).toBeGreaterThan(0);
    for (const frame of atB) {
      expect(frame.events).not.toContain("A activity");
    }
  });

  /**
   * THE LIVE CALLBACK PATH — with an exact statement of what these prove and what they do not.
   *
   * `onEvent` is the hook's other half: history is a read, this is the stream. Before these cases
   * NOTHING in the repository passed an `onEvent` callback at all, so the callback path had zero
   * coverage — independent mutation review reverted the repair that moved
   * `onEventRef.current = onEvent` out of render and into an effect, and every suite stayed green.
   *
   * WHAT THESE PROVE: a live frame reaches the current scope's callback, and a frame arriving on a
   * SUPERSEDED channel reaches neither the callback nor the feed — the outcome the repair protects.
   *
   * WHAT THEY DO NOT PROVE, stated rather than implied: they cannot distinguish the render-phase
   * assignment from the effect-phase one. That defect needs a frame to arrive INSIDE the window
   * between a re-render and the old effect's cleanup, and `act` flushes both together, so the
   * window is unreachable from jsdom. The repair stands on React's own rule — a ref written during
   * render can retain a value from a render React discarded — and that timing property is
   * honestly UNCOVERED here.
   */
  it("delivers a live frame to the CURRENT scope's callback", async () => {
    const seen: string[] = [];
    await mountHook({ scope: "tenant", tenantId: "tenant-A" }, (e) => seen.push(e.title));
    await act(async () => {
      channels.get("rail:tenant:tenant-A")!.dispatch(row("live-1", "A live event"));
      await flush();
    });
    expect(seen).toEqual(["A live event"]);
  });

  it("does not deliver a frame from a SUPERSEDED channel to the new scope's callback", async () => {
    const seen: string[] = [];
    const h = await mountHook({ scope: "tenant", tenantId: "tenant-A" }, (e) => seen.push(e.title));
    await h.switchTo({ scope: "tenant", tenantId: "tenant-B" });
    seen.length = 0;

    // The old channel is torn down but still holds its handler; a frame arriving late on it must
    // reach neither the callback nor the feed.
    await act(async () => {
      channels.get("rail:tenant:tenant-A")!.dispatch(row("stale-1", "A stale live event"));
      await flush();
    });
    expect(seen).toEqual([]);
    expect(h.latest().events.map((e) => e.title)).not.toContain("A stale live event");
  });

  it("still delivers on the NEW channel after the switch", async () => {
    const seen: string[] = [];
    const h = await mountHook({ scope: "tenant", tenantId: "tenant-A" }, (e) => seen.push(e.title));
    await h.switchTo({ scope: "tenant", tenantId: "tenant-B" });
    seen.length = 0;
    await act(async () => {
      channels.get("rail:tenant:tenant-B")!.dispatch(row("live-2", "B live event"));
      await flush();
    });
    expect(seen).toEqual(["B live event"]);
    expect(h.latest().events.map((e) => e.title)).toContain("B live event");
  });

  it("tears down the prior channel on a scope switch", async () => {
    const h = await mountHook({ scope: "tenant", tenantId: "tenant-A" });
    await h.switchTo({ scope: "tenant", tenantId: "tenant-B" });
    expect(removed).toContain("rail:tenant:tenant-A");
  });
});

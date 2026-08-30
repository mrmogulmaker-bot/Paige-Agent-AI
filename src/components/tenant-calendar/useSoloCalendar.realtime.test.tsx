import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SoloBooking } from "./useSoloCalendar";

/**
 * The open Calendar must not go stale.
 *
 * A guest booking through the public page, or a teammate creating, moving or
 * cancelling an appointment, changes nothing this hook depends on — so without a
 * change subscription the surface keeps showing a schedule that is no longer
 * true until the person navigates or reloads. `CalendarAdmin` subscribed to
 * tenant-filtered `internal_bookings` changes and debounced a refetch; the
 * Solo-native rebuild shipped without it. These cover the restored behaviour and
 * the three ways a naive refresh goes wrong: blanking the grid, stampeding on a
 * burst, and letting a slow response overwrite a newer one.
 */

interface Deferred {
  resolve: (rows: SoloBooking[]) => void;
  fail: (message: string) => void;
}
const rpcCalls: { name: string; args: Record<string, unknown> }[] = [];
let pending: Deferred[] = [];

const rpc = vi.fn((name: string, args: Record<string, unknown>) => {
  rpcCalls.push({ name, args });
  return new Promise((res) => {
    pending.push({
      resolve: (rows) => res({ data: rows, error: null }),
      fail: (message) => res({ data: null, error: { message } }),
    });
  });
});

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    rpc: (name: string, args: Record<string, unknown>) => rpc(name, args),
    from: () => ({ select: () => ({ eq: () => Promise.resolve({ data: [], error: null }) }) }),
    auth: { getUser: () => Promise.resolve({ data: { user: { id: "user-1" } } }) },
  },
}));

/** The shared realtime hook is the seam under test's DEPENDENCY, not its subject:
 *  captured here so the subscription's table, tenant filter and enabled flag can
 *  be asserted, and so the change handler can be fired the way Postgres would. */
let sub: {
  table: string;
  handler: () => void;
  opts?: { filter?: string; enabled?: boolean; onStatus?: (s: string) => void; resubscribeKey?: number };
} | null = null;
vi.mock("@/hooks/useRealtimeTable", () => ({
  useRealtimeTable: (
    table: string,
    onChange: () => void,
    opts?: { filter?: string; enabled?: boolean; onStatus?: (s: string) => void; resubscribeKey?: number },
  ) => { sub = { table, handler: onChange, opts }; },
}));

const { useSoloCalendar } = await import("./useSoloCalendar");

/** Stable across renders — a fresh Date every render would refire the range effect. */
const CURSOR = new Date(2026, 7, 26);

function row(id: string): SoloBooking {
  return {
    id, title: "Discovery call", start_at: "2026-08-26T14:00:00Z", end_at: "2026-08-26T15:00:00Z",
    status: "scheduled", source: "manual", guest_name: null, guest_email: null, guest_phone: null,
    calendar_id: null, location_type: null, location_value: null, notes: null,
    booking_kind: "single", capacity: null, class_session_id: null,
    host_user_id: "host-a", host_full_name: null, timezone: null,
    intake_answers: null, appointment_type: null,
  };
}

let seen: ReturnType<typeof useSoloCalendar> | null = null;
function Probe({ tenantId }: { tenantId: string | null }) {
  seen = useSoloCalendar(tenantId, "week", CURSOR);
  return null;
}

let container: HTMLDivElement;
let root: Root;

async function mount(tenantId: string | null = "tenant-1") {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => { root.render(<Probe tenantId={tenantId} />); });
}

/** Resolve the oldest in-flight read with `rows`. */
async function settle(rows: SoloBooking[], index = 0) {
  const d = pending[index];
  pending = pending.filter((_, i) => i !== index);
  await act(async () => { d.resolve(rows); });
}

/** Fail the oldest in-flight read the way PostgREST would. */
async function settleError(message: string, index = 0) {
  const d = pending[index];
  pending = pending.filter((_, i) => i !== index);
  await act(async () => { d.fail(message); });
}

async function tick(ms: number) {
  await act(async () => { vi.advanceTimersByTime(ms); });
}

beforeEach(() => {
  vi.useFakeTimers();
  rpc.mockClear();
  rpcCalls.length = 0;
  pending = [];
  sub = null;
  seen = null;
});

afterEach(() => {
  act(() => root?.unmount());
  container?.remove();
  vi.useRealTimers();
});

describe("Solo Calendar — live booking invalidation", () => {
  it("subscribes to booking changes for THIS account only", async () => {
    await mount();
    expect(sub?.table).toBe("internal_bookings");
    // Server-resolved tenant, never a client-asserted one: the filter is the
    // same id the reads are scoped by, and RLS still decides what is delivered.
    expect(sub?.opts?.filter).toBe("tenant_id=eq.tenant-1");
    expect(sub?.opts?.enabled).toBe(true);
  });

  it("does not subscribe before an account is resolved", async () => {
    await mount(null);
    expect(sub?.opts?.enabled).toBe(false);
  });

  it("refetches from the real seam when a booking changes elsewhere", async () => {
    await mount();
    await settle([row("a")]);
    expect(rpcCalls).toHaveLength(1);

    act(() => sub!.handler());
    await tick(400);
    expect(rpcCalls).toHaveLength(2);
    expect(rpcCalls[1].name).toBe("list_team_bookings");
    expect(rpcCalls[1].args._tenant_id).toBe("tenant-1");

    await settle([row("a"), row("b")]);
    expect(seen!.bookings.map((b) => b.id)).toEqual(["a", "b"]);
  });

  it("keeps the schedule on screen while it refreshes — no blanking flash", async () => {
    await mount();
    await settle([row("a")]);

    act(() => sub!.handler());
    await tick(400);
    // Mid-refresh: the read is in flight and the grid still shows what is true.
    expect(seen!.phase).toBe("ready");
    expect(seen!.bookings.map((b) => b.id)).toEqual(["a"]);
  });

  it("collapses a burst of changes into a single read", async () => {
    await mount();
    await settle([row("a")]);

    act(() => { sub!.handler(); sub!.handler(); sub!.handler(); });
    await tick(400);
    expect(rpcCalls).toHaveLength(2);
  });

  it("does not fire a queued refresh after the surface is gone", async () => {
    await mount();
    await settle([row("a")]);

    act(() => sub!.handler());
    act(() => root.unmount());
    await tick(1000);
    expect(rpcCalls).toHaveLength(1);
  });

  it("ignores a slow read that lands after a newer one", async () => {
    await mount();
    await settle([row("a")]);

    act(() => sub!.handler());
    await tick(400);          // read #2 in flight
    act(() => sub!.handler());
    await tick(400);          // read #3 in flight
    expect(rpcCalls).toHaveLength(3);

    // #3 answers first with the current truth, then the stale #2 arrives.
    await settle([row("c")], 1);
    await settle([row("stale")], 0);
    expect(seen!.bookings.map((b) => b.id)).toEqual(["c"]);
  });
});

describe("Solo Calendar — the surface says so when it could not refresh", () => {
  /**
   * A failed live refresh used to be reported to the console alone. The rows on
   * screen were then stale with nothing on the surface saying so, which is the
   * worst of both worlds: the owner reads a schedule that looks current and is
   * not. The rows must STAY (losing them is worse), and the surface must carry
   * an honest freshness state with a way back.
   */
  it("is not stale, and records a real sync time, while refreshes succeed", async () => {
    await mount();
    expect(seen!.lastSyncedAt).toBeNull();   // nothing has succeeded yet
    await settle([row("a")]);
    expect(seen!.stale).toBe(false);
    const first = seen!.lastSyncedAt;
    expect(first).toBeInstanceOf(Date);

    vi.advanceTimersByTime(60_000);
    act(() => sub!.handler());
    await tick(400);
    await settle([row("a"), row("b")]);
    expect(seen!.stale).toBe(false);
    expect(seen!.lastSyncedAt!.getTime()).toBeGreaterThan(first!.getTime());
  });

  it("goes stale when a live refresh fails, and keeps the rows it already had", async () => {
    await mount();
    await settle([row("a")]);
    const synced = seen!.lastSyncedAt!.getTime();

    vi.advanceTimersByTime(60_000);
    act(() => sub!.handler());
    await tick(400);
    await settleError("permission denied for function list_team_bookings");

    expect(seen!.stale).toBe(true);
    expect(seen!.phase).toBe("ready");
    expect(seen!.bookings.map((b) => b.id)).toEqual(["a"]);
    // The sync time must NOT advance on a failure — it names the last time the
    // rows were actually true, never the last time we tried.
    expect(seen!.lastSyncedAt!.getTime()).toBe(synced);
  });

  it("recovers on retry: the rows refresh and the stale state clears", async () => {
    await mount();
    await settle([row("a")]);
    act(() => sub!.handler());
    await tick(400);
    await settleError("network error");
    expect(seen!.stale).toBe(true);

    vi.advanceTimersByTime(60_000);
    await act(async () => { void seen!.retry(); });
    await settle([row("a"), row("b")]);

    expect(seen!.stale).toBe(false);
    expect(seen!.bookings.map((b) => b.id)).toEqual(["a", "b"]);
    expect(seen!.lastSyncedAt).toBeInstanceOf(Date);
  });

  it("stays stale when the retry fails too — never a false all-clear", async () => {
    await mount();
    await settle([row("a")]);
    act(() => sub!.handler());
    await tick(400);
    await settleError("network error");

    await act(async () => { void seen!.retry(); });
    await settleError("still down");

    expect(seen!.stale).toBe(true);
    expect(seen!.bookings.map((b) => b.id)).toEqual(["a"]);
  });

  it("clears the stale state when the range changes and that read succeeds", async () => {
    await mount();
    await settle([row("a")]);
    act(() => sub!.handler());
    await tick(400);
    await settleError("network error");
    expect(seen!.stale).toBe(true);

    // A navigation is a fresh load, not a background refresh.
    await act(async () => { root.render(<Probe tenantId="tenant-1" />); });
    await act(async () => { void seen!.refresh(); });
    await settle([row("z")]);
    expect(seen!.stale).toBe(false);
  });

  // ---- Codex P1: a channel that stops delivering must not read as LIVE ----

  it("marks the calendar stale when the realtime channel fails to subscribe", async () => {
    await mount();
    await settle([row("a")]);
    expect(seen!.stale).toBe(false);

    // Nothing else fires: no change event, so no read, so nothing would error.
    act(() => sub!.opts!.onStatus!("CHANNEL_ERROR"));

    expect(seen!.stale).toBe(true);
    // The rows the person is reading stay exactly where they are.
    expect(seen!.bookings.map((b) => b.id)).toEqual(["a"]);
  });

  it("marks the calendar stale when the channel times out or closes", async () => {
    for (const status of ["TIMED_OUT", "CLOSED"]) {
      await mount();
      await settle([row("a")]);
      act(() => sub!.opts!.onStatus!(status));
      expect(seen!.stale).toBe(true);
    }
  });

  it("does not fire an extra read on the FIRST successful subscribe", async () => {
    await mount();
    await settle([row("a")]);
    const readsAfterLoad = rpc.mock.calls.length;

    act(() => sub!.opts!.onStatus!("SUBSCRIBED"));
    await tick(500);

    expect(rpc.mock.calls.length).toBe(readsAfterLoad);
  });

  it("catches up once when the channel RECOVERS, and clears the stale state", async () => {
    await mount();
    await settle([row("a")]);
    act(() => sub!.opts!.onStatus!("CHANNEL_ERROR"));
    expect(seen!.stale).toBe(true);

    act(() => sub!.opts!.onStatus!("SUBSCRIBED"));
    await settle([row("a"), row("b")]);

    expect(seen!.stale).toBe(false);
    expect(seen!.bookings.map((b) => b.id)).toEqual(["a", "b"]);
  });

  // ---- Codex P2: a refresh must not supersede an in-flight load ----

  it("does not let a queued refresh discard an in-flight load", async () => {
    await mount();
    await settle([row("a")]);

    // A range change starts a fresh load...
    let resolveLoad: (v: unknown) => void = () => {};
    rpc.mockImplementationOnce(() => new Promise((r) => { resolveLoad = r; }));
    await act(async () => { void seen!.refresh(); });

    // ...and a booking changes elsewhere while that load is still in flight.
    act(() => sub!.handler());
    await tick(400);

    // The load now returns. Its rows must land, not be dropped as superseded.
    await act(async () => {
      resolveLoad({ data: [row("loaded")], error: null });
      await Promise.resolve();
    });

    expect(seen!.bookings.map((b) => b.id)).toEqual(["loaded"]);
    expect(seen!.phase).toBe("ready");
  });

  it("runs the deferred refresh after the load settles", async () => {
    await mount();
    await settle([row("a")]);

    let resolveLoad: (v: unknown) => void = () => {};
    rpc.mockImplementationOnce(() => new Promise((r) => { resolveLoad = r; }));
    await act(async () => { void seen!.refresh(); });
    act(() => sub!.handler());
    await tick(400);

    await act(async () => {
      resolveLoad({ data: [row("loaded")], error: null });
      await Promise.resolve();
    });
    // The deferred refresh fires on the microtask after the load settles.
    await settle([row("fresher")]);

    expect(seen!.bookings.map((b) => b.id)).toEqual(["fresher"]);
    expect(seen!.phase).toBe("ready");
  });

  // ---- Codex P1 on this PR: channel health must LATCH until resubscription ----

  it("a successful Retry does NOT clear a channel that is still down", async () => {
    await mount();
    await settle([row("a")]);

    act(() => sub!.opts!.onStatus!("CHANNEL_ERROR"));
    expect(seen!.stale).toBe(true);

    // The read itself is fine — the SUBSCRIPTION is what is broken. A point-in-time
    // success must not be reported as "live" while future changes cannot arrive.
    await act(async () => { void seen!.retry(); });
    await settle([row("a"), row("b")]);

    expect(seen!.bookings.map((b) => b.id)).toEqual(["a", "b"]);
    expect(seen!.stale).toBe(true);
  });

  it("a range load does not clear a channel that is still down either", async () => {
    await mount();
    await settle([row("a")]);
    act(() => sub!.opts!.onStatus!("CHANNEL_ERROR"));
    expect(seen!.stale).toBe(true);

    await act(async () => { void seen!.refresh(); });
    await settle([row("z")]);

    expect(seen!.stale).toBe(true);
  });

  it("only resubscription clears it", async () => {
    await mount();
    await settle([row("a")]);
    act(() => sub!.opts!.onStatus!("CHANNEL_ERROR"));
    await act(async () => { void seen!.retry(); });
    await settle([row("a")]);
    expect(seen!.stale).toBe(true);

    act(() => sub!.opts!.onStatus!("SUBSCRIBED"));
    await settle([row("a")]);
    expect(seen!.stale).toBe(false);
  });
  // ---- Codex P2 on the SHIPPED #652: the catch-up must EARN the LIVE state ----

  it("stays stale while the reconnect catch-up read is still in flight", async () => {
    await mount();
    await settle([row("a")]);
    act(() => sub!.opts!.onStatus!("CHANNEL_ERROR"));
    expect(seen!.stale).toBe(true);

    act(() => sub!.opts!.onStatus!("SUBSCRIBED"));

    // SUBSCRIBED only proves FUTURE changes can arrive. Everything that changed
    // during the outage was never delivered, so the rows on screen are still
    // stale until the catch-up read lands. Clearing here would flash a LIVE that
    // is not yet true.
    expect(seen!.stale).toBe(true);

    await settle([row("a"), row("b")]);
    expect(seen!.stale).toBe(false);
    expect(seen!.bookings.map((b) => b.id)).toEqual(["a", "b"]);
  });

  it("stays stale indefinitely when the catch-up read never settles", async () => {
    await mount();
    await settle([row("a")]);
    act(() => sub!.opts!.onStatus!("CHANNEL_ERROR"));

    act(() => sub!.opts!.onStatus!("SUBSCRIBED"));
    // Nothing resolves the catch-up. A hung read must never resolve to LIVE.
    await tick(60_000);

    expect(seen!.stale).toBe(true);
  });

  it("stays stale when the catch-up read FAILS, until a later one lands", async () => {
    await mount();
    await settle([row("a")]);
    act(() => sub!.opts!.onStatus!("CHANNEL_ERROR"));

    act(() => sub!.opts!.onStatus!("SUBSCRIBED"));
    await settleError("network");
    expect(seen!.stale).toBe(true);

    // The channel is live — SUBSCRIBED arrived and nothing has contradicted it —
    // so the next read that LANDS closes the gap the failed one left open. That
    // is the reachable recovery: the person presses Retry and gets a live
    // calendar back, without needing the subscription torn down and rebuilt.
    await act(async () => { void seen!.retry(); });
    await settle([row("a"), row("b")]);
    expect(seen!.stale).toBe(false);
    expect(seen!.bookings.map((b) => b.id)).toEqual(["a", "b"]);
  });

  // ---- Retry must be a REACHABLE recovery, not a read that changes nothing ----

  it("Retry on a dead channel asks for a fresh subscription", async () => {
    await mount();
    await settle([row("a")]);
    const keyBefore = sub!.opts!.resubscribeKey;

    act(() => sub!.opts!.onStatus!("CHANNEL_ERROR"));
    expect(seen!.stale).toBe(true);

    await act(async () => { void seen!.retry(); });

    // A read cannot revive a subscription. Without this the person's only way
    // back to a live calendar is a full page reload.
    expect(sub!.opts!.resubscribeKey).not.toBe(keyBefore);
  });

  it("Retry on a HEALTHY channel does not churn the subscription", async () => {
    await mount();
    await settle([row("a")]);
    act(() => sub!.opts!.onStatus!("SUBSCRIBED"));
    const keyBefore = sub!.opts!.resubscribeKey;

    await act(async () => { void seen!.retry(); });
    await settle([row("a")]);

    expect(sub!.opts!.resubscribeKey).toBe(keyBefore);
  });
  // ---- Codex on THIS PR: the catch-up must be bound to channel health ----

  it("does not clear the latch when the channel dies again during the catch-up read", async () => {
    await mount();
    await settle([row("a")]);
    act(() => sub!.opts!.onStatus!("CHANNEL_ERROR"));
    expect(seen!.stale).toBe(true);

    act(() => sub!.opts!.onStatus!("SUBSCRIBED"));
    // The replacement channel dies while the catch-up RPC is still in flight.
    act(() => sub!.opts!.onStatus!("CHANNEL_ERROR"));
    await settle([row("a"), row("b")]);

    // The read succeeded, but the subscription it was supposed to vindicate is
    // dead again. Reporting LIVE here is the exact false confidence this whole
    // surface exists to prevent.
    expect(seen!.stale).toBe(true);
  });

  it("clears the latch when a catch-up deferred behind a load finally lands", async () => {
    await mount();
    await settle([row("a")]);
    act(() => sub!.opts!.onStatus!("CHANNEL_ERROR"));
    expect(seen!.stale).toBe(true);

    // A range change starts a LOAD; the channel recovers while it is in flight,
    // so the catch-up refresh is deferred behind it rather than running now.
    await act(async () => { seen!.refresh(); });
    act(() => sub!.opts!.onStatus!("SUBSCRIBED"));

    await settle([row("a"), row("b")]);   // the load lands
    await act(async () => { await Promise.resolve(); });
    if (pending.length) await settle([row("a"), row("b")]);  // the deferred refresh lands

    // The gap IS closed — the rows on screen came back over a live channel.
    // Losing that because the catch-up was queued rather than run would strand a
    // healthy calendar on PARTIAL until the next resubscription.
    expect(seen!.stale).toBe(false);
  });

  it("a read that lands while the channel is still down never clears the latch", async () => {
    await mount();
    await settle([row("a")]);
    act(() => sub!.opts!.onStatus!("CHANNEL_ERROR"));

    await act(async () => { seen!.refresh(); });
    await settle([row("z")]);

    expect(seen!.stale).toBe(true);
  });
  it("a read STARTED during the outage cannot close the gap when it lands", async () => {
    await mount();
    await settle([row("a")]);
    act(() => sub!.opts!.onStatus!("CHANNEL_ERROR"));
    expect(seen!.stale).toBe(true);

    // A range change starts a load WHILE the channel is still down, so its
    // database snapshot is taken mid-outage.
    await act(async () => { seen!.refresh(); });
    // The channel recovers before that load comes back; the catch-up defers.
    act(() => sub!.opts!.onStatus!("SUBSCRIBED"));

    await settle([row("a")]);

    // The channel is healthy NOW, but these rows were read before it recovered:
    // anything committed in the last moments of the outage is missing from them.
    // Clearing here would report LIVE over exactly the gap the latch exists for,
    // and if the deferred catch-up then hangs it would say so indefinitely.
    expect(seen!.stale).toBe(true);

    await act(async () => { await Promise.resolve(); });
    if (pending.length) await settle([row("a"), row("b")]);
    expect(seen!.stale).toBe(false);
  });

  it("a read in flight across a drop AND recovery cannot close the gap either", async () => {
    await mount();
    await settle([row("a")]);
    act(() => sub!.opts!.onStatus!("SUBSCRIBED"));

    await act(async () => { void seen!.retry(); });
    // The channel dies and comes back while that read is still in flight.
    act(() => sub!.opts!.onStatus!("CHANNEL_ERROR"));
    act(() => sub!.opts!.onStatus!("SUBSCRIBED"));
    await settle([row("a")]);

    // Healthy at start and healthy at landing — but not the SAME subscription.
    // The outage happened underneath this read, so it proves nothing about it.
    expect(seen!.stale).toBe(true);
  });
  it("carries no outage debt across an account change", async () => {
    // The reset branch clears the owed gap and the health flag but deliberately
    // does NOT reset the epoch: it only ever needs to be COMPARABLE, and leaving
    // it monotonic is what guarantees a read issued for the previous account can
    // never match an epoch belonging to the next one.
    await mount("tenant-1");
    await settle([row("a")]);
    act(() => sub!.opts!.onStatus!("CHANNEL_ERROR"));
    expect(seen!.stale).toBe(true);

    await act(async () => { root.render(<Probe tenantId={null} />); });
    expect(seen!.stale).toBe(false);

    await act(async () => { root.render(<Probe tenantId="tenant-2" />); });
    await settle([row("b")]);

    // A fresh account starts clean: the previous account's outage is not its
    // problem, and nothing is owed that a later read could wrongly "close".
    expect(seen!.stale).toBe(false);

    // And the new subscription still reports honestly on its own terms.
    act(() => sub!.opts!.onStatus!("CHANNEL_ERROR"));
    expect(seen!.stale).toBe(true);
  });

  it("an initial load before any SUBSCRIBED neither clears nor claims anything", async () => {
    // Nothing is owed on a fresh mount, so the -1 sentinel a pre-subscription
    // read carries has nothing to act on. It must not throw, and it must not
    // leave the surface asserting a freshness it never established.
    await mount();
    await settle([row("a")]);
    expect(seen!.stale).toBe(false);

    act(() => sub!.opts!.onStatus!("SUBSCRIBED"));
    expect(seen!.stale).toBe(false);
  });
});

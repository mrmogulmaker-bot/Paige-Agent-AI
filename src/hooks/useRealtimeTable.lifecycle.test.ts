import { describe, it, expect } from "vitest";
import { RealtimeClient } from "@supabase/realtime-js";

/**
 * Realtime lifecycle harness.
 *
 * `useRealtimeTable` reports channel status to callers that must not present
 * stale data as live (the Solo Calendar). Whether that reporting is correct
 * depends on facts about the INSTALLED realtime library that are invisible from
 * our own source: when a status reaches the subscribe callback, and in what
 * order relative to a replacement subscription.
 *
 * A review of the shipped Calendar asserted a specific race — that tearing a
 * channel down emits `CLOSED` on the server's leave acknowledgement, so an old
 * channel's `CLOSED` could arrive AFTER a new channel's `SUBSCRIBED` and latch a
 * healthy surface stale with no way back. That is a claim about the library, so
 * it is settled against the library, not by reading our own code.
 *
 * This drives a REAL `RealtimeClient` over a fake WebSocket transport, so every
 * frame and every acknowledgement is ours to order. No network, no timing luck.
 *
 * These assertions pin library behaviour we depend on. If an upgrade changes
 * them, this fails — which is the point: the Calendar's honesty rests on them.
 */

type Frame = [string, string, string, string, unknown];

class FakeSocket {
  static CONNECTING = 0;
  static OPEN = 1;
  static CLOSING = 2;
  static CLOSED = 3;

  readyState = FakeSocket.OPEN;
  onopen: ((e: unknown) => void) | null = null;
  onmessage: ((e: { data: string }) => void) | null = null;
  onclose: ((e: unknown) => void) | null = null;
  onerror: ((e: unknown) => void) | null = null;

  static sent: Frame[] = [];
  static live: FakeSocket | null = null;

  constructor() {
    FakeSocket.live = this;
    setTimeout(() => this.onopen?.({}), 0);
  }
  send(data: string) { FakeSocket.sent.push(JSON.parse(data) as Frame); }
  close() { this.readyState = FakeSocket.CLOSED; this.onclose?.({ code: 1000 }); }
  deliver(msg: unknown) { this.onmessage?.({ data: JSON.stringify(msg) }); }
}

const settle = () => new Promise((r) => setTimeout(r, 20));

/** The most recent frame of a given phoenix event, e.g. `phx_join` / `phx_leave`. */
function lastFrame(event: string): Frame | undefined {
  return [...FakeSocket.sent].reverse().find((f) => f[3] === event);
}

/** Acknowledge a frame the way the server would. */
function ack(frame: Frame, response: unknown = {}) {
  FakeSocket.live?.deliver([frame[0], frame[1], frame[2], "phx_reply", { status: "ok", response }]);
}

function joinResponse(tenant: string) {
  return {
    postgres_changes: [
      { id: 1, event: "*", schema: "public", table: "internal_bookings", filter: `tenant_id=eq.${tenant}` },
    ],
  };
}

async function harness() {
  FakeSocket.sent = [];
  FakeSocket.live = null;
  const client = new RealtimeClient("ws://realtime.test/socket", {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    transport: FakeSocket as any,
    params: { apikey: "test" },
    timeout: 10_000,
  });
  client.connect();
  await settle();

  const statuses: string[] = [];
  const subscribe = (tenant: string) => {
    const channel = client.channel(`rt:public:internal_bookings:tenant_id=eq.${tenant}`);
    channel
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .on("postgres_changes" as any, { event: "*", schema: "public", table: "internal_bookings", filter: `tenant_id=eq.${tenant}` }, () => {})
      .subscribe((status) => { statuses.push(`${tenant}:${status}`); });
    return channel;
  };
  return { client, statuses, subscribe };
}

describe("realtime channel lifecycle (the facts useRealtimeTable relies on)", () => {
  it("delivers CLOSED to the subscribe callback when WE tear a channel down", async () => {
    const { client, statuses, subscribe } = await harness();
    const a = subscribe("A");
    await settle();
    ack(lastFrame("phx_join")!, joinResponse("A"));
    await settle();
    expect(statuses).toEqual(["A:SUBSCRIBED"]);

    client.removeChannel(a);
    await settle();

    // The teardown OUR OWN cleanup performs is indistinguishable, at the
    // callback, from the channel dying under us. This is why a status handler
    // shared across subscriptions cannot be trusted without scoping.
    expect(statuses).toEqual(["A:SUBSCRIBED", "A:CLOSED"]);
  });

  it("emits that CLOSED immediately and locally, NOT on the server leave-ack", async () => {
    const { client, statuses, subscribe } = await harness();
    const a = subscribe("A");
    await settle();
    ack(lastFrame("phx_join")!, joinResponse("A"));
    await settle();

    client.removeChannel(a);
    await settle();

    // No leave acknowledgement has been delivered at this point.
    expect(lastFrame("phx_leave")).toBeDefined();
    expect(statuses).toContain("A:CLOSED");
  });

  it("orders a replaced channel's CLOSED BEFORE the replacement's SUBSCRIBED", async () => {
    // This is the review's asserted race, driven deliberately: the server
    // acknowledges the NEW channel's join first and the OLD channel's leave
    // second — the worst ordering available to it.
    const { client, statuses, subscribe } = await harness();
    const a = subscribe("A");
    await settle();
    ack(lastFrame("phx_join")!, joinResponse("A"));
    await settle();

    // React runs effect cleanup before the next effect body.
    client.removeChannel(a);
    subscribe("B");
    await settle();

    ack(lastFrame("phx_join")!, joinResponse("B"));
    await settle();
    const leave = lastFrame("phx_leave");
    if (leave) ack(leave);
    await settle();

    // DISPROVED. Because CLOSED is local and immediate, the old channel can
    // never overtake the new subscription, however the server orders its acks.
    expect(statuses).toEqual(["A:SUBSCRIBED", "A:CLOSED", "B:SUBSCRIBED"]);
  });

  it("leaves a removed channel permanently silent", async () => {
    const { client, statuses, subscribe } = await harness();
    const a = subscribe("A");
    await settle();
    ack(lastFrame("phx_join")!, joinResponse("A"));
    await settle();
    client.removeChannel(a);
    await settle();
    const afterRemoval = statuses.length;

    FakeSocket.live?.close();
    await settle();

    // No late ghost status from a channel we already dropped.
    expect(statuses.length).toBe(afterRemoval);
  });

  it("emits CLOSED with NO successor when a subscription is simply dropped", async () => {
    // The genuinely dangerous shape, and the one the review did not state: a
    // teardown with nothing following it. Any handler that latches on CLOSED and
    // waits for a SUBSCRIBED to clear it waits forever here.
    const { client, statuses, subscribe } = await harness();
    const a = subscribe("A");
    await settle();
    ack(lastFrame("phx_join")!, joinResponse("A"));
    await settle();

    client.removeChannel(a);
    await settle();

    expect(statuses).toEqual(["A:SUBSCRIBED", "A:CLOSED"]);
    expect(statuses.filter((s) => s.endsWith("SUBSCRIBED"))).toHaveLength(1);
  });
});

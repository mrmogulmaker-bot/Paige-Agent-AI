import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Status reporting must describe THIS subscription, not the one being replaced.
 *
 * `removeChannel` makes the outgoing channel emit `CLOSED` through its own
 * subscribe callback — immediately and locally, proven against the real library
 * in `useRealtimeTable.lifecycle.test.ts`. That teardown is ours. A caller that
 * treats it as "the channel died" marks a healthy surface stale, and when
 * nothing subscribes after it (a tenant clearing, an unmount) no later
 * `SUBSCRIBED` ever arrives to undo that.
 */

type StatusCb = (s: string) => void;

interface FakeChannel {
  name: string;
  status: StatusCb | null;
  on: (...a: unknown[]) => FakeChannel;
  subscribe: (cb: StatusCb) => FakeChannel;
}

const channels: FakeChannel[] = [];
const removed: string[] = [];

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    channel: (name: string) => {
      const ch: FakeChannel = {
        name,
        status: null,
        on: () => ch,
        subscribe: (cb: StatusCb) => { ch.status = cb; return ch; },
      };
      channels.push(ch);
      return ch;
    },
    // Faithful to the installed library: tearing a channel down pushes CLOSED
    // straight back through that channel's own status callback.
    removeChannel: (ch: FakeChannel) => { removed.push(ch.name); ch.status?.("CLOSED"); },
  },
}));

const { useRealtimeTable } = await import("./useRealtimeTable");

const seen: string[] = [];
function Probe({ filter, enabled = true, resubscribeKey }: {
  filter?: string; enabled?: boolean; resubscribeKey?: number;
}) {
  useRealtimeTable("internal_bookings", () => {}, {
    filter, enabled, resubscribeKey,
    onStatus: (s) => seen.push(s),
  });
  return null;
}

let container: HTMLDivElement;
let root: Root;
const render = async (p: React.ComponentProps<typeof Probe>) => {
  await act(async () => { root.render(<Probe {...p} />); });
};

beforeEach(() => {
  channels.length = 0; removed.length = 0; seen.length = 0;
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(() => { act(() => root.unmount()); container.remove(); });

describe("useRealtimeTable — status is scoped to the live subscription", () => {
  it("reports a genuine status from the current channel", async () => {
    await render({ filter: "tenant_id=eq.A" });
    act(() => { channels[0].status!("SUBSCRIBED"); });
    act(() => { channels[0].status!("CHANNEL_ERROR"); });
    expect(seen).toEqual(["SUBSCRIBED", "CHANNEL_ERROR"]);
  });

  it("does NOT report the CLOSED raised by replacing a subscription", async () => {
    await render({ filter: "tenant_id=eq.A" });
    act(() => { channels[0].status!("SUBSCRIBED"); });

    // The account changes: cleanup tears down A, then B subscribes.
    await render({ filter: "tenant_id=eq.B" });
    expect(removed).toEqual(["rt:public:internal_bookings:tenant_id=eq.A"]);

    // A's teardown CLOSED must not reach the caller — nothing died.
    expect(seen).toEqual(["SUBSCRIBED"]);
  });

  it("does NOT report CLOSED when the subscription is simply switched off", async () => {
    // The shape with no successor: nothing subscribes after this, so a caller
    // that latched on CLOSED here would stay latched forever.
    await render({ filter: "tenant_id=eq.A" });
    act(() => { channels[0].status!("SUBSCRIBED"); });

    await render({ filter: undefined, enabled: false });

    expect(removed).toHaveLength(1);
    expect(seen).toEqual(["SUBSCRIBED"]);
  });

  it("does NOT report CLOSED on unmount", async () => {
    await render({ filter: "tenant_id=eq.A" });
    act(() => { channels[0].status!("SUBSCRIBED"); });
    act(() => { root.unmount(); });
    expect(seen).toEqual(["SUBSCRIBED"]);
    // Re-root so afterEach's unmount is harmless.
    root = createRoot(container);
  });

  it("rebuilds the subscription when resubscribeKey changes", async () => {
    // The caller's recovery path: a dead channel cannot be revived by re-reading,
    // so the caller must be able to ask for a fresh subscription.
    await render({ filter: "tenant_id=eq.A", resubscribeKey: 0 });
    act(() => { channels[0].status!("CHANNEL_ERROR"); });
    expect(seen).toEqual(["CHANNEL_ERROR"]);

    await render({ filter: "tenant_id=eq.A", resubscribeKey: 1 });

    expect(channels).toHaveLength(2);
    expect(removed).toHaveLength(1);
    act(() => { channels[1].status!("SUBSCRIBED"); });
    // The teardown of the dead channel is still not reported; the new one is.
    expect(seen).toEqual(["CHANNEL_ERROR", "SUBSCRIBED"]);
  });
});

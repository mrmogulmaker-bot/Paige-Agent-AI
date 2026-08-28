import React from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type RpcResult = { data: Record<string, number>; error: null };
type Deferred = { promise: Promise<RpcResult>; resolve: (value: RpcResult) => void };

const deferred = (): Deferred => {
  let resolve!: (value: RpcResult) => void;
  const promise = new Promise<RpcResult>((done) => { resolve = done; });
  return { promise, resolve };
};

const harness = vi.hoisted(() => ({ calls: [] as Array<Promise<unknown>> }));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    rpc: vi.fn(() => {
      const call = harness.calls.shift();
      if (!call) throw new Error("No dashboard RPC response queued");
      return call;
    }),
    channel: () => ({ on() { return this; }, subscribe() { return this; } }),
    removeChannel: vi.fn(),
  },
}));

import { usePracticeDashboard } from "../usePracticeDashboard";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

function Probe({ epoch }: { epoch?: string | null }) {
  const result = usePracticeDashboard(30, epoch);
  return (
    <output data-loading={String(result.loading)}>
      {result.metrics?.active_clients ?? ""}|{result.attention?.tasks_due ?? ""}
    </output>
  );
}

let container: HTMLDivElement;
let root: Root;
let client: QueryClient;

beforeEach(() => {
  harness.calls = [];
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
});

afterEach(() => {
  act(() => root.unmount());
  client.clear();
  container.remove();
});

function render(epoch?: string | null) {
  root.render(
    <QueryClientProvider client={client}>
      <Probe epoch={epoch} />
    </QueryClientProvider>,
  );
}

describe("usePracticeDashboard account epoch", () => {
  it("clears account A immediately and cannot commit its late response into account B", async () => {
    const metricsA = deferred();
    const attentionA = deferred();
    const metricsB = deferred();
    const attentionB = deferred();
    harness.calls = [metricsA.promise, attentionA.promise, metricsB.promise, attentionB.promise];

    await act(async () => { render("account-a"); await Promise.resolve(); });
    await act(async () => { render("account-b"); await Promise.resolve(); });
    expect(container.textContent).toBe("|");
    expect(container.querySelector("output")?.dataset.loading).toBe("true");

    await act(async () => {
      metricsB.resolve({ data: { active_clients: 22 }, error: null });
      attentionB.resolve({ data: { tasks_due: 4 }, error: null });
      await Promise.resolve();
      await Promise.resolve();
    });
    await vi.waitFor(() => expect(container.textContent).toBe("22|4"));

    await act(async () => {
      metricsA.resolve({ data: { active_clients: 99 }, error: null });
      attentionA.resolve({ data: { tasks_due: 99 }, error: null });
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(container.textContent).toBe("22|4");
    expect(container.textContent).not.toContain("99");
  });

  it("clears accepted data while the server-resolved epoch is unavailable", async () => {
    const metrics = deferred();
    const attention = deferred();
    harness.calls = [metrics.promise, attention.promise];
    await act(async () => { render("account-a"); await Promise.resolve(); });
    await act(async () => {
      metrics.resolve({ data: { active_clients: 3 }, error: null });
      attention.resolve({ data: { tasks_due: 1 }, error: null });
      await Promise.resolve();
      await Promise.resolve();
    });
    await vi.waitFor(() => expect(container.textContent).toBe("3|1"));

    await act(async () => { render(null); await Promise.resolve(); });
    expect(container.textContent).toBe("|");
    expect(container.querySelector("output")?.dataset.loading).toBe("true");
  });

  it("keeps the legacy cache keys unchanged when no epoch contract is requested", async () => {
    const metrics = deferred();
    const attention = deferred();
    harness.calls = [metrics.promise, attention.promise];
    await act(async () => { render(undefined); await Promise.resolve(); });
    expect(client.getQueryCache().getAll().map((query) => query.queryKey)).toEqual([
      ["practice-dashboard-metrics", 30],
      ["practice-attention-queue"],
    ]);
  });
});

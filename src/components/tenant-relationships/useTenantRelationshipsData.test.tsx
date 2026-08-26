import { act } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useTenantRelationshipsData } from "./useTenantRelationshipsData";

const { pending, from } = vi.hoisted(() => {
  type Result = { data: unknown; error: null };
  type Deferred = { promise: Promise<Result>; resolve: (value: Result) => void };
  const requests = new Map<string, Deferred>();
  const createDeferred = (key: string) => {
    let resolve!: Deferred["resolve"];
    const promise = new Promise<Result>((done) => { resolve = done; });
    const value = { promise, resolve };
    requests.set(key, value);
    return value;
  };
  const fromTable = vi.fn((table: string) => {
    let tenant = "";
    const chain = {
      select: () => chain,
      eq: (_column: string, value: string) => { tenant = value; return chain; },
      order: () => chain,
      limit: () => requests.get(`${table}:${tenant}`)?.promise ?? createDeferred(`${table}:${tenant}`).promise,
    };
    return chain;
  });
  return { pending: requests, from: fromTable };
});

vi.mock("@/integrations/supabase/client", () => ({ supabase: { from } }));
vi.mock("@/hooks/usePortalConfig", () => ({
  usePortalConfig: () => ({ config: {}, isLoading: false, isError: false, refetch: vi.fn() }),
}));

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function Harness({ tenantId }: { tenantId: string | null }) {
  const state = useTenantRelationshipsData({ activeTenantId: tenantId, variant: "clients" });
  return <output data-people={state.people.map(({ name }) => name).join(",")} />;
}

describe("tenant relationship adapter sequencing", () => {
  beforeEach(() => { pending.clear(); from.mockClear(); });

  it("never lets an older account response overwrite the newer active account", async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const host = document.createElement("div");
    const root = createRoot(host);
    await act(async () => root.render(<QueryClientProvider client={client}><Harness tenantId="tenant-a" /></QueryClientProvider>));
    await vi.waitFor(() => expect(pending.has("clients:tenant-a")).toBe(true));
    await act(async () => root.render(<QueryClientProvider client={client}><Harness tenantId="tenant-b" /></QueryClientProvider>));
    await vi.waitFor(() => expect(pending.has("clients:tenant-b")).toBe(true));

    await act(async () => {
      pending.get("clients:tenant-b")?.resolve({ data: [{ id: "b", first_name: "New", last_name: "Account", entity_name: null, email: null, linked_user_id: null, lifecycle_stage: "client_active", assigned_coach_user_id: null, last_contacted_at: null }], error: null });
      await Promise.resolve();
    });
    await vi.waitFor(() => expect(host.querySelector("output")?.getAttribute("data-people")).toBe("New Account"));
    expect(host.querySelector("output")?.getAttribute("data-people")).toBe("New Account");

    await act(async () => {
      pending.get("clients:tenant-a")?.resolve({ data: [{ id: "a", first_name: "Old", last_name: "Account", entity_name: null, email: null, linked_user_id: null, lifecycle_stage: "client_active", assigned_coach_user_id: null, last_contacted_at: null }], error: null });
      await Promise.resolve();
    });
    expect(host.querySelector("output")?.getAttribute("data-people")).toBe("New Account");
    act(() => root.unmount());
  });

  it("clears accepted account data immediately on sign-out and ignores late work", async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const host = document.createElement("div");
    const root = createRoot(host);
    await act(async () => root.render(<QueryClientProvider client={client}><Harness tenantId="tenant-a" /></QueryClientProvider>));
    await vi.waitFor(() => expect(pending.has("clients:tenant-a")).toBe(true));
    await act(async () => root.render(<QueryClientProvider client={client}><Harness tenantId={null} /></QueryClientProvider>));
    expect(host.querySelector("output")?.getAttribute("data-people")).toBe("");
    await act(async () => {
      pending.get("clients:tenant-a")?.resolve({ data: [{ id: "a", first_name: "Late", last_name: "Account", entity_name: null, email: null, linked_user_id: null, lifecycle_stage: "client_active", assigned_coach_user_id: null, last_contacted_at: null }], error: null });
      await Promise.resolve();
    });
    expect(host.querySelector("output")?.getAttribute("data-people")).toBe("");
    act(() => root.unmount());
  });
});

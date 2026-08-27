import { act } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useTenantRelationshipsData } from "./useTenantRelationshipsData";

const { pending, from, selections } = vi.hoisted(() => {
  type Result = { data: unknown; error: null };
  type Deferred = { promise: Promise<Result>; resolve: (value: Result) => void };
  const requests = new Map<string, Deferred>();
  const selectedColumns: Array<{ table: string; columns: string }> = [];
  const createDeferred = (key: string) => {
    let resolve!: Deferred["resolve"];
    const promise = new Promise<Result>((done) => { resolve = done; });
    const value = { promise, resolve };
    requests.set(key, value);
    return value;
  };
  const fromTable = vi.fn((table: string) => {
    let tenant = "";
    let recordId = "";
    const chain = {
      select: (columns: string) => { selectedColumns.push({ table, columns }); return chain; },
      eq: (column: string, value: string) => { if (column === "tenant_id") tenant = value; if (column === "id") recordId = value; return chain; },
      order: () => chain,
      limit: () => requests.get(`${table}:${tenant}`)?.promise ?? createDeferred(`${table}:${tenant}`).promise,
      maybeSingle: () => requests.get(`${table}:${tenant}:${recordId}`)?.promise ?? createDeferred(`${table}:${tenant}:${recordId}`).promise,
    };
    return chain;
  });
  return { pending: requests, from: fromTable, selections: selectedColumns };
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

function DetailHarness({ tenantId }: { tenantId: string }) {
  const state = useTenantRelationshipsData({ activeTenantId: tenantId, variant: "clients", soloPeople: true });
  const person = state.people[0];
  return <output data-record={person ? JSON.stringify(person) : ""} />;
}

function DeepLinkHarness({ tenantId, personId }: { tenantId: string | null; personId: string | null }) {
  const state = useTenantRelationshipsData({ activeTenantId: tenantId, variant: "clients", soloPeople: true, deepLinkedContactId: personId });
  return <output data-record={state.deepLinkedPerson ? JSON.stringify(state.deepLinkedPerson) : ""} />;
}

describe("tenant relationship adapter sequencing", () => {
  beforeEach(() => { pending.clear(); selections.length = 0; from.mockClear(); });

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

  it("maps grounded standard fields and uses an explicit entity type as partial business evidence", async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const host = document.createElement("div");
    const root = createRoot(host);
    await act(async () => root.render(<QueryClientProvider client={client}><DetailHarness tenantId="tenant-business" /></QueryClientProvider>));
    await vi.waitFor(() => expect(pending.has("clients:tenant-business")).toBe(true));
    await act(async () => {
      pending.get("clients:tenant-business")?.resolve({
        data: [{
          id: "business-1", first_name: "Supplied", last_name: "Contact", entity_name: "Supplied Company", entity_type: "LLC",
          email: "hello@example.test", phone: "+1 202 555 0142", title: null, website: "https://example.test",
          city: "Atlanta", state: "GA", source: "referral", status: "active", tags: ["Priority"],
          do_not_contact: false, paige_shared_context_consent: false, linked_user_id: null,
          lifecycle_stage: "client_active", assigned_coach_user_id: null, last_contacted_at: null,
          created_at: "2026-01-10T12:00:00Z", updated_at: "2026-08-24T12:00:00Z",
        }],
        error: null,
      });
      await Promise.resolve();
    });
    await vi.waitFor(() => expect(host.querySelector("output")?.getAttribute("data-record")).not.toBe(""));
    const mapped = JSON.parse(host.querySelector("output")?.getAttribute("data-record") || "{}");
    expect(mapped).toMatchObject({
      id: "business-1",
      name: "Supplied Contact",
      recordType: "business",
      phone: "+1 202 555 0142",
      website: "https://example.test",
      location: "Atlanta, GA",
      tags: ["Priority"],
    });
    act(() => root.unmount());
  });

  it("keeps the legacy non-Solo select contract narrow", async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const host = document.createElement("div");
    const root = createRoot(host);
    await act(async () => root.render(<QueryClientProvider client={client}><Harness tenantId="tenant-legacy" /></QueryClientProvider>));
    await vi.waitFor(() => expect(pending.has("clients:tenant-legacy")).toBe(true));
    expect(selections.find(({ table }) => table === "clients")?.columns).toBe("id,first_name,last_name,entity_name,email,linked_user_id,lifecycle_stage,assigned_coach_user_id,last_contacted_at");
    act(() => root.unmount());
  });

  it("resolves an authorized deep link independently of the capped list", async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const host = document.createElement("div");
    const root = createRoot(host);
    await act(async () => root.render(<QueryClientProvider client={client}><DeepLinkHarness tenantId="tenant-deep" personId="outside-page" /></QueryClientProvider>));
    await vi.waitFor(() => expect(pending.has("clients:tenant-deep:outside-page")).toBe(true));
    await act(async () => {
      pending.get("clients:tenant-deep:outside-page")?.resolve({
        data: { id: "outside-page", first_name: "Direct", last_name: "Record", entity_name: null, entity_type: null, email: null, phone: null, title: null, website: null, city: null, state: null, source: null, status: "active", tags: [], do_not_contact: false, paige_shared_context_consent: false, linked_user_id: null, lifecycle_stage: "client_active", assigned_coach_user_id: null, last_contacted_at: null, created_at: "2026-01-01T00:00:00Z", updated_at: "2026-01-01T00:00:00Z" },
        error: null,
      });
      await Promise.resolve();
    });
    await vi.waitFor(() => expect(host.querySelector("output")?.getAttribute("data-record")).toContain("Direct Record"));
    act(() => root.unmount());
  });

  it("clears a deep-linked record on account change and rejects the older account response", async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const host = document.createElement("div");
    const root = createRoot(host);
    await act(async () => root.render(<QueryClientProvider client={client}><DeepLinkHarness tenantId="tenant-a" personId="person-a" /></QueryClientProvider>));
    await vi.waitFor(() => expect(pending.has("clients:tenant-a:person-a")).toBe(true));
    await act(async () => root.render(<QueryClientProvider client={client}><DeepLinkHarness tenantId="tenant-b" personId="person-b" /></QueryClientProvider>));
    expect(host.querySelector("output")?.getAttribute("data-record")).toBe("");
    await vi.waitFor(() => expect(pending.has("clients:tenant-b:person-b")).toBe(true));
    await act(async () => {
      pending.get("clients:tenant-b:person-b")?.resolve({ data: { id: "person-b", first_name: "New", last_name: "Deep Link", entity_name: null, entity_type: null, email: null, phone: null, title: null, website: null, city: null, state: null, source: null, status: "active", tags: [], do_not_contact: false, paige_shared_context_consent: false, linked_user_id: null, lifecycle_stage: "client_active", assigned_coach_user_id: null, last_contacted_at: null, created_at: "2026-01-01T00:00:00Z", updated_at: "2026-01-01T00:00:00Z" }, error: null });
      await Promise.resolve();
    });
    await vi.waitFor(() => expect(host.querySelector("output")?.getAttribute("data-record")).toContain("New Deep Link"));
    await act(async () => {
      pending.get("clients:tenant-a:person-a")?.resolve({ data: { id: "person-a", first_name: "Old", last_name: "Deep Link", entity_name: null, entity_type: null, email: null, phone: null, title: null, website: null, city: null, state: null, source: null, status: "active", tags: [], do_not_contact: false, paige_shared_context_consent: false, linked_user_id: null, lifecycle_stage: "client_active", assigned_coach_user_id: null, last_contacted_at: null, created_at: "2026-01-01T00:00:00Z", updated_at: "2026-01-01T00:00:00Z" }, error: null });
      await Promise.resolve();
    });
    expect(host.querySelector("output")?.getAttribute("data-record")).toContain("New Deep Link");
    expect(host.querySelector("output")?.getAttribute("data-record")).not.toContain("Old Deep Link");
    await act(async () => root.render(<QueryClientProvider client={client}><DeepLinkHarness tenantId={null} personId={null} /></QueryClientProvider>));
    expect(host.querySelector("output")?.getAttribute("data-record")).toBe("");
    act(() => root.unmount());
  });
});

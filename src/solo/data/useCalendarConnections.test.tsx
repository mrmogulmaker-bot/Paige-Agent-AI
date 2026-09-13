/**
 * The Calendar write gate is resolved against the VIEWED tenant.
 *
 * The defect these cover: `canWrite` was read from `is_current_user_tenant_admin()`,
 * which answers "am I an admin of MY OWN active tenant" (`current_user_tenant_id()`
 * = `profiles.active_tenant_id`), not "of the account I am looking at". When those
 * diverge — a stale profile pointer, a tenant switch before the profile persists,
 * or an operator/agency acting as another account — the button was hidden from an
 * owner the write would accept, or shown to someone it would refuse. The gate now
 * mirrors the `calendars` manage-RLS (`is_platform_admin() OR is_tenant_admin(row
 * tenant)`) evaluated for the VIEWED `activeTenantId`, so it can never disagree
 * with the write RLS will actually run.
 */
import { act, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useCalendarConnections } from "./useCalendarConnections";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const tenantCtx = vi.hoisted(() => ({ activeTenantId: "t-viewed" as string | null, loading: false }));
vi.mock("@/hooks/useTenantContext", () => ({
  useTenantContext: () => ({ activeTenantId: tenantCtx.activeTenantId, tenants: [], loading: tenantCtx.loading }),
}));

const rpc = vi.hoisted(() => ({
  calls: [] as { name: string; args: unknown }[],
  adminByTenant: {} as Record<string, boolean>, // is_tenant_admin resolves per _tenant
  platformAdmin: false,
  callerTenant: null as string | null,          // current_user_tenant_id()
}));
const tables = vi.hoisted(() => ({ calendars: [] as unknown[], calendarsError: null as unknown }));

vi.mock("@/integrations/supabase/client", () => {
  const builder = (table: string) => {
    const result = () =>
      table === "calendars"
        ? { data: tables.calendars, error: tables.calendarsError }
        : { data: null, error: null };
    const b: Record<string, unknown> = {};
    for (const m of ["select", "eq", "order", "limit", "in"]) b[m] = () => b;
    b.maybeSingle = () => Promise.resolve(result());
    b.then = (res: (v: unknown) => unknown, rej: (e: unknown) => unknown) =>
      Promise.resolve(result()).then(res, rej);
    return b;
  };
  const supabase = {
    from: (t: string) => builder(t),
    rpc: (name: string, args?: unknown) => {
      rpc.calls.push({ name, args });
      let data: unknown = null;
      if (name === "is_tenant_admin") {
        const t = (args as { _tenant?: string } | undefined)?._tenant ?? "";
        data = rpc.adminByTenant[t] ?? false;
      } else if (name === "is_platform_admin") data = rpc.platformAdmin;
      else if (name === "current_user_tenant_id") data = rpc.callerTenant;
      return {
        then: (res: (v: unknown) => unknown, rej: (e: unknown) => unknown) =>
          Promise.resolve({ data, error: null }).then(res, rej),
      };
    },
    auth: { getUser: () => Promise.resolve({ data: { user: { id: "u1" } }, error: null }) },
  };
  return { supabase };
});

let latest: ReturnType<typeof useCalendarConnections> | null = null;
let force: () => void = () => {};
function Probe() {
  latest = useCalendarConnections();
  return null;
}
function Harness() {
  const [, setN] = useState(0);
  force = () => setN((n) => n + 1);
  return <Probe />;
}

let container: HTMLDivElement;
let root: Root;
async function flush() {
  await act(async () => { for (let i = 0; i < 8; i++) await Promise.resolve(); });
}
async function mount() {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => { root.render(<Harness />); });
  await flush();
}

beforeEach(() => {
  rpc.calls = []; rpc.adminByTenant = {}; rpc.platformAdmin = false; rpc.callerTenant = null;
  tables.calendars = []; tables.calendarsError = null;
  tenantCtx.activeTenantId = "t-viewed"; tenantCtx.loading = false;
  latest = null;
});
afterEach(() => { act(() => root?.unmount()); container?.remove(); });

describe("Calendar write gate — evaluated against the viewed tenant", () => {
  it("asks is_tenant_admin about the VIEWED tenant, never the own-tenant is_current_user_tenant_admin", async () => {
    rpc.adminByTenant = { "t-viewed": true };
    await mount();
    const admin = rpc.calls.find((c) => c.name === "is_tenant_admin");
    expect(admin?.args).toEqual({ _tenant: "t-viewed" });
    expect(rpc.calls.some((c) => c.name === "is_current_user_tenant_admin")).toBe(false);
    expect(latest?.canWrite).toBe(true);
  });

  it("grants write to the viewed-tenant admin EVEN WHEN the profile's active tenant is a different, stale account", async () => {
    // Stale profile: current_user_tenant_id() points elsewhere. The old gate,
    // keyed on that value, would have denied. The viewed-tenant gate grants.
    rpc.adminByTenant = { "t-viewed": true, "t-stale": false };
    rpc.callerTenant = "t-stale";
    await mount();
    expect(latest?.canWrite).toBe(true);
  });

  it("grants write to a platform admin viewing a tenant they are not a member of", async () => {
    rpc.adminByTenant = {};   // not a tenant admin anywhere
    rpc.platformAdmin = true; // but a platform operator
    await mount();
    expect(latest?.canWrite).toBe(true);
  });

  it("denies write when the user is neither an admin of the viewed tenant nor a platform admin", async () => {
    rpc.adminByTenant = { "t-viewed": false, "t-elsewhere": true }; // admin elsewhere only
    rpc.callerTenant = "t-elsewhere";
    rpc.platformAdmin = false;
    await mount();
    expect(latest?.canWrite).toBe(false);
  });

  it("re-evaluates against the NEW tenant on a tenant switch", async () => {
    rpc.adminByTenant = { "t-viewed": true, "t2": false };
    await mount();
    expect(latest?.canWrite).toBe(true);

    rpc.calls = [];
    tenantCtx.activeTenantId = "t2";
    await act(async () => { force(); });
    await flush();

    const admin = rpc.calls.find((c) => c.name === "is_tenant_admin");
    expect(admin?.args).toEqual({ _tenant: "t2" }); // asked about the new tenant
    expect(latest?.canWrite).toBe(false);           // and denied there
  });
});

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
import { blankDraft } from "@/lib/calendar/config";

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
  presetError: null as unknown,                 // arm a lifecycle-RPC failure
  presetUpdateData: { ok: true } as unknown,    // arm update_calendar_preset's success payload (auto_paused/reason)
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
      let error: unknown = null;
      if (name === "is_tenant_admin") {
        const t = (args as { _tenant?: string } | undefined)?._tenant ?? "";
        data = rpc.adminByTenant[t] ?? false;
      } else if (name === "is_platform_admin") data = rpc.platformAdmin;
      else if (name === "current_user_tenant_id") data = rpc.callerTenant;
      // The booking-preset lifecycle RPCs — the shared server seam the hook now
      // drives instead of direct table writes. Return a canned success unless the
      // test armed an error, so a test can assert WHICH RPC was called with what.
      else if (name === "create_calendar_preset") { data = rpc.presetError ? null : { calendar_id: "cal-new", enabled: false, status: "draft" }; error = rpc.presetError; }
      else if (name === "update_calendar_preset") { data = rpc.presetError ? null : rpc.presetUpdateData; error = rpc.presetError; }
      else if (name === "publish_calendar_preset" || name === "pause_calendar_preset") { data = rpc.presetError ? null : { ok: true }; error = rpc.presetError; }
      // The S1 seam: duplicate returns a new draft id; archive/restore return ok.
      else if (name === "duplicate_calendar_preset") { data = rpc.presetError ? null : { calendar_id: "cal-dup", source_id: (args as { _cal?: string } | undefined)?._cal, enabled: false, status: "draft" }; error = rpc.presetError; }
      else if (name === "archive_calendar_preset" || name === "restore_calendar_preset") { data = rpc.presetError ? null : { ok: true }; error = rpc.presetError; }
      return {
        then: (res: (v: unknown) => unknown, rej: (e: unknown) => unknown) =>
          Promise.resolve({ data, error }).then(res, rej),
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
  rpc.presetError = null;
  rpc.presetUpdateData = { ok: true };
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

describe("Booking-preset lifecycle — the hook drives the shared server RPCs, not direct table writes", () => {
  it("createCalendar creates a DRAFT via create_calendar_preset, never a table insert + enabled flip", async () => {
    rpc.adminByTenant = { "t-viewed": true };
    tables.calendars = [{ id: "cal-new", tenant_id: "t-viewed", slug: "x", title: "X", type: "personal", enabled: false, published_at: null }];
    await mount();
    await act(async () => { await latest!.createCalendar(blankDraft("New preset")); });
    const call = rpc.calls.find((c) => c.name === "create_calendar_preset");
    expect(call).toBeTruthy();
    expect((call!.args as { _tenant?: string })._tenant).toBe("t-viewed");
    // The old draft-then-flip dance is gone: the hook never registers hosts or
    // flips enabled itself — the RPC does it server-side and draft-by-default.
    expect(rpc.calls.some((c) => c.name === "set_calendar_hosts")).toBe(false);
  });

  it("publish calls publish_calendar_preset for the VIEWED tenant", async () => {
    rpc.adminByTenant = { "t-viewed": true };
    await mount();
    await act(async () => { await latest!.publish("cal-1"); });
    expect(rpc.calls.find((c) => c.name === "publish_calendar_preset")?.args).toEqual({ _cal: "cal-1", _tenant: "t-viewed" });
  });

  it("pause calls pause_calendar_preset for the VIEWED tenant", async () => {
    rpc.adminByTenant = { "t-viewed": true };
    await mount();
    await act(async () => { await latest!.pause("cal-1"); });
    expect(rpc.calls.find((c) => c.name === "pause_calendar_preset")?.args).toEqual({ _cal: "cal-1", _tenant: "t-viewed" });
  });

  it("saveCalendar routes config edits through update_calendar_preset (the shared edit seam)", async () => {
    rpc.adminByTenant = { "t-viewed": true };
    tables.calendars = [{ id: "cal-1", tenant_id: "t-viewed", slug: "x", title: "X", type: "personal", enabled: false, published_at: null }];
    await mount();
    await act(async () => { await latest!.saveCalendar("cal-1", { title: "Renamed" }); });
    const call = rpc.calls.find((c) => c.name === "update_calendar_preset");
    expect(call?.args).toMatchObject({ _cal: "cal-1", _tenant: "t-viewed" });
  });

  it("saveCalendar surfaces the server's auto_paused/reason so the UI can warn the page went off the air", async () => {
    // The server auto-pauses a Live preset an edit pushed below the publish bar; the
    // hook must carry that fact up so the surface says so, not hide a silent unpublish.
    rpc.adminByTenant = { "t-viewed": true };
    rpc.presetUpdateData = { ok: true, auto_paused: true, reason: "PRESET_NO_HOURS: add at least one open window before publishing" };
    tables.calendars = [{ id: "cal-1", tenant_id: "t-viewed", slug: "x", title: "X", type: "personal", enabled: true, published_at: "2027-01-01T00:00:00Z" }];
    await mount();
    let res: { ok: boolean; autoPaused?: boolean; autoPauseReason?: string | null } = { ok: false };
    await act(async () => { res = await latest!.saveCalendar("cal-1", { availability_json: [] }) as typeof res; });
    expect(res.ok).toBe(true);
    expect(res.autoPaused).toBe(true);
    expect(res.autoPauseReason ?? "").toMatch(/PRESET_NO_HOURS/);
  });

  it("saveCalendar reports auto_paused=false on an ordinary edit that keeps the page bookable", async () => {
    rpc.adminByTenant = { "t-viewed": true };
    rpc.presetUpdateData = { ok: true, auto_paused: false, reason: null };
    tables.calendars = [{ id: "cal-1", tenant_id: "t-viewed", slug: "x", title: "X", type: "personal", enabled: true, published_at: "2027-01-01T00:00:00Z" }];
    await mount();
    let res: { ok: boolean; autoPaused?: boolean } = { ok: false };
    await act(async () => { res = await latest!.saveCalendar("cal-1", { title: "Still bookable" }) as typeof res; });
    expect(res.ok).toBe(true);
    expect(res.autoPaused).toBe(false);
  });

  it("a server refusal surfaces as an actionable message, never a fabricated success", async () => {
    rpc.adminByTenant = { "t-viewed": true };
    rpc.presetError = { code: "22023", message: "PRESET_NEEDS_HOSTS: needs at least 2 host(s); 1 assigned" };
    await mount();
    let res: { ok: boolean; message?: string } = { ok: true };
    await act(async () => { res = await latest!.publish("cal-1"); });
    expect(res.ok).toBe(false);
    expect(res.message ?? "").toMatch(/host/i);
  });
});

describe("Booking-preset duplicate / archive / restore — the S1 governed seam", () => {
  it("duplicate calls duplicate_calendar_preset for the VIEWED tenant with a fresh slug + copy title", async () => {
    rpc.adminByTenant = { "t-viewed": true };
    tables.calendars = [{ id: "cal-dup", tenant_id: "t-viewed", slug: "x-copy", title: "X (copy)", type: "personal", enabled: false, published_at: null, archived_at: null }];
    await mount();
    let res: { ok: boolean; calendarId?: string | null } = { ok: false };
    await act(async () => { res = await latest!.duplicate("cal-1", "X") as typeof res; });
    const call = rpc.calls.find((c) => c.name === "duplicate_calendar_preset");
    expect(call).toBeTruthy();
    const args = call!.args as { _cal?: string; _new_slug?: string; _new_title?: string; _tenant?: string };
    expect(args._cal).toBe("cal-1");
    expect(args._tenant).toBe("t-viewed");
    expect(args._new_title).toBe("X (copy)");
    // A random suffix keeps booking links unique platform-wide — the slug is derived
    // from the copy's title, never reused verbatim from the source.
    expect(args._new_slug ?? "").toMatch(/^x-copy-[a-z0-9]+$/);
    expect(res.ok).toBe(true);
  });

  it("archive calls archive_calendar_preset for the VIEWED tenant", async () => {
    rpc.adminByTenant = { "t-viewed": true };
    await mount();
    await act(async () => { await latest!.archive("cal-1"); });
    expect(rpc.calls.find((c) => c.name === "archive_calendar_preset")?.args).toEqual({ _cal: "cal-1", _tenant: "t-viewed" });
  });

  it("restore calls restore_calendar_preset for the VIEWED tenant", async () => {
    rpc.adminByTenant = { "t-viewed": true };
    await mount();
    await act(async () => { await latest!.restore("cal-1"); });
    expect(rpc.calls.find((c) => c.name === "restore_calendar_preset")?.args).toEqual({ _cal: "cal-1", _tenant: "t-viewed" });
  });

  it("a PRESET_ARCHIVED refusal surfaces the restore-first message, never a fabricated success", async () => {
    rpc.adminByTenant = { "t-viewed": true };
    rpc.presetError = { code: "22023", message: "PRESET_ARCHIVED: restore this preset before publishing" };
    await mount();
    let res: { ok: boolean; message?: string } = { ok: true };
    await act(async () => { res = await latest!.publish("cal-1"); });
    expect(res.ok).toBe(false);
    expect(res.message ?? "").toMatch(/archived/i);
  });

  it("a duplicate refusal surfaces the taken-link message, never a fabricated success", async () => {
    rpc.adminByTenant = { "t-viewed": true };
    rpc.presetError = { code: "23505", message: "PRESET_SLUG_TAKEN: that booking link is already in use" };
    await mount();
    let res: { ok: boolean; message?: string } = { ok: true };
    await act(async () => { res = await latest!.duplicate("cal-1", "X") as typeof res; });
    expect(res.ok).toBe(false);
    expect(res.message ?? "").toMatch(/taken|link/i);
  });
});

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TeamAccessConfiguration } from "./team-access-configuration";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const harness = vi.hoisted(() => ({
  context: { activeTenantId: "tenant-a" as string | null, loading: false },
  canManage: true,
  version: 2,
  admin: { command: "manage", clients: "manage", calendar: "manage", campaigns: "manage", analytics: "view", team: "manage", connections: "manage", integrations: "manage", security: "view", vault: "hidden", billing: "hidden" } as Record<string, string>,
  member: { command: "view", clients: "view", calendar: "view", campaigns: "view", analytics: "view", team: "view", connections: "hidden", integrations: "hidden", security: "hidden", vault: "hidden", billing: "hidden" } as Record<string, string>,
  rpc: vi.fn(),
}));

vi.mock("@/hooks/useTenantContext", () => ({ useTenantContext: () => harness.context }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc: (...args: unknown[]) => harness.rpc(...args) } }));

const profiles = () => ({ tenant_id: "tenant-a", viewer_permission: harness.canManage ? "owner" : "member", can_manage: harness.canManage, profiles: [
  { permission: "owner", version: 0, updated_at: null, areas: { ...harness.admin, analytics: "manage", security: "manage", vault: "manage", billing: "manage" } },
  { permission: "admin", version: harness.version, updated_at: "2026-09-01T12:00:00Z", areas: { ...harness.admin } },
  { permission: "member", version: 3, updated_at: "2026-09-01T12:00:00Z", areas: { ...harness.member } },
] });

let host: HTMLDivElement;
let root: Root;
const settle = async () => { await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); }); };
const click = async (element: Element | null) => { expect(element).toBeTruthy(); await act(async () => { (element as HTMLElement).click(); }); await settle(); };

beforeEach(() => {
  harness.context.activeTenantId = "tenant-a"; harness.context.loading = false; harness.canManage = true; harness.version = 2;
  harness.admin.analytics = "view"; harness.admin.clients = "manage"; harness.rpc.mockReset();
  harness.rpc.mockImplementation(async (name: string, args?: Record<string, unknown>) => {
    if (name === "get_solo_team_access_profiles") return { data: profiles(), error: null };
    if (name === "set_solo_team_access_profile") {
      harness.version += 1; Object.assign(harness.admin, args?._areas || {});
      return { data: { permission: "admin", version: harness.version, updated_at: "2026-09-01T13:00:00Z", areas: { ...harness.admin } }, error: null };
    }
    return { data: null, error: { message: "unsupported" } };
  });
  host = document.createElement("div"); document.body.appendChild(host); root = createRoot(host);
});

afterEach(async () => { await act(async () => root.unmount()); host.remove(); });

describe("Solo Team access configuration", () => {
  it("reviews and saves an editable Admin profile while keeping the form truthful", async () => {
    await act(async () => root.render(<TeamAccessConfiguration />)); await settle();
    await click(host.querySelector('input[name="admin-analytics"][value="hidden"]'));
    expect(host.textContent).toContain("Unsaved changes");
    await click([...host.querySelectorAll("button")].find((button) => button.textContent === "Review changes") || null);
    expect(host.textContent).toContain("Confirm Admin access");
    await click([...host.querySelectorAll("button")].find((button) => button.textContent === "Confirm and save access") || null);
    expect(harness.rpc).toHaveBeenCalledWith("set_solo_team_access_profile", expect.objectContaining({ _permission: "admin", _expected_version: 2 }));
    expect(host.textContent).toContain("Saved profile · version 3");
    expect((host.querySelector('input[name="admin-analytics"][value="hidden"]') as HTMLInputElement).checked).toBe(true);
  });

  it("cancels local changes without saving", async () => {
    await act(async () => root.render(<TeamAccessConfiguration />)); await settle();
    await click(host.querySelector('input[name="admin-clients"][value="view"]'));
    await click([...host.querySelectorAll("button")].find((button) => button.textContent === "Cancel") || null);
    expect((host.querySelector('input[name="admin-clients"][value="manage"]') as HTMLInputElement).checked).toBe(true);
    expect(harness.rpc).not.toHaveBeenCalledWith("set_solo_team_access_profile", expect.anything());
  });

  it("renders the same profile read-only for a non-owner", async () => {
    harness.canManage = false;
    await act(async () => root.render(<TeamAccessConfiguration />)); await settle();
    expect(host.textContent).toContain("Read only");
    expect(host.querySelectorAll('.stw-access-options input:not(:disabled)')).toHaveLength(0);
    expect([...host.querySelectorAll("button")].some((button) => button.textContent === "Review changes")).toBe(false);
  });
});

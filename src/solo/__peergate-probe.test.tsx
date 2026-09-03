import { act } from "react";
import { createRoot } from "react-dom/client";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { SoloBillingView } from "./settings-billing";

const context = vi.hoisted(() => ({ tenantId: "tenant-a", loading: false }));
const rpc = vi.hoisted(() => vi.fn());
const invoke = vi.hoisted(() => vi.fn());
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
vi.mock("@/hooks/useTenantContext", () => ({ useTenantContext: () => ({ activeTenantId: context.tenantId, loading: context.loading }) }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc, functions: { invoke } } }));

const AUTH = (over: any = {}) => ({ tenant_id: context.tenantId, scope: "top_level_solo", role: "owner", can_manage_billing: true, billing_account_state: "absent", can_view_billing: true, receives_billing_notices: false, billing_contact_state: "none", paid_activation_ready: false, ...over });
const ROSTER = (tid: string, members: any[]) => ({ tenant_id: tid, tenant_name: "W", viewer_permission: "owner", can_manage_profiles: true, can_manage_invitations: true, can_change_permissions: true, total_members: members.length, members, invitations: [] });
const OWNER = { membership_id: "m1", user_id: "user-owner", full_name: "Workspace Owner", email: "o@e.test", avatar_url: null, status: "active", permission: "owner", is_owner: true, job_title: null, responsibilities: null, last_sign_in_at: null };
const OWNER_B = { ...OWNER, membership_id: "m1b", full_name: "Owner (also in B)" };

async function render() {
  const host = document.createElement("div"); document.body.appendChild(host);
  const root = createRoot(host);
  await act(async () => root.render(<SoloBillingView />));
  for (let i = 0; i < 4; i++) await act(async () => { await Promise.resolve(); });
  return { host, root };
}
const text = (h: HTMLElement) => h.textContent ?? "";
const sel = (h: HTMLElement) => Array.from(h.querySelectorAll("select"));
const btn = (h: HTMLElement, t: string) => Array.from(h.querySelectorAll("button")).find(b => b.textContent?.includes(t));
const choose = async (s: HTMLSelectElement, v: string) => { await act(async () => { Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value")!.set!.call(s, v); s.dispatchEvent(new Event("change", { bubbles: true })); }); };

beforeEach(() => { context.tenantId = "tenant-a"; rpc.mockReset(); invoke.mockReset(); invoke.mockResolvedValue({ data: null, error: null }); });

describe("probe", () => {
  it("A: a FAILED roster read is rendered as 'this workspace has nobody eligible'", async () => {
    rpc.mockImplementation((n: string) => {
      if (n === "get_workspace_billing_authority") return Promise.resolve({ data: [AUTH()], error: null });
      if (n === "get_workspace_billing_contacts") return Promise.resolve({ data: [], error: null });
      if (n === "get_solo_team_workspace") return Promise.resolve({ data: null, error: { message: "boom" } });
      return Promise.resolve({ data: null, error: null });
    });
    const { host } = await render();
    console.log("A-CONTAINS-FALSE-CLAIM:", text(host).includes("No current workspace owner is available to designate"));
    console.log("A-CONTAINS-NO-ADMIN:", text(host).includes("no current admin, so there is nobody to designate"));
  });

  it("B: a success message from workspace A survives into workspace B", async () => {
    const store: any = { contacts: [] };
    rpc.mockImplementation((n: string, args: any) => {
      if (n === "get_workspace_billing_authority") return Promise.resolve({ data: [AUTH()], error: null });
      if (n === "get_workspace_billing_contacts") return Promise.resolve({ data: context.tenantId === "tenant-a" ? store.contacts : [], error: null });
      if (n === "get_solo_team_workspace") return Promise.resolve({ data: ROSTER(context.tenantId, context.tenantId === "tenant-a" ? [OWNER] : []), error: null });
      if (n === "platform_billing_contact_designate") { store.contacts = [{ id: "c1", user_id: args.p_user_id, designation: args.p_designation, role: "owner", display_name: "Workspace Owner", email_verified: true, still_eligible: true, designated_at: "x", designated_by: "u" }]; return Promise.resolve({ data: null, error: null }); }
      return Promise.resolve({ data: null, error: null });
    });
    const { host, root } = await render();
    await choose(sel(host)[0], "user-owner");
    await act(async () => { sel(host)[0].closest("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })); });
    for (let i = 0; i < 4; i++) await act(async () => { await Promise.resolve(); });
    console.log("B-SET-IN-A:", text(host).includes("Primary billing contact set for this workspace."));
    context.tenantId = "tenant-b";
    await act(async () => root.render(<SoloBillingView />));
    for (let i = 0; i < 6; i++) await act(async () => { await Promise.resolve(); });
    console.log("B-STALE-SUCCESS-IN-B:", text(host).includes("Primary billing contact set for this workspace."));
    console.log("B-ALSO-SAYS-NONE:", text(host).includes("No billing contact has been designated for this workspace yet"));
  });

  it("C: a selection made in workspace A is still armed in workspace B", async () => {
    rpc.mockImplementation((n: string, args: any) => {
      if (n === "get_workspace_billing_authority") return Promise.resolve({ data: [AUTH()], error: null });
      if (n === "get_workspace_billing_contacts") return Promise.resolve({ data: [], error: null });
      if (n === "get_solo_team_workspace") return Promise.resolve({ data: ROSTER(context.tenantId, context.tenantId === "tenant-a" ? [OWNER] : [OWNER_B]), error: null });
      return Promise.resolve({ data: null, error: null });
    });
    const { host, root } = await render();
    await choose(sel(host)[0], "user-owner");
    context.tenantId = "tenant-b";
    await act(async () => root.render(<SoloBillingView />));
    for (let i = 0; i < 6; i++) await act(async () => { await Promise.resolve(); });
    const b = btn(host, "Set primary billing contact") as HTMLButtonElement;
    console.log("C-BUTTON-ENABLED-IN-B:", b && !b.disabled);
    await act(async () => { sel(host)[0].closest("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })); });
    for (let i = 0; i < 3; i++) await act(async () => { await Promise.resolve(); });
    const wrote = rpc.mock.calls.filter(c => c[0] === "platform_billing_contact_designate");
    console.log("C-WROTE-IN-B:", JSON.stringify(wrote));
  });

  it("D: an unrecognised billing_account_state at solo scope claims a billing account", async () => {
    rpc.mockImplementation((n: string) => {
      if (n === "get_workspace_billing_authority") return Promise.resolve({ data: [AUTH({ billing_account_state: "pending_review" })], error: null });
      if (n === "get_workspace_billing_contacts") return Promise.resolve({ data: [], error: null });
      if (n === "get_solo_team_workspace") return Promise.resolve({ data: ROSTER("tenant-a", [OWNER]), error: null });
      return Promise.resolve({ data: null, error: null });
    });
    const { host } = await render();
    console.log("D-CLAIMS-HAS-ACCOUNT:", text(host).includes("This workspace has a billing account"));
    console.log("D-PORTAL-STATE:", host.querySelector("[data-portal-state]")?.getAttribute("data-portal-state"));
    console.log("D-MANAGE-BUTTON:", !!btn(host, "Manage billing"));
  });
});

/**
 * Solo Settings › Billing — driven through the rendered surface, with the real hooks against a
 * server double.
 *
 * Two classes of thing are proven here.
 *
 * 1. THE NEGATIVE CLAIMS, rendered. `billing-contract.test.ts` proves the resolver never fabricates;
 *    this file proves the SCREEN never does either — no catalogue price reaches the DOM, "no
 *    subscription" is never printed for a read that was refused or unmapped, and a refusal to read
 *    the contacts is not rendered as "there are none".
 *
 * 2. THE ONE FLOW A PERSON CAN ACTUALLY FINISH (§70.1). First use from an empty workspace →
 *    designate a primary billing contact → the write reaches the server with the right arguments →
 *    the list is re-read from the server rather than patched locally → the designation is there on
 *    a fresh mount. Plus its delegate variant, its revoke, its cancellation, its refusal, its
 *    retry, its role boundary, and its workspace switch.
 */
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SoloBillingView } from "./settings-billing";

const context = vi.hoisted(() => ({ tenantId: "tenant-a", loading: false }));
const rpc = vi.hoisted(() => vi.fn());
const invoke = vi.hoisted(() => vi.fn());

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

vi.mock("@/hooks/useTenantContext", () => ({
  useTenantContext: () => ({ activeTenantId: context.tenantId, loading: context.loading }),
}));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { rpc, functions: { invoke } },
}));

type AuthorityRow = {
  tenant_id: string | null;
  scope: string;
  role: string | null;
  can_manage_billing: boolean;
  billing_account_state: string;
  can_view_billing: boolean;
  receives_billing_notices: boolean;
  billing_contact_state: string;
  paid_activation_ready: boolean;
};

function authorityRow(over: Partial<AuthorityRow> = {}): AuthorityRow {
  return {
    tenant_id: "tenant-a", scope: "top_level_solo", role: "owner",
    can_manage_billing: true, billing_account_state: "absent", can_view_billing: true,
    receives_billing_notices: false, billing_contact_state: "none", paid_activation_ready: false,
    ...over,
  };
}

function contactRow(over: Record<string, unknown> = {}) {
  return {
    id: "contact-1", user_id: "user-owner", designation: "primary_contact", role: "owner",
    display_name: "Workspace Owner", email_verified: true, still_eligible: true,
    designated_at: "2026-09-03T00:00:00Z", designated_by: "user-owner", ...over,
  };
}

const ROSTER = {
  tenant_id: "tenant-a", tenant_name: "A workspace", viewer_permission: "owner",
  can_manage_profiles: true, can_manage_invitations: true, can_change_permissions: true,
  total_members: 3,
  members: [
    { membership_id: "m1", user_id: "user-owner", full_name: "Workspace Owner", email: "owner@example.test", avatar_url: null, status: "active", permission: "owner", is_owner: true, job_title: null, responsibilities: null, last_sign_in_at: null },
    { membership_id: "m2", user_id: "user-admin", full_name: "An Admin", email: "admin@example.test", avatar_url: null, status: "active", permission: "admin", is_owner: false, job_title: null, responsibilities: null, last_sign_in_at: null },
    { membership_id: "m3", user_id: "user-member", full_name: "A Member", email: "member@example.test", avatar_url: null, status: "active", permission: "member", is_owner: false, job_title: null, responsibilities: null, last_sign_in_at: null },
  ],
  invitations: [],
};

/** The server double. `contacts` is a live array so a write can change what the RE-READ returns. */
function world(over: {
  authority?: Partial<AuthorityRow>;
  authorityError?: { message: string } | null;
  contacts?: Array<Record<string, unknown>>;
  contactsError?: { message: string } | null;
  writeError?: { message: string } | null;
  roster?: unknown;
  rosterError?: { message: string } | null;
} = {}) {
  const state = { contacts: over.contacts ?? [] };
  rpc.mockImplementation((name: string, args?: Record<string, unknown>) => {
    if (name === "get_workspace_billing_authority") {
      return Promise.resolve(over.authorityError ? { data: null, error: over.authorityError } : { data: [authorityRow(over.authority)], error: null });
    }
    if (name === "get_workspace_billing_contacts") {
      return Promise.resolve(over.contactsError ? { data: null, error: over.contactsError } : { data: state.contacts, error: null });
    }
    if (name === "get_solo_team_workspace") {
      return Promise.resolve(over.rosterError ? { data: null, error: over.rosterError } : { data: over.roster ?? ROSTER, error: null });
    }
    if (name === "platform_billing_contact_designate") {
      if (over.writeError) return Promise.resolve({ data: null, error: over.writeError });
      state.contacts = [...state.contacts, contactRow({
        id: `contact-${state.contacts.length + 1}`,
        user_id: String(args?.p_user_id),
        designation: String(args?.p_designation),
        display_name: String(args?.p_user_id) === "user-admin" ? "An Admin" : "Workspace Owner",
        role: String(args?.p_user_id) === "user-admin" ? "admin" : "owner",
      })];
      return Promise.resolve({ data: null, error: null });
    }
    if (name === "platform_billing_contact_revoke") {
      if (over.writeError) return Promise.resolve({ data: null, error: over.writeError });
      state.contacts = state.contacts.filter((c) => c.id !== args?.p_contact_id);
      return Promise.resolve({ data: null, error: null });
    }
    return Promise.resolve({ data: null, error: null });
  });
  return state;
}

async function render() {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  await act(async () => root.render(<SoloBillingView />));
  await act(async () => { await Promise.resolve(); });
  await act(async () => { await Promise.resolve(); });
  return { host, root };
}

const text = (host: HTMLElement) => host.textContent ?? "";
const buttons = (host: HTMLElement) => Array.from(host.querySelectorAll("button"));
const byText = (host: HTMLElement, t: string) => buttons(host).find((b) => b.textContent?.includes(t));
const click = async (el: Element | undefined | null) => { await act(async () => { el?.dispatchEvent(new MouseEvent("click", { bubbles: true })); }); };
const selects = (host: HTMLElement) => Array.from(host.querySelectorAll<HTMLSelectElement>("select"));
const choose = async (select: HTMLSelectElement, value: string) => {
  await act(async () => {
    const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value")?.set;
    setter?.call(select, value);
    select.dispatchEvent(new Event("change", { bubbles: true }));
  });
};
const submit = async (form: HTMLFormElement | null) => {
  await act(async () => { form?.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })); });
};
const planState = (host: HTMLElement) => host.querySelector("[data-billing-state]")?.getAttribute("data-billing-state");
const portalState = (host: HTMLElement) => host.querySelector("[data-portal-state]")?.getAttribute("data-portal-state");
const contactsState = (host: HTMLElement) => host.querySelector("[data-contacts-state]")?.getAttribute("data-contacts-state");

beforeEach(() => {
  context.tenantId = "tenant-a";
  context.loading = false;
  rpc.mockReset();
  invoke.mockReset();
  invoke.mockResolvedValue({ data: null, error: null });
  vi.spyOn(window, "confirm").mockReturnValue(true);
});
afterEach(() => { vi.restoreAllMocks(); document.body.innerHTML = ""; });

describe("what the screen refuses to claim", () => {
  it("never prints a money figure anywhere, from any server answer this slice can produce", async () => {
    for (const state of ["absent", "ambiguous", "mapped", "not_applicable"]) {
      world({ authority: { billing_account_state: state } });
      const { host, root } = await render();
      expect(text(host), `state ${state}`).not.toMatch(/\$\s?\d/);
      await act(async () => root.unmount());
    }
  });

  /** §58: this card shipped on the pre-Foundation-C surface and must not vanish with the rewrite. */
  it("keeps the Usage & limits card that already shipped here", async () => {
    world();
    const { host } = await render();
    expect(text(host)).toContain("Usage & limits");
    expect(text(host)).toContain("No totals are shown");
  });

  /** R22: a Solo member who may not VIEW billing is refused the plan, not shown it. */
  it("refuses the plan to someone the server says may not view billing", async () => {
    world({ authority: { can_manage_billing: false, can_view_billing: false, role: "member" } });
    const { host } = await render();
    expect(planState(host)).toBe("role-refusal");
    expect(text(host)).toContain("visible to its owner");
  });

  it("never says the workspace has no subscription when nothing proved it", async () => {
    world();
    const { host } = await render();
    const rendered = text(host).toLowerCase();
    expect(rendered).not.toContain("no current solo subscription");
    expect(rendered).not.toContain("no subscription");
    expect(rendered).not.toContain("no plan yet");
    expect(planState(host)).toBe("billing-unavailable");
    // and it says WHY, rather than leaving "unavailable" bare
    expect(text(host)).toContain("could not find a billing account linked to this workspace");
    expect(text(host)).toContain("nothing is being charged");
  });

  it("reports a failed authority read as a failed read, with a retry, not as an account state", async () => {
    world({ authorityError: { message: "boom" } });
    const { host } = await render();
    expect(planState(host)).toBe("plan-error");
    expect(text(host)).toContain("Nothing about your plan has changed");
    expect(byText(host, "Retry")).toBeTruthy();
  });

  it("keeps 'not applicable' distinct from 'nothing here' for a sub-account", async () => {
    world({ authority: { scope: "sub_account", can_manage_billing: false, billing_account_state: "not_applicable" } });
    const { host } = await render();
    expect(planState(host)).toBe("plan-subaccount");
    expect(text(host)).toContain("not because there is no plan");
    expect(portalState(host)).toBe("portal-not-applicable");
  });

  it("says why manage-billing cannot open instead of offering a button that must fail", async () => {
    world({ authority: { billing_account_state: "absent" } });
    const { host } = await render();
    expect(portalState(host)).toBe("portal-unavailable");
    expect(byText(host, "Manage billing")).toBeUndefined();
    expect(text(host)).toContain("no billing account linked to it yet");
  });

  it("reports the server's own refusal reason when the portal is offered and refuses", async () => {
    world({ authority: { billing_account_state: "mapped" } });
    invoke.mockResolvedValue({
      data: null,
      error: Object.assign(new Error("Edge Function returned a non-2xx status code"), {
        context: new Response(JSON.stringify({ error: "not_enabled" }), { status: 503 }),
      }),
    });
    const { host } = await render();
    expect(portalState(host)).toBe("portal-entry");
    await click(byText(host, "Manage billing"));
    expect(text(host)).toContain("Managing billing from here is not switched on yet");
  });

  /**
   * `asState()` coerces any unrecognised server value to `not_applicable`. At Solo scope that used
   * to fall THROUGH the mapping guards into "this workspace has a billing account" plus a live
   * "Manage billing" button — a positive claim and a money act produced by a default.
   */
  it("fails closed on a mapping state it does not recognise, rather than into a claim", async () => {
    world({ authority: { billing_account_state: "pending_review" } });
    const { host } = await render();
    expect(planState(host)).toBe("billing-unavailable");
    expect(text(host)).not.toContain("has a billing account");
    expect(portalState(host)).toBe("portal-unavailable");
    expect(byText(host, "Manage billing")).toBeUndefined();
    expect(text(host)).not.toMatch(/\$\s?\d/);
  });

  it("points at client billing without pretending to hold it", async () => {
    world();
    const { host } = await render();
    expect(text(host)).toContain("What you charge your own clients");
    expect(text(host)).toContain("your own payment processor");
  });
});

describe("billing contacts — the flow a person can finish", () => {
  it("first use: an empty workspace says so, and says what it blocks", async () => {
    world({ contacts: [] });
    const { host } = await render();
    expect(contactsState(host)).toBe("none");
    expect(text(host)).toContain("No billing contact has been designated for this workspace yet");
    expect(text(host)).toContain("A paid plan cannot start for this workspace until a current owner is designated");
  });

  it("states, on the surface, that a designation is not ownership and that nothing is sent", async () => {
    world();
    const { host } = await render();
    expect(text(host)).toContain("does not change who owns this workspace");
    expect(text(host)).toContain("grants no ownership, equity or co-owner status");
    expect(text(host)).toContain("not being sent yet");
  });

  it("designates a primary billing contact, sends the right arguments, and re-reads the server", async () => {
    world({ contacts: [] });
    const { host } = await render();
    const select = selects(host)[0];
    expect(Array.from(select.options).map((o) => o.value)).toEqual(["", "user-owner"]);
    await choose(select, "user-owner");
    await submit(select.closest("form"));
    await act(async () => { await Promise.resolve(); });

    expect(rpc).toHaveBeenCalledWith("platform_billing_contact_designate", { p_user_id: "user-owner", p_designation: "primary_contact" });
    // The list came back from the SERVER's re-read, not from a local patch.
    const reads = rpc.mock.calls.filter((c) => c[0] === "get_workspace_billing_contacts").length;
    expect(reads).toBeGreaterThanOrEqual(2);
    expect(contactsState(host)).toBe("designated");
    expect(text(host)).toContain("Primary billing contact");
    expect(text(host)).toContain("Primary billing contact set for this workspace.");
    // and the "you have none" warning is gone, because one now exists
    expect(text(host)).not.toContain("No billing contact has been designated");
  });

  it("holds the designation across a fresh mount (it was persisted, not held in the component)", async () => {
    const state = world({ contacts: [] });
    const first = await render();
    await choose(selects(first.host)[0], "user-owner");
    await submit(selects(first.host)[0].closest("form"));
    await act(async () => { await Promise.resolve(); });
    await act(async () => first.root.unmount());

    expect(state.contacts).toHaveLength(1);
    const second = await render();
    expect(contactsState(second.host)).toBe("designated");
    expect(text(second.host)).toContain("Workspace Owner");
  });

  it("adds a delegate from the admins only — an owner is never offered as a delegate", async () => {
    world({ contacts: [contactRow()] });
    const { host } = await render();
    const delegateSelect = selects(host).at(-1)!;
    expect(Array.from(delegateSelect.options).map((o) => o.value)).toEqual(["", "user-admin"]);
    await choose(delegateSelect, "user-admin");
    await submit(delegateSelect.closest("form"));
    await act(async () => { await Promise.resolve(); });
    expect(rpc).toHaveBeenCalledWith("platform_billing_contact_designate", { p_user_id: "user-admin", p_designation: "delegate" });
    expect(text(host)).toContain("Billing delegate added for this workspace.");
  });

  it("never offers someone who already holds a designation", async () => {
    world({ contacts: [contactRow()] });
    const { host } = await render();
    for (const select of selects(host)) {
      expect(Array.from(select.options).map((o) => o.value)).not.toContain("user-owner");
    }
  });

  it("says everyone eligible is already designated, not that the workspace has no owner", async () => {
    world({ contacts: [contactRow(), contactRow({ id: "contact-2", user_id: "user-admin", designation: "delegate", role: "admin", display_name: "An Admin" })] });
    const { host } = await render();
    expect(text(host)).toContain("Everyone eligible to be the primary billing contact is already designated");
    expect(text(host)).toContain("Every current admin is already designated");
    expect(text(host)).not.toContain("No current workspace owner is available");
  });

  it("says a workspace with nobody eligible has nobody, and says which", async () => {
    world({ contacts: [], roster: { ...ROSTER, members: ROSTER.members.filter((m) => m.permission === "member") } });
    const { host } = await render();
    expect(text(host)).toContain("No current workspace owner is available to designate");
    expect(text(host)).toContain("no current admin, so there is nobody to designate");
  });

  it("cannot submit an empty selection", async () => {
    world({ contacts: [] });
    const { host } = await render();
    const submitButton = byText(host, "Set primary billing contact") as HTMLButtonElement;
    expect(submitButton.disabled).toBe(true);
    await submit(selects(host)[0].closest("form"));
    expect(rpc).not.toHaveBeenCalledWith("platform_billing_contact_designate", expect.anything());
  });

  it("clears a selection that is no longer offered, so the button cannot re-send a stale choice", async () => {
    // Two eligible owners: designating one must not leave the other form pointing at the designated
    // person with an enabled button.
    world({
      contacts: [],
      roster: {
        ...ROSTER,
        members: [
          ...ROSTER.members,
          { membership_id: "m4", user_id: "user-owner-2", full_name: "Second Owner", email: "o2@example.test", avatar_url: null, status: "active", permission: "owner", is_owner: true, job_title: null, responsibilities: null, last_sign_in_at: null },
        ],
      },
    });
    const { host } = await render();
    const select = selects(host)[0];
    expect(Array.from(select.options).map((o) => o.value)).toEqual(["", "user-owner", "user-owner-2"]);
    await choose(select, "user-owner");
    await submit(select.closest("form"));
    await act(async () => { await Promise.resolve(); });

    const after = selects(host)[0];
    expect(Array.from(after.options).map((o) => o.value)).toEqual(["", "user-owner-2"]);
    expect(after.value).toBe("");
    expect((byText(host, "Set primary billing contact") as HTMLButtonElement).disabled).toBe(true);
    const designateCalls = rpc.mock.calls.filter((c) => c[0] === "platform_billing_contact_designate").length;
    await submit(after.closest("form"));
    await act(async () => { await Promise.resolve(); });
    expect(rpc.mock.calls.filter((c) => c[0] === "platform_billing_contact_designate").length).toBe(designateCalls);
  });

  it("shows the server's refusal verbatim and does not pretend the write happened", async () => {
    world({ contacts: [], writeError: { message: "billing_contact_email_unverified" } });
    const { host } = await render();
    await choose(selects(host)[0], "user-owner");
    await submit(selects(host)[0].closest("form"));
    await act(async () => { await Promise.resolve(); });
    expect(text(host)).toContain("email address is not verified yet");
    expect(contactsState(host)).toBe("none");
  });

  it("revokes a delegate after confirming, and removes it from the server list", async () => {
    const state = world({ contacts: [contactRow(), contactRow({ id: "contact-2", user_id: "user-admin", designation: "delegate", role: "admin", display_name: "An Admin" })] });
    const { host } = await render();
    const rows = Array.from(host.querySelectorAll("[data-contact-designation='delegate']"));
    await click(rows[0].querySelector("button"));
    await act(async () => { await Promise.resolve(); });
    expect(state.contacts.map((c) => c.id)).toEqual(["contact-1"]);
    expect(text(host)).toContain("no longer billing delegate for this workspace");
  });

  it("abandoning the confirm changes nothing and claims nothing", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(false);
    const state = world({ contacts: [contactRow()] });
    const { host } = await render();
    await click(host.querySelector("[data-contact-designation='primary_contact'] button"));
    await act(async () => { await Promise.resolve(); });
    expect(rpc).not.toHaveBeenCalledWith("platform_billing_contact_revoke", expect.anything());
    expect(state.contacts).toHaveLength(1);
    expect(text(host)).not.toContain("no longer");
  });

  it("warns, before removing the last primary contact, what the workspace would lose", async () => {
    world({ contacts: [contactRow()] });
    const { host } = await render();
    await click(host.querySelector("[data-contact-designation='primary_contact'] button"));
    expect(vi.mocked(window.confirm).mock.calls[0][0]).toContain("a paid plan cannot start without one");
  });

  it("reports a designation that no longer names a current owner instead of dropping it", async () => {
    world({ contacts: [contactRow({ still_eligible: false })] });
    const { host } = await render();
    expect(text(host)).toContain("No longer a current owner — not counted");
  });
});

describe("authority boundaries", () => {
  it("a non-owner gets a read-only surface: no designate form, no remove, no roster read", async () => {
    world({ authority: { can_manage_billing: false, can_view_billing: false, role: "admin" }, contacts: [contactRow()] });
    const { host } = await render();
    expect(selects(host)).toHaveLength(0);
    expect(host.querySelector("[data-contact-designation] button")).toBeNull();
    expect(text(host)).toContain("Your access here is read-only");
    expect(rpc.mock.calls.some((c) => c[0] === "get_solo_team_workspace")).toBe(false);
  });

  it("an owner-only refusal on the contacts read is never rendered as 'there are none'", async () => {
    world({ contactsError: { message: "billing_workspace_owner_only" } });
    const { host } = await render();
    expect(contactsState(host)).toBe("refusal:billing_workspace_owner_only");
    expect(text(host)).toContain("Only a workspace owner can choose the billing contacts");
    expect(text(host)).not.toContain("No billing contact has been designated");
  });

  it("offers a retry for an unreadable contacts list, and the retry re-reads", async () => {
    world({ contactsError: { message: "connection lost" } });
    const { host } = await render();
    expect(contactsState(host)).toBe("refusal:network");
    const before = rpc.mock.calls.filter((c) => c[0] === "get_workspace_billing_contacts").length;
    await click(byText(host, "Retry"));
    await act(async () => { await Promise.resolve(); });
    expect(rpc.mock.calls.filter((c) => c[0] === "get_workspace_billing_contacts").length).toBeGreaterThan(before);
  });

  it("keeps working when the roster cannot be read — it says so and still shows the designations", async () => {
    world({ contacts: [contactRow()], rosterError: { message: "boom" } });
    const { host } = await render();
    expect(contactsState(host)).toBe("designated");
    expect(text(host)).toContain("could not be read just now");
  });

  /**
   * A failed roster read produces the SAME empty list as a workspace with nobody eligible. Printing
   * the eligibility verdict on the strength of it is a claim about the account derived from an
   * answer nobody received — the exact failure this screen exists to remove.
   */
  it("never turns an unreadable roster into 'this workspace has nobody eligible'", async () => {
    world({ contacts: [], rosterError: { message: "boom" } });
    const { host } = await render();
    expect(text(host)).toContain("could not be read just now");
    expect(text(host)).not.toContain("No current workspace owner is available");
    expect(text(host)).not.toContain("no current admin, so there is nobody to designate");
    expect(text(host)).not.toContain("Everyone eligible");
    expect(selects(host)).toHaveLength(0);
  });

  it("treats a roster answered for a DIFFERENT workspace as unreadable, never as this one's people", async () => {
    world({ contacts: [], roster: { ...ROSTER, tenant_id: "tenant-b" } });
    const { host } = await render();
    expect(selects(host)).toHaveLength(0);
    expect(text(host)).toContain("could not be read just now");
  });
});

describe("an outcome belongs to the workspace it was made in", () => {
  it("does not carry a designation success across a workspace switch", async () => {
    world({ contacts: [] });
    const { host, root } = await render();
    await choose(selects(host)[0], "user-owner");
    await submit(selects(host)[0].closest("form"));
    await act(async () => { await Promise.resolve(); });
    expect(text(host)).toContain("Primary billing contact set for this workspace.");

    context.tenantId = "tenant-b";
    world({ contacts: [], authority: { tenant_id: "tenant-b" }, roster: { ...ROSTER, tenant_id: "tenant-b" } });
    await act(async () => root.render(<SoloBillingView />));
    await act(async () => { await Promise.resolve(); });
    await act(async () => { await Promise.resolve(); });

    expect(contactsState(host)).toBe("none");
    expect(text(host)).not.toContain("Primary billing contact set for this workspace.");
  });

  it("does not carry a portal refusal across a workspace switch", async () => {
    world({ authority: { billing_account_state: "mapped" } });
    invoke.mockResolvedValue({
      data: null,
      error: Object.assign(new Error("Edge Function returned a non-2xx status code"), {
        context: new Response(JSON.stringify({ error: "not_enabled" }), { status: 503 }),
      }),
    });
    const { host, root } = await render();
    await click(byText(host, "Manage billing"));
    expect(text(host)).toContain("not switched on yet");

    context.tenantId = "tenant-b";
    world({ authority: { tenant_id: "tenant-b", scope: "sub_account", can_manage_billing: false, billing_account_state: "not_applicable" } });
    await act(async () => root.render(<SoloBillingView />));
    await act(async () => { await Promise.resolve(); });
    await act(async () => { await Promise.resolve(); });

    expect(portalState(host)).toBe("portal-not-applicable");
    expect(text(host)).not.toContain("not switched on yet");
  });
});

describe("workspace switching", () => {
  it("shows nothing at all while no workspace is selected", async () => {
    context.tenantId = "";
    world();
    const { host } = await render();
    expect(planState(host)).toBe("plan-no-workspace");
    expect(text(host)).toContain("There is no billing account to show until a workspace is open");
  });

  it("never paints the previous workspace's contacts under the next one", async () => {
    world({ contacts: [contactRow({ display_name: "Owner of A" })] });
    const { host, root } = await render();
    expect(text(host)).toContain("Owner of A");

    context.tenantId = "tenant-b";
    world({ contacts: [], authority: { tenant_id: "tenant-b" }, roster: { ...ROSTER, tenant_id: "tenant-b", members: [] } });
    await act(async () => root.render(<SoloBillingView />));
    await act(async () => { await Promise.resolve(); });
    await act(async () => { await Promise.resolve(); });
    expect(text(host)).not.toContain("Owner of A");
    expect(contactsState(host)).toBe("none");
  });

  it("drops a late answer that arrives for a workspace already left", async () => {
    let releaseFirst!: (value: { data: unknown; error: unknown }) => void;
    const slow = new Promise<{ data: unknown; error: unknown }>((done) => { releaseFirst = done; });
    let firstContactsRead = true;
    rpc.mockImplementation((name: string) => {
      if (name === "get_workspace_billing_authority") return Promise.resolve({ data: [authorityRow({ tenant_id: context.tenantId })], error: null });
      if (name === "get_workspace_billing_contacts") {
        if (firstContactsRead) { firstContactsRead = false; return slow; }
        return Promise.resolve({ data: [], error: null });
      }
      if (name === "get_solo_team_workspace") return Promise.resolve({ data: { ...ROSTER, tenant_id: context.tenantId, members: [] }, error: null });
      return Promise.resolve({ data: null, error: null });
    });

    const host = document.createElement("div");
    document.body.appendChild(host);
    const root = createRoot(host);
    await act(async () => root.render(<SoloBillingView />));

    context.tenantId = "tenant-b";
    await act(async () => root.render(<SoloBillingView />));
    await act(async () => { await Promise.resolve(); });
    // The first workspace's answer lands now, after we have left it.
    await act(async () => { releaseFirst({ data: [contactRow({ display_name: "Owner of A" })], error: null }); await Promise.resolve(); });
    await act(async () => { await Promise.resolve(); });

    expect(text(host)).not.toContain("Owner of A");
  });
});

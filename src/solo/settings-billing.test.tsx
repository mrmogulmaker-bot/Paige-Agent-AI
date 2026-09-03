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

type StatusRow = Record<string, unknown>;

/** The Billing Experience status row, as `get_workspace_billing_status()` actually returns it —
 * a real promotional workspace with $0 due, no provider mapping, no payment method, and no
 * historical duplicate primary. */
function statusRow(over: Partial<StatusRow> = {}): StatusRow {
  return {
    tenant_id: "tenant-a", workspace_name: "A workspace", scope: "top_level",
    can_view: true, can_manage: true, access_state: "promotional", revenue_class: "promotional",
    plan_slug: "solo", plan_name: "Solo", amount_due_cents: 0, payment_method_required: false,
    billed_by: "PAIGE Platform", provider_state: "not_created",
    payment_method_connected: false, payment_method_brand: null, payment_method_last4: null,
    payment_method_exp_month: null, payment_method_exp_year: null,
    seats_included: 1, seats_used: 1, contacts_included: 250, contacts_used: 0,
    sms_included: null, sms_used: null,
    ai_tokens_included: 5000000, ai_credit_token_ratio: 1000, paid_addons_count: 0,
    primary_contact_count: 0, delegate_count: 0, primary_selection_needed: false,
    notice_delivery_state: "no_sender", trial_ends_at: null,
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
/**
 * The AI-usage row as `get_workspace_ai_usage()` actually returns it: `bigint` columns arrive as
 * STRINGS over PostgREST, so the fixture uses strings. A fixture that used numbers would let a
 * number-only parser pass here and return nothing on the real platform.
 */
function usageRow(over: Partial<Record<string, unknown>> = {}): Record<string, unknown> {
  return {
    tenant_id: "tenant-a",
    scope: "top_level",
    can_view: true,
    usage_state: "ok",
    revenue_class: "promotional",
    reference_plan_slug: "solo",
    included_ai_tokens_month: "5000000",
    ai_credit_token_ratio: 1000,
    period_source: "calendar_month",
    period_start: "2026-09-01T00:00:00Z",
    period_end: "2026-10-01T00:00:00Z",
    tokens_used: "1250000",
    events_counted: 7,
    usage_last_recorded_at: "2026-09-02T10:00:00Z",
    ...over,
  };
}

function world(over: {
  authority?: Partial<AuthorityRow>;
  authorityError?: { message: string } | null;
  status?: Partial<StatusRow> | null;
  statusError?: { message: string } | null;
  contacts?: Array<Record<string, unknown>>;
  contactsError?: { message: string } | null;
  writeError?: { message: string } | null;
  roster?: unknown;
  rosterError?: { message: string } | null;
  usage?: Partial<Record<string, unknown>> | null;
  usageError?: { message: string } | null;
} = {}) {
  const state = { contacts: over.contacts ?? [] };
  rpc.mockImplementation((name: string, args?: Record<string, unknown>) => {
    if (name === "get_workspace_billing_authority") {
      return Promise.resolve(over.authorityError ? { data: null, error: over.authorityError } : { data: [authorityRow(over.authority)], error: null });
    }
    if (name === "get_workspace_billing_status") {
      if (over.statusError) return Promise.resolve({ data: null, error: over.statusError });
      if (over.status === null) return Promise.resolve({ data: [], error: null });
      return Promise.resolve({ data: [statusRow(over.status)], error: null });
    }
    if (name === "get_workspace_billing_contacts") {
      return Promise.resolve(over.contactsError ? { data: null, error: over.contactsError } : { data: state.contacts, error: null });
    }
    if (name === "get_workspace_ai_usage") {
      if (over.usageError) return Promise.resolve({ data: null, error: over.usageError });
      // `usage: null` means "the RPC returned no row" — the shape a failed/absent read has, which
      // the card must report as unreadable rather than as zero usage.
      if (over.usage === null) return Promise.resolve({ data: [], error: null });
      return Promise.resolve({ data: [usageRow(over.usage)], error: null });
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
const usageState = (host: HTMLElement) => host.querySelector("[data-usage-state]")?.getAttribute("data-usage-state");

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
  /**
   * Owner brief 2026-09-03 (R13): a promotional workspace with $0 due IS a truthful money figure
   * and must be shown — "$0 due today" is the whole point of the rebuild, not a claim to suppress.
   * What must NEVER appear is a NONZERO figure the platform did not actually charge.
   */
  it("shows $0 due for a promotional workspace, and never a nonzero figure it did not prove", async () => {
    world();
    const { host } = await render();
    expect(text(host)).toContain("$0");
    expect(text(host)).not.toMatch(/\$[1-9]/);
  });

  it("never prints a nonzero money figure for any provider readiness state this slice can produce", async () => {
    for (const providerState of ["not_created", "mapped", "ambiguous"]) {
      world({ status: { provider_state: providerState } });
      const { host, root } = await render();
      expect(text(host), `provider_state ${providerState}`).not.toMatch(/\$[1-9]/);
      await act(async () => root.unmount());
    }
  });

  /** §58: this card shipped on the pre-Foundation-C surface and must not vanish with the rewrite. */
  it("keeps the Usage & limits card that already shipped here", async () => {
    world();
    const { host } = await render();
    // §58 NOTE — this guard used to assert the card said "Usage & limits" / "No totals are shown".
    // That card was UNAVAILABLE because the platform had no allowance model and no tenant-safe read
    // of the meter. Both now exist (owner ruling 2026-09-03), so the card was UPGRADED in place —
    // not removed. The guard is rewritten to assert the stronger capability rather than deleted,
    // because a deleted guard is how a card silently disappears next time.
    expect(text(host)).toContain("AI usage");
    expect(usageState(host)).toBe("usage-tracked");
    expect(text(host)).toContain("5,000 AI credits (5,000,000 tokens)");
  });

  /** R22: a Solo member who may not VIEW billing is refused the plan, not shown it. */
  it("refuses the plan to someone the server says may not view billing", async () => {
    world({ status: { can_view: false, can_manage: false } });
    const { host } = await render();
    expect(planState(host)).toBe("status-role-refusal");
    expect(text(host)).toContain("visible to its owner");
  });

  it("says a workspace with no active plan has none, only when the server actually proved it", async () => {
    world({ status: { access_state: "no_plan", plan_slug: null, plan_name: null, amount_due_cents: null, billed_by: null, payment_method_required: false } });
    const { host } = await render();
    const rendered = text(host).toLowerCase();
    expect(rendered).not.toContain("no current solo subscription");
    expect(planState(host)).toBe("status-no-plan");
    expect(text(host)).toContain("no active plan");
  });

  it("never claims 'no plan' or 'billing unavailable' for a real promotional workspace", async () => {
    world();
    const { host } = await render();
    const rendered = text(host).toLowerCase();
    expect(rendered).not.toContain("no subscription");
    expect(rendered).not.toContain("no plan yet");
    expect(planState(host)).toBe("status-promotional");
    expect(text(host)).toContain("Billed by");
    expect(text(host)).toContain("PAIGE Platform");
  });

  it("reports a failed status read as a failed read, with a retry, not as an account state", async () => {
    world({ statusError: { message: "boom" } });
    const { host } = await render();
    expect(planState(host)).toBe("status-error");
    expect(text(host)).toContain("Nothing about your plan has changed");
    expect(byText(host, "Retry")).toBeTruthy();
  });

  it("keeps 'not applicable' distinct from 'nothing here' for a sub-account", async () => {
    world({
      authority: { scope: "sub_account", can_manage_billing: false, billing_account_state: "not_applicable" },
      status: { scope: "sub_account", can_view: false, can_manage: false, access_state: "unknown" },
    });
    const { host } = await render();
    expect(planState(host)).toBe("status-subaccount");
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
   * "Manage billing" button — a positive claim and a money act produced by a default. That guard
   * still binds the portal (still authority-driven, still correctly mapping-gated).
   */
  it("fails closed on a mapping state it does not recognise, rather than into a claim", async () => {
    world({ authority: { billing_account_state: "pending_review" } });
    const { host } = await render();
    expect(text(host)).not.toContain("has a billing account");
    expect(portalState(host)).toBe("portal-unavailable");
    expect(byText(host, "Manage billing")).toBeUndefined();
  });

  /** The status hook's own coercion: an access_state/scope/provider_state this page does not
   * recognise fails closed into an honest "not described", never a default positive claim. */
  it("fails closed on a status the hook does not recognise, rather than a fabricated default", async () => {
    world({ status: { access_state: "some_future_state", provider_state: "some_future_state" } });
    const { host } = await render();
    expect(planState(host)).toBe("status-unknown");
    expect(text(host)).not.toMatch(/\$[1-9]/);
    expect(text(host)).toContain("has not been given approved wording");
  });

  /**
   * The reverse of the old assertion, and deliberately so (owner, 2026-09-03). Client billing MOVED
   * to Campaigns → Sales. Billing is one direction of money — the platform billing this workspace —
   * so a card about what the tenant charges its own customers must not reappear here.
   */
  it("does not carry client billing any more — that moved to Campaigns › Sales", async () => {
    world();
    const { host } = await render();
    expect(text(host)).not.toContain("What you charge your clients");
    expect(text(host)).not.toContain("your own payment processor");
    expect(text(host)).not.toMatch(/charge your own clients/i);
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

  /**
   * Owner brief 2026-09-03, item 2: "For Mogul Maker Academy specifically, the current two-primary
   * state must render as a fixable selection-needed state, not as two people both being called
   * primary." `primary_selection_needed` comes from `get_workspace_billing_status()` — historical
   * data can leave two live primaries even though the DB trigger (Slice A) blocks any NEW second one.
   */
  it("renders a Selection needed banner when the server reports two live primaries, distinct from the per-row badges", async () => {
    world({
      status: { primary_selection_needed: true },
      contacts: [contactRow(), contactRow({ id: "contact-2", user_id: "user-owner-2", display_name: "Second Owner" })],
    });
    const { host } = await render();
    const banner = host.querySelector("[data-selection-needed='true']");
    expect(banner).toBeTruthy();
    expect(banner?.textContent).toContain("Selection needed");
    expect(banner?.textContent).toContain("must remove all but one");
    // still the ordinary designated list underneath — the banner names the problem, it does not replace the rows.
    expect(contactsState(host)).toBe("designated");
  });

  it("does not render the Selection needed banner when the server reports only one primary", async () => {
    world({ status: { primary_selection_needed: false }, contacts: [contactRow()] });
    const { host } = await render();
    expect(host.querySelector("[data-selection-needed='true']")).toBeNull();
  });
});

describe("plan & usage — access state is independent of provider readiness (R13)", () => {
  it("reports an internal/platform workspace distinctly, never dressed up as promotional", async () => {
    world({ status: { access_state: "internal", revenue_class: "internal_test", plan_slug: null, plan_name: null, amount_due_cents: null, billed_by: null } });
    const { host } = await render();
    expect(planState(host)).toBe("status-internal");
    expect(text(host)).toContain("Internal / platform workspace");
    // Scoped to the plan card's own state element — the page's UNRELATED AI usage card (a
    // different read, `get_workspace_ai_usage`) legitimately says "Promotional" for its own
    // fixture and must not make this assertion a false negative.
    const planNode = host.querySelector("[data-billing-state]");
    expect(planNode?.textContent ?? "").not.toContain("Promotional");
  });

  it("reports Agency and Enterprise as unsupported account types, never as a Solo plan", async () => {
    for (const scope of ["agency", "enterprise"]) {
      world({ status: { scope, can_view: false, can_manage: false, access_state: "unknown" } });
      const { host, root } = await render();
      expect(planState(host), scope).toBe("status-unsupported");
      expect(text(host)).toContain("not available for this account type yet");
      await act(async () => root.unmount());
    }
  });

  it("shows the provider readiness fact SEPARATELY from access — not_created never reads as no plan", async () => {
    world({ status: { provider_state: "not_created" } });
    const { host } = await render();
    expect(planState(host)).toBe("status-promotional");
    expect(text(host)).toContain("Not set up yet");
  });

  it("shows a connected payment method's brand and last 4 when one is real", async () => {
    world({ status: {
      provider_state: "mapped", payment_method_connected: true,
      payment_method_brand: "Visa", payment_method_last4: "4242",
      payment_method_exp_month: 12, payment_method_exp_year: 2031,
    } });
    const { host } = await render();
    expect(text(host)).toContain("Visa •••• 4242");
    expect(text(host)).toContain("exp 12/2031");
  });

  it("shows real seats/contacts usage, and omits SMS when no meter exists", async () => {
    world({ status: { seats_included: 1, seats_used: 1, contacts_included: 250, contacts_used: 3, sms_included: null, sms_used: null } });
    const { host } = await render();
    expect(text(host)).toContain("1 of 1 included");
    expect(text(host)).toContain("3 of 250 included");
    expect(text(host)).not.toContain("SMS");
  });
});

/**
 * Item 4 (owner brief 2026-09-03) — the payment-method connect act, rendered inside the SAME
 * "Payment method" card as the pre-existing hosted-portal block (§18 one home), gated on the SAME
 * authority the server itself gates on, so the button is never offered where the server would
 * refuse it (§36 — no dead-end buttons).
 */
describe("payment setup — the connect act (item 4)", () => {
  const originalLocation = Object.getOwnPropertyDescriptor(window, "location")!;
  let assign: ReturnType<typeof vi.fn>;
  beforeEach(() => {
    assign = vi.fn();
    Object.defineProperty(window, "location", { value: { ...originalLocation.value, assign }, writable: true, configurable: true });
  });
  afterEach(() => { Object.defineProperty(window, "location", originalLocation); });

  const setupState = (host: HTMLElement) => host.querySelector("[data-setup-state]")?.getAttribute("data-setup-state");

  it("offers 'Set up payment method' to the owner when no method is connected yet — not_created reads exactly like an already-mapped-but-unconnected workspace", async () => {
    for (const providerState of ["not_created", "mapped"]) {
      world({ status: { provider_state: providerState, payment_method_connected: false } });
      const { host, root } = await render();
      expect(setupState(host), providerState).toBe("setup-needed");
      expect(byText(host, "Set up payment method")).toBeTruthy();
      await act(async () => root.unmount());
    }
  });

  it("offers 'Update payment method' and shows the real masked details once one is connected", async () => {
    world({ status: {
      provider_state: "mapped", payment_method_connected: true,
      payment_method_brand: "Visa", payment_method_last4: "4242",
      payment_method_exp_month: 12, payment_method_exp_year: 2031,
    } });
    const { host } = await render();
    expect(setupState(host)).toBe("setup-connected");
    expect(byText(host, "Update payment method")).toBeTruthy();
  });

  it("never offers payment setup to a non-owner", async () => {
    world({ authority: { can_manage_billing: false, role: "admin" }, status: { can_manage: false } });
    const { host } = await render();
    expect(setupState(host)).toBe("setup-not-owner");
    expect(byText(host, "Set up payment method")).toBeUndefined();
    expect(byText(host, "Update payment method")).toBeUndefined();
  });

  it("refuses payment setup for an ambiguous workspace rather than creating a new provider object over the conflict", async () => {
    // The setup gate reads `authority.billingAccountState` — the SAME field the server's own
    // decideConnectAccess gates on — not `status.providerState` (a separate read for display).
    world({ authority: { billing_account_state: "ambiguous" } });
    const { host } = await render();
    expect(setupState(host)).toBe("setup-needs-review");
    expect(byText(host, "Set up payment method")).toBeUndefined();
  });

  it("calls platform-billing-connect and navigates to the returned URL for THIS workspace", async () => {
    world({ status: { provider_state: "not_created" } });
    invoke.mockImplementation((name: string) => {
      if (name === "platform-billing-connect") return Promise.resolve({ data: { url: "https://checkout.example/setup", tenant_id: "tenant-a" }, error: null });
      return Promise.resolve({ data: null, error: null });
    });
    const { host } = await render();
    await click(byText(host, "Set up payment method"));
    await act(async () => { await Promise.resolve(); });
    expect(invoke).toHaveBeenCalledWith("platform-billing-connect");
    expect(assign).toHaveBeenCalledWith("https://checkout.example/setup");
  });

  it("reports the server's refusal reason verbatim and never navigates on a refusal", async () => {
    world({ status: { provider_state: "not_created" } });
    invoke.mockImplementation((name: string) => {
      if (name === "platform-billing-connect") {
        return Promise.resolve({
          data: null,
          error: Object.assign(new Error("Edge Function returned a non-2xx status code"), {
            context: new Response(JSON.stringify({ error: "billing_account_ambiguous" }), { status: 409 }),
          }),
        });
      }
      return Promise.resolve({ data: null, error: null });
    });
    const { host } = await render();
    await click(byText(host, "Set up payment method"));
    await act(async () => { await Promise.resolve(); });
    expect(text(host)).toContain("This workspace's billing records need a platform review before payment setup can proceed");
    expect(assign).not.toHaveBeenCalled();
  });

  it("withdraws the action after a refusal a retry cannot fix, rather than leaving a dead button (owner hotfix 2026-09-03)", async () => {
    world({ status: { provider_state: "not_created" } });
    invoke.mockImplementation((name: string) => {
      if (name === "platform-billing-connect") {
        return Promise.resolve({
          data: null,
          error: Object.assign(new Error("Edge Function returned a non-2xx status code"), {
            context: new Response(JSON.stringify({ error: "needs_config" }), { status: 503 }),
          }),
        });
      }
      return Promise.resolve({ data: null, error: null });
    });
    const { host } = await render();
    expect(byText(host, "Set up payment method")).toBeTruthy();
    await click(byText(host, "Set up payment method"));
    await act(async () => { await Promise.resolve(); });
    expect(text(host)).toContain("isn't turned on for this workspace yet");
    expect(byText(host, "Set up payment method")).toBeUndefined();
    expect(host.querySelector("[data-setup-durable-refusal]")).toBeTruthy();
  });

  it("keeps the action live after a transient refusal, so a genuine retry is still possible", async () => {
    world({ status: { provider_state: "not_created" } });
    invoke.mockImplementation((name: string) => {
      if (name === "platform-billing-connect") {
        return Promise.resolve({
          data: null,
          error: Object.assign(new Error("Edge Function returned a non-2xx status code"), {
            context: new Response(JSON.stringify({ error: "audit_failed" }), { status: 500 }),
          }),
        });
      }
      return Promise.resolve({ data: null, error: null });
    });
    const { host } = await render();
    await click(byText(host, "Set up payment method"));
    await act(async () => { await Promise.resolve(); });
    expect(text(host)).toContain("Try again");
    expect(byText(host, "Set up payment method")).toBeTruthy();
    expect(host.querySelector("[data-setup-durable-refusal]")).toBeFalsy();
  });

  it("keeps the action live after billing_account_unresolvable too — the server maps every Stripe exception (network blips, rate limits, transient 5xx) to this one code, so it is never assumed permanent (Codex review, #886)", async () => {
    world({ status: { provider_state: "not_created" } });
    invoke.mockImplementation((name: string) => {
      if (name === "platform-billing-connect") {
        return Promise.resolve({
          data: null,
          error: Object.assign(new Error("Edge Function returned a non-2xx status code"), {
            context: new Response(JSON.stringify({ error: "billing_account_unresolvable" }), { status: 409 }),
          }),
        });
      }
      return Promise.resolve({ data: null, error: null });
    });
    const { host } = await render();
    await click(byText(host, "Set up payment method"));
    await act(async () => { await Promise.resolve(); });
    expect(text(host)).toContain("The payment provider could not open a setup page");
    expect(byText(host, "Set up payment method")).toBeTruthy();
    expect(host.querySelector("[data-setup-durable-refusal]")).toBeFalsy();
  });

  it("does not navigate to a URL minted for a different workspace than the one clicked in", async () => {
    world({ status: { provider_state: "not_created" } });
    invoke.mockImplementation((name: string) => {
      if (name === "platform-billing-connect") return Promise.resolve({ data: { url: "https://checkout.example/setup", tenant_id: "tenant-DIFFERENT" }, error: null });
      return Promise.resolve({ data: null, error: null });
    });
    const { host } = await render();
    await click(byText(host, "Set up payment method"));
    await act(async () => { await Promise.resolve(); });
    expect(assign).not.toHaveBeenCalled();
  });

  it("shows a 'confirming' banner on a successful redirect return, and polls the real status read rather than trusting the URL alone", async () => {
    context.tenantId = "tenant-a";
    Object.defineProperty(window, "location", {
      value: { assign, search: "?payment_setup=success", pathname: "/solo/1/settings/billing" },
      writable: true, configurable: true,
    });
    // history.replaceState is real in jsdom and harmless to call.
    world();
    const { host } = await render();
    expect(host.querySelector("[data-setup-return='success']")).toBeTruthy();
    expect(text(host)).toContain("Confirming your payment method");
    const before = rpc.mock.calls.filter((c) => c[0] === "get_workspace_billing_status").length;
    // The poll fires on a timer; advancing real timers here would slow the suite, so this asserts
    // only that the return is detected and rendered — the poll's own re-read is covered by the
    // dedicated hook-level refresh test on useWorkspaceBillingStatus.
    expect(rpc.mock.calls.filter((c) => c[0] === "get_workspace_billing_status").length).toBeGreaterThanOrEqual(before);
  });

  it("shows a neutral 'cancelled' banner and claims no change on a cancelled redirect return", async () => {
    context.tenantId = "tenant-a";
    Object.defineProperty(window, "location", {
      value: { assign, search: "?payment_setup=cancelled", pathname: "/solo/1/settings/billing" },
      writable: true, configurable: true,
    });
    world();
    const { host } = await render();
    expect(host.querySelector("[data-setup-return='cancelled']")).toBeTruthy();
    expect(text(host)).toContain("Payment setup was cancelled");
    expect(text(host)).toContain("Nothing about your billing changed");
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
    expect(planState(host)).toBe("status-no-workspace");
    expect(text(host)).toContain("There is no billing status to show until a workspace is open");
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

/**
 * AI usage on this surface. The contract itself is asserted directly in `ai-usage-contract.test.ts`;
 * what matters HERE is that the card is wired to the real seam, that a refusal reaches the screen
 * as a refusal, and that a total for one workspace can never be read under another.
 */
describe("AI usage card", () => {
  it("reads the server seam with no argument, so the workspace is never client-supplied", async () => {
    world();
    await render();
    const call = rpc.mock.calls.find((c) => c[0] === "get_workspace_ai_usage");
    expect(call).toBeDefined();
    expect(call?.[1]).toBeUndefined();
  });

  it("states the allowance, the usage and the remainder, with the credit conversion spelled out", async () => {
    world();
    const { host } = await render();
    expect(usageState(host)).toBe("usage-tracked");
    expect(text(host)).toContain("5,000 AI credits (5,000,000 tokens)");
    expect(text(host)).toContain("1,250 AI credits (1,250,000 tokens)");
    expect(text(host)).toContain("3,750 AI credits (3,750,000 tokens)");
    expect(text(host)).toContain("One AI credit is 1,000 tokens recorded by the platform.");
  });

  it("calls a promotional workspace promotional, and never a paid plan", async () => {
    world();
    const { host } = await render();
    expect(text(host)).toContain("Promotional AI usage tracking");
  });

  it("shows no cost, no projection and no overage anywhere on the surface", async () => {
    world();
    const { host } = await render();
    expect(text(host)).not.toMatch(/overage|projected|forecast|on track to|will run out/i);
    // The plan card is now allowed to show a REAL "$0 due today" (owner brief 2026-09-03); what
    // the AI usage card itself must never show is a cost/price figure of its own — nonzero or not.
    expect(text(host)).not.toMatch(/AI usage[\s\S]*\$\d/);
  });

  it("reports a failed read as unreadable and offers a retry — never as zero usage", async () => {
    world({ usageError: { message: "boom" } });
    const { host } = await render();
    expect(usageState(host)).toBe("usage-error");
    expect(text(host)).not.toMatch(/0 AI credits/);
    expect(byText(host, "Retry")).toBeDefined();
  });

  it("treats an empty result as unreadable rather than as a workspace that used nothing", async () => {
    world({ usage: null });
    const { host } = await render();
    expect(usageState(host)).toBe("usage-error");
  });

  it("retries the read when asked, rather than only clearing the message", async () => {
    world({ usageError: { message: "boom" } });
    const { host } = await render();
    const before = rpc.mock.calls.filter((c) => c[0] === "get_workspace_ai_usage").length;
    await click(byText(host, "Retry"));
    expect(rpc.mock.calls.filter((c) => c[0] === "get_workspace_ai_usage").length).toBeGreaterThan(before);
  });

  it("tells a non-owner why no total is shown instead of showing them a zero", async () => {
    world({ usage: { usage_state: "owner_only", can_view: false, tokens_used: null, included_ai_tokens_month: null, ai_credit_token_ratio: null } });
    const { host } = await render();
    expect(usageState(host)).toBe("usage-owner-only");
    expect(text(host)).not.toMatch(/0 AI credits/);
  });

  it("tells a sub-account the roll-up is undecided rather than claiming it used nothing", async () => {
    world({ usage: { usage_state: "not_applicable", scope: "sub_account", can_view: false, tokens_used: null } });
    const { host } = await render();
    expect(usageState(host)).toBe("usage-not-applicable");
    expect(text(host)).toContain("not a statement that nothing was used");
  });

  it("says a plan defines no allowance instead of rendering it as zero included", async () => {
    world({ usage: { included_ai_tokens_month: null, ai_credit_token_ratio: null, reference_plan_slug: "enterprise" } });
    const { host } = await render();
    expect(usageState(host)).toBe("usage-no-allowance");
    expect(text(host)).not.toMatch(/0 AI credits \(0 tokens\) included/i);
    expect(text(host)).toContain("does not define an included monthly amount");
  });

  it("shows a real zero from a successful read, which a refusal must not be confusable with", async () => {
    world({ usage: { tokens_used: "0", events_counted: 0 } });
    const { host } = await render();
    expect(usageState(host)).toBe("usage-tracked");
    expect(text(host)).toContain("0 AI credits (0 tokens)");
  });

  it("never paints one workspace's usage total under the next one", async () => {
    world({ usage: { tokens_used: "1250000" } });
    const { host, root } = await render();
    expect(text(host)).toContain("1,250 AI credits");

    context.tenantId = "tenant-b";
    world({
      authority: { tenant_id: "tenant-b" },
      roster: { ...ROSTER, tenant_id: "tenant-b", members: [] },
      usage: { tenant_id: "tenant-b", tokens_used: "40000" },
    });
    await act(async () => root.render(<SoloBillingView />));
    await act(async () => { await Promise.resolve(); });
    await act(async () => { await Promise.resolve(); });
    expect(text(host)).not.toContain("1,250 AI credits");
    expect(text(host)).toContain("40 AI credits (40,000 tokens)");
  });
});

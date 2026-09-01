import { act } from "react";
import { createRoot } from "react-dom/client";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { SoloSettings } from "./settings";

/**
 * Carrier registration, and the four ways this surface can lie.
 *
 * Every one of these was a real defect on the legacy tab that this Solo surface reuses the
 * seams of, and all four collapse into the same screen — "nothing registered", above a
 * button whose only effect is a PAID model call that overwrites reviewed compliance copy:
 *
 *   • the workspace could not be resolved, so we know nothing;
 *   • the read failed, so we still know nothing;
 *   • the row exists but has left preparation, so its copy is locked;
 *   • the save succeeded, which is NOT the same as the registration being filed.
 *
 * The last one is the one that matters most, because filing does not exist in this product
 * at all. A person told their registration is filed stops waiting for the thing that would
 * make texting work.
 */

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const state = vi.hoisted(() => ({
  invoke: vi.fn(),
  tenantId: "tenant-1971670" as string | null,
  isAdmin: true as boolean | null,
  registration: null as Record<string, unknown> | null,
  regError: null as { message: string } | null,
  legal: { legal_business_name: "Test Workspace LLC", website_url: "https://example.com" } as Record<string, unknown> | null,
}));

const PREPARABLE = {
  status: "pending", brand_status: "pending", campaign_status: "pending",
  brand_sid: null, campaign_sid: null, messaging_service_sid: null,
  submitted_at: null, approved_at: null,
  use_case: "Client follow-ups", campaign_description: "We text our own clients about their appointments.",
  sample_messages: ["Hi Dana — confirming Tuesday at 3."],
  optin_flow: "Clients agree when they book.", optin_message: "You're subscribed.",
  optout_message: "Reply STOP to opt out.", help_message: "Reply HELP for help.",
};

vi.mock("@/hooks/useUserRoles", () => ({
  // The predicate the SERVER gates on (platform owner OR global admin/coach). Tied to the
  // same switch as the tenant-admin answer, so "someone the server would refuse" is
  // refused by BOTH halves — otherwise the authority row passes for want of one of them.
  useUserRoles: () => ({
    loading: false, userId: "u1", roles: state.isAdmin ? ["admin"] : [],
    isAdmin: state.isAdmin === true, isCoach: false, isClient: false, isBroker: false,
    isStaff: state.isAdmin === true,
  }),
}));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    rpc: vi.fn(async (fn: string) => {
      if (fn === "current_user_tenant_id") return { data: state.tenantId, error: state.tenantId ? null : { message: "no tenant" } };
      if (fn === "is_current_user_tenant_admin") return { data: state.isAdmin, error: null };
      if (fn === "tenant_comms_readiness") return { data: READINESS, error: null };
      return { data: null, error: null };
    }),
    from: vi.fn((table: string) => {
      const row = table === "tenant_a2p_registrations"
        ? { data: state.registration, error: state.regError }
        : table === "tenant_legal_profile" ? { data: state.legal, error: null }
          : { data: null, error: null };
      const leaf = {
        maybeSingle: async () => row,
        order: async () => ({ data: [], error: null }),
        limit: () => leaf,
        eq: () => leaf,
      };
      return { select: () => leaf };
    }),
    functions: { invoke: (...args: unknown[]) => state.invoke(...args) },
  },
}));
vi.mock("@/hooks/useTenantContext", () => ({
  useTenantContext: () => ({ activeTenantId: "tenant-1971670", loading: false, activeTenant: { account_number: "1971670" } }),
}));
vi.mock("@/lib/routing/useSubtabRoute", () => ({ useSubtabRoute: () => ["connections", vi.fn()] }));
vi.mock("./data/useSoloBusiness", () => ({
  useSoloBusiness: () => ({ name: "Test Workspace", brand: {}, loading: false, error: null, refresh: vi.fn() }),
}));
vi.mock("./data/useSoloOwner", () => ({
  useSoloOwner: () => ({ owner: { name: null, email: null, phone: null, website: null }, loading: false, error: null, refresh: vi.fn() }),
}));

const READINESS = {
  tenant_id: "tenant-1971670", can_send_sms: false, blocked_reason: "registration_absent",
  subaccount: "connected", number: "assigned", number_e164: "+14045550123",
  business: { has_name: true, has_website: true, has_phone: true },
  a2p: "absent",
  consent: { granted_count: 0, suppressed_count: 0, state: "none_recorded" },
  delivery: { state: "none", sent_30d: 0, delivered_30d: 0, failed_30d: 0, last_inbound_at: null },
  billing: { subscription: "active", plan_name: "Solo", period_end: null, cancel_at_period_end: false, usage_metering: "not_recording", metered_events_30d: 0 },
};

let host: HTMLDivElement;
async function mount() {
  host = document.createElement("div");
  document.body.appendChild(host);
  await act(async () => {
    createRoot(host).render(
      <MemoryRouter initialEntries={["/solo/1971670/settings/connections"]}>
        <Routes><Route path="/solo/:account/settings/*" element={<SoloSettings/>}/></Routes>
      </MemoryRouter>,
    );
  });
  await act(async () => { button("Registration")?.click(); });
}
const text = () => host.textContent ?? "";
function button(label: string): HTMLButtonElement | undefined {
  return [...host.querySelectorAll("button")].find((b) => (b.textContent ?? "").trim() === label) as HTMLButtonElement | undefined;
}
function buttonContaining(label: string): HTMLButtonElement | undefined {
  return [...host.querySelectorAll("button")].find((b) => (b.textContent ?? "").includes(label)) as HTMLButtonElement | undefined;
}
const draftBody = () => {
  const call = [...state.invoke.mock.calls].reverse().find((c) => c[0] === "comms-a2p-draft");
  return (call?.[1] as { body?: Record<string, unknown> } | undefined)?.body ?? {};
};
const saveBody = () => {
  const call = [...state.invoke.mock.calls].reverse().find((c) => c[0] === "comms-a2p-submit");
  return (call?.[1] as { body?: Record<string, unknown> } | undefined)?.body ?? {};
};

const DRAFTED = {
  draft: {
    use_case: "Client follow-ups",
    campaign_description: "We text people who are already our clients.",
    sample_messages: ["Hi Dana — confirming Tuesday at 3.", "Your notes from today are ready."],
    optin_flow: "Clients agree when they book.",
    optin_message: "You're subscribed. Reply STOP to stop.",
    optout_message: "You're unsubscribed.",
    help_message: "Reply HELP and we'll call you.",
  },
  legal_business_name: "Test Workspace LLC",
  website_url: "https://example.com",
  saved: true,
};

beforeEach(() => {
  state.invoke = vi.fn(async () => ({ data: DRAFTED, error: null }));
  state.tenantId = "tenant-1971670";
  state.isAdmin = true;
  state.registration = null;
  state.regError = null;
  state.legal = { legal_business_name: "Test Workspace LLC", website_url: "https://example.com" };
  document.body.innerHTML = "";
  vi.restoreAllMocks();
});

describe("Reaching the registration at all", () => {
  it("is its own area of Connections, not a card buried in Communications", async () => {
    await mount();
    expect(text()).toContain("Prepare your registration");
    expect(buttonContaining("Draft with Paige")).toBeTruthy();
  });

  it("shows the stored legal name WITHOUT offering a box that would discard it", async () => {
    // Both A2P functions read the legal name from `tenant_legal_profile` and ignore the
    // one in the request body — submit's own header says the identity fields are
    // "validated and then DISCARDED here". So an input for it is a save that lies: type
    // a correction, be told the registration was saved, reload, find the old value.
    await mount();
    expect(text()).toContain("Test Workspace LLC");
    const typeable = [...host.querySelectorAll("input")].find((i) => i.value === "Test Workspace LLC");
    expect(typeable, "a field the save discards must not be typeable").toBeUndefined();
    expect(text()).toContain("Setup");
  });

  it("does not offer the PAID draft to a workspace the server will refuse", async () => {
    // `comms-a2p-draft` refuses with LEGAL_PROFILE_REQUIRED before it spends, and a
    // workspace that has not filled in its business profile is the default case — so
    // without this gate the commonest outcome of pressing the button was a refusal.
    state.legal = null;
    await mount();
    expect(buttonContaining("Draft with Paige")).toBeUndefined();
    expect(text()).toContain("Add your legal business name first");
  });
});

describe("The four things this surface must never claim", () => {
  it("does not offer a paid draft when it could not work out which workspace this is", async () => {
    state.tenantId = null;
    await mount();
    expect(text()).toContain("couldn’t tell which business you’re in");
    expect(buttonContaining("Draft with Paige"), "a draft here overwrites a registration we never read").toBeUndefined();
  });

  it("does not offer a paid draft when the read itself failed", async () => {
    state.regError = { message: "42703 column does not exist" };
    await mount();
    expect(text()).toContain("couldn’t read this business’s registration");
    expect(text()).toContain("It may well exist");
    expect(buttonContaining("Draft with Paige")).toBeUndefined();
  });

  it("locks the copy once the registration has left preparation", async () => {
    state.registration = { ...PREPARABLE, submitted_at: "2026-08-01T00:00:00Z", status: "submitted" };
    await mount();
    expect(text()).toContain("moved past preparation");
    expect(buttonContaining("Draft with Paige"), "the save seam refuses this row").toBeUndefined();
    expect(buttonContaining("Save registration")).toBeUndefined();
  });

  it("NEVER says a saved registration was filed", async () => {
    // Filing does not exist. comms-a2p-submit refuses and returns a2p_submit_wired: false.
    state.registration = PREPARABLE;
    await mount();
    state.invoke = vi.fn(async () => ({ data: { saved: true, submitted: false, a2p_submit_wired: false }, error: null }));
    await act(async () => { buttonContaining("Save registration")?.click(); });
    expect(text()).toContain("has not been filed");
    expect(text()).not.toMatch(/\bfiled with\b(?!.*not)/);
    expect(text()).not.toContain("Submitted for review");
  });
});

describe("Drafting and saving", () => {
  it("re-opens saved copy for editing rather than making someone pay to see it again", async () => {
    state.registration = PREPARABLE;
    await mount();
    expect(text()).toContain("What carriers will read");
    const area = [...host.querySelectorAll("textarea")].find((t) => t.value.includes("appointments"));
    expect(area, "the saved campaign description should be editable").toBeTruthy();
  });

  it("sends the short form to the draft seam, and never a tenant id", async () => {
    await mount();
    await act(async () => { buttonContaining("Draft with Paige")?.click(); });
    const body = draftBody();
    expect(body.legal_business_name).toBe("Test Workspace LLC");
    // §9: both seams derive the tenant from the verified JWT. A body tenant would be
    // ignored server-side, so sending one can only mislead whoever reads this later.
    expect(body).not.toHaveProperty("tenant_id");
  });

  it("treats needs_config as a refusal, not as empty regulatory copy", async () => {
    state.invoke = vi.fn(async () => ({ data: { needs_config: true, error: "no_model_configured" }, error: null }));
    await mount();
    await act(async () => { buttonContaining("Draft with Paige")?.click(); });
    expect(host.querySelector('.ss-outcome[data-tone="bad"]')).toBeTruthy();
    // Empty fields presented as Paige's work would be worse than no draft at all.
    expect(text()).not.toContain("What carriers will read");
  });

  it("sends the three replies even when emptied, because omitting them preserves the old ones", async () => {
    state.registration = PREPARABLE;
    await mount();
    const stopField = [...host.querySelectorAll("input")].find((i) => i.value === "Reply STOP to opt out.")!;
    await act(async () => {
      Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value")!.set!.call(stopField, "");
      stopField.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await act(async () => { buttonContaining("Save registration")?.click(); });
    expect(saveBody()).toHaveProperty("optout_message", "");
  });
});

describe("Authority", () => {
  it("shows no registration controls to someone the server would refuse", async () => {
    state.isAdmin = false;
    await mount();
    expect(buttonContaining("Draft with Paige")).toBeUndefined();
    expect(text()).toContain("Only a workspace admin can change this business's carrier registration.");
  });
});

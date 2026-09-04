import { act } from "react";
import { createRoot } from "react-dom/client";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { SoloSettings } from "./settings";

/**
 * The three states Connections can actually be in, RENDERED.
 *
 * The existing rendered-copy suite uses `renderToStaticMarkup`, which never runs
 * effects — so every assertion it makes about this surface is made while all five
 * readiness cards still show "Clearing and resolving this account…". Neither the
 * populated state nor the failed-read state was exercised anywhere.
 *
 * That gap is not theoretical: it is exactly how a resolver failure came to
 * render five confident sentences of the form "No X record has been read for this
 * account yet" — statements about the ACCOUNT, made when nothing about the
 * account had been learned — with no error and no retry on the default view.
 * `COMMS_READINESS_FORBIDDEN` is raised for any authenticated caller who is not
 * admin / coach / platform-operator, so a sales_rep or an ungranted team member
 * saw that on every load.
 *
 * These mount for real and let the effects run.
 */

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

/**
 * Mocked PER RPC NAME, not globally.
 *
 * A single shared mock fed `tenant_comms_readiness`'s error to
 * `resolve_tenant_domain_identity` as well, and the identity card renders
 * `error.message` verbatim — so the suite reported a leak that only the mock
 * created. Keying on the function name keeps each hook's failure its own.
 */
const rpcState = vi.hoisted(() => ({
  readiness: { data: null as unknown, error: null as { message: string } | null },
}));

vi.mock("@/hooks/useUserRoles", () => ({
  // The predicate the SERVER gates on (platform owner OR global admin/coach). Mocked
  // rather than left to the real hook, which opens its own auth subscription.
  useUserRoles: () => ({ loading: false, userId: "u1", roles: ["admin"], isAdmin: true, isCoach: false, isClient: false, isBroker: false, isStaff: true }),
}));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    rpc: vi.fn(async (fn: string) =>
      fn === "tenant_comms_readiness" ? rpcState.readiness : { data: null, error: null }),
  },
}));
vi.mock("@/hooks/useTenantContext", () => ({
  useTenantContext: () => ({
    activeTenantId: "tenant-1971670",
    loading: false,
    activeTenant: { account_number: "1971670" },
  }),
}));
vi.mock("@/lib/routing/useSubtabRoute", () => ({ useSubtabRoute: () => ["connections", vi.fn()] }));
vi.mock("./data/useSoloBusiness", () => ({
  useSoloBusiness: () => ({ name: "First Sterling Capital", brand: { website: null, business_phone: null, industry: null }, loading: false, error: null, refresh: vi.fn() }),
}));
vi.mock("./data/useSoloOwner", () => ({
  useSoloOwner: () => ({ owner: { name: "Antonio Cook", email: null, phone: null, website: null }, loading: false, error: null, refresh: vi.fn() }),
}));
vi.mock("./data/useSoloComms", () => ({
  useSoloComms: () => ({ business: { name: "", website: "", phone: "" }, mailbox: { connected: false, address: null, displayName: null, provider: null, status: null }, canManage: true, saveBusiness: vi.fn(async () => ({ ok: true, error: null })), addDomain: vi.fn(async () => ({ ok: true, error: null })), refreshDomain: vi.fn(async () => ({ ok: true, error: null })), setDefaultDomain: vi.fn(async () => ({ ok: true, error: null })), removeDomain: vi.fn(async () => ({ ok: true, error: null })), startGmailConnect: vi.fn(async () => ({ url: null, error: null })), disconnectGmail: vi.fn(async () => ({ ok: true, error: null })), domains: [], billing: null, loading: false, error: null, refresh: vi.fn() }),
}));

const READY = {
  tenant_id: "tenant-1971670",
  can_send_sms: false,
  blocked_reason: "registration_absent",
  subaccount: "connected",
  number: "assigned",
  number_e164: "+15550001111",
  business: { has_name: true, has_website: true, has_phone: true },
  a2p: "absent",
  consent: { granted_count: 2, suppressed_count: 0, state: "ready" },
  delivery: { state: "delivering", sent_30d: 5, delivered_30d: 4, failed_30d: 1, last_inbound_at: null },
  billing: { subscription: "active", plan_name: "Solo", period_end: null, cancel_at_period_end: false, usage_metering: "not_recording", metered_events_30d: 0 },
};

async function mountConnections() {
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  await act(async () => {
    root.render(
      <MemoryRouter initialEntries={["/solo/1971670/settings/connections"]}>
        <Routes><Route path="/solo/:account/settings/:tab" element={<SoloSettings />} /></Routes>
      </MemoryRouter>,
    );
  });
  return { host, cleanup: async () => { await act(async () => root.unmount()); host.remove(); } };
}

describe("Connections renders its real states", () => {
  beforeEach(() => { rpcState.readiness = { data: null, error: null }; });

  it("says the READ failed — it does not report an empty account", async () => {
    rpcState.readiness = { data: null, error: { message: "COMMS_READINESS_FORBIDDEN" } };
    const { host, cleanup } = await mountConnections();
    const text = host.textContent ?? "";

    expect(text).toContain("We couldn’t read this account’s setup");
    expect(Array.from(host.querySelectorAll("button")).some((b) => b.textContent === "Try again")).toBe(true);

    // The failure must never be dressed up as a fact about the account.
    for (const kind of ["number", "registration", "consent", "delivery", "billing"]) {
      expect(text).not.toContain(`No ${kind} record has been read for this account yet.`);
    }
    // And the raw resolver diagnostic never reaches the tenant.
    expect(text).not.toContain("COMMS_READINESS");
    await cleanup();
  });

  it("reports the account when the read SUCCEEDS (non-vacuity for the case above)", async () => {
    rpcState.readiness = { data: READY, error: null };
    const { host, cleanup } = await mountConnections();
    const text = host.textContent ?? "";

    // Without this the failure assertions could pass on a surface that renders
    // nothing at all in either state.
    expect(text).toContain("+15550001111");
    expect(text).toContain("4 of 5 delivered");
    expect(text).not.toContain("We couldn’t read this account’s setup");
    expect(text).not.toContain("Clearing and resolving this account");

    // The live registration handoff and the replies disclosure both survive.
    expect(text).toContain("Carrier filing and returned status are managed in Registration");
    expect(text).toContain("Whether replies are arriving is not reported");
    await cleanup();
  });

  it("shows a step the same number in the card AND in the ladder", async () => {
    rpcState.readiness = { data: READY, error: null };
    const { host, cleanup } = await mountConnections();
    const numbersFor = (name: string) =>
      Array.from(host.querySelectorAll(".ss-step"))
        .filter((el) => el.querySelector(".ss-step-name strong")?.textContent === name)
        .map((el) => el.querySelector(".ss-step-idx")?.textContent);

    // The card's lone step, on the default view.
    const inCard = numbersFor("Business details");
    expect(inCard).toEqual(["2"]);

    // Now the LADDER, which lives on the other view. An earlier version of this
    // test never switched, so the ladder was never in the DOM and the whole
    // component could be deleted with the test still green — it asserted a
    // cross-rendering agreement while only ever seeing one rendering.
    const health = Array.from(host.querySelectorAll('button[role="tab"]'))
      .find((b) => b.textContent === "Health") as HTMLButtonElement | undefined;
    expect(health).toBeTruthy();
    await act(async () => { health!.click(); });

    const inLadder = numbersFor("Business details");
    expect(inLadder).toEqual(["2"]);
    // The ladder really is rendered now, not an empty list agreeing by default.
    expect(host.querySelectorAll(".ss-step").length).toBeGreaterThan(4);
    await cleanup();
  });

  it("stops the CARD claiming replies are unrecorded once the resolver reports them", async () => {
    // The step's detail was made conditional and the note beside it was left
    // absolute, so the card would have gone silent in one sentence and still
    // asserted "nothing on this account records them" in the next — the same
    // one-record-two-answers the conditional was added to remove.
    rpcState.readiness = { data: { ...READY, delivery: { ...READY.delivery, inbound_reporting: "available" } }, error: null };
    const { host, cleanup } = await mountConnections();
    const text = host.textContent ?? "";
    expect(text).not.toContain("Replies and webhook health are");
    expect(text).not.toContain("Whether replies are arriving is not reported");
    // Webhook health genuinely has no record either way, so it must still say so.
    expect(text).toContain("Webhook health is");
    await cleanup();
  });

  it("DOES say replies are unrecorded while the resolver says so (non-vacuity)", async () => {
    rpcState.readiness = { data: READY, error: null };   // inbound_reporting absent = unavailable
    const { host, cleanup } = await mountConnections();
    expect(host.textContent ?? "").toContain("Replies and webhook health are");
    await cleanup();
  });

  it("does not claim texting is not ready when the read itself failed", async () => {
    // The Health card headlined "Texting is not ready yet" over the failed-read
    // block — a definite claim about the account, one line above a sentence
    // saying nothing is being claimed about it.
    rpcState.readiness = { data: null, error: { message: "COMMS_READINESS_FORBIDDEN" } };
    const { host, cleanup } = await mountConnections();
    const health = Array.from(host.querySelectorAll('button[role="tab"]'))
      .find((b) => b.textContent === "Health") as HTMLButtonElement | undefined;
    await act(async () => { health!.click(); });

    const text = host.textContent ?? "";
    expect(text).toContain("We couldn\u2019t read this account\u2019s setup");
    expect(text).not.toContain("Texting is not ready yet");
    expect(text).not.toContain("Ready to text");
    await cleanup();
  });

  it("DOES say texting is not ready when the read succeeded and it is not (non-vacuity)", async () => {
    rpcState.readiness = { data: READY, error: null };
    const { host, cleanup } = await mountConnections();
    const health = Array.from(host.querySelectorAll('button[role="tab"]'))
      .find((b) => b.textContent === "Health") as HTMLButtonElement | undefined;
    await act(async () => { health!.click(); });
    // READY has `can_send_sms: false`, so the claim is true here and must appear.
    expect(host.textContent ?? "").toContain("Texting is not ready yet");
    await cleanup();
  });
});

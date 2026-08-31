import { act } from "react";
import { createRoot } from "react-dom/client";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { SoloSettings } from "./settings";
import { domainOutcomeFor, isSendableDomain, readDnsRecords } from "./domainActions";

/**
 * SENDING DOMAINS — the four verbs that shipped and were never reachable.
 *
 * `manage-tenant-domain` has carried add / refresh / set_default / remove since
 * it was written. The adapter in front of it declared every write "a separate
 * slice" and this card rendered a read-only list, so a tenant could see that
 * they had no verified sending domain and had no way to do anything about it.
 * The deferral was a decision an earlier session made, not a missing contract.
 *
 * These prove the human can finish: add, learn what to publish, verify, promote,
 * and remove — plus what happens when each of those is refused.
 */

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const state = vi.hoisted(() => ({
  calls: [] as { verb: string; body: Record<string, unknown> }[],
  /** Keyed by verb so one test can fail exactly one of them. */
  results: {} as Record<string, { data?: unknown; error?: unknown }>,
  domains: [] as Record<string, unknown>[],
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    rpc: vi.fn(async (fn: string) => {
      if (fn === "is_platform_owner") return { data: true, error: null };
      if (fn === "is_current_user_tenant_admin") return { data: true, error: null };
      return { data: null, error: null };
    }),
    auth: {
      getUser: vi.fn(async () => ({ data: { user: { id: "u1" } }, error: null })),
      onAuthStateChange: vi.fn(() => ({ data: { subscription: { unsubscribe: vi.fn() } } })),
    },
    // `.eq()` has to be BOTH awaitable and chainable: the adapter awaits it for
    // the plans list and calls `.maybeSingle()` on it for the brand row. A double
    // that only did one made the whole Promise.all reject, so the card rendered a
    // read error and every domain assertion failed for a reason that was mine.
    from: vi.fn(() => ({
      select: () => ({
        eq: () => ({
          then: (res: (v: unknown) => unknown) => res({ data: [], error: null }),
          maybeSingle: async () => ({ data: { brand: {} }, error: null }),
        }),
      }),
    })),
    functions: {
      invoke: vi.fn(async (name: string, opts: { body?: Record<string, unknown> }) => {
        const verb = String(opts?.body?.verb ?? "");
        if (name !== "manage-tenant-domain") return { data: null, error: null };
        state.calls.push({ verb, body: opts?.body ?? {} });
        if (verb === "list") return { data: { domains: state.domains }, error: null };
        const hit = state.results[verb];
        if (hit) return { data: hit.data ?? null, error: hit.error ?? null };
        return { data: { ok: true }, error: null };
      }),
    },
  },
}));
vi.mock("@/hooks/useUserRoles", () => ({
  useUserRoles: () => ({ loading: false, userId: "u1", roles: ["admin"], isAdmin: true,
    isCoach: false, isClient: false, isBroker: false, isStaff: true }),
}));
vi.mock("@/hooks/useTenantContext", () => ({
  useTenantContext: () => ({ activeTenantId: "tenant-a", loading: false, activeTenant: { account_number: "1971670" } }),
}));
vi.mock("@/lib/routing/useSubtabRoute", () => ({ useSubtabRoute: () => ["connections", vi.fn()] }));
vi.mock("./data/useSoloBusiness", () => ({
  useSoloBusiness: () => ({ name: "B", brand: { website: null, business_phone: null, industry: null }, loading: false, error: null, refresh: vi.fn() }),
}));
vi.mock("./data/useSoloOwner", () => ({
  useSoloOwner: () => ({ owner: { name: "A", email: null, phone: null, website: null }, loading: false, error: null, refresh: vi.fn() }),
}));

async function mount() {
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  await act(async () => {
    root.render(
      <MemoryRouter initialEntries={["/solo/1971670/settings/connections"]}>
        <Routes><Route path="/solo/:account/settings/:tab" element={<SoloSettings />} /></Routes>
      </MemoryRouter>);
  });
  return { host, cleanup: async () => { await act(async () => root.unmount()); host.remove(); } };
}
const btn = (h: HTMLElement, label: string) =>
  Array.from(h.querySelectorAll("button")).find((b) => (b.textContent ?? "").trim() === label) as HTMLButtonElement | undefined;
const click = async (el: HTMLElement) => { await act(async () => { el.click(); }); };
const type = async (el: HTMLInputElement, v: string) => {
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(el, v);
    el.dispatchEvent(new Event("input", { bubbles: true }));
  });
};

beforeEach(() => { state.calls = []; state.results = {}; state.domains = []; });

const VERIFIED = { id: "d1", domain: "acme.com", from_email_local: "no-reply", from_name: "Acme",
  status: "verified", is_default: true, dns_records: [] };
const PENDING = { id: "d2", domain: "second.com", from_email_local: "hello", from_name: "Second",
  status: "pending", is_default: false,
  dns_records: [{ record: "TXT", name: "_dmarc.second.com", value: "v=DMARC1; p=none" }] };

describe("A tenant can add a sending domain and finish the job", () => {
  it("offers a control to add one at all", async () => {
    const { host, cleanup } = await mount();
    expect(btn(host, "Add a sending domain")).toBeTruthy();
    await cleanup();
  });

  it("sends the domain to the released verb and re-reads the list", async () => {
    const { host, cleanup } = await mount();
    await click(btn(host, "Add a sending domain")!);
    await type(host.querySelector("#ss-dom") as HTMLInputElement, "acme.com");
    // The record really does change once it is added.
    state.results.add = { data: { domain: VERIFIED } };
    state.domains = [VERIFIED];
    await click(btn(host, "Add domain")!);

    const add = state.calls.find((c) => c.verb === "add");
    expect(add).toBeTruthy();
    expect(add!.body.domain).toBe("acme.com");
    // Never names a tenant: the function derives it and rejects a body value.
    expect(Object.keys(add!.body)).not.toContain("tenant_id");
    // Re-read, not a locally patched row.
    expect(state.calls.filter((c) => c.verb === "list").length).toBeGreaterThan(1);
    expect(host.textContent).toContain("acme.com");
    await cleanup();
  });

  it("will not submit something that is not a domain, and says why", async () => {
    const { host, cleanup } = await mount();
    await click(btn(host, "Add a sending domain")!);
    await type(host.querySelector("#ss-dom") as HTMLInputElement, "https://acme.com/mail");
    expect(btn(host, "Add domain")!.disabled).toBe(true);
    expect(host.textContent).toContain("not a web address");
    // And nothing was sent.
    expect(state.calls.some((c) => c.verb === "add")).toBe(false);
    await cleanup();
  });

  it("shows the DNS records the tenant has to publish", async () => {
    // Without these the person is stuck at "pending" with nothing to act on —
    // the same dead end as having no control at all.
    state.domains = [PENDING];
    const { host, cleanup } = await mount();
    await click(btn(host, "Show DNS records")!);
    const text = host.textContent ?? "";
    expect(text).toContain("_dmarc.second.com");
    expect(text).toContain("v=DMARC1; p=none");
    expect(text).toContain("TXT");
    await cleanup();
  });

  it("re-checks verification and promotes a domain to default", async () => {
    state.domains = [VERIFIED, PENDING];
    const { host, cleanup } = await mount();
    await click(btn(host, "Check verification")!);
    expect(state.calls.find((c) => c.verb === "refresh")?.body.id).toBe("d2");
    await click(btn(host, "Make default")!);
    expect(state.calls.find((c) => c.verb === "set_default")?.body.id).toBe("d2");
    await cleanup();
  });

  it("does not offer verification or promotion where they make no sense", async () => {
    // A verified default has nothing to check and nothing to promote to.
    state.domains = [VERIFIED];
    const { host, cleanup } = await mount();
    expect(btn(host, "Check verification")).toBeUndefined();
    expect(btn(host, "Make default")).toBeUndefined();
    await cleanup();
  });
});

describe("Removing is destructive and asks first", () => {
  it("does not delete on the first click", async () => {
    state.domains = [VERIFIED];
    const { host, cleanup } = await mount();
    await click(btn(host, "Remove")!);
    expect(state.calls.some((c) => c.verb === "remove")).toBe(false);
    const text = host.textContent ?? "";
    expect(text).toContain("Remove acme.com?");
    // It must say the consequence, not just ask.
    expect(text).toContain("deletes it from your email provider");
    expect(text).toContain("cannot be undone");
    await cleanup();
  });

  it("backs out cleanly, and deletes only on the explicit confirm", async () => {
    state.domains = [VERIFIED];
    const { host, cleanup } = await mount();
    await click(btn(host, "Remove")!);
    await click(btn(host, "Keep it")!);
    expect(state.calls.some((c) => c.verb === "remove")).toBe(false);

    await click(btn(host, "Remove")!);
    await click(btn(host, "Remove it")!);
    expect(state.calls.find((c) => c.verb === "remove")?.body.id).toBe("d1");
    await cleanup();
  });
});

describe("When a write is refused", () => {
  it("never puts the email provider's own error on the tenant's screen", async () => {
    state.results.add = {
      error: Object.assign(new Error("Edge Function returned a non-2xx status code"), {
        context: new Response(JSON.stringify({ error: "resend_422: {\"message\":\"Domain already registered to account acct_9f2\"}" }),
          { status: 502, headers: { "content-type": "application/json" } }),
      }),
    };
    const { host, cleanup } = await mount();
    await click(btn(host, "Add a sending domain")!);
    await type(host.querySelector("#ss-dom") as HTMLInputElement, "acme.com");
    await click(btn(host, "Add domain")!);

    const text = host.textContent ?? "";
    expect(text).toContain("The email provider refused that");
    expect(text).toContain("Nothing was changed on your account");
    // The provider payload and any account identifier inside it stay out.
    expect(text).not.toContain("acct_9f2");
    expect(text).not.toContain("resend_422");
    expect(text).not.toContain("non-2xx");
    await cleanup();
  });

  it("names a permission refusal and who can act", async () => {
    state.results.remove = {
      error: Object.assign(new Error("x"), {
        context: new Response(JSON.stringify({ error: "forbidden" }), { status: 403 }),
      }),
    };
    state.domains = [VERIFIED];
    const { host, cleanup } = await mount();
    await click(btn(host, "Remove")!);
    await click(btn(host, "Remove it")!);
    const text = host.textContent ?? "";
    expect(text).toContain("You do not have permission to change sending domains");
    expect(text).toContain("An owner on this account can do it");
    await cleanup();
  });

  it("treats a 200 that carries an error as a refusal, not a success", async () => {
    state.results.set_default = { data: { error: "not_found" } };
    state.domains = [VERIFIED, PENDING];
    const { host, cleanup } = await mount();
    await click(btn(host, "Make default")!);
    expect(host.textContent).toContain("That domain is no longer on this account");
    await cleanup();
  });
});

describe("The domain vocabulary itself", () => {
  it("collapses every provider passthrough shape rather than quoting it", () => {
    for (const raw of ["resend_422: {\"x\":1}", "resend_500", "RESEND_API_KEY missing"]) {
      expect(domainOutcomeFor(raw).code).toBe("provider_error");
    }
  });

  it("keeps an unknown code's identity instead of inventing a reason", () => {
    expect(domainOutcomeFor("some_new_code").code).toBe("some_new_code");
    expect(domainOutcomeFor("some_new_code").title).toBe("That didn’t go through");
    expect(domainOutcomeFor(null).code).toBe("unknown");
  });

  it("accepts a bare domain and rejects what people actually paste", () => {
    expect(isSendableDomain("acme.com")).toBe(true);
    expect(isSendableDomain("mail.acme.co.uk")).toBe(true);
    for (const bad of ["https://acme.com", "me@acme.com", "acme", "acme .com", ""]) {
      expect(isSendableDomain(bad)).toBe(false);
    }
  });

  it("drops a DNS row that could not be published rather than rendering a blank", () => {
    expect(readDnsRecords([
      { record: "TXT", name: "a", value: "v" },
      { type: "MX", name: "b", data: "w" },
      { record: "TXT", name: "c" },          // no value — unpublishable
      "nonsense",
    ])).toEqual([{ type: "TXT", name: "a", value: "v" }, { type: "MX", name: "b", value: "w" }]);
    expect(readDnsRecords(null)).toEqual([]);
  });
});

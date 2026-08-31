import { act } from "react";
import { createRoot } from "react-dom/client";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { SoloSettings } from "./settings";
import { KNOWN_REFUSAL_CODES, preparePermission, refusalFor } from "./a2pPrepare";

/**
 * PREPARING A REGISTRATION — the flow, not the file.
 *
 * The Communications surface already reported this account's setup accurately and
 * offered nothing to do about it. Its own card said a registration "can be
 * prepared and saved here" while carrying no control that could prepare one — the
 * only caller of the drafting seam was a legacy admin tab that a flag-enabled
 * Solo tenant is redirected away from. So the sentence was true of the product
 * and false of the screen it was printed on.
 *
 * These cover the actor reaching the goal, and every way the attempt can end:
 * first use, an existing draft, no authority, each refusal the server can return,
 * abandoning with unsaved edits, and switching accounts mid-flow.
 */

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const state = vi.hoisted(() => ({
  readiness: { data: null as unknown, error: null as { message: string } | null },
  platformOwner: false as boolean,
  roles: { loading: false, isStaff: true },
  tenantId: "tenant-a" as string,
  /** Every comms-a2p-draft call this mount made, so a test can prove one did NOT happen. */
  invocations: [] as { name: string; body: unknown }[],
  invokeResult: { data: null as unknown, error: null as unknown },
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    rpc: vi.fn(async (fn: string) => {
      if (fn === "tenant_comms_readiness") return state.readiness;
      if (fn === "is_platform_owner") return { data: state.platformOwner, error: null };
      return { data: null, error: null };
    }),
    // `usePlatformOwner` re-asks on an auth change, the way useUserRoles does, so
    // the operator flag cannot go stale beside fresh roles. The double has to
    // carry it or the hook throws on mount.
    auth: {
      onAuthStateChange: (_cb: unknown) => ({ data: { subscription: { unsubscribe: () => {} } } }),
    },
    functions: {
      invoke: vi.fn(async (name: string, opts: { body?: unknown }) => {
        state.invocations.push({ name, body: opts?.body });
        // A successful save really does change the record — the RPC writes the
        // row and `tenant_comms_readiness` then reports `prepared`. Advancing the
        // fixture here is what makes the assertion below a proof that the surface
        // RE-READS, rather than one it could pass by optimistically painting
        // success over a record that never moved.
        const res = state.invokeResult as { data?: { saved?: boolean } | null };
        if (res?.data?.saved && state.readiness.data) {
          state.readiness = {
            data: { ...(state.readiness.data as Record<string, unknown>), a2p: "prepared" },
            error: null,
          };
        }
        return state.invokeResult;
      }),
    },
  },
}));
vi.mock("@/hooks/useUserRoles", () => ({
  useUserRoles: () => ({
    loading: state.roles.loading, userId: "u1", roles: state.roles.isStaff ? ["admin"] : ["sales_rep"],
    isAdmin: state.roles.isStaff, isCoach: false, isClient: false, isBroker: false, isStaff: state.roles.isStaff,
  }),
}));
vi.mock("@/hooks/useTenantContext", () => ({
  useTenantContext: () => ({ activeTenantId: state.tenantId, loading: false, activeTenant: { account_number: "1971670" } }),
}));
vi.mock("@/lib/routing/useSubtabRoute", () => ({ useSubtabRoute: () => ["connections", vi.fn()] }));
vi.mock("./data/useSoloBusiness", () => ({
  useSoloBusiness: () => ({ name: "First Sterling Capital", brand: { website: null, business_phone: null, industry: null }, loading: false, error: null, refresh: vi.fn() }),
}));
vi.mock("./data/useSoloOwner", () => ({
  useSoloOwner: () => ({ owner: { name: "A. Cook", email: null, phone: null, website: null }, loading: false, error: null, refresh: vi.fn() }),
}));
vi.mock("./data/useSoloComms", () => ({
  useSoloComms: () => ({ domains: [], billing: null, loading: false, error: null, refresh: vi.fn() }),
}));

const READINESS = (over: Record<string, unknown> = {}) => ({
  tenant_id: state.tenantId,
  can_send_sms: false, blocked_reason: "registration_absent",
  subaccount: "connected", number: "assigned", number_e164: "+15550001111",
  business: { has_name: true, has_website: true, has_phone: true },
  a2p: "absent",
  consent: { granted_count: 0, suppressed_count: 0, state: "none_recorded" },
  delivery: { state: "no_activity", sent_30d: 0, delivered_30d: 0, failed_30d: 0, last_inbound_at: null },
  billing: { subscription: "active", plan_name: "Solo", period_end: null, cancel_at_period_end: false, usage_metering: "not_recording", metered_events_30d: 0 },
  ...over,
});

async function mount() {
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
  // `rerender` renders the SAME root again. The account-switch test needs it:
  // unmounting and mounting fresh proves nothing, because a fresh mount has no
  // dialog and no text no matter what the component does with `activeTenantId`.
  const rerender = async () => {
    await act(async () => {
      root.render(
        <MemoryRouter initialEntries={["/solo/1971670/settings/connections"]}>
          <Routes><Route path="/solo/:account/settings/:tab" element={<SoloSettings />} /></Routes>
        </MemoryRouter>,
      );
    });
  };
  return { host, rerender, cleanup: async () => { await act(async () => root.unmount()); host.remove(); } };
}

const btn = (host: HTMLElement, label: string) =>
  Array.from(host.querySelectorAll("button")).find((b) => (b.textContent ?? "").trim() === label) as HTMLButtonElement | undefined;
const click = async (el: HTMLElement) => { await act(async () => { el.click(); }); };
const type = async (el: HTMLTextAreaElement | HTMLInputElement, v: string) => {
  await act(async () => {
    const setter = Object.getOwnPropertyDescriptor(
      el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype, "value")!.set!;
    setter.call(el, v);
    el.dispatchEvent(new Event("input", { bubbles: true }));
  });
};

beforeEach(() => {
  state.readiness = { data: READINESS(), error: null };
  state.platformOwner = false;
  state.roles = { loading: false, isStaff: true };
  state.tenantId = "tenant-a";
  state.invocations = [];
  state.invokeResult = { data: { draft: { use_case: "Client follow-ups" }, saved: true }, error: null };
});

describe("An owner can actually prepare a registration from this surface", () => {
  it("offers the control the card's own copy promises", async () => {
    const { host, cleanup } = await mount();
    // The failing-first assertion: the card said a registration "can be prepared
    // and saved here" and there was no control on the surface that could do it.
    expect(btn(host, "Prepare registration")).toBeTruthy();
    await cleanup();
  });

  it("sends what the tenant described to the drafting seam, and reports the save", async () => {
    const { host, cleanup } = await mount();
    await click(btn(host, "Prepare registration")!);

    const dialog = host.querySelector('[role="dialog"]') as HTMLElement | null;
    expect(dialog).toBeTruthy();
    const hint = dialog!.querySelector("textarea") as HTMLTextAreaElement;
    await type(hint, "Appointment reminders and follow-ups for my clients");
    await click(btn(host, "Save draft")!);

    expect(state.invocations).toHaveLength(1);
    expect(state.invocations[0].name).toBe("comms-a2p-draft");
    expect((state.invocations[0].body as { use_case_hint: string }).use_case_hint)
      .toBe("Appointment reminders and follow-ups for my clients");

    // Saved, and said to stop exactly where the product stops.
    const text = host.textContent ?? "";
    expect(text).toContain("Prepared, not submitted");
    // It must never imply a filing happened.
    expect(text).not.toMatch(/submitted to carriers|filed with carriers/i);
    await cleanup();
  });

  it("never names a tenant in the request body — the server derives it", async () => {
    const { host, cleanup } = await mount();
    await click(btn(host, "Prepare registration")!);
    await type(host.querySelector('[role="dialog"] textarea') as HTMLTextAreaElement, "Client follow-ups");
    await click(btn(host, "Save draft")!);
    expect(Object.keys(state.invocations[0].body as object)).not.toContain("tenant_id");
    await cleanup();
  });
});

describe("Every unavailable action explains itself", () => {
  it("names submission as unbuilt rather than offering it", async () => {
    const { host, cleanup } = await mount();
    const submit = btn(host, "Submit to carriers");
    expect(submit).toBeTruthy();
    expect(submit!.disabled).toBe(true);
    expect(host.textContent).toContain("Filing with carriers is not built yet");
    await cleanup();
  });

  it("explains why finding a number is not offered, and who can do it", async () => {
    const { host, cleanup } = await mount();
    const text = host.textContent ?? "";
    expect(text).toContain("spends money, which this screen has no authority to do");
    expect(text).toContain("An owner with provider access arranges it");
    await cleanup();
  });
});

describe("Staff without authority", () => {
  it("says they can see it but not change it, and how to proceed", async () => {
    state.roles = { loading: false, isStaff: false };
    const { host, cleanup } = await mount();
    const prepare = btn(host, "Prepare registration");
    expect(prepare?.disabled).toBe(true);
    expect(host.textContent).toContain("You can see this, but not change it");
    expect(host.textContent).toContain("An owner on this account can prepare it");
    await cleanup();
  });

  it("does not deny a platform operator who holds no tenant role", async () => {
    // The server gates on is_platform_owner() OR admin/coach. Mirroring only the
    // roles half would tell an operator they lack access the server would grant.
    state.roles = { loading: false, isStaff: false };
    state.platformOwner = true;
    const { host, cleanup } = await mount();
    expect(btn(host, "Prepare registration")?.disabled).toBe(false);
    expect(host.textContent).not.toContain("You can see this, but not change it");
    await cleanup();
  });

  it("claims nothing about permission while it is still loading", async () => {
    state.roles = { loading: true, isStaff: false };
    const { host, cleanup } = await mount();
    // Neither a denial nor an enabled control: a flash of "you may not" at an
    // owner on every visit is a claim we have not earned yet.
    expect(host.textContent).not.toContain("You can see this, but not change it");
    expect(btn(host, "Prepare registration")?.disabled).toBe(true);
    await cleanup();
  });
});

describe("When the save is refused", () => {
  it("names the missing business record and where to fix it — not a raw server message", async () => {
    state.invokeResult = {
      data: null,
      error: { message: "Edge Function returned a non-2xx status code",
        context: { body: JSON.stringify({ error: { code: "LEGAL_PROFILE_REQUIRED", message: "internal detail" } }) } },
    };
    const { host, cleanup } = await mount();
    await click(btn(host, "Prepare registration")!);
    await type(host.querySelector('[role="dialog"] textarea') as HTMLTextAreaElement, "Client follow-ups");
    await click(btn(host, "Save draft")!);

    const text = host.textContent ?? "";
    expect(text).toContain("Your legal business name is needed first");
    expect(text).toContain("Add it to your business profile");
    expect(text).not.toContain("internal detail");
    expect(text).not.toContain("non-2xx");
    // And it must not claim the registration is prepared.
    expect(text).not.toContain("Prepared, not submitted");
    await cleanup();
  });

  it("treats an unconfigured drafting model as ours, not as a fact about the account", async () => {
    state.invokeResult = { data: { needs_config: true, error: "model_not_configured" }, error: null };
    const { host, cleanup } = await mount();
    await click(btn(host, "Prepare registration")!);
    await type(host.querySelector('[role="dialog"] textarea') as HTMLTextAreaElement, "Client follow-ups");
    await click(btn(host, "Save draft")!);

    const text = host.textContent ?? "";
    expect(text).toContain("Drafting is not available right now");
    expect(text).toContain("not something about your account");
    // A 200 that carries needs_config is NOT a save.
    expect(text).not.toContain("Prepared, not submitted");
    await cleanup();
  });

  it("reads the refusal off the REAL client error shape, not a convenient one", async () => {
    // supabase-js throws `new FunctionsHttpError(response)` — `context` IS the
    // Response, and the documented read is `await error.context.json()`. The
    // other refusal tests here hand over a plain `{ body: "..." }`, which is the
    // fallback arm; if only that arm worked, every real refusal would render as
    // the generic unknown copy and the whole recovery layer would be decorative
    // while its tests stayed green. So this one uses the actual shape.
    state.invokeResult = {
      data: null,
      error: Object.assign(new Error("Edge Function returned a non-2xx status code"), {
        name: "FunctionsHttpError",
        context: new Response(JSON.stringify({ error: { code: "REGISTRATION_IMMUTABLE", message: "raw" } }),
          { status: 422, headers: { "content-type": "application/json" } }),
      }),
    };
    const { host, cleanup } = await mount();
    await click(btn(host, "Prepare registration")!);
    await type(host.querySelector('[role="dialog"] textarea') as HTMLTextAreaElement, "Client follow-ups");
    await click(btn(host, "Save draft")!);

    const text = host.textContent ?? "";
    expect(text).toContain("This registration can no longer be edited");
    expect(text).toContain("Nothing was overwritten");
    expect(text).not.toContain("non-2xx");
    expect(text).not.toContain("raw");
    await cleanup();
  });

  it("keeps what the tenant wrote so a retry does not start from nothing", async () => {
    state.invokeResult = {
      data: null,
      error: { message: "x", context: { body: JSON.stringify({ error: { code: "UNKNOWN_NEW_CODE" } }) } },
    };
    const { host, cleanup } = await mount();
    await click(btn(host, "Prepare registration")!);
    await type(host.querySelector('[role="dialog"] textarea') as HTMLTextAreaElement, "Onboarding nudges");
    await click(btn(host, "Save draft")!);

    const ta = host.querySelector('[role="dialog"] textarea') as HTMLTextAreaElement | null;
    expect(ta).toBeTruthy();
    expect(ta!.value).toBe("Onboarding nudges");
    // An unmapped code still refuses honestly rather than reading as success.
    expect(host.textContent).toContain("The registration was not saved");
    await cleanup();
  });
});

describe("Abandonment and account switching", () => {
  it("does not silently discard unsaved edits", async () => {
    const { host, cleanup } = await mount();
    await click(btn(host, "Prepare registration")!);
    await type(host.querySelector('[role="dialog"] textarea') as HTMLTextAreaElement, "half a thought");
    await click(btn(host, "Cancel")!);

    // Still open, now asking. The dialog must not vanish taking the text with it.
    expect(host.querySelector('[role="dialog"]')).toBeTruthy();
    expect(host.textContent).toContain("Discard your unsaved changes");
    await cleanup();
  });

  it("closes without asking when nothing was typed", async () => {
    const { host, cleanup } = await mount();
    await click(btn(host, "Prepare registration")!);
    await click(btn(host, "Cancel")!);
    expect(host.querySelector('[role="dialog"]')).toBeNull();
    await cleanup();
  });

  it("never carries a draft, a refusal, or an open dialog into another account", async () => {
    /**
     * NON-VACUITY, and this test had none. It used to unmount and mount FRESH,
     * then assert the fresh mount had no dialog — which is true of any component
     * ever written. Measured: deleting the reset effect it claims to pin
     * (`useEffect(..., [activeTenantId])` in ConnectionsView) left it passing,
     * 18/18. It now re-renders the SAME root, which is the only way the effect
     * is exercised at all, and fails with that effect removed.
     */
    const { host, rerender, cleanup } = await mount();
    await click(btn(host, "Prepare registration")!);
    await type(host.querySelector('[role="dialog"] textarea') as HTMLTextAreaElement, "tenant A's words");
    expect(host.querySelector('[role="dialog"]')).toBeTruthy();

    // The account changes under the LIVE surface.
    state.tenantId = "tenant-b";
    state.readiness = { data: READINESS({ tenant_id: "tenant-b" }), error: null };
    await rerender();

    expect(host.querySelector('[role="dialog"]')).toBeNull();
    expect(host.textContent).not.toContain("tenant A's words");
    await cleanup();
  });

  it("still asks before discarding when the save was REFUSED — the path with the most typing behind it", async () => {
    /**
     * The guard held before a save and silently vanished after a refused one:
     * the attempted hint was written back into the parent's state, returned as
     * `initialHint`, and the drawer's own reset effect then made `dirty` false.
     * Cancel destroyed the text with no prompt. Measured, exactly here.
     */
    state.invokeResult = { data: null, error: { message: "Edge Function returned a non-2xx status code" } };
    const { host, cleanup } = await mount();
    await click(btn(host, "Prepare registration")!);
    await type(host.querySelector('[role="dialog"] textarea') as HTMLTextAreaElement, "a long brief I do not want to lose");
    await click(btn(host, "Save draft")!);

    // The refusal kept the text — that part already worked.
    expect((host.querySelector('[role="dialog"] textarea') as HTMLTextAreaElement).value)
      .toContain("a long brief I do not want to lose");

    await click(btn(host, "Cancel")!);
    expect(host.querySelector('[role="dialog"]')).toBeTruthy();
    expect(host.textContent).toContain("Discard");
    await cleanup();
  });
});

describe("The refusal vocabulary itself", () => {
  it("covers every code comms-a2p-draft can return, with a reason and a stated recovery", () => {
    // The function's own fail() codes plus every key of SAVE_REFUSAL_STATUS.
    for (const code of ["LEGAL_PROFILE_REQUIRED", "REGISTRATION_IMMUTABLE", "FORBIDDEN", "NO_TENANT",
      "UNAUTHENTICATED", "USE_CASE_REQUIRED", "SAMPLES_REQUIRED", "SAMPLES_INVALID"]) {
      expect(KNOWN_REFUSAL_CODES).toContain(code);
      const r = refusalFor(code);
      expect(r.body.length).toBeGreaterThan(20);
      // `recovery` may be null, but only deliberately — REGISTRATION_IMMUTABLE is
      // the one case where nothing the tenant does changes the answer.
      if (code !== "REGISTRATION_IMMUTABLE") expect(r.recovery).toBeTruthy();
    }
  });

  it("keeps an unknown code's identity instead of inventing a reason for it", () => {
    const r = refusalFor("SOMETHING_NEW");
    expect(r.code).toBe("SOMETHING_NEW");
    expect(r.title).toBe("The registration was not saved");
  });

  it("is pending — never denied — until the operator check comes back", () => {
    expect(preparePermission({ loading: false, isStaff: false, isPlatformOwner: null }).state).toBe("pending");
    expect(preparePermission({ loading: false, isStaff: false, isPlatformOwner: false }).state).toBe("denied");
    expect(preparePermission({ loading: false, isStaff: true, isPlatformOwner: null }).state).toBe("allowed");
  });
});

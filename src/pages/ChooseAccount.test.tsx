import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter, useLocation } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const harness = vi.hoisted(() => ({
  memberships: [
    { tenant_id: "antonio", role: "admin" },
    { tenant_id: "mogul", role: "owner" },
  ],
  user: { id: "user-1", email: "mrmogulmaker@gmail.com" } as { id: string; email: string } | null,
  membershipError: null as { message: string } | null,
  context: {
    tenants: [
      { id: "antonio", slug: "antonio", name: "Antonio Daniel LLC", status: "active", account_type: "standalone", parent_tenant_id: null, account_number: 111111, features: { solo_shell_enabled: true } },
      { id: "mogul", slug: "mogul", name: "Mogul Maker Academy", status: "active", account_type: "standalone", parent_tenant_id: null, account_number: 222222, features: { solo_shell_enabled: true } },
      { id: "hidden", slug: "hidden", name: "Not My Account", status: "active", account_type: "standalone", parent_tenant_id: null, account_number: 333333, features: { solo_shell_enabled: true } },
    ],
    activeTenantId: "antonio",
    accountContextLoading: false,
    accountContextStatus: "ready",
    isPlatformStaff: false,
    switchTenant: vi.fn(),
  },
}));

vi.mock("@/hooks/useTenantContext", () => ({ useTenantContext: () => harness.context }));
vi.mock("@/integrations/auth/oauth", () => ({ signInWithOAuth: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    auth: {
      getUser: vi.fn(async () => ({ data: { user: harness.user }, error: null })),
      signOut: vi.fn(async () => ({ error: null })),
    },
    from: vi.fn(() => {
      const result = { data: harness.memberships, error: harness.membershipError };
      const query = {
        select: vi.fn(() => query),
        eq: vi.fn(() => query),
        then: (resolve: (value: typeof result) => unknown) => Promise.resolve(result).then(resolve),
      };
      return query;
    }),
  },
}));

// Captured once, before any test can mutate the harness.
const PRISTINE_TENANTS = harness.context.tenants.map((t) => ({ ...t }));

import { registerAccountSwitchGuard } from "@/lib/auth/accountSwitchGuard";
import ChooseAccount from "./ChooseAccount";

function LocationProbe() {
  const loc = useLocation();
  return <i data-loc={loc.pathname} data-search={loc.search} />;
}

describe("ChooseAccount", () => {
  let host: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    sessionStorage.clear();
    localStorage.clear();
    harness.membershipError = null;
    harness.context.activeTenantId = "antonio";
    // Restore the tenant fixture. Several cases mutate it (status, canary,
    // account_number) and without this the mutations leak forward and the next
    // test passes or fails for a reason that has nothing to do with its subject.
    harness.context.tenants = PRISTINE_TENANTS.map((t) => ({ ...t }));
    harness.user = { id: "user-1", email: "mrmogulmaker@gmail.com" };
    harness.memberships = [
      { tenant_id: "antonio", role: "admin" },
      { tenant_id: "mogul", role: "owner" },
    ];
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
  });

  afterEach(() => {
    act(() => root.unmount());
    host.remove();
  });

  it("shows only the signed-in identity's active Paige memberships", async () => {
    await act(async () => {
      root.render(<MemoryRouter initialEntries={["/choose-account"]}><ChooseAccount /></MemoryRouter>);
    });

    expect(host.textContent).toContain("Where do you want to work?");
    expect(host.textContent).toContain("mrmogulmaker@gmail.com");
    expect(host.textContent).toContain("Antonio Daniel LLC");
    expect(host.textContent).toContain("Solo account · Admin");
    expect(host.textContent).toContain("Mogul Maker Academy");
    expect(host.textContent).not.toContain("Not My Account");
    expect(host.querySelectorAll("button").length).toBeGreaterThanOrEqual(3);
  });

  // The owner ruling of 2026-09-02: choosing a workspace ENTERS it. Routing the
  // choice back through `/admin` is what re-opened the parked context and put an
  // owner in a workspace they had not chosen, so the destination is the chosen
  // workspace's own root.
  it("enters the CHOSEN workspace at its own root instead of routing back through /admin", async () => {
    const assign = vi.fn();
    const original = window.location;
    Object.defineProperty(window, "location", { configurable: true, value: { ...original, assign, search: "" } });
    harness.context.switchTenant = vi.fn(async () => true);

    await act(async () => {
      root.render(<MemoryRouter initialEntries={["/choose-account"]}><ChooseAccount /></MemoryRouter>);
    });
    const button = Array.from(host.querySelectorAll("button")).find((b) => b.textContent?.includes("Mogul Maker Academy"));
    await act(async () => { button?.dispatchEvent(new MouseEvent("click", { bubbles: true })); });

    expect(harness.context.switchTenant).toHaveBeenCalledWith("mogul");
    expect(assign).toHaveBeenCalledWith("/solo/222222/command-center");
    expect(assign).not.toHaveBeenCalledWith("/admin");
    Object.defineProperty(window, "location", { configurable: true, value: original });
  });

  // The loop breaker. `/admin` now sends a multi-context person here, and the two
  // surfaces count workspaces from different sources — this page re-queries
  // memberships, the host reads the tenant context — so they can disagree by one.
  // Without the marker on the way back, a disagreement is an infinite redirect.
  // ONE TRUTHFUL TRANSITION. With a single workspace to offer, the page does not
  // merely record it and leave — it performs the switch, and only records the entry
  // once that succeeded. Recording an entry that never happened is exactly what made
  // the door and this page disagree forever.
  it("actually switches into the single workspace before recording it as entered", async () => {
    const assign = vi.fn();
    const original = window.location;
    Object.defineProperty(window, "location", { configurable: true, value: { ...original, assign, search: "" } });
    harness.memberships = [{ tenant_id: "mogul", role: "owner" }];
    harness.context.switchTenant = vi.fn(async () => true);

    await act(async () => {
      root.render(<MemoryRouter initialEntries={["/choose-account"]}><ChooseAccount /><LocationProbe /></MemoryRouter>);
    });

    expect(harness.context.switchTenant).toHaveBeenCalledWith("mogul");
    expect(assign).toHaveBeenCalledWith("/solo/222222/command-center");
    expect(sessionStorage.getItem("paige.workspace.entered")).toBe("mogul");
    Object.defineProperty(window, "location", { configurable: true, value: original });
  });

  // The other half of the same rule: a FAILED switch records nothing and goes
  // nowhere, so the door still knows this person has not settled anywhere.
  it("records nothing and stays put when the switch itself fails", async () => {
    const assign = vi.fn();
    const original = window.location;
    Object.defineProperty(window, "location", { configurable: true, value: { ...original, assign, search: "" } });
    harness.memberships = [{ tenant_id: "mogul", role: "owner" }];
    harness.context.switchTenant = vi.fn(async () => false);

    await act(async () => {
      root.render(<MemoryRouter initialEntries={["/choose-account"]}><ChooseAccount /></MemoryRouter>);
    });

    expect(assign).not.toHaveBeenCalled();
    expect(sessionStorage.getItem("paige.workspace.entered")).toBeNull();
    expect(host.textContent).toContain("couldn't open that account");
    Object.defineProperty(window, "location", { configurable: true, value: original });
  });


  // THE LOCKOUT GUARD. The owner was parked in a sub-account and could not reach
  // this page's picker at all: two of his three workspaces were on `trial`, the
  // filter counted only `active`, so it saw ONE choice, concluded there was
  // nothing to choose, and redirected him back to /admin — into the exact context
  // he was trying to leave. A trial workspace is live and must be offered.
  it("offers TRIAL workspaces, not only active ones", async () => {
    harness.context.tenants = harness.context.tenants.map((t) =>
      t.id === "mogul" ? { ...t, status: "trial" } : t,
    ) as typeof harness.context.tenants;
    await act(async () => {
      root.render(<MemoryRouter initialEntries={["/choose-account"]}><ChooseAccount /><LocationProbe /></MemoryRouter>);
    });
    // Still two choices, so the picker RENDERS rather than bouncing to /admin.
    // The probe always renders; what matters is that it still reads this page.
    expect(host.querySelector("[data-loc]")?.getAttribute("data-loc")).toBe("/choose-account");
    expect(host.textContent).toContain("Where do you want to work?");
    expect(host.textContent).toContain("Mogul Maker Academy");
  });

  it("does not offer a workspace that is genuinely gone", async () => {
    harness.context.tenants = harness.context.tenants.map((t) =>
      t.id === "mogul" ? { ...t, status: "canceled" } : t,
    ) as typeof harness.context.tenants;
    await act(async () => {
      root.render(<MemoryRouter initialEntries={["/choose-account"]}><ChooseAccount /><LocationProbe /></MemoryRouter>);
    });
    expect(host.textContent).not.toContain("Mogul Maker Academy");
  });

  // LOOP GUARD. `/admin` sends multi-context people here; this page re-queries
  // memberships while the door reads the tenant context, so the two can disagree.
  // On zero choices an earlier revision wrote no settlement record and still left
  // for `/admin`, which bounced it straight back — an infinite redirect in exactly
  // the branch where the sources disagree.
  // LOOP GUARD, restated for the converged transition. With nothing to offer there
  // is no transition to make and nothing honest to record, so handing back to
  // `/admin` is only safe when that door would not immediately ask again. Here the
  // context still lists enterable workspaces while the membership read returned
  // none — the exact disagreement — so the page stops rather than starting a cycle.
  it("refuses to hand back to a door that would immediately ask again", async () => {
    harness.memberships = [];
    await act(async () => {
      root.render(<MemoryRouter initialEntries={["/choose-account"]}><ChooseAccount /><LocationProbe /></MemoryRouter>);
    });
    expect(host.querySelector("[data-loc]")?.getAttribute("data-loc")).toBe("/choose-account");
    expect(host.textContent).toContain("couldn't confirm which workspaces");
    expect(sessionStorage.getItem("paige.workspace.entered")).toBeNull();
  });

  // And when the door genuinely would NOT ask — no enterable workspaces at all —
  // leaving for /admin is correct and terminates.
  it("hands back to /admin when that door has nothing to ask about either", async () => {
    harness.memberships = [];
    harness.context.tenants = [];
    await act(async () => {
      root.render(<MemoryRouter initialEntries={["/choose-account"]}><ChooseAccount /><LocationProbe /></MemoryRouter>);
    });
    expect(host.querySelector("[data-loc]")?.getAttribute("data-loc")).toBe("/admin");
  });


  // A FAILED READ IS NOT ZERO CHOICES. Navigating away on an error made the error
  // card and its Retry unreachable, and turned any transient failure on one query
  // into a redirect storm.
  it("shows its error and its Retry instead of leaving when the membership read fails", async () => {
    harness.membershipError = { message: "network" };
    await act(async () => {
      root.render(<MemoryRouter initialEntries={["/choose-account"]}><ChooseAccount /><LocationProbe /></MemoryRouter>);
    });
    // It stays here rather than leaving for /admin, which is what makes the card
    // reachable at all.
    expect(host.querySelector("[data-loc]")?.getAttribute("data-loc")).toBe("/choose-account");
    expect(host.textContent).toContain("couldn't load your Paige accounts");
    expect(Array.from(host.querySelectorAll("button")).some((b) => b.textContent?.includes("Retry"))).toBe(true);
  });

  // §58 — a protection that shipped on `main` for the control this PR DELETES.
  // `settings-setup.tsx` registers a guard while Setup is dirty or mid-save, and
  // the deleted `MemberAccountSwitcher` was its only caller. Replacing that control
  // has to carry its protection across, not just its capability.
  it("refuses to switch when a registered guard says the workspace has unsaved work", async () => {
    const assign = vi.fn();
    const original = window.location;
    Object.defineProperty(window, "location", { configurable: true, value: { ...original, assign, search: "" } });
    harness.context.switchTenant = vi.fn(async () => true);
    const release = registerAccountSwitchGuard(async () => false);

    await act(async () => {
      root.render(<MemoryRouter initialEntries={["/choose-account"]}><ChooseAccount /></MemoryRouter>);
    });
    const button = Array.from(host.querySelectorAll("button")).find((b) => b.textContent?.includes("Mogul Maker Academy"));
    await act(async () => { button?.dispatchEvent(new MouseEvent("click", { bubbles: true })); });

    expect(harness.context.switchTenant).not.toHaveBeenCalled();
    expect(assign).not.toHaveBeenCalled();
    release();
    Object.defineProperty(window, "location", { configurable: true, value: original });
  });

  // Nothing from the previous account may render under the new one's heading.
  // A full-page load already clears React state and the query cache; what survives
  // is browser storage, and these three keys name the OLD account rather than a
  // preference belonging to the person.
  it("drops the leaving workspace's identity and navigation state when a choice is made", async () => {
    const assign = vi.fn();
    const original = window.location;
    Object.defineProperty(window, "location", { configurable: true, value: { ...original, assign, search: "" } });
    harness.context.switchTenant = vi.fn(async () => true);
    sessionStorage.setItem("paige_impersonating_contact", '{"id":"contact-from-old-account"}');
    sessionStorage.setItem("paige.oauth.return", '{"path":"/solo/111111/settings"}');
    // Deliberately NOT cleared: `BusinessContext` selects by `owner_user_id`, so
    // this names the PERSON, not the account they were in.
    localStorage.setItem("paige.activeBusinessId", "belongs-to-the-person");

    await act(async () => {
      root.render(<MemoryRouter initialEntries={["/choose-account"]}><ChooseAccount /></MemoryRouter>);
    });
    const button = Array.from(host.querySelectorAll("button")).find((b) => b.textContent?.includes("Mogul Maker Academy"));
    await act(async () => { button?.dispatchEvent(new MouseEvent("click", { bubbles: true })); });

    expect(sessionStorage.getItem("paige_impersonating_contact")).toBeNull();
    expect(sessionStorage.getItem("paige.oauth.return")).toBeNull();
    expect(localStorage.getItem("paige.activeBusinessId")).toBe("belongs-to-the-person");
    expect(sessionStorage.getItem("paige.workspace.entered")).toBe("mogul");
    Object.defineProperty(window, "location", { configurable: true, value: original });
  });
});

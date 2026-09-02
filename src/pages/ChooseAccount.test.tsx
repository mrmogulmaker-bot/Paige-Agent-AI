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
  context: {
    tenants: [
      { id: "antonio", slug: "antonio", name: "Antonio Daniel LLC", status: "active", account_type: "standalone", parent_tenant_id: null, account_number: 111111, features: { solo_shell_enabled: true } },
      { id: "mogul", slug: "mogul", name: "Mogul Maker Academy", status: "active", account_type: "standalone", parent_tenant_id: null, account_number: 222222, features: { solo_shell_enabled: true } },
      { id: "hidden", slug: "hidden", name: "Not My Account", status: "active", account_type: "standalone", parent_tenant_id: null, account_number: 333333, features: { solo_shell_enabled: true } },
    ],
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
      const result = { data: harness.memberships, error: null };
      const query = {
        select: vi.fn(() => query),
        eq: vi.fn(() => query),
        then: (resolve: (value: typeof result) => unknown) => Promise.resolve(result).then(resolve),
      };
      return query;
    }),
  },
}));

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
  it("leaves to the single workspace's root, and marks the fallback so /admin cannot bounce it back", async () => {
    harness.memberships = [{ tenant_id: "mogul", role: "owner" }];
    await act(async () => {
      root.render(<MemoryRouter initialEntries={["/choose-account"]}><ChooseAccount /><LocationProbe /></MemoryRouter>);
    });
    expect(host.querySelector("[data-loc]")?.getAttribute("data-loc")).toBe("/solo/222222/command-center");

    // Entering is recorded BEFORE leaving, so the `/admin` door does not ask
    // again for a workspace this session has just resolved.
    expect(sessionStorage.getItem("paige.workspace.entered")).toBe("mogul");

    // Same single choice, but its shell canary is OFF: that tenant's shell only
    // exists inline at `/admin`, so that is where it goes — and the entry is still
    // recorded, which is what stops `/admin` bouncing it straight back here.
    act(() => root.unmount());
    host.remove();
    sessionStorage.clear();
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
    harness.context.tenants = harness.context.tenants.map((t) =>
      t.id === "mogul" ? { ...t, features: {} } : t,
    ) as typeof harness.context.tenants;
    await act(async () => {
      root.render(<MemoryRouter initialEntries={["/choose-account"]}><ChooseAccount /><LocationProbe /></MemoryRouter>);
    });
    expect(host.querySelector("[data-loc]")?.getAttribute("data-loc")).toBe("/admin");
    expect(sessionStorage.getItem("paige.workspace.entered")).toBe("mogul");
  });

  // Nothing from the previous account may render under the new one's heading.
  // A full-page load already clears React state and the query cache; what survives
  // is browser storage, and these four keys name the OLD account rather than a
  // preference belonging to the person.
  it("drops the leaving workspace's identity and navigation state when a choice is made", async () => {
    const assign = vi.fn();
    const original = window.location;
    Object.defineProperty(window, "location", { configurable: true, value: { ...original, assign, search: "" } });
    harness.context.switchTenant = vi.fn(async () => true);
    sessionStorage.setItem("paige_impersonating_contact", '{"id":"contact-from-old-account"}');
    sessionStorage.setItem("paige.oauth.return", '{"path":"/solo/111111/settings"}');
    localStorage.setItem("paige.activeBusinessId", "business-from-old-account");

    await act(async () => {
      root.render(<MemoryRouter initialEntries={["/choose-account"]}><ChooseAccount /></MemoryRouter>);
    });
    const button = Array.from(host.querySelectorAll("button")).find((b) => b.textContent?.includes("Mogul Maker Academy"));
    await act(async () => { button?.dispatchEvent(new MouseEvent("click", { bubbles: true })); });

    expect(sessionStorage.getItem("paige_impersonating_contact")).toBeNull();
    expect(sessionStorage.getItem("paige.oauth.return")).toBeNull();
    expect(localStorage.getItem("paige.activeBusinessId")).toBeNull();
    expect(sessionStorage.getItem("paige.workspace.entered")).toBe("mogul");
    Object.defineProperty(window, "location", { configurable: true, value: original });
  });
});

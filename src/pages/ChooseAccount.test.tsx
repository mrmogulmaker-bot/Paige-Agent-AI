import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const harness = vi.hoisted(() => ({
  memberships: [
    { tenant_id: "antonio", role: "admin" },
    { tenant_id: "mogul", role: "owner" },
  ],
  user: { id: "user-1", email: "mrmogulmaker@gmail.com" } as { id: string; email: string } | null,
  context: {
    tenants: [
      { id: "antonio", slug: "antonio", name: "Antonio Daniel LLC", status: "active", account_type: "standalone", parent_tenant_id: null },
      { id: "mogul", slug: "mogul", name: "Mogul Maker Academy", status: "active", account_type: "standalone", parent_tenant_id: null },
      { id: "hidden", slug: "hidden", name: "Not My Account", status: "active", account_type: "standalone", parent_tenant_id: null },
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

describe("ChooseAccount", () => {
  let host: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
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
});

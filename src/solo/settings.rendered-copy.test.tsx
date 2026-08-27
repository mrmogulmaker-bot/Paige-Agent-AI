import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { SoloSettings } from "./settings";

const testState = vi.hoisted(() => ({ tab: "team" }));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: { rpc: vi.fn() },
}));
vi.mock("@/hooks/useTenantContext", () => ({
  useTenantContext: () => ({
    activeTenantId: "tenant-1971670",
    loading: false,
    activeTenant: { account_number: "1971670" },
  }),
}));
vi.mock("@/lib/routing/useSubtabRoute", () => ({
  useSubtabRoute: () => [testState.tab, vi.fn()],
}));
vi.mock("./data/useSoloBusiness", () => ({
  useSoloBusiness: () => ({
    name: "First Sterling Capital",
    brand: { website: null, business_phone: null, industry: null },
    loading: false,
    error: null,
    refresh: vi.fn(),
  }),
}));
vi.mock("./data/useSoloOwner", () => ({
  useSoloOwner: () => ({
    owner: { name: "Antonio Cook", email: null, phone: null, website: null },
    loading: false,
    error: null,
    refresh: vi.fn(),
  }),
}));
vi.mock("./data/useSoloComms", () => ({
  useSoloComms: () => ({
    domains: [],
    billing: null,
    loading: false,
    error: null,
    refresh: vi.fn(),
  }),
}));

const destinations = [
  "setup",
  "team",
  "connections",
  "notifications",
  "security-data",
  "vault",
  "billing",
] as const;

function renderDestination(tab: (typeof destinations)[number]) {
  testState.tab = tab;
  return renderToStaticMarkup(
    <MemoryRouter initialEntries={[`/solo/1971670/settings/${tab}`]}>
      <Routes>
        <Route path="/solo/:account/settings/:tab" element={<SoloSettings />} />
      </Routes>
    </MemoryRouter>,
  );
}

function renderedText(html: string) {
  return html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

describe("Solo Settings rendered customer copy", () => {
  it("renders the approved Workspace permissions title and body", () => {
    const text = renderedText(renderDestination("team"));
    expect(text).toContain("Workspace permissions");
    expect(text).toContain("Owners and authorized admins may manage team access. Permissions apply only to this Solo workspace.");
  });

  it("keeps operator-only terminology out of all seven rendered destinations", () => {
    const rendered = destinations.map(renderDestination).join(" ").toLowerCase();
    const forbiddenTerms = [
      "platform operator",
      "break-glass",
      "fleet",
      "cross-tenant",
      "tenant-null",
      "tenant_id is null",
      "operator surface",
    ];

    for (const term of forbiddenTerms) expect(rendered).not.toContain(term);
  });
});

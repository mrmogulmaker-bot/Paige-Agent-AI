import { act } from "react";
import { createRoot } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";
import path from "node:path";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { SoloSettings } from "./settings";

const testState = vi.hoisted(() => ({ tab: "team" }));

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

vi.mock("@/integrations/supabase/client", () => ({
  supabase: { rpc: vi.fn().mockResolvedValue({ data: null, error: null }) },
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
  "integrations",
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

  it("keeps operator-only terminology out of every rendered destination", () => {
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

  it("renders Integrations as its own truthful Settings destination", () => {
    const text = renderedText(renderDestination("integrations"));
    expect(text).toContain("External tools and bridges");
    expect(text).toContain("Marketplace handoff");
    expect(text).toContain("Communications setup stays in Connections");
    expect(text).not.toContain("Business phone");
    expect(text).not.toContain("A2P");
  });

  it("places the compact Business phone search first in Connections", () => {
    const html = renderDestination("connections");
    const text = renderedText(html);

    expect(text).toContain("Business phone");
    expect(text).toContain("Search available phone numbers");
    expect(text).toContain("Area code or locality");
    expect(text).toContain("Required capabilities");
    expect(text).toContain("Search numbers");
    expect(text).toContain("PROPOSED");
    expect(html.indexOf("ss-phone-setup")).toBeLessThan(html.indexOf("PAIGE-managed sending identity"));
  });

  it("keeps number search non-mutating and explains the unavailable execution contract", async () => {
    testState.tab = "connections";
    const shellScrollOwner = document.createElement("main");
    shellScrollOwner.id = "tenant-shell-main";
    const host = document.createElement("div");
    shellScrollOwner.append(host);
    document.body.append(shellScrollOwner);
    const root = createRoot(host);

    await act(async () => {
      root.render(
        <MemoryRouter initialEntries={["/solo/1971670/settings/connections"]}>
          <Routes>
            <Route path="/solo/:account/settings/:tab" element={<SoloSettings />} />
          </Routes>
        </MemoryRouter>,
      );
    });

    const rpc = (await import("@/integrations/supabase/client")).supabase.rpc as ReturnType<typeof vi.fn>;
    const callsBeforeSearch = rpc.mock.calls.length;
    const button = Array.from(host.querySelectorAll("button")).find((candidate) => candidate.textContent === "Search numbers");
    const form = button?.closest("form");
    expect(button).toBeTruthy();
    expect(form).toBeTruthy();
    expect(shellScrollOwner.classList.contains("tcs-main--settings-scrollbar-hidden")).toBe(true);

    await act(async () => {
      form?.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    });

    expect(host.querySelector('[role="status"]')?.textContent).toContain("Number search is not connected yet");
    expect(rpc.mock.calls.length).toBe(callsBeforeSearch);

    await act(async () => root.unmount());
    expect(shellScrollOwner.classList.contains("tcs-main--settings-scrollbar-hidden")).toBe(false);
    shellScrollOwner.remove();
  });

  it("hides Settings scrollbar chrome without disabling scrolling", () => {
    const css = readFileSync(path.resolve(process.cwd(), "src/solo/settings.css"), "utf8");
    expect(css).toContain(".tcs-main--settings-scrollbar-hidden");
    expect(css).toContain("scrollbar-width: none");
    expect(css).toContain(".ss-phone-title");
    expect(css).toMatch(/\.ss-phone-title[^}]*font:\s*650 18px/);
    expect(css).not.toMatch(/\.tcs-main--settings-scrollbar-hidden\s*\{[^}]*overflow[^}]*hidden/);
  });
});

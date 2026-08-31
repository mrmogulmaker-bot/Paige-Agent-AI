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
    // A static render shows the surface before its tenant-scoped read resolves,
    // so the copy proven here is the chrome and the honest waiting state. The
    // provider cards themselves are proven in the rendered-flow tests, which
    // drive the real read (settings-integrations.test.tsx).
    expect(text).toContain("Integrations");
    expect(text).toContain("Automations");
    expect(text).toMatch(/Resolving this account/);
    // The removed chrome must not come back: no oversized catalogue masthead,
    // no ownership table, no scroll cue.
    expect(text).not.toContain("Integration catalogue");
    expect(text).not.toContain("Browse by provider");
    expect(text).not.toContain("Scroll to browse");
    expect(text).not.toContain("Marketplace Governed Paige capability lifecycle");
    expect(text).not.toContain("External tools and bridges");
    expect(text).not.toContain("Marketplace / Storefront");
    expect(text).not.toContain("Business phone");
    expect(text).not.toContain("A2P");
  });

  /**
   * Replaces "places the compact Business phone search first in Connections".
   *
   * That test encoded the IA this redesign removes: number search rendered as a
   * full-width accented panel at the top of Connections, so it read as the whole
   * feature and pushed registration, sending identity and delivery below the
   * fold. Business phone is now ONE of four named Communications subsections,
   * and search is a peer card inside it.
   */
  it("presents Communications as four named subsections, not a phone search", () => {
    const html = renderDestination("connections");
    const text = renderedText(html);

    for (const heading of ["Business phone", "Messaging registration", "Sending identity", "Delivery health"]) {
      expect(text, `missing subsection: ${heading}`).toContain(heading);
    }
    // The search affordance survives, with its ceiling intact.
    expect(text).toContain("Area code or locality");
    expect(text).toContain("Search numbers");
    expect(text).toContain("PROPOSED");
  });

  it("does not let number search lead or dominate the surface", () => {
    const html = renderDestination("connections");
    // The number RECORD comes before the search form: what this business has is
    // stated before what it could look for.
    expect(html.indexOf("Number on this business")).toBeLessThan(html.indexOf("Find a number"));
    // And the search panel no longer carries the full-width accent treatment.
    expect(html).not.toContain("ss-phone-setup");
  });

  /**
   * NARROWED, and the narrowing is the honest part.
   *
   * This asserted that Connections contained no connector names at all. That
   * passed — but only because #660's `Available` catalogue sits behind its own
   * tab and the default view is Communications. A test that green-lights on
   * which tab happens to be selected is not evidence about the seam; it is
   * evidence about a default.
   *
   * What this PR was actually told to do is narrower: do not BUILD Integrations
   * as a tab inside Connections. That is what is asserted now. #660's Available
   * catalogue predates the split, is annotated there as owner-locked, and is
   * deliberately left alone — whether it still earns a place in Connections now
   * that #657 ships a real Integrations destination is the owner's call and
   * that lane's, not this PR's.
   */
  it("does not build an Integrations tab inside Connections", () => {
    const text = renderedText(renderDestination("connections"));
    // No Integrations destination of Connections' own — the §18 duplication.
    expect(text).not.toContain("Integrations");
    // And Connections opens on Communications, not on a connector catalogue.
    expect(text).toContain("Business phone");
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

  it("opens Calendars when the entry says the link came from Calendar", () => {
    // The Calendar's "Manage calendar settings" exit carries origin=calendar.
    // Landing on Communications after following it is how someone concludes the
    // setting is not there, so the validated entry picks the segment.
    testState.tab = "connections";
    const html = renderToStaticMarkup(
      <MemoryRouter initialEntries={["/solo/1971670/settings/connections?origin=calendar&returnTo=%2Fsolo%2F1971670%2Fclients%2Fcalendar"]}>
        <Routes>
          <Route path="/solo/:account/settings/:tab" element={<SoloSettings />} />
        </Routes>
      </MemoryRouter>,
    );
    const text = renderedText(html);
    expect(text).toContain("Booking presets");
    expect(html).toMatch(/aria-selected="true"[^>]*>Calendars</);
    // …and an ordinary visit still lands on Communications.
    const plain = renderDestination("connections");
    expect(renderedText(plain)).not.toContain("Booking presets");
    expect(plain).toMatch(/aria-selected="true"[^>]*>Communications</);
  });

  it("opens Calendars when the OAuth return names that segment", () => {
    // Which segment you were on is local state and never reaches the URL, so
    // the return address carries it explicitly — otherwise the callback rebuilds
    // Settings from the path alone and lands on Communications.
    testState.tab = "connections";
    const html = renderToStaticMarkup(
      <MemoryRouter initialEntries={["/solo/1971670/settings/connections?segment=calendars"]}>
        <Routes>
          <Route path="/solo/:account/settings/:tab" element={<SoloSettings />} />
        </Routes>
      </MemoryRouter>,
    );
    expect(html).toMatch(/aria-selected="true"[^>]*>Calendars</);
  });

  it("ignores a segment the surface does not have, rather than rendering nothing", () => {
    // The value arrives from a URL. Casting it would select no segment at all
    // and paint an empty Connections page.
    testState.tab = "connections";
    const html = renderToStaticMarkup(
      <MemoryRouter initialEntries={["/solo/1971670/settings/connections?segment=nonsense"]}>
        <Routes>
          <Route path="/solo/:account/settings/:tab" element={<SoloSettings />} />
        </Routes>
      </MemoryRouter>,
    );
    expect(html).toMatch(/aria-selected="true"[^>]*>Communications</);
  });

  it("pins the Connections sub-navigation so the context survives a long scroll", () => {
    const css = readFileSync(path.resolve(process.cwd(), "src/solo/settings.css"), "utf8");
    expect(css).toMatch(/\.ss-subnav\s*\{[^}]*position:\s*sticky/);
    expect(css).toMatch(/\.ss-subnav\s*\{[^}]*background:\s*var\(--pg-canvas\)/);
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

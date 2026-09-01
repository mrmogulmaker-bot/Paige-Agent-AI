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

vi.mock("@/hooks/useUserRoles", () => ({
  // The predicate the SERVER gates on (platform owner OR global admin/coach). Mocked
  // rather than left to the real hook, which opens its own auth subscription.
  useUserRoles: () => ({ loading: false, userId: "u1", roles: ["admin"], isAdmin: true, isCoach: false, isClient: false, isBroker: false, isStaff: true }),
}));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    // `current_user_tenant_id` is the resolver both new adapters read through — it is
    // what the WRITES use, so the reads use it too. A double that answers null for it
    // makes every surface report an unidentifiable workspace instead of rendering copy.
    rpc: vi.fn(async (fn: string) =>
      fn === "current_user_tenant_id" ? { data: "tenant-1971670", error: null } : { data: null, error: null }),
    // The number panel calls an edge function now, and `useSoloNumbers` reads the
    // numbers table, so both have to exist on the double or the surface throws
    // before any copy is rendered.
    functions: { invoke: vi.fn().mockResolvedValue({ data: null, error: null }) },
    from: vi.fn(() => ({
      select: () => ({ eq: () => ({ order: async () => ({ data: [], error: null }), limit: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) }) }),
    })),
  },
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
    business: { name: "", website: "", phone: "" }, mailbox: { connected: false, address: null, displayName: null, provider: null, status: null }, canManage: true, saveBusiness: vi.fn(async () => ({ ok: true, error: null })), addDomain: vi.fn(async () => ({ ok: true, error: null })), refreshDomain: vi.fn(async () => ({ ok: true, error: null })), setDefaultDomain: vi.fn(async () => ({ ok: true, error: null })), removeDomain: vi.fn(async () => ({ ok: true, error: null })), startGmailConnect: vi.fn(async () => ({ url: null, error: null })), disconnectGmail: vi.fn(async () => ({ ok: true, error: null })), domains: [],
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
    // The search subsection is present. The CONTROL itself is authority-gated and
    // this render is static — `renderToStaticMarkup` runs no effects, so
    // `is_current_user_tenant_admin` never resolves and the panel correctly shows
    // its read-only notice. Asserting the button here would either fail or force
    // the gate open for the test's convenience. It is asserted below, in the test
    // that actually mounts.
    expect(text).toContain("Find a number");
  });

  it("does not let number search lead the surface", () => {
    const html = renderDestination("connections");
    // The number RECORD still comes before the search form: what this business
    // HAS is stated before what it could look for. That ordering is the part
    // worth locking, and it survives the panel going live.
    expect(html.indexOf("Number on this business")).toBeLessThan(html.indexOf("Find a number"));
    // The accent treatment is no longer withheld: this panel now performs the
    // act of the subsection (search and buy), which is what the treatment marks.
    // Asserting its ABSENCE would now be asserting that the live control looks
    // inert, which is the opposite of what this surface should say.
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

  it("actually searches, and reports a setup gap as a setup gap", async () => {
    // REPLACES "keeps number search non-mutating and explains the unavailable
    // execution contract". That test locked the panel's inertness — it asserted
    // the button ran nothing and said so. Owner ruling 2026-08-31: bring it live.
    // `comms-search-numbers` was always real; only the caller was missing.
    //
    // So what is locked now is the opposite, plus the honesty rule that matters
    // most here: a workspace with no messaging account CANNOT buy, and that is a
    // setup gap, never an empty result. Reporting "no numbers found" would blame
    // the search for something it did not do.
    testState.tab = "connections";
    const shellScrollOwner = document.createElement("main");
    shellScrollOwner.id = "tenant-shell-main";
    const host = document.createElement("div");
    shellScrollOwner.append(host);
    document.body.append(shellScrollOwner);
    const root = createRoot(host);

    const client = (await import("@/integrations/supabase/client")).supabase;
    // Resolve the caller as a workspace admin, which is what the server requires:
    // `comms-search-numbers` returns 403 to anyone else, so a surface that showed
    // the control to a non-admin would be showing a button that always fails.
    (client.rpc as ReturnType<typeof vi.fn>).mockImplementation(async (fn: string) =>
      // Both resolvers, because the adapter needs both: the workspace it is scoped to,
      // and whether this caller may change its numbers. Answering only the second left
      // the surface unable to say which workspace it was in, so it showed no controls.
      fn === "current_user_tenant_id" ? { data: "tenant-1971670", error: null }
        : fn === "is_current_user_tenant_admin" ? { data: true, error: null }
          : { data: null, error: null });
    const invoke = client.functions.invoke as ReturnType<typeof vi.fn>;
    invoke.mockResolvedValue({ data: { needs_config: true, message: "Messaging isn't set up yet.", numbers: [] }, error: null });

    await act(async () => {
      root.render(
        <MemoryRouter initialEntries={["/solo/1971670/settings/connections"]}>
          <Routes>
            <Route path="/solo/:account/settings/:tab" element={<SoloSettings />} />
          </Routes>
        </MemoryRouter>,
      );
    });

    const button = Array.from(host.querySelectorAll("button")).find((c) => (c.textContent ?? "").includes("Search numbers"));
    const form = button?.closest("form");
    expect(button, "the live search button should render").toBeTruthy();
    expect(shellScrollOwner.classList.contains("tcs-main--settings-scrollbar-hidden")).toBe(true);

    await act(async () => {
      form?.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    });

    // It REACHED the real seam — the assertion the old test made impossible.
    expect(invoke.mock.calls.some((c) => c[0] === "comms-search-numbers"),
      "Search must call comms-search-numbers").toBe(true);
    // And a setup gap reads as one.
    expect(host.textContent).toContain("can't buy a number yet");
    expect(host.textContent).not.toContain("No numbers matched");

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

  it("dresses and resets the element that actually scrolls, not the one above it", async () => {
    // SoloApp nests a screen host inside the shell's `#tenant-shell-main`, and
    // that host is what scrolls Settings. Adding the scrollbar-hiding class to the
    // outer main left the VISIBLE scrollbar undressed. And because one host serves
    // the whole route, its scroll position outlived a tab change — opening a short
    // destination after a long one landed part-way down its content.
    testState.tab = "connections";
    const shellMain = document.createElement("main");
    shellMain.id = "tenant-shell-main";
    const screenHost = document.createElement("main");
    screenHost.setAttribute("data-solo-screen-host", "");
    const host = document.createElement("div");
    screenHost.append(host);
    shellMain.append(screenHost);
    document.body.append(shellMain);
    const root = createRoot(host);

    await act(async () => {
      root.render(
        <MemoryRouter initialEntries={["/solo/1971670/settings/connections"]}>
          <Routes><Route path="/solo/:account/settings/:tab" element={<SoloSettings />} /></Routes>
        </MemoryRouter>,
      );
    });

    expect(screenHost.classList.contains("tcs-main--settings-scrollbar-hidden")).toBe(true);
    expect(shellMain.classList.contains("tcs-main--settings-scrollbar-hidden")).toBe(false);

    screenHost.scrollTop = 900;
    testState.tab = "notifications";
    await act(async () => {
      root.render(
        <MemoryRouter initialEntries={["/solo/1971670/settings/notifications"]}>
          <Routes><Route path="/solo/:account/settings/:tab" element={<SoloSettings />} /></Routes>
        </MemoryRouter>,
      );
    });
    expect(screenHost.scrollTop).toBe(0);

    await act(async () => root.unmount());
    expect(screenHost.classList.contains("tcs-main--settings-scrollbar-hidden")).toBe(false);
    shellMain.remove();
  });

  it("keeps Settings off SoloApp's clipped-host list, so its long tabs can be scrolled", () => {
    // The regression this exists for: `settings` was in SoloApp's `full` set, so
    // the screen host rendered `overflow:hidden` at `height:100%`. The Calendars
    // tab — the longest surface in Settings — was cut off at the fold, and the
    // shell's own scroll owner never overflowed either, so there was nothing to
    // scroll by wheel, key or scrollbar. `.solo-settings` is a document flow with
    // no internal scroller; its host must be the one that scrolls.
    const app = readFileSync(path.resolve(process.cwd(), "src/solo/SoloApp.tsx"), "utf8");
    const full = app.match(/const full=([^;]+);/)?.[1] ?? "";
    expect(full).not.toBe("");
    expect(full).not.toContain("'settings'");
    // The host itself still switches on `full` — that is what makes the list load-bearing.
    expect(app).toMatch(/overflow:full\?'hidden':'auto'/);
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

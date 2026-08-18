// Routing contract for the operator subtree (§65 R4, Super Admin pack slice 1b).
//
// The failure this exists to catch is SILENT and specific. App.tsx used to match `/operator`
// as an EXACT path; slice 1b changes it to a splat so the console can live at
// `/operator/{section}`. If `OperatorEntry` ever loses its `index` leg, bare `/operator`
// renders NOTHING — the shape `BusinessEntry` has today, where a bare `/business` is blank.
// And because NOTHING in the product links to `/operator` (repo-wide grep: zero href/to/
// navigate hits — it is a typed or bookmarked URL only), a blank root would ship completely
// undetected and only surface when the owner types the URL and finds the door gone.
//
// That is the #538 lockout class. This test is the mechanical guard against it.
//
// Children are mocked deliberately: the assertion is about WHICH leg the router picks, not
// about what the login form or the shell render. Mocking keeps the test honest about its own
// scope and free of supabase/session setup (folder convention: react-dom/server, no RTL).
import { describe, it, expect, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter, Routes, Route } from "react-router-dom";

vi.mock("@/pages/OperatorLogin", () => ({
  default: () => <div data-testid="login">OPERATOR_LOGIN</div>,
}));
vi.mock("@/operator/OperatorApp", () => ({
  default: () => <div data-testid="console">OPERATOR_CONSOLE</div>,
}));
// The guard is exercised by its own concerns (loading/session/role); here it must be
// transparent so the routing assertion is not entangled with auth state.
vi.mock("@/operator/RequireOperator", () => ({
  default: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

import OperatorEntry from "./OperatorEntry";

/**
 * Mirrors the REAL mount in App.tsx: `<Route path="/operator/*" element={<OperatorEntry/>} />`.
 * This nesting is load-bearing to the test's validity — mounting OperatorEntry at the router
 * ROOT instead would let its `:section/*` leg greedily match the literal segment "operator",
 * so `/operator` would resolve to the console and the index leg would look broken when it is
 * not. Test the component as it is actually mounted, or the test lies in both directions.
 */
const mountAt = (path: string, Entry: React.ComponentType) =>
  renderToStaticMarkup(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/operator/*" element={<Entry />} />
      </Routes>
    </MemoryRouter>,
  );

const at = (path: string) => mountAt(path, OperatorEntry);

describe("OperatorEntry — the /operator subtree routing contract", () => {
  it("bare /operator STILL renders the login door (the load-bearing index leg)", () => {
    // If this fails, the operator's front door is a blank page and nothing in the
    // product would reveal it.
    expect(at("/operator")).toContain("OPERATOR_LOGIN");
  });

  it("/operator/login renders the same door at an explicit address", () => {
    expect(at("/operator/login")).toContain("OPERATOR_LOGIN");
  });

  it("a section path renders the console, not the door", () => {
    const html = at("/operator/fleet");
    expect(html).toContain("OPERATOR_CONSOLE");
    expect(html).not.toContain("OPERATOR_LOGIN");
  });

  it("a deep sub-tab path renders the console", () => {
    expect(at("/operator/fleet/tenants")).toContain("OPERATOR_CONSOLE");
  });

  it("the three-level settings path renders the console", () => {
    // /operator/settings/team/roles — the roles surface, the deepest shape in the tree.
    expect(at("/operator/settings/team/roles")).toContain("OPERATOR_CONSOLE");
  });

  it("the door is NOT behind the guard", async () => {
    // Re-import with a DENYING guard: the login legs must still render, or a signed-out
    // operator can never reach the form (an unrecoverable lockout).
    vi.resetModules();
    vi.doMock("@/operator/RequireOperator", () => ({
      default: () => <div data-testid="denied">DENIED</div>,
    }));
    const { default: Entry } = await import("./OperatorEntry");
    expect(mountAt("/operator", Entry)).toContain("OPERATOR_LOGIN");
    expect(mountAt("/operator/login", Entry)).toContain("OPERATOR_LOGIN");
    expect(mountAt("/operator/fleet", Entry)).toContain("DENIED");
    vi.doUnmock("@/operator/RequireOperator");
  });
});

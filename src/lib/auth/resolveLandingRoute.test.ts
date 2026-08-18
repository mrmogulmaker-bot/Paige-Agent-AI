import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * §65 — the agency landing route.
 *
 * WHY THIS FILE EXISTS (§39): the bug it guards is invisible to every other
 * check. `resolveAgencyLanding` returning bare `/agency` instead of the numeric
 * URL type-checks, builds, lints, and renders — it just silently drops an agency
 * owner on the LEGACY board forever. A green pipeline proves nothing about it.
 * These cases drive the real resolver end-to-end against a mocked client, so a
 * regression fails here instead of in the owner's browser.
 *
 * The two properties worth protecting:
 *   1. §13 — a missing/garbage account number NEVER builds a URL from it. The
 *      fallback is the pre-change bare `/agency`, never `/agency/null/…`.
 *   2. §39 — the canary is honored. `/admin` Gate A gates the URL-driven shell on
 *      `agency_shell_enabled`, but `AgencyEntry` does NOT (a numeric segment goes
 *      straight to AgencyApp), so login must apply that gate itself or the two
 *      entry points disagree for the next agency provisioned.
 */

const rpc = vi.fn();
const from = vi.fn();

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    rpc: (...a: unknown[]) => rpc(...a),
    from: (...a: unknown[]) => from(...a),
  },
}));

const { resolveLandingRoute } = await import("./resolveLandingRoute");

/** A signed-in user carrying the `admin` role and nothing else that redirects. */
function mockTables(opts: { agencyLoginDefault?: string | null } = {}) {
  from.mockImplementation((table: string) => {
    const one = (data: unknown) => ({
      select: () => ({
        eq: () => ({
          maybeSingle: () => Promise.resolve({ data, error: null }),
          limit: () => ({ maybeSingle: () => Promise.resolve({ data, error: null }) }),
          eq: () => ({ limit: () => ({ maybeSingle: () => Promise.resolve({ data, error: null }) }) }),
        }),
      }),
    });
    if (table === "user_roles") {
      return { select: () => ({ eq: () => Promise.resolve({ data: [{ role: "admin" }], error: null }) }) };
    }
    if (table === "profiles") {
      return one({ agency_login_default: opts.agencyLoginDefault ?? "agency" });
    }
    return one(null); // clients / tenants / tenant_members / agency_team_members
  });
}

/** What `agency_switch_context()` hands back. */
function mockCtx(ctx: Record<string, unknown> | null) {
  rpc.mockImplementation((name: string) =>
    name === "agency_switch_context"
      ? Promise.resolve({ data: ctx, error: null })
      : Promise.resolve({ data: null, error: null }),
  );
}

const MANAGER = { is_agency_manager: true, agency_shell_enabled: true, agency_account_number: 1924546 };

beforeEach(() => {
  rpc.mockReset();
  from.mockReset();
  mockTables();
});

describe("resolveLandingRoute — agency landing (§65)", () => {
  it("sends an eligible manager to their REAL numeric URL, not the legacy board", async () => {
    mockCtx(MANAGER);
    expect(await resolveLandingRoute("u1")).toBe("/agency/1924546/command-center");
  });

  it("normalizes an account number arriving as a jsonb string", async () => {
    mockCtx({ ...MANAGER, agency_account_number: "1924546" });
    expect(await resolveLandingRoute("u1")).toBe("/agency/1924546/command-center");
  });

  // §39 — the case above passes the GUARD only because of the Number() coercion,
  // but it cannot prove the URL carries the COERCED value: "1924546" interpolates
  // byte-identically to 1924546. These two can only pass if the number that reaches
  // the template is the normalized one, so a regression that guards on Number() and
  // then interpolates the raw field still fails here.
  for (const [label, raw, expected] of [
    ["exponent notation", "1e6", 1000000],
    ["leading whitespace", " 1924546", 1924546],
  ] as const) {
    it(`interpolates the COERCED number, not the raw field (${label})`, async () => {
      mockCtx({ ...MANAGER, agency_account_number: raw });
      const route = await resolveLandingRoute("u1");
      expect(route).toBe(`/agency/${expected}/command-center`);
      expect(route).not.toContain(raw);
    });
  }

  // §13 — never construct a URL from a value we don't have.
  for (const [label, value] of [
    ["absent (migration not deployed yet)", undefined],
    ["explicitly null", null],
    ["garbage", "not-a-number"],
    ["zero", 0],
  ] as const) {
    it(`falls back to bare /agency when the account number is ${label}`, async () => {
      mockCtx({ ...MANAGER, agency_account_number: value });
      const route = await resolveLandingRoute("u1");
      expect(route).toBe("/agency");
      expect(route).not.toContain("null");
      expect(route).not.toContain("undefined");
      expect(route).not.toContain("NaN");
    });
  }

  // §39 — the canary must gate login exactly as it gates /admin Gate A.
  it("does NOT hand over the new shell when agency_shell_enabled is false", async () => {
    mockCtx({ ...MANAGER, agency_shell_enabled: false });
    expect(await resolveLandingRoute("u1")).toBe("/agency");
  });

  it("treats a missing agency_shell_enabled as OFF (strict === true)", async () => {
    mockCtx({ is_agency_manager: true, agency_account_number: 1924546 });
    expect(await resolveLandingRoute("u1")).toBe("/agency");
  });

  // Pre-existing branches that must keep working (§58).
  it("honors the 'last_account' preference by falling through to /admin", async () => {
    mockCtx(MANAGER);
    mockTables({ agencyLoginDefault: "last_account" });
    expect(await resolveLandingRoute("u1")).toBe("/admin");
  });

  it("falls through to /admin when the caller is not an agency manager", async () => {
    mockCtx({ is_agency_manager: false, agency_account_number: null });
    expect(await resolveLandingRoute("u1")).toBe("/admin");
  });

  it("falls through to /admin when the RPC throws", async () => {
    rpc.mockImplementation(() => Promise.reject(new Error("boom")));
    expect(await resolveLandingRoute("u1")).toBe("/admin");
  });
});

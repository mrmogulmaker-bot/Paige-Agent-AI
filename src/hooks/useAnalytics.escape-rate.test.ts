import { describe, it, expect, vi } from "vitest";
import { randomBytes } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { redactSecretPath, redactSecretSearch } from "./useAnalytics";

/**
 * A CREDENTIAL CONTROL WITH A MEASURED ESCAPE RATE IS NOT A CONTROL.
 *
 * The shape rule exists to cover the token-bearing route nobody remembered to register. Whether it
 * does is a measurable question, not a design opinion, and measuring it has twice overturned what
 * the code claimed:
 *
 *   · A character-class count alone let 1 in 786 real invite tokens through — all letters, no
 *     digit, no `+` or `/`.
 *   · Adding "32 characters is enough on its own" fixed that and left something far worse: `/` is
 *     in the STANDARD base64 alphabet and 39.6% of real tokens contain one, so the token reached a
 *     path ALREADY SPLIT into fragments below the length floor and was never seen whole. Measured
 *     escape rate at that point: 1 in 7. Worse than the defect it replaced.
 *
 * So the rate is asserted here, at zero, and the route allowlist stays regardless — it is the half
 * that is certain on the routes we know, and this is the half that covers the ones we do not.
 */

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    auth: { getSession: vi.fn(async () => ({ data: { session: null } })), onAuthStateChange: vi.fn() },
  },
}));

// `encode(gen_random_bytes(24), 'base64')` — exactly what create_tenant_invite_token mints.
const mintInviteToken = () => randomBytes(24).toString("base64");

describe("shape-rule escape rate, on a route the allowlist does not know about", () => {
  it("is zero across a large sample, in the path AND in the query string", () => {
    const N = 250_000;
    let pathEscapes = 0;
    let searchEscapes = 0;
    let withSlash = 0;
    for (let i = 0; i < N; i++) {
      const token = mintInviteToken();
      if (token.includes("/")) withSlash++;
      if (redactSecretPath(`/brand-new-flow/${token}`).includes(token)) pathEscapes++;
      if (redactSecretSearch(`?t=${token}`).includes(token)) searchEscapes++;
    }
    // A sample with no split tokens would not be exercising the case that failed at 1 in 7.
    expect(withSlash).toBeGreaterThan(N * 0.3);
    expect(pathEscapes).toBe(0);
    expect(searchEscapes).toBe(0);
  }, 120_000);

  it("catches the two shapes that individually defeated an earlier rule", () => {
    // All letters, no digit, no symbol — defeated the character-class count.
    const allLetters = "kJvQmZxRbNwTyHcLpAdSeQfGhKlMnOpQ";
    expect(redactSecretPath(`/brand-new-flow/${allLetters}`)).not.toContain(allLetters);
    // Contains `/`, so it arrives split — defeated per-segment length checking.
    const split = "kJ8vQ2mZ+xR7bN4wT1yH/cL6pA3dS9e=";
    expect(split).toContain("/");
    expect(redactSecretPath(`/brand-new-flow/${split}`)).not.toContain(split);
  });
});

/**
 * The other half of the trade. Over-redaction is not a safe failure: analytics that cannot group a
 * path is analytics nobody uses, and that is the pressure that gets a guard loosened later.
 */
describe("the real route table is not mangled", () => {
  it("leaves every non-credential route exactly as it was", () => {
    const app = fs.readFileSync(path.join(process.cwd(), "src/App.tsx"), "utf8");
    const routes = [...app.matchAll(/path="([^"]+)"/g)].map((m) => m[1]).filter((r) => r !== "*");
    expect(routes.length).toBeGreaterThan(50);

    const CREDENTIAL_ROUTES = new Set(["sign", "join", "u"]);
    const mangled: string[] = [];
    for (const route of routes) {
      const concrete = route
        .replace(/:tenantSlug/g, "acme-coaching")
        .replace(/:account/g, "3855")
        .replace(/:id/g, "3f2504e0-4f89-11d3-9a0c-0305e82c3301")
        .replace(/:[A-Za-z]+/g, "sample-value");
      if (CREDENTIAL_ROUTES.has(concrete.split("/")[1]?.toLowerCase() ?? "")) continue;
      const out = redactSecretPath(concrete);
      if (out !== concrete) mangled.push(`${concrete} -> ${out}`);
    }
    expect(mangled).toEqual([]);
  });
});

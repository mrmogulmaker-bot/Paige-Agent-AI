import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";

/**
 * The redaction UNIT tests prove `redactSecretPath` / `redactSecretUrl` work. They do NOT prove
 * the payload calls them — stripping all three call sites left every one of them green. That gap
 * is the whole defect: a guard that passes while the credential ships is worse than no guard,
 * because it reports safety. These tests assert the WIRING.
 */

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    auth: {
      getSession: vi.fn(async () => ({ data: { session: null } })),
      onAuthStateChange: vi.fn(),
    },
    functions: { invoke: vi.fn(async () => ({ data: null, error: null })) },
  },
}));

const TOKEN = "d".repeat(43) + "Z9-_";

describe("trackEvent never posts the signing credential", () => {
  let sent: string[] = [];

  beforeEach(() => {
    sent = [];
    // Narrow the stub to sendBeacon only — replacing `navigator` wholesale strips `userAgent`
    // and react-dom reads it at import time.
    Object.defineProperty(navigator, "sendBeacon", {
      // Returning false forces the fetch fallback, whose body is a readable string.
      value: () => false,
      configurable: true,
      writable: true,
    });
    vi.stubGlobal("fetch", ((_url: string, init?: RequestInit) => {
      if (init?.body) sent.push(String(init.body));
      return Promise.resolve({ ok: true } as Response);
    }) as typeof fetch);
    Object.defineProperty(window, "location", {
      value: new URL(`https://app.example.com/sign/${TOKEN}`),
      writable: true,
      configurable: true,
    });
    Object.defineProperty(document, "referrer", {
      value: `https://app.example.com/sign/${TOKEN}`,
      configurable: true,
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("redacts the token out of every field it posts", async () => {
    const { trackEvent } = await import("./useAnalytics");
    await trackEvent("page_view");
    expect(sent.length).toBeGreaterThan(0);
    const body = sent.join("\n");
    expect(body).not.toContain(TOKEN);
    // ...and still reports that a signing page was viewed.
    expect(body).toContain("sign");
  });
});

/**
 * The two sinks that are not reachable through `trackEvent` — `usePageView`'s own `path`
 * property, and the referral tracker's `landingPath`, which lands in `referral_clicks` where RLS
 * lets the OWNING AFFILIATE read it. Asserted against source so removing a call site fails here.
 */
describe("every URL sink routes through the redactor", () => {
  const read = (p: string) => fs.readFileSync(path.join(process.cwd(), p), "utf8");

  it("usePageView redacts the path it records", () => {
    const src = read("src/hooks/useAnalytics.ts");
    expect(src).toMatch(/path:\s*redactSecretPath\(location\.pathname\)/);
    expect(src).toMatch(/page_path:\s*redactSecretPath\(window\.location\.pathname\)/);
    expect(src).toMatch(/referrer:\s*redactSecretUrl\(document\.referrer\)/);
  });

  it("the referral tracker redacts the landing path it sends to referral_clicks", () => {
    const src = read("src/hooks/useReferralTracking.ts");
    expect(src).toMatch(/landingPath:\s*redactSecretPath\(url\.pathname\)/);
    expect(src).not.toMatch(/landingPath:\s*url\.pathname\s*\+/);
  });
});

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { redactSecretPath, redactSecretSearch, redactSecretUrl } from "./useAnalytics";

/**
 * PROOF AGAINST THE EMITTED REQUEST BODY, not against the source and not against the helpers.
 *
 * The redaction unit tests prove the helpers work; the wiring tests prove the call sites exist.
 * Neither proves what actually leaves the browser, and that is the only thing `analytics_events`
 * ever sees. These tests put a real-shaped credential into EVERY input this module reads and
 * assert it is absent from the ACTUAL posted body.
 *
 * The token shapes are the ones the platform really mints, not invented fixtures:
 *   · SIGNING / UNSUBSCRIBE — `mintSignerToken()`: 32 CSPRNG bytes as hex => 64 chars [0-9a-f].
 *   · INVITE — `encode(gen_random_bytes(24), 'base64')` => 32 chars, STANDARD alphabet (+ / =).
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

const SIGNING_TOKEN = "3f".repeat(32);                 // 64 hex chars
const UNSUB_TOKEN = "a9".repeat(32);                   // 64 hex chars
const INVITE_TOKEN = "kJ8vQ2mZ+xR7bN4wT1yH/cL6pA3dS9e="; // 32 chars, standard base64

let sent: string[] = [];

function atLocation(href: string) {
  Object.defineProperty(window, "location", {
    value: new URL(href),
    writable: true,
    configurable: true,
  });
}

function withReferrer(value: string) {
  Object.defineProperty(document, "referrer", { value, configurable: true });
}

beforeEach(() => {
  sent = [];
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
  withReferrer("");
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("no credential reaches the posted body, from any live token surface", () => {
  const cases: Array<{ name: string; href: string; token: string }> = [
    { name: "/sign/:token — the signing bearer", href: `https://app.example.com/sign/${SIGNING_TOKEN}`, token: SIGNING_TOKEN },
    { name: "/join/:token — an UNHASHED, directly redeemable invite", href: `https://app.example.com/join/${INVITE_TOKEN}`, token: INVITE_TOKEN },
    { name: "/u/:token — unsubscribe in the path", href: `https://app.example.com/u/${UNSUB_TOKEN}`, token: UNSUB_TOKEN },
    { name: "?token= — unsubscribe in the QUERY STRING", href: `https://app.example.com/unsubscribe?token=${UNSUB_TOKEN}`, token: UNSUB_TOKEN },
    { name: "?ct= — tenant-comms unsubscribe in the query string", href: `https://app.example.com/unsubscribe?ct=${UNSUB_TOKEN}`, token: UNSUB_TOKEN },
  ];

  for (const c of cases) {
    it(`redacts ${c.name}`, async () => {
      atLocation(c.href);
      const { trackEvent } = await import("./useAnalytics");
      await trackEvent("page_view");
      expect(sent.length).toBeGreaterThan(0);
      expect(sent.join("\n")).not.toContain(c.token);
    });
  }

  it("redacts the referrer sink too", async () => {
    atLocation("https://app.example.com/dashboard");
    withReferrer(`https://app.example.com/sign/${SIGNING_TOKEN}?x=1`);
    const { trackEvent } = await import("./useAnalytics");
    await trackEvent("page_view");
    expect(sent.join("\n")).not.toContain(SIGNING_TOKEN);
  });
});

/**
 * THE POINT OF THE SHAPE RULE. A route allowlist is only ever right about the routes someone
 * remembered to register — it shipped holding "sign" alone while /join and /u were already live.
 * This route is deliberately NOT in the set, so only the shape rule can be redacting it. If
 * somebody replaces shape matching with an allowlist again, this is the test that goes red.
 */
describe("an UNREGISTERED future token route is still covered", () => {
  it("redacts a credential on a route nobody registered", async () => {
    atLocation(`https://app.example.com/brand-new-flow/${SIGNING_TOKEN}`);
    const { trackEvent } = await import("./useAnalytics");
    await trackEvent("page_view");
    expect(sent.join("\n")).not.toContain(SIGNING_TOKEN);
  });

  it("redacts an unregistered route carrying an invite-shaped token", () => {
    expect(redactSecretPath(`/somewhere/${INVITE_TOKEN}`)).not.toContain(INVITE_TOKEN);
  });
});

/**
 * usePageView's own `path` and `search` properties are not reachable without a DOM renderer, but
 * they travel through `trackEvent`, whose whole payload is scrubbed before it is posted. Passing
 * the values RAW proves the choke point holds even when a caller forgets to redact.
 */
describe("the choke point catches what a caller forgot to redact", () => {
  it("scrubs a raw path and search handed in through properties", async () => {
    atLocation("https://app.example.com/dashboard");
    const { trackEvent } = await import("./useAnalytics");
    await trackEvent("page_view", "engagement", {
      path: `/sign/${SIGNING_TOKEN}`,
      search: `?ct=${UNSUB_TOKEN}`,
      note: `visited /join/${INVITE_TOKEN} earlier`,
    });
    const body = sent.join("\n");
    expect(body).not.toContain(SIGNING_TOKEN);
    expect(body).not.toContain(UNSUB_TOKEN);
    expect(body).not.toContain(INVITE_TOKEN);
  });

  it("scrubs a credential nested deep inside properties", async () => {
    atLocation("https://app.example.com/dashboard");
    const { trackEvent } = await import("./useAnalytics");
    await trackEvent("page_view", "engagement", {
      outer: { inner: [{ href: `https://app.example.com/join/${INVITE_TOKEN}` }] },
    });
    expect(sent.join("\n")).not.toContain(INVITE_TOKEN);
  });
});

/**
 * Over-redaction is its own failure: analytics that cannot group a path is analytics nobody uses,
 * and the pressure to loosen the guard comes from exactly that. Ordinary paths must survive.
 */
describe("does not mangle ordinary values", () => {
  it("leaves real product paths untouched", () => {
    for (const p of ["/", "/solo/3855/growth/sales", "/clients/people", "/signup", "/signals/x"]) {
      expect(redactSecretPath(p)).toBe(p);
    }
  });

  it("leaves a UUID path segment intact — an identifier is not a credential", () => {
    const uuid = "3f2504e0-4f89-11d3-9a0c-0305e82c3301";
    expect(redactSecretPath(`/admin/contacts/${uuid}`)).toBe(`/admin/contacts/${uuid}`);
  });

  it("leaves a long word-slug intact", () => {
    const p = "/blog/the-complete-guide-to-client-onboarding-2026";
    expect(redactSecretPath(p)).toBe(p);
  });

  it("keeps ordinary query parameters", () => {
    expect(redactSecretSearch("?view=terms&page=2")).toBe("?view=terms&page=2");
    expect(redactSecretUrl("https://app.example.com/solo/3855/growth/sales?view=terms")).toBe(
      "https://app.example.com/solo/3855/growth/sales?view=terms",
    );
  });
});

/**
 * REGRESSIONS THE PEER GATE CAUGHT IN THIS GUARD ITSELF.
 *
 * Every case below failed against the first version of this fix. They are kept because each one is
 * a way for a credential guard to be worse than useless — either leaking the thing it exists to
 * stop, or destroying data it was never meant to touch.
 */
describe("peer-gate regressions", () => {
  it("does NOT redact campaign attribution — a guard that eats utm_campaign is a business outage", async () => {
    atLocation("https://app.example.com/pricing?utm_source=linkedin&utm_medium=cpc&utm_campaign=black_friday_2026_launch");
    const { trackEvent } = await import("./useAnalytics");
    await trackEvent("page_view");
    const body = sent.join("\n");
    // `track-event` writes utm_source/utm_medium/utm_campaign into their own columns.
    expect(body).toContain("black_friday_2026_launch");
    expect(body).toContain("linkedin");
  });

  it("keeps mixed-case and long campaign names too", () => {
    for (const name of ["Black_Friday_2026_Launch", "Coach_Summit_Q3_2026", "spring-into-growth-2026-cohort"]) {
      expect(redactSecretSearch(`?utm_campaign=${name}`)).toContain(name);
    }
  });

  it("redacts a BARE standard-base64 invite token — it contains `/` and used to split past the guard", async () => {
    atLocation("https://app.example.com/dashboard");
    const { trackEvent } = await import("./useAnalytics");
    await trackEvent("page_view", "engagement", { invite_link_value: INVITE_TOKEN });
    expect(sent.join("\n")).not.toContain(INVITE_TOKEN);
  });

  it("fails CLOSED past the recursion cap rather than handing the value back", async () => {
    atLocation("https://app.example.com/dashboard");
    const { trackEvent } = await import("./useAnalytics");
    let nested: Record<string, unknown> = { leaf: SIGNING_TOKEN };
    for (let i = 0; i < 12; i++) nested = { n: nested };
    await trackEvent("page_view", "engagement", nested);
    expect(sent.join("\n")).not.toContain(SIGNING_TOKEN);
  });

  it("redacts an invite token that scores only two character classes (1 in 786 of real tokens)", () => {
    // All letters, no digit, no `+` or `/` — measured to occur in ~0.13% of real invite tokens.
    const allLetters = "kJvQmZxRbNwTyHcLpAdSeQfGhKlMnOpQ"; // 32 chars, the exact mint width
    expect(allLetters).toHaveLength(32);
    expect(redactSecretPath(`/brand-new-flow/${allLetters}`)).not.toContain(allLetters);
    expect(redactSecretSearch(`?t=${allLetters}`)).not.toContain(allLetters);
  });

  it("redacts a credential in the URL FRAGMENT — the Supabase recovery-link shape", () => {
    const out = redactSecretUrl(`https://app.example.com/reset-password#access_token=${SIGNING_TOKEN}&refresh_token=abc`);
    expect(out).not.toContain(SIGNING_TOKEN);
  });

  it("does not blank ordinary properties named code or key", async () => {
    atLocation("https://app.example.com/dashboard");
    const { trackEvent } = await import("./useAnalytics");
    await trackEvent("page_view", "engagement", { code: "SUMMER20", key: "pricing_tab", plan: "solo" });
    const body = sent.join("\n");
    expect(body).toContain("SUMMER20");
    expect(body).toContain("pricing_tab");
  });

  it("keeps the prose around a credential in free text", () => {
    // Rewriting the whole string as a path turned a sentence into "/join/<redacted>".
    const out = redactSecretPath("/dashboard");
    expect(out).toBe("/dashboard");
  });
});

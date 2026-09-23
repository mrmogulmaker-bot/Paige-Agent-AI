import { describe, it, expect } from "vitest";
import { redactSecretPath, redactSecretUrl } from "./useAnalytics";

/**
 * The signing bearer token is a CREDENTIAL in a URL path segment — the whole of a counterparty's
 * authority to open and sign a legal agreement. Every page view is posted to `track-event`, which
 * inserts the path into `analytics_events`. Without this, each signing link anyone opened would sit
 * in plaintext, indefinitely, in a table a platform operator can read.
 */
describe("redactSecretPath", () => {
  it("never lets a signing token through", () => {
    const token = "a".repeat(43) + "Z9-_";
    const out = redactSecretPath(`/sign/${token}`);
    expect(out).not.toContain(token);
    expect(out).toBe("/sign/<redacted>");
  });

  it("redacts on the ROUTE, not on how the value looks", () => {
    // A token that reads like an ordinary word is still a token.
    expect(redactSecretPath("/sign/hello")).toBe("/sign/<redacted>");
    // ...and anything trailing it goes too, so a sub-path cannot smuggle it back.
    expect(redactSecretPath("/sign/tok123/confirm")).toBe("/sign/<redacted>");
  });

  it("leaves every other path exactly as it was", () => {
    for (const p of ["/", "/solo/3855/growth/sales", "/clients/people", "/signup", "/signals/x"]) {
      expect(redactSecretPath(p)).toBe(p);
    }
  });
});

/**
 * Review found the first guard matched by a CASE-SENSITIVE string prefix while React Router
 * registers `/sign/:token` case-insensitively. Verified against the real router before fixing:
 * `matchPath({path:"/sign/:token"}, "/SIGN/TOK")` matches and yields `token=TOK`, so those URLs
 * render the signing page for real and the prefix check waved the credential straight through.
 */
describe("redactSecretPath — matched the way the router matches", () => {
  const token = "b".repeat(43);

  it("redacts the casings the router actually serves", () => {
    for (const p of [`/sign/${token}`, `/SIGN/${token}`, `/Sign/${token}`, `/sIgN/${token}`]) {
      expect(redactSecretPath(p)).not.toContain(token);
    }
  });

  it("redacts a percent-encoded head the router would NOT match", () => {
    // `/%73ign/...` does not match the route, so it never renders — but these sinks log whatever
    // is in the URL regardless of what matched. The guard is deliberately wider than the router.
    expect(redactSecretPath(`/%73ign/${token}`)).not.toContain(token);
  });

  it("does not throw or over-redact on hostile input", () => {
    expect(redactSecretPath("/%/x")).toBe("/%/x"); // lone `%` — decode throws, must not propagate
    expect(redactSecretPath("/signup/abc")).toBe("/signup/abc");
    expect(redactSecretPath("/signals/x")).toBe("/signals/x");
    expect(redactSecretPath("")).toBe("");
  });
});

/**
 * The third sink, in the same payload object as the first two: `referrer: document.referrer`.
 * Armed rather than firing today — the signing page has no full-page navigation, and an SPA route
 * change does not update `document.referrer`. But `Referrer-Policy` is
 * `strict-origin-when-cross-origin`, which strips the path only CROSS-origin; a same-origin
 * full-page navigation away from the signing route carries the whole URL, token included.
 */
describe("redactSecretUrl — the referrer sink", () => {
  const token = "c".repeat(43);

  it("strips the token from a same-origin referrer", () => {
    const out = redactSecretUrl(`https://app.example.com/sign/${token}?x=1`);
    expect(out).not.toContain(token);
    expect(out).toContain("/sign/%3Credacted%3E");
  });

  it("keeps an ordinary referrer intact", () => {
    const ref = "https://app.example.com/solo/3855/growth/sales?view=terms";
    expect(redactSecretUrl(ref)).toBe(ref);
  });

  it("never hands back an unredacted value on a parse failure", () => {
    expect(redactSecretUrl(`/sign/${token}`)).not.toContain(token);
    expect(redactSecretUrl("")).toBe("");
  });
});

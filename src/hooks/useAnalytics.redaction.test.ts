import { describe, it, expect } from "vitest";
import { redactSecretPath } from "./useAnalytics";

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

/**
 * The OAuth return address is a navigation target written by one surface and
 * consumed by another after a round trip through a third party, so the only
 * interesting question is what it REFUSES. Every case below is a value that must
 * never become a redirect.
 */
import { beforeEach, describe, expect, it } from "vitest";
import { clearOAuthReturn, isSafeReturnPath, rememberOAuthReturn, takeOAuthReturn } from "./oauthReturn";

const KEY = "paige.oauth.return";

describe("isSafeReturnPath", () => {
  it("accepts a same-origin absolute path", () => {
    expect(isSafeReturnPath("/solo/1971670/settings/connections")).toBe(true);
    expect(isSafeReturnPath("/solo/1/settings/connections?origin=calendar")).toBe(true);
  });

  it("refuses anything that could leave the origin", () => {
    for (const bad of [
      "//evil.example",                    // protocol-relative
      "https://evil.example/x",            // absolute URL
      "/\\evil.example",                   // backslash, treated as a separator by some parsers
      "javascript:alert(1)",               // scheme
      "/admin",                             // retired product route
      "/admin/deep/link",                   // retired deep link
      "settings/connections",              // relative
      "/",                                 // no destination
      "",
      null,
      undefined,
      42,
      { path: "/x" },
    ] as unknown[]) {
      expect(isSafeReturnPath(bad)).toBe(false);
    }
  });

  it("refuses an absurdly long value rather than storing it", () => {
    expect(isSafeReturnPath(`/${"a".repeat(600)}`)).toBe(false);
  });
});

describe("remember / take", () => {
  beforeEach(() => window.sessionStorage.clear());

  it("returns the stored path exactly once", () => {
    rememberOAuthReturn("/solo/1971670/settings/connections");
    expect(takeOAuthReturn()).toBe("/solo/1971670/settings/connections");
    expect(takeOAuthReturn()).toBeNull();
  });

  it("never stores an unsafe path in the first place", () => {
    rememberOAuthReturn("https://evil.example/x");
    expect(window.sessionStorage.getItem(KEY)).toBeNull();
    expect(takeOAuthReturn()).toBeNull();
  });

  it("refuses a poisoned entry written by something else, and clears it", () => {
    window.sessionStorage.setItem(KEY, JSON.stringify({ path: "//evil.example", at: Date.now() }));
    expect(takeOAuthReturn()).toBeNull();
    expect(window.sessionStorage.getItem(KEY)).toBeNull();
  });

  it("refuses and clears a stale retired admin return", () => {
    window.sessionStorage.setItem(KEY, JSON.stringify({ path: "/admin/setup", at: Date.now() }));
    expect(takeOAuthReturn()).toBeNull();
    expect(window.sessionStorage.getItem(KEY)).toBeNull();
  });

  it("ignores an abandoned attempt rather than replaying it later", () => {
    window.sessionStorage.setItem(KEY, JSON.stringify({ path: "/solo/1/settings/connections", at: Date.now() - 20 * 60_000 }));
    expect(takeOAuthReturn()).toBeNull();
  });

  it("survives unreadable storage without throwing", () => {
    window.sessionStorage.setItem(KEY, "not json");
    expect(takeOAuthReturn()).toBeNull();
  });
});

describe("clear", () => {
  beforeEach(() => window.sessionStorage.clear());

  it("drops a stored path without reading it", () => {
    rememberOAuthReturn("/solo/1971670/settings/connections");
    clearOAuthReturn();
    expect(takeOAuthReturn()).toBeNull();
  });

  it("is safe to call when nothing was stored", () => {
    expect(() => clearOAuthReturn()).not.toThrow();
  });
});

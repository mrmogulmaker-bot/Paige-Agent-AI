import { describe, it, expect, beforeEach } from "vitest";
import { armOAuthReturn, takeOAuthReturn, isSafeReturnPath } from "@/solo/data/oauthReturn";

const readSrc = (p: string) => require("node:fs").readFileSync(require("node:path").join(process.cwd(), p), "utf8");

describe("a finished connection returns to where it started", () => {
  beforeEach(() => { try { window.sessionStorage.clear(); } catch { /* ignore */ } });

  it("round-trips the Integrations path", () => {
    armOAuthReturn("/solo/9082725/settings/integrations");
    expect(takeOAuthReturn()).toBe("/solo/9082725/settings/integrations");
  });

  it("is read-and-clear, so a later unrelated callback cannot inherit it", () => {
    armOAuthReturn("/solo/9082725/settings/integrations");
    takeOAuthReturn();
    expect(takeOAuthReturn()).toBeNull();
  });

  it("refuses an off-origin destination rather than becoming an open redirect", () => {
    for (const bad of ["//evil.example/x", "https://evil.example", "/\\evil.example", "javascript:alert(1)"]) {
      expect(isSafeReturnPath(bad)).toBe(false);
      armOAuthReturn(bad);
      expect(takeOAuthReturn()).toBeNull();
    }
  });

  it("starting a flow with no return address CLEARS a stale one", () => {
    // Abandoning a provider's consent page produces no callback at all, so nothing on the
    // error paths runs and an address can outlive the journey that wrote it.
    armOAuthReturn("/solo/9082725/settings/integrations");
    armOAuthReturn(undefined);
    expect(takeOAuthReturn()).toBeNull();
  });
});

describe("there is ONE return-address store, not one per integration", () => {
  it("every OAuth surface uses the shared module", () => {
    // A second implementation on the same sessionStorage key would silently break the
    // Gmail and Calendar returns that already depend on it. This test exists because a
    // duplicate was written and caught before it shipped.
    for (const f of [
      "src/solo/settings-integrations.tsx",
      "src/pages/McpOAuthCallback.tsx",
      "src/pages/ZapierOAuthCallback.tsx",
      "src/solo/settings.tsx",
      "src/pages/GmailCallback.tsx",
      "src/pages/GoogleCalendarCallback.tsx",
    ]) {
      expect(readSrc(f)).toMatch(/from "(@\/solo|\.)\/data\/oauthReturn"/);
    }
    expect(require("node:fs").existsSync("src/lib/integrations/oauthReturn.ts")).toBe(false);
  });

  it("a connected callback returns instead of stopping on an interstitial", () => {
    const mcp = readSrc("src/pages/McpOAuthCallback.tsx");
    expect(mcp).toContain('phase.connected && back.current) navigate(back.current, { replace: true })');
    // The old destination was "/" -- the PUBLIC marketing page, not a workspace.
    expect(mcp).not.toContain('navigate("/")}>Back to your workspace');
    const zap = readSrc("src/pages/ZapierOAuthCallback.tsx");
    expect(zap).toContain('phase.healthy&&back.current)navigate(back.current,{replace:true})');
    expect(zap).not.toContain('onClick={()=>navigate("/")}');
  });

  it("both Zapier flows arm the return before leaving for the provider", () => {
    const ui = readSrc("src/solo/settings-integrations.tsx");
    expect(ui.match(/armOAuthReturn\(`\$\{window\.location\.pathname\}\$\{window\.location\.search\}`\)/g)).toHaveLength(2);
  });
});

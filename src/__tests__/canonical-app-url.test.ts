import { describe, expect, it } from "vitest";

import {
  canonicalAppUrl,
  resolveCanonicalAppPath,
} from "../../supabase/functions/_shared/canonical-app-url";

describe("canonical externally emitted app destinations", () => {
  it.each([
    ["operator", "operator", null, "home", "/operator/fleet/systems-check"],
    ["account", "solo", "1971670", "home", "/solo/1971670/command-center/business-game-plan"],
    ["account", "sub_account", "1971671", "home", "/business/1971671/command-center/overview"],
    ["account", "agency", "1971672", "home", "/agency/1971672/command-center/overview"],
  ] as const)("maps %s/%s to its mounted home", (actor, tier, account, destination, expected) => {
    expect(resolveCanonicalAppPath({ actor, tier, account, destination })).toBe(expected);
  });

  it.each([
    ["solo", "/solo/1971670/settings/billing"],
    ["sub_account", "/business/1971670/billing/your-plan"],
    ["agency", "/agency/1971670/billing/your-plan"],
  ] as const)("maps %s billing only to a mounted action-parity surface", (tier, expected) => {
    expect(resolveCanonicalAppPath({
      actor: "account",
      tier,
      account: "1971670",
      destination: "billing",
    })).toBe(expected);
  });

  it("maps database account_type=standalone to the Solo tree", () => {
    expect(resolveCanonicalAppPath({
      actor: "account",
      tier: "standalone",
      account: 1971670,
      destination: "connections",
    })).toBe("/solo/1971670/settings/connections");
  });

  it("uses the mounted operator governance routes for operator alerts", () => {
    expect(resolveCanonicalAppPath({
      actor: "operator", tier: "operator", destination: "approvals",
    })).toBe("/operator/settings/governance/approvals");
    expect(resolveCanonicalAppPath({
      actor: "operator", tier: "operator", destination: "security",
    })).toBe("/operator/settings/governance/security");
  });

  it.each([
    { actor: "account", tier: "enterprise", account: "1971670", destination: "home" },
    { actor: "operator", tier: "operator", destination: "billing" },
    { actor: "account", tier: "agency", account: "1971670", destination: "security" },
    { actor: "account", tier: "solo", account: "1971670", destination: "approvals" },
    { actor: "operator", tier: "solo", account: "1971670", destination: "home" },
    { actor: "account", tier: "operator", account: "1971670", destination: "home" },
    { actor: "account", tier: "solo", account: "not/an/account", destination: "home" },
    { actor: "account", tier: "solo", account: null, destination: "home" },
  ] as const)("fails closed for unsupported or unsafe destination %#", (input) => {
    expect(resolveCanonicalAppPath(input)).toBeNull();
  });

  it("emits the canonical Paige Agent AI origin and never /admin", () => {
    const url = canonicalAppUrl({
      actor: "account",
      tier: "solo",
      account: 1971670,
      destination: "billing",
    });
    expect(url).toBe("https://paigeagent.ai/solo/1971670/settings/billing");
    expect(url).not.toContain("/admin");
  });
});

import { describe, it, expect } from "vitest";
import {
  getTierFeatureSet,
  hasFeature,
  resolveTierKey,
  type Feature,
  type TierClassification,
  type TierKey,
} from "./tierFeatures";

// §60 tier-lock guard (owner-ruled 2026-08-11). This test LOCKS the load-bearing
// cells of the TIER_FEATURE_BASELINE map so a future careless edit that re-adds
// (or drops) a feature on the wrong tier is caught in CI — the §51/§13 backstop the
// lint:tier-features guard can't provide (the linter checks call sites, not the map).
// PURE — no DB, no fetch.

/** Build a classification for a tier the way the hook does. */
function cls(
  account_type: string | null,
  opts: { parent?: string | null; staff?: boolean } = {},
): TierClassification {
  return {
    account_type,
    parent_tenant_id: opts.parent ?? null,
    isPlatformStaff: opts.staff ?? false,
  };
}

const SOLO = cls("standalone");
const SUB = cls("sub_account", { parent: "agency-uuid" });
const AGENCY = cls("agency");
const ENTERPRISE = cls("enterprise");
const GOD = cls(null, { staff: true });

describe("resolveTierKey", () => {
  const cases: Array<[string, TierClassification, TierKey]> = [
    ["god = platform staff, no tenant", GOD, "god"],
    ["agency", AGENCY, "agency"],
    ["enterprise", ENTERPRISE, "enterprise"],
    ["sub_account (typed)", SUB, "sub_account"],
    ["solo (standalone, no parent)", SOLO, "solo"],
    ["solo (null type, no parent)", cls(null), "solo"],
  ];
  it.each(cases)("resolves %s", (_label, c, expected) => {
    expect(resolveTierKey(c)).toBe(expected);
  });

  it("§51 parent-first: a legacy 'standalone' WITH a parent resolves to sub_account, not solo", () => {
    expect(resolveTierKey(cls("standalone", { parent: "agency-uuid" }))).toBe("sub_account");
  });

  it("§51 defense-in-depth: a mistyped child (account_type='agency' while parented) never resolves to a manager tier", () => {
    expect(resolveTierKey(cls("agency", { parent: "agency-uuid" }))).toBe("sub_account");
  });

  it("platform staff WITH an active tenant resolves to that tenant's tier, not god", () => {
    expect(resolveTierKey(cls("sub_account", { parent: "x", staff: true }))).toBe("sub_account");
  });
});

describe("§60 customer_portal_invite lock — the owner-ruled cell", () => {
  it("solo + sub_account + enterprise GET it (enterprise = the HYBRID tier, owner 2026-08-11)", () => {
    expect(hasFeature(SOLO, "customer_portal_invite")).toBe(true);
    expect(hasFeature(SUB, "customer_portal_invite")).toBe(true);
    // Enterprise HYBRID (closes flag 1 from PR #458): a creation-capable tenant with a
    // direct client book must be able to invite the very clients its campaigns are for.
    expect(hasFeature(ENTERPRISE, "customer_portal_invite")).toBe(true);
  });
  it("a pure agency + god do NOT (the lock holds for agency)", () => {
    expect(hasFeature(AGENCY, "customer_portal_invite")).toBe(false);
    expect(hasFeature(GOD, "customer_portal_invite")).toBe(false);
  });
});

describe("§60 other load-bearing cells", () => {
  it("fleet_console is god-only", () => {
    expect(hasFeature(GOD, "fleet_console")).toBe(true);
    for (const c of [SOLO, SUB, AGENCY, ENTERPRISE]) {
      expect(hasFeature(c, "fleet_console")).toBe(false);
    }
  });

  it("subaccount_management is manager-tier only (agency + enterprise)", () => {
    expect(hasFeature(AGENCY, "subaccount_management")).toBe(true);
    expect(hasFeature(ENTERPRISE, "subaccount_management")).toBe(true);
    for (const c of [SOLO, SUB, GOD]) {
      expect(hasFeature(c, "subaccount_management")).toBe(false);
    }
  });

  it("universal features are on every tier incl. god", () => {
    const universal: Feature[] = [
      "command_center",
      "systems_check",
      "marketplace",
      "analytics",
      "setup",
      "paige_hub",
    ];
    for (const c of [SOLO, SUB, AGENCY, ENTERPRISE, GOD]) {
      for (const f of universal) expect(hasFeature(c, f)).toBe(true);
    }
  });

  it("god does NOT carry the tenant CRM cluster (people_crm/pipeline/conversations)", () => {
    for (const f of ["people_crm", "pipeline", "conversations"] as Feature[]) {
      expect(hasFeature(GOD, f)).toBe(false);
    }
  });

  it("§60 growth (creation surfaces) — solo/sub/enterprise/god GET it, agency does NOT", () => {
    for (const c of [SOLO, SUB, ENTERPRISE, GOD]) {
      expect(hasFeature(c, "growth")).toBe(true);
    }
    expect(hasFeature(AGENCY, "growth")).toBe(false);
  });

  it("§60 studio (Vibe Studio) — solo/sub/enterprise/god GET it, agency does NOT", () => {
    for (const c of [SOLO, SUB, ENTERPRISE, GOD]) {
      expect(hasFeature(c, "studio")).toBe(true);
    }
    expect(hasFeature(AGENCY, "studio")).toBe(false);
  });

  it("enterprise is a superset of agency (never falls below it — even after the growth/studio split)", () => {
    const agencySet = getTierFeatureSet(AGENCY);
    const enterpriseSet = getTierFeatureSet(ENTERPRISE);
    for (const f of agencySet) expect(enterpriseSet.has(f)).toBe(true);
  });
});

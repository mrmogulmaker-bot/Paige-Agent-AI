import { describe, it, expect } from "vitest";
import {
  TIER_TREES,
  SOLO_BRANCHES,
  AGENCY_BRANCHES,
  treeForTier,
  defaultBranchSlug,
  branchBySlug,
  branchByKey,
  branchPath,
  defaultSubtabSlug,
  subtabBySlug,
  subtabByKey,
  subtabPath,
  type RouteTierKey,
} from "./tierBranches";

const TIERS: RouteTierKey[] = ["operator", "agency", "enterprise", "solo", "sub_account"];

describe("TIER_BRANCHES registry (§65 §11)", () => {
  it("§11c/§60 — sub_account inherits the SOLO tree, NOT the agency tree", () => {
    // Same branch set as solo (the load-bearing §60 invariant)…
    expect(TIER_TREES.sub_account.branches).toBe(SOLO_BRANCHES);
    expect(TIER_TREES.solo.branches).toBe(SOLO_BRANCHES);
    // …but a distinct root prefix (§3 shared shell, §65 mental-model label).
    expect(TIER_TREES.sub_account.root).toBe("/business");
    expect(TIER_TREES.solo.root).toBe("/solo");
    // And it is NOT the agency tree.
    expect(TIER_TREES.sub_account.branches).not.toBe(AGENCY_BRANCHES);
  });

  it("§3/§61 — enterprise = agency baseline (superset), distinct root", () => {
    expect(TIER_TREES.enterprise.root).toBe("/enterprise");
    // Every agency branch is present in enterprise, in order.
    const entSlugs = TIER_TREES.enterprise.branches.map((b) => b.slug);
    for (const b of AGENCY_BRANCHES) expect(entSlugs).toContain(b.slug);
    expect(TIER_TREES.enterprise.branches.length).toBeGreaterThanOrEqual(AGENCY_BRANCHES.length);
  });

  it("every tier has a unique root prefix", () => {
    const roots = TIERS.map((t) => TIER_TREES[t].root);
    expect(new Set(roots).size).toBe(roots.length);
  });

  it("slugs are unique within each tier and url-safe", () => {
    for (const t of TIERS) {
      const slugs = TIER_TREES[t].branches.map((b) => b.slug);
      expect(new Set(slugs).size, `dup slug in ${t}`).toBe(slugs.length);
      for (const s of slugs) expect(s, `unsafe slug ${s}`).toMatch(/^[a-z0-9-]+$/);
    }
  });

  it("keys are unique within each tier (each maps to one screen)", () => {
    for (const t of TIERS) {
      const keys = TIER_TREES[t].branches.map((b) => b.key);
      expect(new Set(keys).size, `dup key in ${t}`).toBe(keys.length);
    }
  });

  it("agency tree carries the manager-only branches solo lacks", () => {
    const soloSlugs = new Set(SOLO_BRANCHES.map((b) => b.slug));
    // Client Support + Billing are agency(manager)-only per §11c.
    expect(AGENCY_BRANCHES.map((b) => b.slug)).toContain("client-support");
    expect(AGENCY_BRANCHES.map((b) => b.slug)).toContain("billing");
    expect(soloSlugs.has("client-support")).toBe(false);
    expect(soloSlugs.has("billing")).toBe(false);
  });

  it("defaultBranchSlug is the first branch (command-center for every real tier)", () => {
    expect(defaultBranchSlug("agency")).toBe("command-center");
    expect(defaultBranchSlug("solo")).toBe("command-center");
    expect(defaultBranchSlug("sub_account")).toBe("command-center");
    expect(defaultBranchSlug("enterprise")).toBe("command-center");
  });

  it("branchBySlug / branchByKey resolve correctly (slug ≠ key by design, §65)", () => {
    const b = branchBySlug("agency", "trust-compass");
    expect(b?.key).toBe("compass");
    expect(branchByKey("agency", "compass")?.slug).toBe("trust-compass");
    // agency 'clients' slug maps to the 'fleet' key.
    expect(branchBySlug("agency", "clients")?.key).toBe("fleet");
    // solo 'clients' slug maps to the 'clients' key (different shell).
    expect(branchBySlug("solo", "clients")?.key).toBe("clients");
    // unknown slug → null (router falls back to default / 404).
    expect(branchBySlug("agency", "does-not-exist")).toBeNull();
  });

  it("branchPath builds ${root}/{account}/{slug}", () => {
    expect(branchPath("agency", "3855", "trust-compass")).toBe("/agency/3855/trust-compass");
    expect(branchPath("sub_account", "1234", "clients")).toBe("/business/1234/clients");
    expect(branchPath("solo", "42", "growth")).toBe("/solo/42/growth");
  });

  it("treeForTier returns the tier's tree", () => {
    expect(treeForTier("agency")).toBe(TIER_TREES.agency);
  });
});

describe("Sub-tab tree (§65 3-level, agency verified 2026-08-17)", () => {
  it("sub-tab slugs are unique + url-safe within each branch; keys unique too", () => {
    for (const b of AGENCY_BRANCHES) {
      if (!b.subtabs) continue;
      const slugs = b.subtabs.map((s) => s.slug);
      const keys = b.subtabs.map((s) => s.key);
      expect(new Set(slugs).size, `dup sub-slug in ${b.slug}`).toBe(slugs.length);
      expect(new Set(keys).size, `dup sub-key in ${b.slug}`).toBe(keys.length);
      for (const s of slugs) expect(s, `unsafe sub-slug ${s}`).toMatch(/^[a-z0-9-]+$/);
    }
  });

  it("no sub-tab slug collides with its own branch slug (avoids /x/x)", () => {
    for (const b of AGENCY_BRANCHES) {
      for (const s of b.subtabs ?? []) {
        expect(s.slug, `${b.slug}/${s.slug} collides`).not.toBe(b.slug);
      }
    }
  });

  it("branches with NO sub-tabs are exactly Client Support + Integrations", () => {
    const noSub = AGENCY_BRANCHES.filter((b) => !b.subtabs).map((b) => b.slug).sort();
    expect(noSub).toEqual(["client-support", "integrations"]);
  });

  it("verified counts + first-is-default per the live-screen audit", () => {
    const count = (slug: string) => branchBySlug("agency", slug)?.subtabs?.length ?? 0;
    expect(count("command-center")).toBe(4);
    expect(count("paige")).toBe(6);
    expect(count("automations")).toBe(3);
    expect(count("calendar")).toBe(5);
    expect(count("growth")).toBe(7);
    expect(count("analytics")).toBe(6);
    expect(count("marketplace")).toBe(6);
    expect(count("team")).toBe(6);
    expect(count("setup")).toBe(7);
    // first sub-tab is the screen's default (bare branch renders it).
    expect(defaultSubtabSlug("agency", "command-center")).toBe("overview");
    expect(defaultSubtabSlug("agency", "paige")).toBe("chat");
    expect(defaultSubtabSlug("agency", "client-support")).toBeNull();
  });

  it("subtabBySlug / subtabByKey resolve (slug ≠ key by design)", () => {
    expect(subtabBySlug("agency", "paige", "sub-agents")?.key).toBe("agents");
    expect(subtabByKey("agency", "paige", "agents")?.slug).toBe("sub-agents");
    expect(subtabBySlug("agency", "analytics", "money")?.label).toBe("The money");
    expect(subtabBySlug("agency", "command-center", "nope")).toBeNull();
    expect(subtabBySlug("agency", "client-support", "anything")).toBeNull();
  });

  it("subtabPath builds ${root}/{account}/{branch}/{sub}", () => {
    expect(subtabPath("agency", "3855", "command-center", "systems-check"))
      .toBe("/agency/3855/command-center/systems-check");
    expect(subtabPath("agency", "42", "growth", "funnels")).toBe("/agency/42/growth/funnels");
  });
});

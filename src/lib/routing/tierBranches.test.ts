import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { TIER_TREES, SOLO_BRANCHES, AGENCY_BRANCHES, SUB_ACCOUNT_BRANCHES, treeForTier, defaultBranchSlug, branchBySlug, branchByKey, branchPath, defaultSubtabSlug, subtabBySlug, subtabByKey, subtabPath, type RouteTierKey, OPERATOR_BRANCHES, leafPath, type Branch } from "./tierBranches";

const TIERS: RouteTierKey[] = ["operator", "agency", "enterprise", "solo", "sub_account"];

describe("TIER_BRANCHES registry (§65 §11)", () => {
  it("exposes the approved Relationships and Clients secondary matrices", () => {
    expect(branchBySlug("solo", "clients")?.subtabs?.filter((tab) => !tab.hidden).map((tab) => tab.label)).toEqual([
      "People", "Conversations", "Calendar", "Portal",
    ]);
    expect(branchBySlug("sub_account", "clients")?.subtabs?.filter((tab) => !tab.hidden).map((tab) => tab.label)).toEqual([
      "People", "Conversations", "Calendar", "Portal",
    ]);
    expect(branchBySlug("agency", "clients")?.subtabs?.filter((tab) => !tab.hidden).map((tab) => tab.label)).toEqual([
      "People", "Conversations", "Calendar", "Segments",
    ]);
    expect(branchBySlug("enterprise", "clients")?.subtabs?.filter((tab) => !tab.hidden).map((tab) => tab.label)).toEqual([
      "People", "Conversations", "Calendar", "Segments",
    ]);
  });
  it("keeps the Sub-account compatibility tree on shared AgencyApp screen keys", () => {
    expect(TIER_TREES.sub_account.branches).toBe(SUB_ACCOUNT_BRANCHES);
    expect(TIER_TREES.solo.branches).toBe(SOLO_BRANCHES);
    // Distinct root prefix (§3 shared shell, §65 mental-model label) — same shell,
    // different address.
    expect(TIER_TREES.sub_account.root).toBe("/business");
    expect(TIER_TREES.solo.root).toBe("/solo");
    expect(branchBySlug("sub_account", "clients")?.key).toBe(branchBySlug("agency", "clients")?.key);
    expect(branchBySlug("sub_account", "clients")?.label).toBe("Clients");
    expect(branchBySlug("agency", "clients")?.label).toBe("Relationships");
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
    expect(count("clients")).toBe(7);
    expect(count("calendar")).toBe(6);
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

describe("Solo sub-tab tree (§65 3-level, solo screens verified 2026-08-18)", () => {
  it("makes Settings the one visible Solo owner with the approved seven destinations", () => {
    const settings = branchBySlug("solo", "settings");
    expect(settings?.key).toBe("settings");
    expect(settings?.subtabs?.map(({ slug, label }) => [slug, label])).toEqual([
      ["setup", "Setup"],
      ["team", "Team"],
      ["connections", "Connections"],
      ["notifications", "Notifications"],
      ["security-data", "Security & data"],
      ["vault", "Vault"],
      ["billing", "Billing"],
    ]);
  });

  it("sub-tab slugs are unique + url-safe within each Solo branch; keys unique too", () => {
    for (const b of SOLO_BRANCHES) {
      if (!b.subtabs) continue;
      const slugs = b.subtabs.map((s) => s.slug);
      const keys = b.subtabs.map((s) => s.key);
      expect(new Set(slugs).size, `dup sub-slug in solo/${b.slug}`).toBe(slugs.length);
      expect(new Set(keys).size, `dup sub-key in solo/${b.slug}`).toBe(keys.length);
      for (const s of slugs) expect(s, `unsafe solo sub-slug ${s}`).toMatch(/^[a-z0-9-]+$/);
    }
  });

  it("no Solo sub-tab slug collides with its own branch slug (avoids /x/x)", () => {
    for (const b of SOLO_BRANCHES) {
      for (const s of b.subtabs ?? []) {
        expect(s.slug, `solo ${b.slug}/${s.slug} collides`).not.toBe(b.slug);
      }
    }
  });

  it("Solo branches with NO sub-tabs are exactly Trust Compass", () => {
    // Verified live: solo/compass.tsx has a full-page department drilldown (no sub-tab strip).
    // Vault is now an owner-locked Settings destination, not a parallel branch.
    const noSub = SOLO_BRANCHES.filter((b) => !b.subtabs).map((b) => b.slug).sort();
    expect(noSub).toEqual(["trust-compass"]);
    expect(SOLO_BRANCHES.filter((b) => b.subtabs).length).toBe(9);
  });

  it("verified Solo counts + first-is-default per the live-screen audit", () => {
    const count = (slug: string) => branchBySlug("solo", slug)?.subtabs?.length ?? 0;
    expect(count("command-center")).toBe(4);
    expect(count("paige")).toBe(6);
    expect(count("automations")).toBe(3);
    expect(count("clients")).toBe(6);
    expect(count("calendar")).toBe(6);
    expect(count("growth")).toBe(7);
    expect(count("analytics")).toBe(6);
    expect(count("marketplace")).toBe(4);
    expect(count("settings")).toBe(7);
    const total = SOLO_BRANCHES.reduce((n, b) => n + (b.subtabs?.length ?? 0), 0);
    expect(total).toBe(49);
    // first sub-tab is the screen's default (bare branch renders it).
    expect(defaultSubtabSlug("solo", "command-center")).toBe("overview");
    expect(defaultSubtabSlug("solo", "paige")).toBe("chat");
    expect(defaultSubtabSlug("solo", "settings")).toBe("setup");
    expect(defaultSubtabSlug("solo", "trust-compass")).toBeNull();
  });

  it("subtabBySlug / subtabByKey round-trip across several Solo branches", () => {
    const roundTrip = (branch: string, slug: string, key: string) => {
      expect(subtabBySlug("solo", branch, slug)?.key, `solo/${branch}/${slug}`).toBe(key);
      expect(subtabByKey("solo", branch, key)?.slug, `solo/${branch} key ${key}`).toBe(slug);
    };
    roundTrip("command-center", "systems-check", "sys");
    roundTrip("paige", "knowledge", "know");
    roundTrip("automations", "library", "lib");
    roundTrip("clients", "pipeline", "pipe");
    expect(subtabBySlug("solo", "calendar", "booking-links")?.key).toBe("booking");
    expect(subtabByKey("solo", "calendar", "booking")?.slug).toBe("booking-pages");
    roundTrip("growth", "overview", "ov");
    roundTrip("analytics", "market-watch", "mkt");
    roundTrip("settings", "connections", "connections");
    roundTrip("settings", "security-data", "security-data");
    roundTrip("settings", "billing", "billing");
    expect(subtabBySlug("solo", "analytics", "money")?.label).toBe("The money");
    expect(subtabBySlug("solo", "paige", "nope")).toBeNull();
    expect(subtabBySlug("solo", "trust-compass", "anything")).toBeNull();
  });

  it("subtabPath builds the Solo (and /business) 3-level path", () => {
    expect(subtabPath("solo", "42", "command-center", "systems-check"))
      .toBe("/solo/42/command-center/systems-check");
    expect(subtabPath("solo", "3855", "growth", "funnels")).toBe("/solo/3855/growth/funnels");
  });

  it("keeps the approved client and relationship matrices distinct", () => {
    const soloClients = branchBySlug("solo", "clients")?.subtabs?.map((s) => s.slug) ?? [];
    expect(soloClients).toEqual([
      "people", "conversations", "calendar", "portal", "pipeline", "delivery",
    ]);
    expect(branchBySlug("agency", "clients")?.subtabs?.map((s) => s.slug))
      .toEqual(["people", "conversations", "calendar", "segments", "portal", "sub-accounts", "pipelines"]);
    // The retired Solo-only Routing URL remains a booking-page compatibility alias.
    expect(subtabBySlug("solo", "calendar", "routing")?.key).toBe("booking");
    expect(subtabBySlug("agency", "calendar", "routing")).toBeNull();
    // Marketplace: curated + publish are agency-only.
    expect(subtabBySlug("agency", "marketplace", "curated")).not.toBeNull();
    expect(subtabBySlug("solo", "marketplace", "curated")).toBeNull();
    expect(subtabBySlug("solo", "marketplace", "publish")).toBeNull();
    // Public Presence remains Analytics-owned and banking is not a Solo Settings destination.
    expect(subtabBySlug("solo", "settings", "presence")).toBeNull();
    expect(subtabBySlug("solo", "settings", "banking")).toBeNull();
    // Agency's legacy Integrations branch remains unchanged; Solo has one Settings owner.
    expect(branchBySlug("agency", "integrations")?.subtabs).toBeUndefined();
    expect(branchBySlug("solo", "integrations")).toBeNull();
  });

  it("keeps the shipped Solo client-portal address as an alias of canonical Portal", () => {
    expect(subtabBySlug("solo", "clients", "client-portal")?.key).toBe("portal");
    expect(subtabByKey("solo", "clients", "portal")?.slug).toBe("portal");
  });

  it("REGRESSION — Solo sub-tab KEYS are Solo's own, never the agency keys (dead-route guard)", () => {
    // Solo's screens switch on their OWN abbreviated `useState` keys. "Normalizing" any of
    // these to its agency twin compiles fine and silently produces a dead route — the exact
    // bug class this assertion exists to catch (§13). Left = shared slug, right = the AGENCY
    // key that must NOT appear on the Solo side.
    const perTierKeys: Array<[string, string, string, string]> = [
      // [branch, shared slug, solo key, agency key]
      ["command-center", "systems-check", "sys", "systems"],
      ["paige", "knowledge", "know", "knowledge"],
      ["paige", "sub-agents", "sub", "agents"],
      ["paige", "actions", "act", "actions"],
      ["paige", "paige-team", "team", "pteam"],
      ["automations", "library", "lib", "library"],
      ["calendar", "schedule", "calendar", "calendar"],
      ["calendar", "requests", "agenda", "agenda"],
      ["calendar", "settings", "connections", "connections"],
      ["growth", "overview", "ov", "overview"],
      ["growth", "brand-kit", "brand", "brand"], // same on both — asserted below as equal
      ["analytics", "retention", "ret", "retain"],
      ["analytics", "decisions", "dec", "decide"],
      ["analytics", "market-watch", "mkt", "market"],
    ];
    for (const [branch, slug, soloKey, agencyKey] of perTierKeys) {
      expect(subtabBySlug("solo", branch, slug)?.key, `solo ${branch}/${slug}`).toBe(soloKey);
      expect(subtabBySlug("agency", branch, slug)?.key, `agency ${branch}/${slug}`).toBe(agencyKey);
      if (soloKey !== agencyKey) {
        // The whole point: the shared slug resolves to DIFFERENT internal keys per tier.
        expect(subtabBySlug("solo", branch, slug)?.key).not.toBe(agencyKey);
      }
    }
    // Solo `growth/brand-kit` legitimately shares the agency key — locked so a future
    // "consistency" sweep can't cite it as precedent for aligning the others.
    expect(subtabBySlug("solo", "growth", "brand-kit")?.key).toBe("brand");
    expect(subtabBySlug("agency", "growth", "brand-kit")?.key).toBe("brand");
  });
});

/**
 * §39 peer-gate finding #1 (PR #533) — the registry↔SCREEN contract.
 *
 * Every other test in this file reads the registry and asserts what the registry
 * says, which cannot catch the failure mode that actually matters: the registry
 * drifting from the tab strip the screen really renders. And there is no
 * compensating control — all 11 Solo screens carry `// @ts-nocheck`, so a green
 * `tsc` proves NOTHING about them.
 *
 * The regression this exists to catch: someone adds a tab to a Solo screen's
 * strip (or renames a key) and forgets the registry. `tsc` stays green, every
 * registry-only test stays green, and the new tab is a silent no-op in
 * production — `setKey` finds no slug and falls back to local state that URL
 * mode never reads.
 *
 * So this reads the actual screen SOURCE. It anchors on each screen's
 * `useSubtabRoute("solo", "<branch>", …)` call and parses the tab strip that
 * immediately follows it — which is precisely the routed component's own strip,
 * never a nested/sibling one (several files carry more than one `const tabs=`:
 * `conversations.tsx` also holds the nested Conversations strip, `paigehub.tsx`
 * the SubAgents and Skills consoles, `CommandCenter.tsx` the inner approvals
 * filter). Then it asserts set-AND-order equality with the registry.
 */
describe("Solo sub-tab registry ↔ screen source contract (§39 #1)", () => {
  const SCREEN_FOR_BRANCH: Record<string, string> = {
    "command-center": "src/solo/CommandCenter.tsx",
    paige: "src/solo/paigehub.tsx",
    automations: "src/solo/automations-build.tsx",
    calendar: "src/pages/admin/CalendarAdmin.tsx",
    growth: "src/solo/growth2.tsx",
    analytics: "src/solo/analytics2.tsx",
    marketplace: "src/solo/marketplace.tsx",
    settings: "src/solo/settings.tsx",
  };

  /** Slice the balanced `[...]` starting at `open`, so nested brackets can't truncate it. */
  function balancedArray(src: string, open: number): string {
    let depth = 0;
    for (let i = open; i < src.length; i++) {
      if (src[i] === "[") depth++;
      else if (src[i] === "]" && --depth === 0) return src.slice(open, i + 1);
    }
    throw new Error(`unbalanced array at ${open}`);
  }

  /** The tab keys the SCREEN actually renders for `branchSlug`, read from source. */
  function screenKeys(file: string, branchSlug: string): string[] {
    const src = readFileSync(resolve(process.cwd(), file), "utf8");
    if (branchSlug === "calendar") {
      // Settings is an explicitly Solo-Clients-owned conditional view. It is
      // routed by the canonical adapter's query state so the shared Solo /
      // Sub-account address registry remains unchanged for every other tier.
      return [...src.matchAll(/<TabsTrigger\s+value=["']([a-z-]+)["']/g)]
        .map((match) => match[1])
        .filter((key) => key !== "settings");
    }
    // Anchor on the routed hook call (tolerant of spacing after commas).
    const hook = new RegExp(
      `useSubtabRoute\\(\\s*["']solo["']\\s*,\\s*["']${branchSlug}["']`,
    ).exec(src);
    if (!hook) throw new Error(`no useSubtabRoute("solo","${branchSlug}") in ${file}`);
    const after = src.slice(hook.index);
    // The strip is either `const tabs=[…]` or an inline `tabs={[…]}` (integrations).
    const decl = after.search(/const\s+tabs\s*=\s*\[/);
    const inline = after.search(/tabs=\{\[/);
    const candidates = [decl, inline].filter((i) => i >= 0);
    if (!candidates.length) throw new Error(`no tab strip after the hook in ${file}`);
    const start = Math.min(...candidates);
    const arr = balancedArray(after, after.indexOf("[", start));
    // Each entry is a tuple whose FIRST element is the key: ['roster','Roster',…].
    return [...arr.matchAll(/\[\s*['"]([A-Za-z0-9_-]+)['"]/g)].map((m) => m[1]);
  }

  for (const branch of SOLO_BRANCHES.filter((b) => b.subtabs?.length && b.slug !== "clients")) {
    it(`${branch.slug}: registry keys match the rendered strip, in order`, () => {
      const file = SCREEN_FOR_BRANCH[branch.slug];
      expect(file, `no screen mapped for solo branch ${branch.slug}`).toBeTruthy();
      expect(screenKeys(file, branch.slug)).toEqual(
        branch.subtabs!.filter((subtab) => !subtab.hidden).map((subtab) => subtab.key),
      );
    });
  }

  it("covers every Solo branch that declares sub-tabs", () => {
    // Guards the map itself: a future branch gaining sub-tabs without a screen
    // entry here would otherwise silently skip the contract check above.
    const declared = SOLO_BRANCHES.filter((b) => b.subtabs?.length && b.slug !== "clients").map((b) => b.slug);
    expect(declared.sort()).toEqual(Object.keys(SCREEN_FOR_BRANCH).sort());
  });
});

/**
 * OPERATOR tree (§65 R4 substrate) — authored from Claude Design's Super Admin pack.
 * These guard the ADDRESSING CONTRACT, not any UI: a future edit must not silently
 * drop a route, collide a slug, or break the account-less path shape.
 */
describe("OPERATOR_BRANCHES (Super Admin pack substrate)", () => {
  const leaves = (b: Branch) =>
    (b.subtabs ?? []).flatMap((s) => (s.subtabs?.length ? s.subtabs : [s]));

  it("carries all 78 addressable tabs from the design registry", () => {
    const total = OPERATOR_BRANCHES.reduce((n, b) => n + leaves(b).length, 0);
    expect(total).toBe(78);
  });

  it("every slug at every level is a single url-safe segment", () => {
    const seg = /^[a-z0-9-]+$/;
    for (const b of OPERATOR_BRANCHES) {
      expect(b.slug, `branch ${b.slug}`).toMatch(seg);
      for (const s of b.subtabs ?? []) {
        expect(s.slug, `${b.slug}/${s.slug}`).toMatch(seg);
        for (const l of s.subtabs ?? []) {
          expect(l.slug, `${b.slug}/${s.slug}/${l.slug}`).toMatch(seg);
        }
      }
    }
  });

  it("sibling slugs are unique at every level", () => {
    const uniq = (xs: string[], where: string) =>
      expect(new Set(xs).size, `dup in ${where}`).toBe(xs.length);
    uniq(OPERATOR_BRANCHES.map((b) => b.slug), "operator branches");
    for (const b of OPERATOR_BRANCHES) {
      uniq((b.subtabs ?? []).map((s) => s.slug), b.slug);
      for (const s of b.subtabs ?? []) uniq((s.subtabs ?? []).map((l) => l.slug), `${b.slug}/${s.slug}`);
    }
  });

  it("is account-less: operator paths carry no account segment", () => {
    // §65 matrix row 1 — the operator is tenant-less. Passing an account must not leak it
    // into the URL, which is why TIER_TREES.operator sets accountSegment:false.
    expect(branchPath("operator", "IGNORED", "fleet")).toBe("/operator/fleet");
    expect(subtabPath("operator", "IGNORED", "fleet", "tenants")).toBe("/operator/fleet/tenants");
    expect(leafPath("operator", "IGNORED", "settings", "team", "roles")).toBe(
      "/operator/settings/team/roles",
    );
    // Tenant tiers are unchanged — the account segment still lands.
    expect(branchPath("agency", "1924546", "command-center")).toBe("/agency/1924546/command-center");
  });

  it("only the operator settings branch uses the third level", () => {
    const withThird = OPERATOR_BRANCHES.filter((b) =>
      (b.subtabs ?? []).some((s) => s.subtabs?.length),
    ).map((b) => b.slug);
    expect(withThird).toEqual(["settings"]);
    for (const tier of ["agency", "solo", "sub_account", "enterprise"] as const) {
      for (const b of TIER_TREES[tier].branches) {
        for (const s of b.subtabs ?? []) expect(s.subtabs, `${tier}/${b.slug}/${s.slug}`).toBeUndefined();
      }
    }
  });
});

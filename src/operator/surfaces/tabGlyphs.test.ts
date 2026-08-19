import { describe, it, expect } from "vitest";
import { OPERATOR_BRANCHES, type SubTab } from "@/lib/routing/tierBranches";
import { TAB_GLYPH, tabGlyph } from "./tabGlyphs";

/**
 * Every addressable operator sub-tab, as its route path minus the `/operator/` prefix — the exact
 * shape TAB_GLYPH keys on. A sub-tab that itself carries sub-tabs (the five settings groups) is a
 * container, not a destination, so only its leaves are emitted.
 */
function subtabPaths(): string[] {
  const out: string[] = [];
  for (const branch of OPERATOR_BRANCHES) {
    for (const sub of branch.subtabs ?? []) {
      const leaves: SubTab[] | undefined = sub.subtabs;
      if (leaves?.length) {
        for (const leaf of leaves) out.push(`${branch.slug}/${sub.slug}/${leaf.slug}`);
      } else {
        out.push(`${branch.slug}/${sub.slug}`);
      }
    }
  }
  return out;
}

/**
 * The six sub-tabs CD's `TABS` map has no entry for. Named here so a later "fill in the blanks"
 * pass has to change this list deliberately rather than quietly inventing a mark (§13/§58).
 */
const NO_GLYPH_IN_PACK = [
  "fleet/prospects",
  "growth/brand-kit",
  "comms/templates",
  "comms/sent-log",
  "settings/integrations/available",
  "settings/vault/vendors",
];

describe("TAB_GLYPH — CD's operator tab-strip marks", () => {
  it("the operator tree still has the 78 sub-tabs this map was built against", () => {
    const paths = subtabPaths();
    expect(paths.length).toBe(78);
    expect(new Set(paths).size).toBe(78);
  });

  it("no orphans — every key addresses a real route in OPERATOR_BRANCHES", () => {
    const valid = new Set(subtabPaths());
    const orphans = Object.keys(TAB_GLYPH).filter((k) => !valid.has(k));
    expect(orphans, `TAB_GLYPH keys with no operator route: ${orphans.join(", ")}`).toEqual([]);
  });

  it("covers 72 of the 78 sub-tabs; the other 6 are absent, never a stand-in", () => {
    const paths = subtabPaths();
    const covered = paths.filter((p) => p in TAB_GLYPH);
    const uncovered = paths.filter((p) => !(p in TAB_GLYPH));

    // The report, locked as an assertion so it cannot drift unnoticed.
    expect(covered.length).toBe(72);
    expect(uncovered.length).toBe(6);
    expect(uncovered.sort()).toEqual([...NO_GLYPH_IN_PACK].sort());
    expect(Object.keys(TAB_GLYPH).length).toBe(72);
  });

  it("every glyph is a real mark, never an empty string or a space", () => {
    for (const [path, glyph] of Object.entries(TAB_GLYPH)) {
      expect(glyph.trim(), `empty glyph at ${path}`).not.toBe("");
      expect(glyph.length, `suspiciously long glyph at ${path}`).toBeLessThanOrEqual(2);
    }
  });

  it("tabGlyph() resolves two-segment branches and the settings third level", () => {
    expect(tabGlyph("fleet", "systems-check")).toBe("◐");
    expect(tabGlyph("fleet", "tenants")).toBe("◎");
    expect(tabGlyph("settings", "governance", "audit-log")).toBe("▤");
    expect(tabGlyph("settings", "setup", "api-mcp")).toBe("⚯");
  });

  /**
   * The arity trap, locked. `leafSlug` is optional, so the two-argument call on a THIRD-level
   * settings leaf compiles and returns `undefined` — 16 marks that silently render as nothing
   * (§32: shipped, correct, and invisible). These two tests walk the real registry so the
   * correct shape is proven for every settings leaf and the wrong shape is proven wrong,
   * rather than either being trusted.
   */
  it("every settings leaf that CD marks resolves via the THREE-argument call", () => {
    const settings = OPERATOR_BRANCHES.find((b) => b.slug === "settings");
    expect(settings, "operator tree lost its settings branch").toBeTruthy();

    let resolved = 0;
    for (const group of settings!.subtabs ?? []) {
      for (const leaf of group.subtabs ?? []) {
        const path = `settings/${group.slug}/${leaf.slug}`;
        const viaThree = tabGlyph("settings", group.slug, leaf.slug);
        expect(viaThree, `three-arg call disagrees with TAB_GLYPH at ${path}`).toBe(
          TAB_GLYPH[path],
        );
        if (viaThree !== undefined) resolved += 1;
      }
    }
    // Every settings row in the map, and nothing invented on top of it.
    const mapped = Object.keys(TAB_GLYPH).filter((k) => k.startsWith("settings/")).length;
    expect(resolved).toBe(mapped);
    expect(resolved).toBe(16);
  });

  it("the TWO-argument call on a settings leaf misses — the trap this API can fall into", () => {
    const settings = OPERATOR_BRANCHES.find((b) => b.slug === "settings");
    for (const group of settings!.subtabs ?? []) {
      for (const leaf of group.subtabs ?? []) {
        expect(
          tabGlyph("settings", leaf.slug),
          `two-arg call on settings/${group.slug}/${leaf.slug} must NOT resolve — if this ` +
            `starts passing, the key shape changed and OperatorApp's strip needs re-checking`,
        ).toBeUndefined();
      }
    }
  });

  it("tabGlyph() returns undefined rather than a substitute where CD has no mark", () => {
    expect(tabGlyph("fleet", "prospects")).toBeUndefined();
    expect(tabGlyph("comms", "sent-log")).toBeUndefined();
    expect(tabGlyph("settings", "vault", "vendors")).toBeUndefined();
    // And for a path that is not a route at all.
    expect(tabGlyph("fleet", "not-a-tab")).toBeUndefined();
  });
});

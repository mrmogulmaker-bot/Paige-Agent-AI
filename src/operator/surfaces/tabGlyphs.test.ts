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

  it("tabGlyph() returns undefined rather than a substitute where CD has no mark", () => {
    expect(tabGlyph("fleet", "prospects")).toBeUndefined();
    expect(tabGlyph("comms", "sent-log")).toBeUndefined();
    expect(tabGlyph("settings", "vault", "vendors")).toBeUndefined();
    // And for a path that is not a route at all.
    expect(tabGlyph("fleet", "not-a-tab")).toBeUndefined();
  });
});

import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { OPERATOR_SLOTS, OPERATOR_VIEW_COUNT, findSlot, viewSlug } from "./operatorIA";

/**
 * The IA is a MIRROR of the design pack, so the test reads the PACK — not a second copy of the
 * expected values. A test that restated the six slots inline would pass forever while the pack
 * moved underneath it, which is the same defect class as a harness handed a fixtured slot list:
 * it can only assert what it was given.
 */
const PACK = path.resolve(
  __dirname, "../../../docs/design-references/cd-packs/super-admin-shell-v3/paige-ia.js",
);

function packSlots(): { id: string; views: string[] }[] {
  const src = fs.readFileSync(PACK, "utf8");
  const dest = src.slice(src.indexOf("P.DEST = {"));
  const ids = ["fleet", "relationships", "campaigns", "marketplace", "analytics", "settings"];
  return ids.map((id) => {
    const at = dest.search(new RegExp(`\\n    ${id}:\\s*\\{`));
    const seg = dest.slice(at, at + 4000);
    const m = seg.match(/views:\s*\[([^\]]*)\]/);
    const views = m
      ? m[1].split(",").map((v) => v.trim().replace(/^'|'$/g, "")).filter(Boolean)
      : [];
    return { id, views };
  });
}

describe("the operator IA mirrors the design pack", () => {
  const pack = packSlots();

  it("carries exactly six slots, in the pack's order", () => {
    expect(OPERATOR_SLOTS.map((s) => s.id)).toEqual(pack.map((p) => p.id));
  });

  it("carries the pack's views, verbatim, for every slot", () => {
    for (const p of pack) {
      const ours = OPERATOR_SLOTS.find((s) => s.id === p.id);
      expect(ours, `slot ${p.id} missing from our IA`).toBeDefined();
      expect(ours!.views, `views drifted on ${p.id}`).toEqual(p.views);
    }
  });

  it("totals 32 views, derived rather than typed beside the list", () => {
    expect(OPERATOR_VIEW_COUNT).toBe(pack.reduce((n, p) => n + p.views.length, 0));
    expect(OPERATOR_VIEW_COUNT).toBe(32);
  });

  /**
   * Absence copy is the DESIGN SIDE'S. This parses `absence-copy.md` from the pack rather than
   * quoting it, which is the same contract shape as the slots test above — nothing here can drift
   * from the source, because nothing here restates it.
   *
   * It deliberately does NOT judge the words. An earlier version required a minimum body length and
   * banned "coming soon" — reasonable constraints on a CC draft, and exactly the wrong thing to aim
   * at design's copy: it would fail a deliberately terse absence and make an implementation test the
   * arbiter of how a surface reads. Copy is surface; the surface rules it. What is ours to assert is
   * only that the copy arrives unedited.
   */
  it("every unbuilt slot carries the pack's absence copy, unedited", () => {
    const doc = fs.readFileSync(
      path.resolve(__dirname, "../../../docs/design-references/cd-packs/super-admin-shell-v3/absence-copy.md"),
      "utf8",
    );
    // Sections are `## <Slot>`, with the title in backticks and the body as a blockquote.
    const given = new Map<string, { title: string; body: string }>();
    for (const m of doc.matchAll(/\n## (\w+)\n([\s\S]*?)(?=\n## |\n---\n## |$)/g)) {
      const slot = m[1].toLowerCase();
      const title = m[2].match(/\*\*absenceTitle\*\*\s*—\s*`([^`]+)`/)?.[1];
      const quoted = [...m[2].matchAll(/^>\s?(.*)$/gm)].map((q) => q[1]).join(" ");
      if (!title || !quoted.trim()) continue;
      // The doc marks table names in backticks for readability; the surface renders plain text.
      const body = quoted.replace(/`/g, "").replace(/\s+/g, " ").trim();
      given.set(slot, { title, body });
    }
    expect(given.size, "parsed no absence sections — the doc's shape changed").toBeGreaterThan(0);

    for (const slot of OPERATOR_SLOTS) {
      const g = given.get(slot.id);
      if (!g) {
        expect(slot.absence, `${slot.id} has absence copy the pack does not define`).toBeUndefined();
        continue;
      }
      expect(slot.absence, `${slot.id} lost its absence`).toBeDefined();
      expect(slot.absence!.title, `${slot.id} absence title edited`).toBe(g.title);
      expect(slot.absence!.body.replace(/\s+/g, " ").trim(), `${slot.id} absence body edited`).toBe(g.body);
    }
  });

  it("a bad key returns null rather than blanking the shell", () => {
    expect(findSlot("nope")).toBeNull();
    expect(findSlot(undefined)).toBeNull();
    expect(findSlot("fleet")?.label).toBe("Fleet");
  });

  it("view slugs are router-safe and stable", () => {
    expect(viewSlug("Systems check")).toBe("systems-check");
    expect(viewSlug("Platform health")).toBe("platform-health");
    expect(viewSlug("Setup")).toBe("setup");
  });
});

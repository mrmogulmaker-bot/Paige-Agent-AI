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

  it("every unbuilt slot carries an absence, and every absence says what and why", () => {
    for (const s of OPERATOR_SLOTS) {
      if (!s.absence) continue;
      expect(s.absence.title.length, `${s.id} absence title too thin`).toBeGreaterThan(10);
      // §13: an absence explains. A bare "coming soon" is the thing this replaces.
      expect(s.absence.body.length, `${s.id} absence body too thin`).toBeGreaterThan(80);
      expect(s.absence.body).not.toMatch(/coming soon|under construction|stay tuned/i);
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

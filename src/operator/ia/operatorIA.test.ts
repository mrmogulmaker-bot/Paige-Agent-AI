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
   * Absence copy is the DESIGN SIDE'S, lifted verbatim. So this asserts only what is ours to
   * assert — that a slot with no destination actually carries copy, and that it is the copy we
   * were given rather than something drifted or re-edited here.
   *
   * It deliberately does NOT judge the words. An earlier version of this test required a minimum
   * body length and banned "coming soon" — sensible constraints on a CC draft, and exactly the
   * wrong thing to point at design's copy: it would fail a deliberately terse absence and make an
   * implementation test the arbiter of how a surface reads. Copy is surface; the surface rules it.
   *
   * When `absence-copy.md` ships in the pack, replace the inline expectations below with a parse of
   * that file — the same contract shape as the slots test above, which reads the pack rather than
   * restating it. It is quoted here only because it arrived in review rather than as a delivery.
   */
  it("every unbuilt slot carries the absence copy it was given, unedited", () => {
    const GIVEN: Record<string, { title: string; body: string }> = {
      relationships: {
        title: "Drawn, not wired",
        body: "People, Conversations, Segments and Calendar are specified and their contract is fixed. None of the four reads live data yet: the surfaces exist, the joins behind them do not. Nothing here is waiting on a decision — only on the wiring.",
      },
      campaigns: {
        title: "Substrate exists · one seam missing",
        body: "Catalog and Sales sit on tables that already ship — tenant_products, tenant_prices, tenant_orders — so this slot is a wiring job rather than a build. One seam is genuinely absent: an order cannot name a campaign. utm_campaign lives on analytics_events and referral_clicks, never on the order, so send → click → order does not join. Until it does, attribution is recorded by hand and Sales reads without it.",
      },
    };
    for (const slot of OPERATOR_SLOTS) {
      const given = GIVEN[slot.id];
      if (!given) {
        expect(slot.absence, `${slot.id} has an absence with no copy on record`).toBeUndefined();
        continue;
      }
      expect(slot.absence, `${slot.id} lost its absence`).toBeDefined();
      expect(slot.absence!.title, `${slot.id} absence title edited`).toBe(given.title);
      expect(slot.absence!.body, `${slot.id} absence body edited`).toBe(given.body);
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

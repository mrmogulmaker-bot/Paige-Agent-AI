import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";

import OperatorPanel from "./OperatorPanel";
import { bespokeSlots } from "./bespokeSlots";
import { getPanelSpec } from "./panelSpecs";

/**
 * These six tabs shipped once as imports that were never rendered — the components existed,
 * `OperatorSurface` fell through to the generic registry, and every one of them showed a
 * "not connected yet" paragraph where CD draws a real surface. Nothing caught it, because a
 * component that is imported and unused still type-checks and still lints.
 *
 * So the dispatch is pinned here by NAME. A future edit that drops a route, or renames the
 * block a slot targets, fails this file instead of silently reverting the surface.
 */
describe("bespoke CD surfaces", () => {
  /** route → the block whose body that route's real surface replaces. */
  const WIRED: ReadonlyArray<[string, string | null, string | null, string]> = [
    ["calendar", "month", null, "month-grid"],
    ["calendar", "settings", null, "platform-hours"],
    ["marketplace", "submissions", null, "review-cards"],
    ["support", "inbox", null, "thread"],
    ["comms", "outbound", null, "compose"],
    ["settings", "integrations", "connected", "grid"],
  ];

  it.each(WIRED)("%s/%s/%s dispatches a real surface into %s", (branch, sub, leaf, blockId) => {
    const slots = bespokeSlots(branch, sub, leaf);
    expect(slots, `${branch}/${sub} lost its bespoke surface`).toBeDefined();
    expect(Object.keys(slots!)).toEqual([blockId]);
    expect(slots![blockId]).toBeTruthy();
  });

  it("every slot targets a block the spec actually has", () => {
    // A slot keyed to a block id that no longer exists is silently ignored by the renderer,
    // which would put the tab straight back to the stand-in with nothing failing. Catch it here.
    for (const [branch, sub, leaf, blockId] of WIRED) {
      const spec = getPanelSpec(branch, sub!, leaf ?? undefined);
      expect(spec, `${branch}/${sub} has no panel spec`).toBeTruthy();
      const ids = spec!.blocks.map((b) => b.id);
      expect(ids, `${branch}/${sub} has no block "${blockId}"`).toContain(blockId);
    }
  });

  it("leaves every other tab to the generic panel", () => {
    expect(bespokeSlots("fleet", "tenants", null)).toBeUndefined();
    expect(bespokeSlots("revenue", "plans", null)).toBeUndefined();
    // Discover is deliberately NOT slotted: its panel already renders CD's real shelves, and
    // an empty MarketplaceStore would replace them with one "not connected" plate.
    expect(bespokeSlots("marketplace", "discover", null)).toBeUndefined();
  });

  /**
   * The seam itself, end to end. A populated map proves the dispatch exists; only a render
   * proves the panel actually SWAPS the body — which is the half that was missing before.
   */
  it.each(WIRED)("%s/%s/%s renders the surface in place of the stand-in", (branch, sub, leaf, blockId) => {
    const spec = getPanelSpec(branch, sub!, leaf ?? undefined)!;
    const block = spec.blocks.find((b) => b.id === blockId)!;
    // Every one of these targets a block the registry draws as the "not connected" stand-in.
    expect(block.body.kind).toBe("notWired");

    const withSlot = renderToStaticMarkup(
      <MemoryRouter>
        <OperatorPanel spec={spec} slots={bespokeSlots(branch, sub, leaf)} />
      </MemoryRouter>,
    );
    const without = renderToStaticMarkup(
      <MemoryRouter>
        <OperatorPanel spec={spec} />
      </MemoryRouter>,
    );
    expect(withSlot).not.toEqual(without);
    // The stand-in's own words must be gone from the slotted block.
    if (block.body.kind === "notWired" && block.body.what) {
      expect(without).toContain(block.body.what);
      expect(withSlot).not.toContain(block.body.what);
    }
  });
});

import { describe, expect, it } from "vitest";
import { OPERATOR_BRANCHES } from "@/lib/routing/tierBranches";
import { assertPanelSpecCoverage, getPanelSpec, operatorPanelKeys } from "./panelSpecs";

/**
 * The console addresses 78 tabs. A tab with no copy renders the honest stand-in, which is safe
 * but is NOT the design — so coverage is asserted rather than assumed, and a branch added to
 * `OPERATOR_BRANCHES` without copy fails here instead of surfacing as a blank frame in front of
 * the operator (§18: the tree has one home, and this proves the registry still matches it).
 */
describe("operator panel specs", () => {
  it("covers every addressable tab, with nothing orphaned", () => {
    const { missing, orphaned } = assertPanelSpecCoverage();
    expect({ missing, orphaned }).toEqual({ missing: [], orphaned: [] });
  });

  it("addresses the whole operator tree", () => {
    const branches = OPERATOR_BRANCHES.length;
    expect(branches).toBeGreaterThan(0);
    expect(operatorPanelKeys().length).toBe(78);
  });

  it("resolves a spec for every key, each with a title and at least one block", () => {
    for (const key of operatorPanelKeys()) {
      const [branch, sub, leaf] = key.split("/");
      const spec = getPanelSpec(branch, sub, leaf);
      expect(spec, key).not.toBeNull();
      expect(spec!.title.length, key).toBeGreaterThan(0);
      expect(spec!.blocks.length, key).toBeGreaterThan(0);
    }
  });
});

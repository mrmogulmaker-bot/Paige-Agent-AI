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

  /**
   * The regression that got the first attempt rejected by the owner: every tab resolved a spec,
   * every spec typechecked, every test passed — and all 78 rendered ONE empty "not connected"
   * card, because the registry only ever emitted the stand-in. Counting keys proved nothing.
   * So the bar is now CONTENT: no tab may fall back to the stand-in, and the KPI/block totals
   * are pinned. A port that quietly thins out fails here instead of in front of the owner.
   */
  /**
   * The regression that got the first attempt rejected: every tab resolved a spec, every spec
   * typechecked, every test passed — and all 78 rendered ONE empty "not connected" card,
   * because the registry only ever emitted the stand-in. Counting KEYS proved the tree was
   * addressed and proved nothing about what an operator sees. So the bar is CONTENT.
   *
   * (An earlier version of this test read `blocks[0].kind`, which does not exist — `kind` is on
   * `body` — so it silently passed everything. The measurement was itself a false green. Hence
   * the explicit `body.kind` below.)
   */
  /**
   * Tabs whose body is a purpose-built CD surface rather than a registry block. Their spec may
   * legitimately be a stand-in, because an operator never sees it. Two different mechanisms:
   *
   *  • The first three return their own component from `OperatorSurface` BEFORE the registry
   *    is consulted, so the spec is unreachable.
   *  • The rest DO render the registry panel — CD's eyebrow, title, KPIs and rail all come from
   *    it — and hand only the named block's body to a real surface via `bespokeSlots`. That
   *    wiring is pinned by name in `bespokeSlots.test.tsx`, which also proves the stand-in's
   *    words are genuinely gone from the render.
   *
   * Listed individually so each exemption is a decision on the record rather than a hole a
   * future stand-in could slip through.
   */
  const BESPOKE = new Set([
    "paige/chat", // WorkspaceSurface, hosting the live operator chat
    "paige/knowledge", // KnowledgeSurface
    "trust-compass/autonomy", // TrustCompass
    "calendar/month", // slot → CalendarMonth
    "support/inbox", // slot → SupportThread
    "settings/integrations/connected", // slot → IntegrationsGrid
  ]);

  it("renders CD's real panel content — no panel-rendered tab falls back to the stand-in", () => {
    const standIns: string[] = [];
    let kpis = 0;
    let blocks = 0;
    for (const key of operatorPanelKeys()) {
      const [branch, sub, leaf] = key.split("/");
      const spec = getPanelSpec(branch, sub, leaf);
      if (!spec) {
        standIns.push(`${key} (no spec)`);
        continue;
      }
      const isStandIn = spec.blocks.length === 1 && spec.blocks[0].body.kind === "notWired";
      if (isStandIn && !BESPOKE.has(key)) standIns.push(key);
      kpis += spec.kpis?.length ?? 0;
      blocks += spec.blocks.length;
    }
    expect(standIns).toEqual([]);
    // Pinned to what the port actually delivers. Raise these when a lot lands more of CD's
    // content; a DROP means someone thinned a panel and must say why.
    expect(kpis).toBeGreaterThanOrEqual(196);
    expect(blocks).toBeGreaterThanOrEqual(135);
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

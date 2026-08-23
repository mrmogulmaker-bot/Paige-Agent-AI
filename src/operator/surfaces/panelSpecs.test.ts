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
    "paige/chat", // PaigeAIChat (presentation="operator"), CD's rail/header around the live chat
    "paige/knowledge", // KnowledgeSurface
    "trust-compass/autonomy", // TrustCompass
    "calendar/month", // slot → CalendarMonth
    "support/inbox", // slot → SupportThread
    "settings/integrations/connected", // slot → IntegrationsGrid
  ]);

  /**
   * A third mechanism, and the strictest: a key the six-slot IA answers with a WHOLE surface, so
   * the registry is never consulted for it at all and it carries NO spec — not even a stand-in.
   *
   * `fleet/systems-check` became one on 2026-08-23. Its spec had been transcribed from the
   * RETIRED pack — "Thirteen categories, — checks. Is the machine running for everybody." — and
   * that copy exists nowhere in v3; the thirteen-category taxonomy it named is not the vocabulary
   * `paige_systems_check_registry.domain` uses either. The surface is now re-ported from v3, and
   * the unreachable spec was deleted rather than left to be grepped back in (§30).
   *
   * A key here is exempt from BOTH the stand-in bar and the every-key-resolves bar, because
   * "resolves a spec" is the wrong question for a key that has no panel.
   */
  const NO_PANEL = new Set([
    "fleet/systems-check", // viewSources: bespoke SystemsCheckSurface — the whole view, not a slot
  ]);

  it("renders CD's real panel content — no panel-rendered tab falls back to the stand-in", () => {
    const standIns: string[] = [];
    let kpis = 0;
    let blocks = 0;
    for (const key of operatorPanelKeys()) {
      const [branch, sub, leaf] = key.split("/");
      const spec = getPanelSpec(branch, sub, leaf);
      if (!spec) {
        if (!NO_PANEL.has(key)) standIns.push(`${key} (no spec)`);
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
    //
    // 2026-08-23, kpis 196 → 192 and blocks 135 → 133. The ratchet caught this and it is the
    // legitimate case it exists to force an explanation for: `fleet/systems-check` was carrying
    // a full spec — four KPIs, two blocks — transcribed from the RETIRED pack, on a key the
    // six-slot IA answers with a whole bespoke surface. It could never render. Deleting it
    // removes retired copy from the repo without removing anything an operator could see. Any
    // FURTHER drop is a real thinning and still has to be justified here.
    expect(kpis).toBeGreaterThanOrEqual(192);
    expect(blocks).toBeGreaterThanOrEqual(133);
  });

  it("resolves a spec for every key, each with a title and at least one block", () => {
    for (const key of operatorPanelKeys()) {
      if (NO_PANEL.has(key)) continue;
      const [branch, sub, leaf] = key.split("/");
      const spec = getPanelSpec(branch, sub, leaf);
      expect(spec, key).not.toBeNull();
      expect(spec!.title.length, key).toBeGreaterThan(0);
      expect(spec!.blocks.length, key).toBeGreaterThan(0);
    }
  });
});

import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { buildLaneCounts, buildActLabels, deriveLevel } from "./useSoloTrust";
import { DEPARTMENT_NAMES } from "./useSoloActivityFeed";

/**
 * The derivation is the whole point of this hook, so it is asserted against the REAL distribution
 * measured on prod 2026-09-03 rather than against a shape invented for the test. If the platform's
 * catalogue changes, these numbers are expected to change with it — what must not change is that
 * the value comes from rows instead of from a constant.
 */
const PROD_2026_09_03: Array<[string, number, number, number]> = [
  // [department, auto, confirm, off] — ENABLED kinds only, which is what the hook counts.
  // owner_ops has 13 ROWS but 11 enabled: "Set up the business" and "Setup step" are disabled.
  // The two disabled rows are added to the fixture below so the filter is genuinely exercised.
  ["owner_ops", 8, 3, 0],
  ["client_experience", 0, 7, 0],
  ["technology_automation", 1, 3, 0],
  ["sales", 1, 2, 0],
  ["executive_office", 1, 0, 0],
  ["operations_pmo", 1, 0, 0],
  ["finance", 0, 1, 0],
  ["marketing", 0, 1, 0],
  ["product_curriculum", 0, 1, 0],
  ["legal_compliance", 0, 0, 1],
  ["people_talent", 0, 0, 1],
];

const mk = (dept: string, lane: string, i: number, enabled = true) => ({
  default_to_department: dept, default_autonomy_lane: lane, label: `${dept} ${lane} ${i}`, enabled, tenant_id: null,
});

const rows = [
  ...PROD_2026_09_03.flatMap(([dept, auto, confirm, off]) => [
    ...Array.from({ length: auto }, (_, i) => mk(dept, "auto", i)),
    ...Array.from({ length: confirm }, (_, i) => mk(dept, "confirm", i)),
    ...Array.from({ length: off }, (_, i) => mk(dept, "off", i)),
  ]),
  // The two real DISABLED owner_ops kinds. Present so "drops disabled" is exercised against the
  // shape prod actually has, not only against a synthetic one-row case.
  { default_to_department: "owner_ops", default_autonomy_lane: "auto", label: "Set up the business", enabled: false, tenant_id: null },
  { default_to_department: "owner_ops", default_autonomy_lane: "auto", label: "Setup step", enabled: false, tenant_id: null },
];

describe("buildLaneCounts — counts real rows, drops what it cannot name", () => {
  it("reproduces the measured prod distribution", () => {
    const counts = buildLaneCounts(rows);
    for (const [dept, auto, confirm, off] of PROD_2026_09_03) {
      expect(counts[dept], dept).toEqual({ auto, confirm, off });
    }
    expect(Object.keys(counts).sort()).toEqual(PROD_2026_09_03.map(([d]) => d).sort());
  });

  it("covers all 32 ENABLED kinds — a guard that counts nothing would pass every other assertion", () => {
    const counts = buildLaneCounts(rows);
    const total = Object.values(counts).reduce((a, l) => a + l.auto + l.confirm + l.off, 0);
    // 34 rows exist on prod; 32 are enabled. Asserting 32 against a fixture that CONTAINS the two
    // disabled rows is what makes this an anti-vacuity check rather than a restatement.
    expect(rows.length).toBe(34);
    expect(total).toBe(32);
  });

  it("DROPS an unrecognised lane rather than bucketing it into a plausible one", () => {
    const counts = buildLaneCounts([
      { default_to_department: "sales", default_autonomy_lane: "supervised", label: "x", enabled: true, tenant_id: null },
      { default_to_department: "sales", default_autonomy_lane: null, label: "y", enabled: true, tenant_id: null },
    ]);
    // Not `{auto:0,confirm:1,off:0}` and not `{...off:2}` — an unknown lane contributes NOTHING,
    // so the department does not appear at all rather than appearing with an invented posture.
    expect(counts.sales).toBeUndefined();
  });

  it("drops a kind with no department, and a disabled kind", () => {
    expect(Object.keys(buildLaneCounts([mk("", "auto", 0)]))).toEqual([]);
    expect(buildLaneCounts([mk("sales", "auto", 0, false)]).sales).toBeUndefined();
  });
});

describe("buildActLabels — the platform's own words, never invented ones", () => {
  it("agrees with the counts: same enabled and lane filter", () => {
    const acts = buildActLabels(rows);
    const counts = buildLaneCounts(rows);
    for (const dept of Object.keys(counts)) {
      const total = counts[dept].auto + counts[dept].confirm + counts[dept].off;
      expect(acts[dept]?.length, dept).toBe(total);
    }
    expect(Object.keys(acts).sort()).toEqual(Object.keys(counts).sort());
  });

  it("excludes the labels of DISABLED kinds", () => {
    const acts = buildActLabels(rows);
    expect(acts.owner_ops.map((a) => a.label)).not.toContain("Set up the business");
    expect(acts.owner_ops.map((a) => a.label)).not.toContain("Setup step");
  });

  it("carries each label with the lane it REALLY runs in", () => {
    const acts = buildActLabels([
      mk("legal_compliance", "off", 0),
      mk("executive_office", "auto", 0),
    ]);
    expect(acts.legal_compliance[0].lane).toBe("off");
    expect(acts.executive_office[0].lane).toBe("auto");
  });

  it("omits an unlabelled kind rather than naming it", () => {
    // The kind is still COUNTED — it is a real routed capability — but it is never given an
    // invented display name to fill the gap.
    const blank = [{ default_to_department: "sales", default_autonomy_lane: "auto", label: "  ", enabled: true, tenant_id: null }];
    expect(buildLaneCounts(blank).sales).toEqual({ auto: 1, confirm: 0, off: 0 });
    expect(buildActLabels(blank).sales).toBeUndefined();
  });
});

describe("deriveLevel — a documented mapping from rows, never a constant", () => {
  it("all-auto is 1, all-off is 0, all-confirm is exactly half", () => {
    expect(deriveLevel({ auto: 3, confirm: 0, off: 0 })).toBe(1);
    expect(deriveLevel({ auto: 0, confirm: 0, off: 3 })).toBe(0);
    expect(deriveLevel({ auto: 0, confirm: 7, off: 0 })).toBe(0.5);
  });

  it("reports an EMPTY desk as null, not as 0", () => {
    // 0 reads as "she never acts here", which is a stronger and different claim than "nothing is
    // routed here". Collapsing the two is the fabrication this hook exists to stop.
    expect(deriveLevel({ auto: 0, confirm: 0, off: 0 })).toBeNull();
    expect(deriveLevel({ auto: 0, confirm: 0, off: 1 })).toBe(0);
  });

  it("gives the measured owner_ops mix a value between confirm and auto", () => {
    // 8 enabled auto + 3 confirm over 11 => (8 + 1.5) / 11. Asserted as the arithmetic rather than
    // a rounded literal so a changed weighting cannot pass by coincidence.
    expect(deriveLevel({ auto: 8, confirm: 3, off: 0 })).toBeCloseTo(9.5 / 11, 12);
  });
});

describe("the vocabulary is the real one", () => {
  it("every measured department is a real seeded slug", () => {
    for (const [dept] of PROD_2026_09_03) {
      expect(Object.keys(DEPARTMENT_NAMES), dept).toContain(dept);
    }
  });

  it("the compass no longer seeds itself from invented department ids", () => {
    // THE INVERSION. This assertion previously asserted the opposite — that the invented ids were
    // still present — with a note that it must be inverted rather than deleted when the rewire
    // landed, because the inversion is the proof it happened. It has landed, so here it is.
    const compass = fs.readFileSync(path.join(process.cwd(), "src/solo/compass.tsx"), "utf8");
    for (const id of ["'exec'", "'mkt'", "'cs'", "'prod'", "'tech'", "'fin'", "'ppl'", "'ops'"]) {
      expect(compass, `invented id ${id} still seeds a department`).not.toContain(`id:${id}`);
    }
    // The fixture array and its mutable singleton are gone, not merely unused.
    expect(compass).not.toContain("export const TC_DEPTS=[");
    expect(compass).not.toContain("TRUST.set(");
  });

  it("the compass presents platform defaults, never a setting the workspace chose", () => {
    const compass = fs.readFileSync(path.join(process.cwd(), "src/solo/compass.tsx"), "utf8");
    // The false affordance is gone: no "Slide to change", no writable dial.
    expect(compass).not.toContain("Slide to change");
    // And the labelling says whose policy it is.
    expect(compass).toContain("not a setting this workspace chose");
  });

  it("the fabricated confidence, trend and action history are gone from the compass", () => {
    const compass = fs.readFileSync(path.join(process.cwd(), "src/solo/compass.tsx"), "utf8");
    for (const gone of [
      "% avg confidence",
      "Confidence, last 30 days",
      "% vs last week",
      "Ran it and logged it",     // the invented per-department action history
      "Drafted, you approved",
      "Full history",
    ]) {
      expect(compass, `still renders "${gone}"`).not.toContain(gone);
    }
  });

  it("neither confidence nor trend is derivable, so this hook returns neither", () => {
    // Both render in the compass (`% avg confidence`, `% vs last week`) and NO seam supplies
    // either. A future edit that adds a derived `conf` here is inventing a measurement.
    const src = fs.readFileSync(path.join(process.cwd(), "src/solo/data/useSoloTrust.ts"), "utf8");
    expect(src).not.toMatch(/\bconf(idence)?\s*:/);
    expect(src).not.toMatch(/\btrend\s*:/);
  });
});

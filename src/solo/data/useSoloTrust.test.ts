import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { buildLaneCounts, deriveLevel } from "./useSoloTrust";
import { DEPARTMENT_NAMES } from "./useSoloActivityFeed";

/**
 * The derivation is the whole point of this hook, so it is asserted against the REAL distribution
 * measured on prod 2026-09-03 rather than against a shape invented for the test. If the platform's
 * catalogue changes, these numbers are expected to change with it — what must not change is that
 * the value comes from rows instead of from a constant.
 */
const PROD_2026_09_03: Array<[string, number, number, number]> = [
  // [department, auto, confirm, off]
  ["owner_ops", 10, 3, 0],
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

const rows = PROD_2026_09_03.flatMap(([dept, auto, confirm, off]) => [
  ...Array.from({ length: auto }, () => ({ default_to_department: dept, default_autonomy_lane: "auto", enabled: true, tenant_id: null })),
  ...Array.from({ length: confirm }, () => ({ default_to_department: dept, default_autonomy_lane: "confirm", enabled: true, tenant_id: null })),
  ...Array.from({ length: off }, () => ({ default_to_department: dept, default_autonomy_lane: "off", enabled: true, tenant_id: null })),
]);

describe("buildLaneCounts — counts real rows, drops what it cannot name", () => {
  it("reproduces the measured prod distribution", () => {
    const counts = buildLaneCounts(rows);
    for (const [dept, auto, confirm, off] of PROD_2026_09_03) {
      expect(counts[dept], dept).toEqual({ auto, confirm, off });
    }
    expect(Object.keys(counts).sort()).toEqual(PROD_2026_09_03.map(([d]) => d).sort());
  });

  it("covers all 34 kinds — a guard that counts nothing would pass every other assertion", () => {
    const counts = buildLaneCounts(rows);
    const total = Object.values(counts).reduce((a, l) => a + l.auto + l.confirm + l.off, 0);
    expect(total).toBe(34);
  });

  it("DROPS an unrecognised lane rather than bucketing it into a plausible one", () => {
    const counts = buildLaneCounts([
      { default_to_department: "sales", default_autonomy_lane: "supervised", enabled: true, tenant_id: null },
      { default_to_department: "sales", default_autonomy_lane: null, enabled: true, tenant_id: null },
    ]);
    // Not `{auto:0,confirm:1,off:0}` and not `{...off:2}` — an unknown lane contributes NOTHING,
    // so the department does not appear at all rather than appearing with an invented posture.
    expect(counts.sales).toBeUndefined();
  });

  it("drops a kind with no department, and a disabled kind", () => {
    expect(buildLaneCounts([
      { default_to_department: null, default_autonomy_lane: "auto", enabled: true, tenant_id: null },
    ]).__none__).toBeUndefined();
    expect(buildLaneCounts([
      { default_to_department: "sales", default_autonomy_lane: "auto", enabled: false, tenant_id: null },
    ]).sales).toBeUndefined();
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
    // 10 auto + 3 confirm over 13 => (10 + 1.5) / 13. Asserted as the arithmetic rather than a
    // rounded literal so a changed weighting cannot pass by coincidence.
    expect(deriveLevel({ auto: 10, confirm: 3, off: 0 })).toBeCloseTo(11.5 / 13, 12);
  });
});

describe("the vocabulary is the real one", () => {
  it("every measured department is a real seeded slug", () => {
    for (const [dept] of PROD_2026_09_03) {
      expect(Object.keys(DEPARTMENT_NAMES), dept).toContain(dept);
    }
  });

  it("the fixture the compass still ships does NOT use the real vocabulary", () => {
    // The finding this hook answers, pinned so it cannot be quietly lost. `compass.tsx` seeds its
    // TRUST store from ten invented ids; only `sales` overlaps the eleven real slugs. When the
    // compass is rewired this assertion is expected to be INVERTED, not deleted — the inversion is
    // the proof the rewire actually happened.
    const compass = fs.readFileSync(path.join(process.cwd(), "src/solo/compass.tsx"), "utf8");
    const invented = ["'exec'", "'mkt'", "'cs'", "'prod'", "'tech'", "'fin'", "'ppl'", "'ops'"];
    const present = invented.filter((id) => compass.includes(`id:${id}`));
    expect(present.length, "invented department ids still seeding TRUST").toBeGreaterThan(0);
    for (const id of present) {
      expect(Object.keys(DEPARTMENT_NAMES)).not.toContain(id.replaceAll("'", ""));
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

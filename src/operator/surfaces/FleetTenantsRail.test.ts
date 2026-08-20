import { describe, expect, it } from "vitest";

import { composeFleetRead, type RailTenant } from "./FleetTenantsRail";

/**
 * `composeFleetRead` is the §13 surface of this rail: it is the one place that turns real fleet
 * figures into a sentence a human reads as Paige's assessment. A template that quietly says
 * something untrue — a count that does not match the rows, a name that is not the tenant it
 * claims, a reassurance printed while the fleet is on fire — is exactly the class of defect the
 * fabricated-metrics sweep exists to prevent, and none of it is catchable by a typecheck.
 *
 * So these tests assert on the CLAIMS the sentence makes, not on its wording.
 */

function tenant(
  name: string,
  tone: "ok" | "warn" | "risk",
  beneath = 0,
): RailTenant {
  return {
    // Only the fields the composer reads are populated; the rest of FleetTenant is irrelevant
    // here and filling it in would just make the fixture lie about what is under test.
    tenant: { id: name.toLowerCase().replace(/\s+/g, "-"), name } as RailTenant["tenant"],
    tier: "Solo",
    health: { label: tone === "risk" ? "At risk" : tone === "warn" ? "Watch" : "Healthy", tone },
    beneath,
  };
}

describe("composeFleetRead", () => {
  it("returns null on an empty fleet rather than a padded sentence", () => {
    // The panel's own empty state is the honest render. A composer that manufactured
    // "everything looks good" from zero rows would be asserting health it never observed.
    expect(composeFleetRead([], 0)).toBeNull();
  });

  it("counts at-risk tenants accurately and names one that is actually at risk", () => {
    const rows = [
      tenant("Alpha Co", "ok"),
      tenant("Bravo Co", "risk"),
      tenant("Charlie Co", "risk"),
    ];
    const read = composeFleetRead(rows, 0)!;
    expect(read).toContain("2 tenants are at risk");
    // The named tenant must be one of the at-risk ones — never a healthy tenant.
    const named = ["Bravo Co", "Charlie Co"].some((n) => read.includes(n));
    expect(named, `named the wrong tenant: ${read}`).toBe(true);
    expect(read).not.toContain("Alpha Co");
  });

  it("uses singular grammar for exactly one at-risk tenant", () => {
    const read = composeFleetRead([tenant("Solo Co", "risk")], 0)!;
    expect(read).toContain("1 tenant is at risk");
    expect(read).not.toContain("tenants are at risk");
  });

  it("never claims the fleet is clear while a tenant is at risk", () => {
    const rows = [tenant("Alpha Co", "ok"), tenant("Bravo Co", "risk")];
    const read = composeFleetRead(rows, 0)!;
    expect(read).not.toContain("Nothing on the fleet is at risk");
  });

  it("falls back to watch-state only when nothing is at risk", () => {
    const rows = [tenant("Alpha Co", "ok"), tenant("Watchful Co", "warn")];
    const read = composeFleetRead(rows, 0)!;
    expect(read).toContain("Nothing is at risk");
    expect(read).toContain("Watchful Co");
  });

  it("says the fleet is clear only when every tenant is healthy", () => {
    const read = composeFleetRead([tenant("Alpha Co", "ok"), tenant("Bravo Co", "ok")], 0)!;
    expect(read).toContain("Nothing on the fleet is at risk right now");
  });

  it("names the tenant that genuinely carries the most beneath it", () => {
    const rows = [
      tenant("Small Co", "ok", 1),
      tenant("Big Co", "ok", 6),
      tenant("Mid Co", "ok", 3),
    ];
    const read = composeFleetRead(rows, 0)!;
    expect(read).toContain("Big Co carries the most beneath it, at 6");
  });

  it("omits the sub-account clause entirely when no tenant has any", () => {
    const read = composeFleetRead([tenant("Alpha Co", "ok")], 0)!;
    expect(read).not.toContain("carries the most beneath");
  });

  it("reports open findings with matching grammar, and omits the clause at zero", () => {
    const rows = [tenant("Alpha Co", "ok")];
    expect(composeFleetRead(rows, 1)!).toContain("1 platform check is still open");
    expect(composeFleetRead(rows, 4)!).toContain("4 platform checks are still open");
    expect(composeFleetRead(rows, 0)!).not.toContain("still open");
  });

  it("never emits an undefined, NaN or empty fragment", () => {
    // A missing value rendering as "undefined tenants are at risk" is the visible form of the
    // same bug class; assert the composed string is clean for every branch.
    const cases: Array<[RailTenant[], number]> = [
      [[tenant("A", "ok")], 0],
      [[tenant("A", "warn")], 2],
      [[tenant("A", "risk", 3)], 5],
      [[tenant("A", "ok", 2), tenant("B", "risk")], 1],
    ];
    for (const [rows, findings] of cases) {
      const read = composeFleetRead(rows, findings)!;
      expect(read).toBeTruthy();
      expect(read).not.toMatch(/undefined|NaN|null/);
      expect(read.trim()).toBe(read);
    }
  });
});

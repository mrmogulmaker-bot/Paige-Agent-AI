import { describe, it, expect } from "vitest";
import {
  parseBureauSource,
  projectPaydown,
  projectNegativeRemoval,
  projectTradeline,
  strongestBureau,
  totalRange,
  bureauBadgeClass,
  type BureauScores,
} from "../creditSimulator";

const scores: BureauScores = { experian: 680, transunion: 690, equifax: 700 };

describe("parseBureauSource", () => {
  it("defaults to all three bureaus when input is empty/null", () => {
    expect(parseBureauSource(null)).toEqual(["experian", "transunion", "equifax"]);
    expect(parseBureauSource("")).toEqual(["experian", "transunion", "equifax"]);
  });

  it("returns all three for 'all', '3B', or 'tri'", () => {
    expect(parseBureauSource("All 3 Bureaus")).toEqual(["experian", "transunion", "equifax"]);
    expect(parseBureauSource("3B")).toEqual(["experian", "transunion", "equifax"]);
    expect(parseBureauSource("tri")).toEqual(["experian", "transunion", "equifax"]);
  });

  it("parses individual bureau aliases", () => {
    expect(parseBureauSource("Experian")).toEqual(["experian"]);
    expect(parseBureauSource("TU")).toEqual(["transunion"]);
    expect(parseBureauSource("EQ")).toEqual(["equifax"]);
    expect(parseBureauSource("XPN")).toEqual(["experian"]);
    expect(parseBureauSource("EFX")).toEqual(["equifax"]);
  });

  it("parses combined bureau strings", () => {
    const result = parseBureauSource("Experian, TransUnion");
    expect(result).toContain("experian");
    expect(result).toContain("transunion");
    expect(result).not.toContain("equifax");
  });

  it("falls back to all three when no known bureau matches", () => {
    expect(parseBureauSource("???")).toEqual(["experian", "transunion", "equifax"]);
  });
});

describe("projectPaydown", () => {
  it("returns zero impact when target is not meaningfully better", () => {
    const out = projectPaydown({
      currentBalance: 500,
      creditLimit: 1000,
      targetBalance: 495,
      bureaus: ["experian"],
      scores,
    });
    expect(out.impacts[0].low).toBe(0);
    expect(out.impacts[0].high).toBe(0);
  });

  it("gives the largest projection for >90% util → <30%", () => {
    const out = projectPaydown({
      currentBalance: 950,
      creditLimit: 1000,
      targetBalance: 200,
      bureaus: ["experian"],
      scores,
    });
    expect(out.impacts[0].low).toBeGreaterThanOrEqual(60);
    expect(out.impacts[0].high).toBeGreaterThanOrEqual(100);
  });

  it("clamps projected scores to the 300–850 range", () => {
    const out = projectPaydown({
      currentBalance: 1000,
      creditLimit: 1000,
      targetBalance: 0,
      bureaus: ["experian"],
      scores: { experian: 820, transunion: null, equifax: null },
    });
    expect(out.impacts[0].projectedHigh).toBeLessThanOrEqual(850);
  });

  it("handles zero credit limit defensively (no division-by-zero)", () => {
    const out = projectPaydown({
      currentBalance: 100,
      creditLimit: 0,
      targetBalance: 0,
      bureaus: ["experian"],
      scores,
    });
    expect(Number.isFinite(out.currentUtil)).toBe(true);
  });

  it("returns null projections when baseline score is null", () => {
    const out = projectPaydown({
      currentBalance: 950,
      creditLimit: 1000,
      targetBalance: 100,
      bureaus: ["experian"],
      scores: { experian: null, transunion: null, equifax: null },
    });
    expect(out.impacts[0].projectedLow).toBeNull();
    expect(out.impacts[0].projectedHigh).toBeNull();
  });
});

describe("projectNegativeRemoval", () => {
  it("scores collections higher than late payments", () => {
    const collection = projectNegativeRemoval({
      itemType: "collection",
      dateOfOccurrence: null,
      bureaus: ["experian"],
      scores,
    });
    const late = projectNegativeRemoval({
      itemType: "late payment",
      dateOfOccurrence: null,
      bureaus: ["experian"],
      scores,
    });
    expect(collection[0].high).toBeGreaterThan(late[0].high);
  });

  it("gives bankruptcy the largest projected lift", () => {
    const bk = projectNegativeRemoval({
      itemType: "bankruptcy",
      dateOfOccurrence: null,
      bureaus: ["experian"],
      scores,
    });
    expect(bk[0].high).toBeGreaterThanOrEqual(80);
  });

  it("halves the projected lift for items older than 4 years", () => {
    const recent = projectNegativeRemoval({
      itemType: "collection",
      dateOfOccurrence: new Date().toISOString(),
      bureaus: ["experian"],
      scores,
    });
    const aged = projectNegativeRemoval({
      itemType: "collection",
      dateOfOccurrence: new Date(Date.now() - 5 * 365 * 24 * 60 * 60 * 1000).toISOString(),
      bureaus: ["experian"],
      scores,
    });
    expect(aged[0].high).toBeLessThan(recent[0].high);
  });

  it("defaults to late-payment range for unknown item types", () => {
    const unknown = projectNegativeRemoval({
      itemType: "something weird",
      dateOfOccurrence: null,
      bureaus: ["experian"],
      scores,
    });
    expect(unknown[0].low).toBe(15);
    expect(unknown[0].high).toBe(30);
  });
});

describe("projectTradeline", () => {
  it("gives bigger lift for first installment loan than for diversification", () => {
    const first = projectTradeline({
      type: "personal_loan",
      profile: {
        hasInstallmentLoan: false,
        hasMortgage: false,
        hasAutoLoan: false,
        hasRentReporting: false,
        hasUtilityReporting: false,
        aggregateUtilization: 20,
      },
      scores,
    });
    const additional = projectTradeline({
      type: "personal_loan",
      profile: {
        hasInstallmentLoan: true,
        hasMortgage: false,
        hasAutoLoan: false,
        hasRentReporting: false,
        hasUtilityReporting: false,
        aggregateUtilization: 20,
      },
      scores,
    });
    expect(first.impacts[0].high).toBeGreaterThan(additional.impacts[0].high);
  });

  it("gives mortgage the highest tradeline lift", () => {
    const mortgage = projectTradeline({
      type: "mortgage",
      profile: {
        hasInstallmentLoan: false,
        hasMortgage: false,
        hasAutoLoan: false,
        hasRentReporting: false,
        hasUtilityReporting: false,
        aggregateUtilization: 20,
      },
      scores,
    });
    expect(mortgage.impacts[0].high).toBeGreaterThanOrEqual(50);
  });

  it("gives a bigger primary card lift when utilization is high", () => {
    const high = projectTradeline({
      type: "primary_card",
      profile: {
        hasInstallmentLoan: false,
        hasMortgage: false,
        hasAutoLoan: false,
        hasRentReporting: false,
        hasUtilityReporting: false,
        aggregateUtilization: 70,
      },
      scores,
    });
    const low = projectTradeline({
      type: "primary_card",
      profile: {
        hasInstallmentLoan: false,
        hasMortgage: false,
        hasAutoLoan: false,
        hasRentReporting: false,
        hasUtilityReporting: false,
        aggregateUtilization: 10,
      },
      scores,
    });
    expect(high.impacts[0].high).toBeGreaterThan(low.impacts[0].high);
  });
});

describe("helpers", () => {
  it("strongestBureau picks the highest non-null score", () => {
    expect(strongestBureau(scores)).toBe("equifax");
    expect(strongestBureau({ experian: null, transunion: null, equifax: null })).toBeNull();
  });

  it("totalRange sums low/high impacts across bureaus", () => {
    const impacts = [
      { bureau: "experian" as const, baseline: 700, low: 5, high: 10, projectedLow: 705, projectedHigh: 710 },
      { bureau: "transunion" as const, baseline: 700, low: 8, high: 15, projectedLow: 708, projectedHigh: 715 },
    ];
    expect(totalRange(impacts)).toEqual({ low: 13, high: 25 });
  });

  it("bureauBadgeClass maps score bands to color classes", () => {
    expect(bureauBadgeClass(null)).toContain("muted");
    expect(bureauBadgeClass(720)).toContain("emerald");
    expect(bureauBadgeClass(640)).toContain("amber");
    expect(bureauBadgeClass(550)).toContain("red");
  });
});

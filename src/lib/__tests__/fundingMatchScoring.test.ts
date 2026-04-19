import { describe, it, expect } from "vitest";
import {
  resolvePrimaryBureau,
  getBureauScore,
  getBureauPullLabel,
  getLenderCategoriesForBureau,
} from "../fundingMatchScoring";

describe("resolvePrimaryBureau", () => {
  it("respects explicit primary_bureau field", () => {
    expect(resolvePrimaryBureau({ primary_bureau: "equifax" })).toBe("equifax");
  });

  it("maps Chase to Experian via lender name", () => {
    expect(resolvePrimaryBureau({ lender_name: "Chase Sapphire" })).toBe("experian");
  });

  it("maps Capital One to TransUnion", () => {
    expect(resolvePrimaryBureau({ lender_name: "Capital One Quicksilver" })).toBe("transunion");
  });

  it("maps Citi to Equifax", () => {
    expect(resolvePrimaryBureau({ lender_name: "Citibank Diamond" })).toBe("equifax");
  });

  it("falls back to type defaults when lender name is unknown", () => {
    expect(resolvePrimaryBureau({ lender_name: "Some Random Bank", product_type: "sba_loan" }))
      .toBe("middle_score");
    expect(resolvePrimaryBureau({ lender_name: "Some Random Bank", product_type: "equipment financing" }))
      .toBe("equifax");
  });

  it("defaults to middle_score for fully unknown products", () => {
    expect(resolvePrimaryBureau({ lender_name: "Mystery Lender", product_type: "term_loan" }))
      .toBe("middle_score");
  });

  it("prefers the longest matching lender key (Chase Ink over Chase)", () => {
    // "chase ink" includes "chase" — both match. Longest-first sort should pick experian.
    // Both happen to map to experian here, so we only assert the result is stable.
    expect(resolvePrimaryBureau({ lender_name: "Chase Ink Business" })).toBe("experian");
  });
});

describe("getBureauScore", () => {
  const scores = { tu: 690, ex: 680, eq: 700 };

  it("returns the bureau-specific score", () => {
    expect(getBureauScore("experian", scores, 690)).toBe(680);
    expect(getBureauScore("transunion", scores, 690)).toBe(690);
    expect(getBureauScore("equifax", scores, 690)).toBe(700);
  });

  it("returns the middle score for all_three / middle_score", () => {
    expect(getBureauScore("all_three", scores, 690)).toBe(690);
    expect(getBureauScore("middle_score", scores, 690)).toBe(690);
  });

  it("returns the best available score for 'flexible'", () => {
    expect(getBureauScore("flexible", scores, 690)).toBe(700);
  });

  it("returns null when 'flexible' has no scores at all", () => {
    expect(getBureauScore("flexible", { tu: null, ex: null, eq: null }, null)).toBeNull();
  });
});

describe("getBureauPullLabel", () => {
  it("produces a human-readable label for each pull type", () => {
    expect(getBureauPullLabel("experian")).toMatch(/Experian/);
    expect(getBureauPullLabel("transunion")).toMatch(/TransUnion/);
    expect(getBureauPullLabel("equifax")).toMatch(/Equifax/);
    expect(getBureauPullLabel("all_three")).toMatch(/middle/);
    expect(getBureauPullLabel("flexible")).toMatch(/best bureau/i);
  });
});

describe("getLenderCategoriesForBureau", () => {
  it("returns a non-empty list for each bureau", () => {
    expect(getLenderCategoriesForBureau("ex")).toContain("Chase");
    expect(getLenderCategoriesForBureau("tu")).toContain("Capital One");
    expect(getLenderCategoriesForBureau("eq")).toContain("Citi");
  });
});

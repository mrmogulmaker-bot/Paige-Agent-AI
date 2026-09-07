import { describe, expect, it } from "vitest";
import { parseCustomerUpdate } from "./usePlatformUpdate";

const release = {
  schemaVersion: 1,
  releaseName: "Paige Solo Preview",
  version: "0.8",
  date: "2026-09-06",
  customerOutcome: "Owners can see the latest governed capability.",
  whatChanged: "A clearer workflow is available.",
  whoCanUseIt: "Solo owners.",
  ownerAction: "Review it when ready.",
  status: ["LIVE", "PROOF OWED"],
  knownLimitations: "One path still needs proof.",
  safeNextStep: "Keep existing work open until it is saved.",
};

describe("customer update parsing", () => {
  it("accepts only a complete customer-safe manifest shape", () => {
    expect(parseCustomerUpdate(release)).toEqual(release);
    expect(parseCustomerUpdate({ ...release, status: ["READY"] })).toBeNull();
    expect(parseCustomerUpdate({ ...release, ownerAction: "" })).toBeNull();
  });

  it("rejects structurally valid technical copy at runtime", () => {
    expect(parseCustomerUpdate({ ...release, knownLimitations: "See deployment dpl_internal" })).toBeNull();
    expect(parseCustomerUpdate({ ...release, customerOutcome: "Provider name is exposed" })).toBeNull();
  });
});

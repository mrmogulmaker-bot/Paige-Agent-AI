import { describe, expect, it } from "vitest";
import {
  EMPTY_SOLO_SETUP_BRIEF,
  applySetupProposal,
  prepareOwnerConfirmedBrief,
  validateSoloSetupBrief,
  type SoloSetupProposal,
} from "./settings-setup-contract";

describe("Solo Setup business brief contract", () => {
  it("requires a real business name and validates optional codes without inventing them", () => {
    expect(validateSoloSetupBrief(EMPTY_SOLO_SETUP_BRIEF)).toMatchObject({
      publicName: expect.any(String),
    });

    const valid = {
      ...EMPTY_SOLO_SETUP_BRIEF,
      publicName: "Northstar Advisory",
      website: "https://northstar.example",
      naicsCode: "541611",
      sicCode: "8742",
    };
    expect(validateSoloSetupBrief(valid)).toEqual({});

    expect(validateSoloSetupBrief({ ...valid, naicsCode: "consulting" })).toMatchObject({
      naicsCode: expect.stringContaining("2–6 digits"),
    });
    expect(validateSoloSetupBrief({ ...valid, sicCode: "87" })).toMatchObject({
      sicCode: expect.stringContaining("4 digits"),
    });
  });

  it("marks only non-empty owner-saved facts as owner-confirmed", () => {
    const saved = prepareOwnerConfirmedBrief(
      { ...EMPTY_SOLO_SETUP_BRIEF, publicName: "Northstar Advisory", industry: "  Consulting  " },
      "2026-08-31T22:00:00.000Z",
    );

    expect(saved.industry).toBe("Consulting");
    expect(saved.provenance.publicName).toEqual({
      source: "owner_confirmed",
      confidence: "confirmed",
      confirmedAt: "2026-08-31T22:00:00.000Z",
    });
    expect(saved.provenance.legalName).toBeUndefined();
  });

  it("applies a Paige proposal only to a draft and keeps representatives owner-controlled", () => {
    const current = {
      ...EMPTY_SOLO_SETUP_BRIEF,
      publicName: "Northstar Advisory",
      representativeUserIds: ["owner-1"],
    };
    const proposal: SoloSetupProposal = {
      id: "proposal-1",
      reason: "The owner described a narrower service area in chat.",
      proposedAt: "2026-08-31T22:00:00.000Z",
      patch: { serviceArea: "Mid-Atlantic", representativeUserIds: ["attacker"] },
    };

    const draft = applySetupProposal(current, proposal);
    expect(draft.serviceArea).toBe("Mid-Atlantic");
    expect(draft.representativeUserIds).toEqual(["owner-1"]);
    expect(current.serviceArea).toBe("");
  });
});

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

  it("preserves connection provenance until an explicit adopt or override decision", () => {
    const original = {
      ...EMPTY_SOLO_SETUP_BRIEF,
      publicName: "Northstar Advisory",
      website: "https://connected.example",
      provenance: {
        website: { source: "connection_sourced" as const, confidence: "observed" as const },
      },
    };
    const untouched = prepareOwnerConfirmedBrief(original, "2026-09-02T12:00:00Z", original);
    expect(untouched.provenance.website?.source).toBe("connection_sourced");

    const adopted = prepareOwnerConfirmedBrief(original, "2026-09-02T12:00:00Z", original, { website: "adopt" });
    expect(adopted.provenance.website?.source).toBe("owner_confirmed");
    expect(adopted.sourceDecisions).toEqual({ website: "adopt" });

    const overridden = prepareOwnerConfirmedBrief(
      { ...original, website: "https://owner.example" },
      "2026-09-02T12:00:00Z",
      original,
      { website: "override" },
    );
    expect(overridden.sourceDecisions).toEqual({ website: "override" });
  });

  it("starts without U.S.-specific legal assumptions and accepts global regions", () => {
    expect(EMPTY_SOLO_SETUP_BRIEF.businessRegistrationIdentifier).toBe("");
    expect(EMPTY_SOLO_SETUP_BRIEF.regionsOfOperation).toBe("");
    expect(EMPTY_SOLO_SETUP_BRIEF.registeredIsoCountry).toBe("");
    expect(validateSoloSetupBrief({
      ...EMPTY_SOLO_SETUP_BRIEF,
      publicName: "Global Advisory",
      legalName: "Global Advisory SAS",
      registeredRegion: "Île-de-France",
      registeredIsoCountry: "FR",
    })).toEqual({});
  });

  it("refuses clearing the legal name from an existing legal sender record", () => {
    const brief = { ...EMPTY_SOLO_SETUP_BRIEF, publicName: "Public name", legalName: "" };
    expect(validateSoloSetupBrief(brief, true).legalName).toContain("legal business name");
  });

  it("applies a Team-backed representative proposal only to the owner's draft", () => {
    const current = {
      ...EMPTY_SOLO_SETUP_BRIEF,
      publicName: "Northstar Advisory",
      representativeUserIds: ["owner-1"],
    };
    const proposal: SoloSetupProposal = {
      id: "proposal-1",
      reason: "The owner described a narrower service area in chat.",
      proposedAt: "2026-08-31T22:00:00.000Z",
      patch: { serviceArea: "Mid-Atlantic", representativeUserIds: ["owner-2"] },
    };

    const draft = applySetupProposal(current, proposal);
    expect(draft.serviceArea).toBe("Mid-Atlantic");
    expect(draft.representativeUserIds).toEqual(["owner-2"]);
    expect(current.representativeUserIds).toEqual(["owner-1"]);
    expect(current.serviceArea).toBe("");
  });
});

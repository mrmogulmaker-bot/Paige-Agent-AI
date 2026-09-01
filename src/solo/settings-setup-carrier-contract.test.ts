import { describe, expect, it } from "vitest";
import {
  EMPTY_SOLO_SETUP_BRIEF,
  applySetupProposal,
  cleanSoloSetupBrief,
  prepareOwnerConfirmedBrief,
  validateSoloSetupBrief,
} from "./settings-setup-contract";

const representative = "2f53a4d8-15cf-4fd9-bfae-d6c51161e9aa";

describe("Solo Setup carrier identity", () => {
  it("validates a U.S. legal sender identity before it reaches the save seam", () => {
    const brief = {
      ...EMPTY_SOLO_SETUP_BRIEF,
      legalName: "Northstar Advisory LLC",
      entityType: "Limited Liability Corporation",
      stateOfFormation: "GA",
      businessRegistrationIdentifier: "EIN",
      businessRegistrationNumber: "12-3456789",
      regionsOfOperation: "USA_AND_CANADA",
      registeredStreet: "123 Main Street",
      registeredCity: "Atlanta",
      registeredRegion: "GA",
      registeredPostalCode: "30303",
      registeredIsoCountry: "US",
      representativeUserIds: [representative],
      authorizedRepresentativeUserId: representative,
      authorizedRepresentativePhone: "+14045550123",
      authorizedRepresentativeJobPosition: "CEO",
    };

    expect(validateSoloSetupBrief(brief)).toEqual({});
    expect(validateSoloSetupBrief({ ...brief, businessRegistrationNumber: "1234" }))
      .toMatchObject({ businessRegistrationNumber: expect.stringContaining("9 digits") });
    expect(validateSoloSetupBrief({ ...brief, authorizedRepresentativePhone: "404-555" }))
      .toMatchObject({ authorizedRepresentativePhone: expect.stringContaining("complete") });
  });

  it("treats the full registration number as write-only and returns only last four", () => {
    const confirmed = prepareOwnerConfirmedBrief({
      ...EMPTY_SOLO_SETUP_BRIEF,
      legalName: "Northstar Advisory LLC",
      businessRegistrationNumber: "12-3456789",
    });
    expect(confirmed.businessRegistrationNumber).toBe("12-3456789");

    const reloaded = cleanSoloSetupBrief({
      ...confirmed,
      businessRegistrationNumber: "12-3456789",
      businessRegistrationNumberLast4: "6789",
    });
    expect(reloaded.businessRegistrationNumber).toBe("");
    expect(reloaded.businessRegistrationNumberLast4).toBe("6789");
  });

  it("does not let a PAIGE proposal supply a tax number or choose the legal representative", () => {
    const current = {
      ...EMPTY_SOLO_SETUP_BRIEF,
      legalName: "Northstar Advisory LLC",
      representativeUserIds: [representative],
      authorizedRepresentativeUserId: representative,
    };
    const next = applySetupProposal(current, {
      id: "proposal-1",
      reason: "Conversation context",
      proposedAt: "2026-09-01T00:00:00.000Z",
      patch: {
        industry: "PROFESSIONAL_SERVICES",
        businessRegistrationNumber: "00-0000000",
        authorizedRepresentativeUserId: "other-user",
      },
    });

    expect(next.industry).toBe("PROFESSIONAL_SERVICES");
    expect(next.businessRegistrationNumber).toBe("");
    expect(next.authorizedRepresentativeUserId).toBe(representative);
  });
});

import { describe, expect, it } from "vitest";
import {
  SOLO_SETUP_TABS,
  cleanSetupKnowledgeSources,
  cleanSoloPaigeProfile,
  validateKnowledgeSource,
  validateManagedEmailLocalPart,
} from "./settings-business-context-contract";

describe("Solo business context contract", () => {
  it("keeps the approved six-tab Setup taxonomy in canonical order", () => {
    expect(SOLO_SETUP_TABS).toEqual([
      "business-profile",
      "public-presence",
      "people-email",
      "knowledge-bucket",
      "direction",
      "paige-brief",
    ]);
  });

  it("cleans tenant-owned knowledge and structured Paige context", () => {
    expect(
      cleanSetupKnowledgeSources([
        {
          id: "one",
          sourceType: "link",
          title: "  Site  ",
          category: "offers",
          sourceUrl: "https://example.com",
          provenance: { source: "owner_confirmed", confidence: "confirmed" },
        },
      ])[0],
    ).toMatchObject({ title: "Site", category: "offers" });
    expect(
      cleanSoloPaigeProfile({ voiceCharacter: "  warm  " }).voiceCharacter,
    ).toBe("warm");
  });

  it("accepts stored HTTPS links but rejects fetch-risk and malformed sources", () => {
    const base = {
      id: "",
      sourceType: "link" as const,
      title: "Site",
      category: "business" as const,
      sourceUrl: "http://127.0.0.1/private",
      reference: "",
      notes: "",
      reviewStatus: "needs_review" as const,
      provenance: {
        source: "owner_confirmed" as const,
        confidence: "confirmed" as const,
      },
    };
    expect(validateKnowledgeSource(base).sourceUrl).toContain("https://");
    expect(
      validateKnowledgeSource({ ...base, sourceUrl: "https://example.com" }),
    ).toEqual({});
  });

  it("validates the owner-managed platform email registry local part", () => {
    expect(validateManagedEmailLocalPart("mr-mogul-maker")).toBeNull();
    expect(
      validateManagedEmailLocalPart("Bad Address@elsewhere.com"),
    ).toContain("lowercase");
  });
});

import { describe, expect, it } from "vitest";
import { buildBrandSection } from "../../supabase/functions/_shared/client-context";

describe("Paige business brief context", () => {
  it("includes saved owner-confirmed context and preserves do-not-assume boundaries", () => {
    const prompt = buildBrandSection({
      business_brief: {
        publicName: "Northstar Advisory",
        offers: "Executive operations consulting",
        idealCustomer: "Founder-led service businesses",
        currentPriority: "Make delivery repeatable",
        brandVoice: "Direct, calm and practical",
        doNotAssume: "Do not assume every lead is qualified.",
        provenance: {
          offers: { source: "owner_confirmed", confidence: "confirmed" },
          idealCustomer: { source: "needs_confirmation", confidence: "unknown" },
          doNotAssume: { source: "owner_confirmed", confidence: "confirmed" },
        },
      },
    }, "Northstar Advisory");

    expect(prompt).toContain("OWNER-CONFIRMED BUSINESS BRIEF");
    expect(prompt).toContain("Executive operations consulting");
    expect(prompt).toContain("Do not assume every lead is qualified.");
    expect(prompt).not.toContain("Founder-led service businesses");
  });
});

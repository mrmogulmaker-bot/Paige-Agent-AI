import type { VerifyAdapter, VerifyResult, BusinessVerifyInput } from "./types.ts";

export const transUnionBizAdapter: VerifyAdapter = {
  source: "transunion_business",
  enabled: () => Boolean(Deno.env.get("TU_BUSINESS_API_KEY") && Deno.env.get("TU_BUSINESS_MEMBER_CODE")),
  async verify(_input: BusinessVerifyInput): Promise<VerifyResult> {
    if (!this.enabled()) {
      return {
        source: this.source,
        source_kind: "paid",
        status: "unavailable",
        error: "TransUnion Business credentials not configured.",
      };
    }
    return { source: this.source, source_kind: "paid", status: "unavailable", error: "Adapter ready; live call not yet wired." };
  },
};

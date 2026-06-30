import type { VerifyAdapter, VerifyResult, BusinessVerifyInput } from "./types.ts";

export const arrayAdapter: VerifyAdapter = {
  source: "array",
  enabled: () => Boolean(Deno.env.get("ARRAY_API_KEY") && Deno.env.get("ARRAY_APP_KEY")),
  async verify(_input: BusinessVerifyInput): Promise<VerifyResult> {
    if (!this.enabled()) {
      return {
        source: this.source,
        source_kind: "paid",
        status: "unavailable",
        error: "Array credentials not configured.",
      };
    }
    return { source: this.source, source_kind: "paid", status: "unavailable", error: "Adapter ready; live call not yet wired." };
  },
};

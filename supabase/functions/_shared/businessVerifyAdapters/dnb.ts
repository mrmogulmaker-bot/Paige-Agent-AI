import type { VerifyAdapter, VerifyResult, BusinessVerifyInput } from "./types.ts";

// Dun & Bradstreet Direct+ adapter. Inert until DNB_API_KEY + DNB_API_SECRET are added.
// When credentials land, fill in the OAuth + match call below — no changes needed elsewhere.
export const dnbAdapter: VerifyAdapter = {
  source: "dnb",
  enabled: () => Boolean(Deno.env.get("DNB_API_KEY") && Deno.env.get("DNB_API_SECRET")),
  async verify(_input: BusinessVerifyInput): Promise<VerifyResult> {
    if (!this.enabled()) {
      return {
        source: this.source,
        source_kind: "paid",
        status: "unavailable",
        error: "D&B credentials not configured. Add DNB_API_KEY + DNB_API_SECRET to activate.",
      };
    }
    // TODO when credentials are issued:
    // 1. POST /v2/token (Basic auth = base64(KEY:SECRET)) -> bearer
    // 2. GET /v1/match/cleanseMatch?name=...&countryISOAlpha2Code=US&...
    // 3. Map response -> normalized { duns, name, address, status, paydex }
    return { source: this.source, source_kind: "paid", status: "unavailable", error: "Adapter ready; live call not yet wired." };
  },
};

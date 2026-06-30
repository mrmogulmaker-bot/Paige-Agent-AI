import type { VerifyAdapter, VerifyResult, BusinessVerifyInput } from "./types.ts";

// LexisNexis Risk - Business InstantID adapter.
// REQUIRES: signed contract + GLBA-permissible-purpose certification.
// Inert until LEXISNEXIS_USER, LEXISNEXIS_PASSWORD, and LEXISNEXIS_BUSINESS_ENDPOINT are configured.
export const lexisNexisAdapter: VerifyAdapter = {
  source: "lexisnexis_business_instantid",
  enabled: () =>
    Boolean(
      Deno.env.get("LEXISNEXIS_USER") &&
        Deno.env.get("LEXISNEXIS_PASSWORD") &&
        Deno.env.get("LEXISNEXIS_BUSINESS_ENDPOINT"),
    ),
  async verify(_input: BusinessVerifyInput): Promise<VerifyResult> {
    if (!this.enabled()) {
      return {
        source: this.source,
        source_kind: "paid",
        status: "unavailable",
        error: "LexisNexis credentials not configured. Requires GLBA contract.",
      };
    }
    // TODO when credentials are issued:
    // 1. Build SOAP envelope with WS-Security UsernameToken
    // 2. POST to LEXISNEXIS_BUSINESS_ENDPOINT
    // 3. Parse XML -> normalized { lexid_business, verified_name, verified_address, risk_score, sos_filing }
    return { source: this.source, source_kind: "paid", status: "unavailable", error: "Adapter ready; live call not yet wired." };
  },
};

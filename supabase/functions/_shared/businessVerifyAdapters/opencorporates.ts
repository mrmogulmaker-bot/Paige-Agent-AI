import type { VerifyAdapter, VerifyResult, BusinessVerifyInput } from "./types.ts";

// OpenCorporates has a free tier; API key is optional but boosts limits.
export const openCorporatesAdapter: VerifyAdapter = {
  source: "opencorporates",
  enabled: () => true,
  async verify(input: BusinessVerifyInput): Promise<VerifyResult> {
    try {
      const url = new URL("https://api.opencorporates.com/v0.4/companies/search");
      url.searchParams.set("q", input.legal_name);
      if (input.state) url.searchParams.set("jurisdiction_code", `us_${input.state.toLowerCase()}`);
      const key = Deno.env.get("OPENCORPORATES_API_KEY");
      if (key) url.searchParams.set("api_token", key);

      const res = await fetch(url.toString());
      if (!res.ok) {
        return { source: this.source, source_kind: "public", status: "error", error: `HTTP ${res.status}` };
      }
      const data = await res.json();
      const companies = data?.results?.companies ?? [];
      if (companies.length === 0) {
        return { source: this.source, source_kind: "public", status: "not_found" };
      }
      const top = companies[0]?.company ?? {};
      const matched: string[] = [];
      if ((top.name ?? "").toLowerCase().includes(input.legal_name.toLowerCase())) matched.push("legal_name");
      if (input.state && top.jurisdiction_code?.endsWith(input.state.toLowerCase())) matched.push("state");
      return {
        source: this.source,
        source_kind: "public",
        status: matched.length >= 1 ? "match" : "mismatch",
        confidence: matched.length * 35,
        matched_fields: matched,
        raw_payload: top,
        normalized: {
          legal_name: top.name,
          state: top.jurisdiction_code,
          status: top.current_status,
          incorporation_date: top.incorporation_date,
          company_number: top.company_number,
        },
        source_url: top.opencorporates_url,
      };
    } catch (err) {
      return { source: this.source, source_kind: "public", status: "error", error: (err as Error).message };
    }
  },
};

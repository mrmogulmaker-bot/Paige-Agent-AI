import type { VerifyAdapter, VerifyResult, BusinessVerifyInput } from "./types.ts";

// State -> SoS business search URL. Firecrawl scrapes the rendered page.
const SOS_URLS: Record<string, string> = {
  CA: "https://bizfileonline.sos.ca.gov/search/business",
  NY: "https://apps.dos.ny.gov/publicInquiry/",
  TX: "https://mycpa.cpa.state.tx.us/coa/",
  FL: "https://search.sunbiz.org/Inquiry/CorporationSearch/ByName",
  GA: "https://ecorp.sos.ga.gov/BusinessSearch",
  IL: "https://apps.ilsos.gov/businessentitysearch/",
  DE: "https://icis.corp.delaware.gov/Ecorp/EntitySearch/NameSearch.aspx",
  WY: "https://wyobiz.wyo.gov/Business/FilingSearch.aspx",
  NV: "https://esos.nv.gov/EntitySearch/OnlineEntitySearch",
  AZ: "https://ecorp.azcc.gov/EntitySearch/Index",
};

export const sosAdapter: VerifyAdapter = {
  source: "secretary_of_state",
  enabled: () => Boolean(Deno.env.get("FIRECRAWL_API_KEY")),
  async verify(input: BusinessVerifyInput): Promise<VerifyResult> {
    const apiKey = Deno.env.get("FIRECRAWL_API_KEY");
    if (!apiKey) {
      return { source: this.source, source_kind: "government", status: "unavailable", error: "FIRECRAWL_API_KEY not configured" };
    }
    const state = (input.state ?? "").toUpperCase();
    const sosUrl = SOS_URLS[state];
    if (!sosUrl) {
      return { source: this.source, source_kind: "government", status: "unavailable", error: `No SoS mapping for state '${state}'` };
    }

    try {
      const res = await fetch("https://api.firecrawl.dev/v2/search", {
        method: "POST",
        headers: { "Authorization": `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          query: `"${input.legal_name}" site:${new URL(sosUrl).hostname} OR "secretary of state" ${state} business entity`,
          limit: 3,
          scrapeOptions: { formats: ["markdown"] },
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        return { source: this.source, source_kind: "government", status: "error", error: data?.error ?? `HTTP ${res.status}` };
      }
      const results = Array.isArray(data?.web) ? data.web : data?.data ?? [];
      const hit = results.find((r: { url?: string; markdown?: string }) =>
        (r?.markdown ?? "").toLowerCase().includes(input.legal_name.toLowerCase()),
      );
      if (!hit) {
        return { source: this.source, source_kind: "government", status: "not_found", source_url: sosUrl };
      }
      return {
        source: this.source,
        source_kind: "government",
        status: "match",
        confidence: 75,
        matched_fields: ["legal_name"],
        raw_payload: { snippet: (hit.markdown ?? "").slice(0, 800), result_url: hit.url },
        source_url: hit.url ?? sosUrl,
      };
    } catch (err) {
      return { source: this.source, source_kind: "government", status: "error", error: (err as Error).message };
    }
  },
};

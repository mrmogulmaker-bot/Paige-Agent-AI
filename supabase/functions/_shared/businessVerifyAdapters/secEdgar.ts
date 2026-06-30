import type { VerifyAdapter, VerifyResult, BusinessVerifyInput } from "./types.ts";

export const secEdgarAdapter: VerifyAdapter = {
  source: "sec_edgar",
  enabled: () => true,
  async verify(input: BusinessVerifyInput): Promise<VerifyResult> {
    try {
      const url = `https://efts.sec.gov/LATEST/search-index?q=${encodeURIComponent(`"${input.legal_name}"`)}&forms=10-K,10-Q,8-K`;
      const res = await fetch(url, {
        headers: { "User-Agent": "PaigeAgent business-verifier ops@paigeagent.ai" },
      });
      if (!res.ok) return { source: this.source, source_kind: "government", status: "error", error: `HTTP ${res.status}` };
      const data = await res.json();
      const total = data?.hits?.total?.value ?? 0;
      if (total === 0) {
        return { source: this.source, source_kind: "government", status: "not_found" };
      }
      return {
        source: this.source,
        source_kind: "government",
        status: "match",
        confidence: 60,
        matched_fields: ["legal_name"],
        raw_payload: { total, top: data?.hits?.hits?.slice(0, 3) },
        source_url: `https://efts.sec.gov/LATEST/search-index?q=${encodeURIComponent(input.legal_name)}`,
      };
    } catch (err) {
      return { source: this.source, source_kind: "government", status: "error", error: (err as Error).message };
    }
  },
};

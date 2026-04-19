// Search SBA-approved lenders by project state.
//
// Backed by SBA's public Lender Activity Reports (data.sba.gov). The dataset
// is bundled at build time as `_shared/sba-lender-data.ts` and refreshed
// quarterly via `scripts/build-sba-data.py`. Keeping it in-process avoids
// parsing a 2.5 MB XLSX on every request and the SBA's CKAN datastore is not
// active for these resources, so live querying is not available.
//
// Endpoint shape mirrors search-local-lenders so paige-ai-chat can fan results
// into the same presentation pipeline.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import {
  SBA_7A_LENDERS_BY_STATE,
  SBA_504_CDCS_BY_STATE,
  SBA_DATA_VINTAGE,
  SBA_DATA_SOURCE_URL,
  type SbaLenderRow,
} from "../_shared/sba-lender-data.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const STATE_ABBR: Record<string, string> = {
  Alabama: "AL", Alaska: "AK", Arizona: "AZ", Arkansas: "AR", California: "CA",
  Colorado: "CO", Connecticut: "CT", Delaware: "DE", Florida: "FL", Georgia: "GA",
  Hawaii: "HI", Idaho: "ID", Illinois: "IL", Indiana: "IN", Iowa: "IA",
  Kansas: "KS", Kentucky: "KY", Louisiana: "LA", Maine: "ME", Maryland: "MD",
  Massachusetts: "MA", Michigan: "MI", Minnesota: "MN", Mississippi: "MS", Missouri: "MO",
  Montana: "MT", Nebraska: "NE", Nevada: "NV", "New Hampshire": "NH", "New Jersey": "NJ",
  "New Mexico": "NM", "New York": "NY", "North Carolina": "NC", "North Dakota": "ND",
  Ohio: "OH", Oklahoma: "OK", Oregon: "OR", Pennsylvania: "PA", "Rhode Island": "RI",
  "South Carolina": "SC", "South Dakota": "SD", Tennessee: "TN", Texas: "TX", Utah: "UT",
  Vermont: "VT", Virginia: "VA", Washington: "WA", "West Virginia": "WV", Wisconsin: "WI",
  Wyoming: "WY", "District of Columbia": "DC",
};

function resolveStateAbbr(input: string): string {
  if (input.length === 2) return input.toUpperCase();
  return STATE_ABBR[input] || input.toUpperCase().slice(0, 2);
}

interface SbaResult {
  name: string;
  source: "SBA";
  type: "SBA-Approved Lender (7a)" | "SBA-Approved CDC (504)";
  loan_program: "7a" | "504";
  city: string;
  state: string;
  project_state: string;
  approved_loans_in_state: number;
  approved_dollars_in_state: number;
  // Loan size capability inferred from average ticket size in this state.
  average_loan_size: number;
  data_vintage: string;
  data_source_url: string;
  // Phone/website not in SBA dataset — Paige tells the client to look these up.
  phone: null;
  website: null;
}

function rowToResult(r: SbaLenderRow, program: "7a" | "504"): SbaResult {
  return {
    name: r.l,
    source: "SBA",
    type: program === "7a" ? "SBA-Approved Lender (7a)" : "SBA-Approved CDC (504)",
    loan_program: program,
    city: r.lc || "",
    state: r.ls || "",
    project_state: r.ps,
    approved_loans_in_state: r.n,
    approved_dollars_in_state: r.d,
    average_loan_size: r.n > 0 ? Math.round(r.d / r.n) : 0,
    data_vintage: SBA_DATA_VINTAGE,
    data_source_url: SBA_DATA_SOURCE_URL,
    phone: null,
    website: null,
  };
}

interface SearchArgs {
  state?: string;
  city?: string;             // Reserved for future use — SBA dataset is state-level
  loan_type?: "7a" | "504" | "microloan" | "sba_express" | "all";
  loan_amount?: number;
  limit?: number;
  test?: boolean;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const respond = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

  try {
    const args: SearchArgs = await req.json();

    if (args.test) {
      return respond({
        ok: true,
        vintage: SBA_DATA_VINTAGE,
        source: SBA_DATA_SOURCE_URL,
        rows_7a: SBA_7A_LENDERS_BY_STATE.length,
        rows_504: SBA_504_CDCS_BY_STATE.length,
      });
    }

    if (!args.state) return respond({ error: "State is required" }, 400);

    const stateAbbr = resolveStateAbbr(args.state);
    const loanType = args.loan_type || "all";
    const limit = Math.min(args.limit ?? 10, 30);

    let rows: SbaResult[] = [];
    let microloanNote: string | null = null;
    let expressNote: string | null = null;

    // 7(a) — covers standard 7(a) and SBA Express (Express is a streamlined sub-product
    // of 7(a) but isn't broken out separately in the public Lender Activity Report).
    if (loanType === "7a" || loanType === "sba_express" || loanType === "all") {
      const matches = SBA_7A_LENDERS_BY_STATE
        .filter((r) => r.ps === stateAbbr)
        .sort((a, b) => b.d - a.d)
        .map((r) => rowToResult(r, "7a"));
      rows.push(...matches);
      if (loanType === "sba_express") {
        expressNote = "SBA Express loans are a streamlined sub-product of the 7(a) program — these are the active 7(a) lenders in the state who can offer Express. Confirm Express availability when you call.";
      }
    }

    // 504 — CDCs (Certified Development Companies)
    if (loanType === "504" || loanType === "all") {
      const matches = SBA_504_CDCS_BY_STATE
        .filter((r) => r.ps === stateAbbr)
        .sort((a, b) => b.d - a.d)
        .map((r) => rowToResult(r, "504"));
      rows.push(...matches);
    }

    // Microloan — SBA does not publish a queryable microloan intermediary list
    // in the same Lender Activity Reports. Direct the client to the official list.
    if (loanType === "microloan" || loanType === "all") {
      microloanNote = "SBA Microloan intermediaries are nonprofit lenders maintained on a separate list — I can't pull the live microloan list from the SBA's public dataset. The current intermediary directory is at https://www.sba.gov/partners/lenders/microloan-program/list-lenders. I recommend filtering by your state on that page.";
    }

    // Apply loan-amount feasibility filter: drop lenders whose average ticket
    // is more than 3x the request (likely too big) or less than 0.2x (likely
    // too small) — only when a loan_amount was supplied and we have signal.
    if (args.loan_amount && args.loan_amount > 0) {
      rows = rows.filter((r) => {
        if (!r.average_loan_size) return true;
        const ratio = r.average_loan_size / args.loan_amount!;
        return ratio >= 0.15 && ratio <= 5;
      });
    }

    rows = rows.slice(0, limit);

    return respond({
      results: rows,
      count: rows.length,
      searched_state: stateAbbr,
      loan_type: loanType,
      loan_amount: args.loan_amount ?? null,
      microloan_note: microloanNote,
      express_note: expressNote,
      data_vintage: SBA_DATA_VINTAGE,
      data_source_url: SBA_DATA_SOURCE_URL,
      note: rows.length === 0
        ? "No SBA lenders matched. The dataset only covers lenders that approved at least one loan in this state during the latest fiscal year. Try a neighboring state or a broader loan_type."
        : "Present these conversationally per the SBA LENDER SEARCH rules. Always note these come from SBA Lender Activity Reports, mention the data vintage, and remind the client that SBA terms (rates, limits) change periodically — they should confirm current terms with the lender directly or at sba.gov.",
    });
  } catch (err: any) {
    console.error("search-sba-lenders error:", err);
    return respond({ error: err?.message || "Search failed" }, 500);
  }
});

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const FDIC_BASE = "https://banks.data.fdic.gov/api/institutions";

interface LenderResult {
  name: string;
  type: "Credit Union" | "Community Bank" | "CDFI";
  address: string;
  city: string;
  state: string;
  zip: string;
  website: string;
  referenceId: string;
  source: "FDIC";
}

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

function titleCase(s: string): string {
  return s.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
}

async function queryFDIC(
  stateAbbr: string,
  city: string | undefined,
  specgrpFilter: string | undefined,
  label: LenderResult["type"]
): Promise<{ results: LenderResult[]; diagnostics: any }> {
  const url = new URL(FDIC_BASE);

  let filters = `STALP:"${stateAbbr}" AND ACTIVE:1`;
  if (city) filters += ` AND CITY:"${titleCase(city)}"`;
  if (specgrpFilter) filters += ` AND ${specgrpFilter}`;

  url.searchParams.set("filters", filters);
  url.searchParams.set("fields", "NAME,CITY,STALP,ADDRESS,ZIP,CERT,WEBADDR,SPECGRP");
  url.searchParams.set("limit", "15");
  url.searchParams.set("offset", "0");
  url.searchParams.set("sort_by", "NAME");
  url.searchParams.set("sort_order", "ASC");

  const requestedUrl = url.toString();
  const startTime = Date.now();

  try {
    const resp = await fetch(requestedUrl);
    const elapsed = Date.now() - startTime;
    const bodyText = await resp.text();

    if (!resp.ok) {
      console.error(`FDIC API error [${resp.status}] for ${requestedUrl}: ${bodyText.slice(0, 500)}`);
      return {
        results: [],
        diagnostics: {
          url: requestedUrl,
          status: resp.status,
          error: `FDIC returned HTTP ${resp.status}`,
          bodyPreview: bodyText.slice(0, 300),
          elapsed_ms: elapsed,
        },
      };
    }

    let data: any;
    try {
      data = JSON.parse(bodyText);
    } catch {
      console.error(`FDIC returned non-JSON for ${requestedUrl}: ${bodyText.slice(0, 200)}`);
      return {
        results: [],
        diagnostics: {
          url: requestedUrl,
          status: resp.status,
          error: "FDIC returned non-JSON response",
          bodyPreview: bodyText.slice(0, 300),
          elapsed_ms: elapsed,
        },
      };
    }

    const institutions = data?.data || [];

    const results: LenderResult[] = institutions.map((inst: any) => {
      const d = inst.data || inst;
      return {
        name: d.NAME || "Unknown Institution",
        type: label,
        address: d.ADDRESS || "",
        city: d.CITY || "",
        state: d.STALP || stateAbbr,
        zip: String(d.ZIP || ""),
        website: d.WEBADDR || "",
        referenceId: String(d.CERT || ""),
        source: "FDIC" as const,
      };
    });

    return {
      results,
      diagnostics: {
        url: requestedUrl,
        status: 200,
        total: data?.meta?.total || results.length,
        returned: results.length,
        elapsed_ms: elapsed,
      },
    };
  } catch (e: any) {
    const elapsed = Date.now() - startTime;
    console.error(`FDIC fetch error for ${requestedUrl}:`, e);
    return {
      results: [],
      diagnostics: {
        url: requestedUrl,
        error: e.message || String(e),
        error_code: e.code || null,
        elapsed_ms: elapsed,
      },
    };
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const respond = (body: any, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  try {
    const body = await req.json();

    // Test endpoint: hardcoded Atlanta GA query to verify FDIC connectivity
    if (body.test === true) {
      const testUrl = `${FDIC_BASE}?filters=STALP%3A%22GA%22%20AND%20CITY%3A%22Atlanta%22%20AND%20ACTIVE%3A1&fields=NAME,CITY,STALP,ADDRESS,ZIP,CERT,WEBADDR&limit=5&sort_by=NAME&sort_order=ASC`;
      const start = Date.now();
      try {
        const resp = await fetch(testUrl);
        const text = await resp.text();
        return respond({
          test: true,
          url: testUrl,
          status: resp.status,
          elapsed_ms: Date.now() - start,
          body: text.slice(0, 2000),
        });
      } catch (e: any) {
        return respond({
          test: true,
          url: testUrl,
          error: e.message,
          error_code: e.code || null,
          elapsed_ms: Date.now() - start,
        });
      }
    }

    const { state, city, lenderType } = body;

    if (!state) {
      return respond({ error: "State is required" }, 400);
    }

    const stateAbbr = resolveStateAbbr(state);
    const cleanCity = city?.trim() || undefined;
    const allDiagnostics: any[] = [];

    // FDIC tracks banks only — credit unions are NCUA-regulated and not in FDIC data.
    // For credit union searches, we return a note with a direct NCUA locator link.
    let creditUnionNote: string | null = null;

    const doSearch = async (c?: string) => {
      if (lenderType === "credit_union") {
        // FDIC doesn't track credit unions — direct user to NCUA locator
        creditUnionNote = `Credit unions are regulated by the NCUA, not the FDIC. Use the NCUA Credit Union Locator at https://mapping.ncua.gov to search for credit unions in ${stateAbbr}.`;
        // Also return savings institutions from FDIC as related results
        const r = await queryFDIC(stateAbbr, c, "SPECGRP:2", "Community Bank");
        allDiagnostics.push({ query: "savings_institutions", ...r.diagnostics });
        return r.results;
      } else if (lenderType === "cdfi") {
        const r = await queryFDIC(stateAbbr, c, "SPECGRP:5", "CDFI");
        allDiagnostics.push({ query: "cdfi", ...r.diagnostics });
        return r.results;
      } else if (lenderType === "community_bank") {
        const r = await queryFDIC(stateAbbr, c, undefined, "Community Bank");
        allDiagnostics.push({ query: "community_bank", ...r.diagnostics });
        return r.results;
      } else {
        // All types — parallel (banks + CDFIs from FDIC)
        const [banks, cdfis] = await Promise.all([
          queryFDIC(stateAbbr, c, undefined, "Community Bank"),
          queryFDIC(stateAbbr, c, "SPECGRP:5", "CDFI"),
        ]);
        allDiagnostics.push(
          { query: "community_bank", ...banks.diagnostics },
          { query: "cdfi", ...cdfis.diagnostics }
        );
        creditUnionNote = `For credit unions, visit the NCUA Credit Union Locator at https://mapping.ncua.gov`;
        return [...banks.results, ...cdfis.results];
      }
    };

    let results = await doSearch(cleanCity);
    let broadened = false;

    if (results.length === 0 && cleanCity) {
      broadened = true;
      results = await doSearch(undefined);
    }

    // Deduplicate by name
    const seen = new Set<string>();
    results = results.filter((r) => {
      const key = r.name.toUpperCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    return respond({
      results,
      broadened,
      searchedCity: cleanCity || null,
      count: results.length,
      diagnostics: allDiagnostics,
    });
  } catch (error: any) {
    console.error("Search local lenders error:", error);
    return respond({
      error: error.message || "Search failed",
      diagnostics: { error_stage: "request_parsing", message: error.message },
    }, 500);
  }
});

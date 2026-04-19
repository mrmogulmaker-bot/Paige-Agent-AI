import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const FDIC_BASE = "https://banks.data.fdic.gov/api/institutions";

type LenderTypeLabel =
  | "Credit Union"
  | "Community Bank"
  | "National Bank"
  | "Regional Bank"
  | "Savings Institution"
  | "Commercial Bank"
  | "Agricultural Bank"
  | "Minority Depository Institution"
  | "CDFI"
  | "Online Bank";

interface LenderResult {
  name: string;
  type: LenderTypeLabel;
  address: string;
  city: string;
  state: string;
  zip: string;
  website: string;
  referenceId: string;
  source: "FDIC";
  asset_size?: number | null;
  bureauPreference?: {
    primary_bureau: string;
    secondary_bureau: string | null;
    confidence_level: string;
    confidence_source: string;
    notes: string | null;
  } | null;
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

/**
 * Lender-type query plans for the FDIC API.
 *
 * FDIC field reference:
 *   - BKCLASS: Charter class (N=National, SM/NM=State Member/Non-Member,
 *              SB=Savings Bank, SA=Savings Assoc, OI=Insured Branch Foreign)
 *   - SPECGRP: Specialization group (2=Ag, 4=Commercial, 5=Mortgage, 6=Consumer)
 *   - ASSET:   Total assets in $ thousands
 *   - MDI_STATUS_CODE: Minority Depository Institution status (>0 = MDI)
 *   - CB_SA: Community bank designation flag
 */
interface QueryPlan {
  label: LenderTypeLabel;
  /** Extra FDIC filter clause appended after STALP/ACTIVE. */
  filter?: string;
}

const TYPE_PLANS: Record<string, QueryPlan> = {
  community_bank:    { label: "Community Bank", filter: 'CB_SA:"1"' },
  national_bank:     { label: "National Bank", filter: 'BKCLASS:"N"' },
  regional_bank:     { label: "Regional Bank", filter: "ASSET:[10000000 TO 100000000]" },
  savings:           { label: "Savings Institution", filter: '(BKCLASS:"SB" OR BKCLASS:"SA")' },
  commercial:        { label: "Commercial Bank", filter: "SPECGRP:4" },
  agricultural:      { label: "Agricultural Bank", filter: "SPECGRP:2" },
  mdi:               { label: "Minority Depository Institution", filter: "MDI_STATUS_CODE:[1 TO 5]" },
  cdfi:              { label: "CDFI", filter: 'CERT_CDFI:"1"' },
  online_bank:       { label: "Online Bank", filter: 'BKCLASS:"N" AND ASSET:[1000000 TO *]' },
};

async function queryFDIC(
  stateAbbr: string,
  city: string | undefined,
  plan: QueryPlan
): Promise<{ results: LenderResult[]; diagnostics: any }> {
  const url = new URL(FDIC_BASE);

  let filters = `STALP:"${stateAbbr}" AND ACTIVE:1`;
  if (city) filters += ` AND CITY:"${titleCase(city)}"`;
  if (plan.filter) filters += ` AND ${plan.filter}`;

  url.searchParams.set("filters", filters);
  url.searchParams.set("fields", "NAME,CITY,STALP,ADDRESS,ZIP,CERT,WEBADDR,SPECGRP,BKCLASS,ASSET,MDI_STATUS_CODE,CB_SA");
  url.searchParams.set("limit", "20");
  url.searchParams.set("offset", "0");
  url.searchParams.set("sort_by", "ASSET");
  url.searchParams.set("sort_order", "DESC");

  const requestedUrl = url.toString();
  const startTime = Date.now();

  try {
    const resp = await fetch(requestedUrl);
    const elapsed = Date.now() - startTime;
    const bodyText = await resp.text();

    if (!resp.ok) {
      return {
        results: [],
        diagnostics: { url: requestedUrl, status: resp.status, error: `FDIC returned HTTP ${resp.status}`, elapsed_ms: elapsed },
      };
    }

    let data: any;
    try { data = JSON.parse(bodyText); } catch {
      return { results: [], diagnostics: { url: requestedUrl, status: resp.status, error: "Non-JSON response", elapsed_ms: elapsed } };
    }

    const institutions = data?.data || [];
    const results: LenderResult[] = institutions.map((inst: any) => {
      const d = inst.data || inst;
      return {
        name: d.NAME || "Unknown Institution",
        type: plan.label,
        address: d.ADDRESS || "",
        city: d.CITY || "",
        state: d.STALP || stateAbbr,
        zip: String(d.ZIP || ""),
        website: d.WEBADDR || "",
        referenceId: String(d.CERT || ""),
        source: "FDIC" as const,
        asset_size: d.ASSET ? Number(d.ASSET) : null,
      };
    });

    return { results, diagnostics: { url: requestedUrl, status: 200, total: data?.meta?.total || results.length, returned: results.length, elapsed_ms: elapsed } };
  } catch (e: any) {
    return { results: [], diagnostics: { url: requestedUrl, error: e.message, elapsed_ms: Date.now() - startTime } };
  }
}

function fuzzyMatch(a: string, b: string): boolean {
  const normalize = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
  const na = normalize(a);
  const nb = normalize(b);
  return na.includes(nb) || nb.includes(na);
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const respond = (body: any, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

  try {
    const body = await req.json();

    // Test endpoint
    if (body.test === true) {
      const testUrl = `${FDIC_BASE}?filters=STALP%3A%22GA%22%20AND%20CITY%3A%22Atlanta%22%20AND%20ACTIVE%3A1&fields=NAME,CITY,STALP,ADDRESS,ZIP,CERT,WEBADDR&limit=5&sort_by=NAME&sort_order=ASC`;
      const start = Date.now();
      try {
        const resp = await fetch(testUrl);
        const text = await resp.text();
        return respond({ test: true, url: testUrl, status: resp.status, elapsed_ms: Date.now() - start, body: text.slice(0, 2000) });
      } catch (e: any) {
        return respond({ test: true, url: testUrl, error: e.message, elapsed_ms: Date.now() - start });
      }
    }

    const { state, city, lenderType } = body;
    if (!state) return respond({ error: "State is required" }, 400);

    const stateAbbr = resolveStateAbbr(state);
    const cleanCity = city?.trim() || undefined;
    const allDiagnostics: any[] = [];
    let creditUnionNote: string | null = null;

    const doSearch = async (c?: string) => {
      // Credit unions are NCUA-regulated, not in FDIC data
      if (lenderType === "credit_union") {
        creditUnionNote = `Credit unions are regulated by the NCUA, not the FDIC. Use the NCUA Credit Union Locator at https://mapping.ncua.gov to search for credit unions in ${stateAbbr}.`;
        return [];
      }

      // Specific lender type from our plan map
      if (lenderType && TYPE_PLANS[lenderType]) {
        const r = await queryFDIC(stateAbbr, c, TYPE_PLANS[lenderType]);
        allDiagnostics.push({ query: lenderType, ...r.diagnostics });
        return r.results;
      }

      // "All" — pull a balanced mix across the most useful categories
      const plans: { key: string; plan: QueryPlan }[] = [
        { key: "community_bank", plan: TYPE_PLANS.community_bank },
        { key: "national_bank", plan: TYPE_PLANS.national_bank },
        { key: "savings", plan: TYPE_PLANS.savings },
        { key: "mdi", plan: TYPE_PLANS.mdi },
      ];
      const queries = await Promise.all(plans.map((p) => queryFDIC(stateAbbr, c, p.plan)));
      queries.forEach((r, i) => allDiagnostics.push({ query: plans[i].key, ...r.diagnostics }));
      creditUnionNote = `For credit unions, visit the NCUA Credit Union Locator at https://mapping.ncua.gov`;
      return queries.flatMap((r) => r.results);
    };

    let results = await doSearch(cleanCity);
    let broadened = false;

    if (results.length === 0 && cleanCity) {
      broadened = true;
      results = await doSearch(undefined);
    }

    // Deduplicate by FDIC cert (most reliable) then by name
    const seenCert = new Set<string>();
    const seenName = new Set<string>();
    results = results.filter((r) => {
      if (r.referenceId && seenCert.has(r.referenceId)) return false;
      const nameKey = r.name.toUpperCase();
      if (seenName.has(nameKey)) return false;
      if (r.referenceId) seenCert.add(r.referenceId);
      seenName.add(nameKey);
      return true;
    });

    // Enrich with bureau preferences from the database
    try {
      const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
      const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
      const sb = createClient(supabaseUrl, serviceKey);

      const { data: prefs } = await sb
        .from("lender_bureau_preferences")
        .select("institution_name, fdic_cert, primary_bureau, secondary_bureau, confidence_level, confidence_source, notes");

      if (prefs && prefs.length > 0) {
        for (const result of results) {
          const certMatch = result.referenceId
            ? prefs.find((p: any) => p.fdic_cert && p.fdic_cert === result.referenceId)
            : null;

          if (certMatch) {
            result.bureauPreference = {
              primary_bureau: certMatch.primary_bureau,
              secondary_bureau: certMatch.secondary_bureau,
              confidence_level: certMatch.confidence_level,
              confidence_source: certMatch.confidence_source,
              notes: certMatch.notes,
            };
            continue;
          }

          const nameMatch = prefs.find((p: any) => fuzzyMatch(result.name, p.institution_name));
          if (nameMatch) {
            result.bureauPreference = {
              primary_bureau: nameMatch.primary_bureau,
              secondary_bureau: nameMatch.secondary_bureau,
              confidence_level: nameMatch.confidence_level,
              confidence_source: nameMatch.confidence_source,
              notes: nameMatch.notes,
            };
          }
        }
      }
    } catch (enrichErr: any) {
      console.error("Bureau preference enrichment failed (non-fatal):", enrichErr.message);
    }

    return respond({
      results,
      broadened,
      searchedCity: cleanCity || null,
      count: results.length,
      creditUnionNote,
      diagnostics: allDiagnostics,
    });
  } catch (error: any) {
    console.error("Search local lenders error:", error);
    return respond({ error: error.message || "Search failed" }, 500);
  }
});

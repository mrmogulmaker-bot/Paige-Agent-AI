import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

interface LenderResult {
  name: string;
  type: "Credit Union" | "Community Bank" | "CDFI";
  address: string;
  city: string;
  state: string;
  zip: string;
  website: string;
  referenceId: string;
  source: "NCUA" | "FDIC";
}

// Map full state names to abbreviations for FDIC API
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

async function searchFDIC(
  stateAbbr: string,
  city?: string,
  specgrpFilter?: string,
  label: LenderResult["type"] = "Community Bank"
): Promise<LenderResult[]> {
  const baseUrl = "https://api.fdic.gov/banks/institutions";
  const url = new URL(baseUrl);

  let filters = `STALP:"${stateAbbr}" AND ACTIVE:1`;
  if (city) filters += ` AND CITY:"${titleCase(city)}"`;
  if (specgrpFilter) filters += ` AND ${specgrpFilter}`;

  url.searchParams.set("filters", filters);
  url.searchParams.set("fields", "NAME,CITY,STALP,ADDRESS,ZIP,CERT,WEBADDR,SPECGRP");
  url.searchParams.set("limit", "15");
  url.searchParams.set("offset", "0");
  url.searchParams.set("sort_by", "NAME");
  url.searchParams.set("sort_order", "ASC");

  try {
    const resp = await fetch(url.toString());
    if (!resp.ok) {
      console.error("FDIC API returned", resp.status);
      return [];
    }
    const data = await resp.json();
    const institutions = data?.data || [];

    return institutions.map((inst: any) => {
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
  } catch (e) {
    console.error("FDIC API error:", e);
    return [];
  }
}

async function searchNCUA(stateAbbr: string, city?: string): Promise<LenderResult[]> {
  // NCUA Credit Union Locator - use their public API
  const url = new URL("https://mapping.ncua.gov/api/geocoding/searchbyfields");
  url.searchParams.set("State", stateAbbr);
  if (city) url.searchParams.set("City", titleCase(city));
  url.searchParams.set("PageSize", "15");
  url.searchParams.set("PageNumber", "1");

  try {
    const resp = await fetch(url.toString(), {
      headers: { Accept: "application/json" },
    });

    if (resp.ok) {
      const data = await resp.json();
      const items = Array.isArray(data) ? data : data?.list || data?.results || [];
      if (items.length > 0) {
        return items.map((cu: any) => ({
          name: cu.CU_NAME || cu.cuName || cu.name || "Unknown Credit Union",
          type: "Credit Union" as const,
          address: cu.Street || cu.street || cu.Address || "",
          city: cu.City || cu.city || "",
          state: cu.State || cu.state || stateAbbr,
          zip: String(cu.Zip || cu.ZipCode || ""),
          website: cu.Website || cu.URL || "",
          referenceId: String(cu.CU_NUMBER || cu.CharterNumber || ""),
          source: "NCUA" as const,
        }));
      }
    }
    console.log("NCUA primary returned", resp.status, "- falling back to FDIC credit union data");
  } catch (e) {
    console.error("NCUA API error:", e);
  }

  // Fallback: FDIC also tracks some credit-union-like institutions
  // Use INSTCAT for savings institutions as a rough proxy
  return await searchFDIC(stateAbbr, city, 'SPECGRP:6', "Credit Union");
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { state, city, lenderType } = await req.json();

    if (!state) {
      return new Response(JSON.stringify({ error: "State is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const stateAbbr = resolveStateAbbr(state);
    const cleanCity = city?.trim() || undefined;
    let results: LenderResult[] = [];
    let broadened = false;

    const search = async () => {
      if (lenderType === "credit_union") {
        return await searchNCUA(stateAbbr, cleanCity);
      } else if (lenderType === "cdfi") {
        return await searchFDIC(stateAbbr, cleanCity, "SPECGRP:5", "CDFI");
      } else if (lenderType === "community_bank") {
        return await searchFDIC(stateAbbr, cleanCity);
      } else {
        // All types
        const [cus, banks, cdfis] = await Promise.all([
          searchNCUA(stateAbbr, cleanCity),
          searchFDIC(stateAbbr, cleanCity),
          searchFDIC(stateAbbr, cleanCity, "SPECGRP:5", "CDFI"),
        ]);
        return [...cus, ...banks, ...cdfis];
      }
    };

    results = await search();

    // Broaden to statewide if city search returned nothing
    if (results.length === 0 && cleanCity) {
      broadened = true;
      if (lenderType === "credit_union") {
        results = await searchNCUA(stateAbbr);
      } else if (lenderType === "cdfi") {
        results = await searchFDIC(stateAbbr, undefined, "SPECGRP:5", "CDFI");
      } else if (lenderType === "community_bank") {
        results = await searchFDIC(stateAbbr);
      } else {
        const [cus, banks, cdfis] = await Promise.all([
          searchNCUA(stateAbbr),
          searchFDIC(stateAbbr),
          searchFDIC(stateAbbr, undefined, "SPECGRP:5", "CDFI"),
        ]);
        results = [...cus, ...banks, ...cdfis];
      }
    }

    // Deduplicate by name
    const seen = new Set<string>();
    results = results.filter((r) => {
      const key = r.name.toUpperCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    return new Response(JSON.stringify({
      results,
      broadened,
      searchedCity: cleanCity || null,
      count: results.length,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Search local lenders error:", error);
    return new Response(JSON.stringify({
      error: error instanceof Error ? error.message : "Search failed",
    }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

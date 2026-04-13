import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

interface SearchParams {
  state: string;
  city?: string;
  lenderType: string; // "credit_union" | "community_bank" | "cdfi" | "all"
}

interface LenderResult {
  name: string;
  type: "Credit Union" | "Community Bank" | "CDFI";
  address: string;
  city: string;
  state: string;
  zip: string;
  phone: string;
  referenceId: string;
  source: "NCUA" | "FDIC";
}

async function searchNCUA(state: string, city?: string): Promise<LenderResult[]> {
  const searchTerm = city || state;
  const url = `https://mapping.ncua.gov/api/geocoding/autocomplete/${encodeURIComponent(searchTerm)}`;
  
  // Use the NCUA search API
  const searchUrl = new URL("https://mapping.ncua.gov/api/geocoding/searchbyfields");
  searchUrl.searchParams.set("State", state);
  if (city) searchUrl.searchParams.set("City", city);
  searchUrl.searchParams.set("PageSize", "15");
  searchUrl.searchParams.set("PageNumber", "0");

  try {
    // Try the main search endpoint first
    const resp = await fetch(searchUrl.toString(), {
      headers: { "Accept": "application/json" },
    });

    if (resp.ok) {
      const data = await resp.json();
      const items = Array.isArray(data) ? data : (data?.results || data?.list || []);
      return items.map((cu: any) => ({
        name: cu.CU_NAME || cu.cu_name || cu.CuName || cu.name || "Unknown Credit Union",
        type: "Credit Union" as const,
        address: cu.Street || cu.street || cu.Address || cu.address || "",
        city: cu.City || cu.city || "",
        state: cu.State || cu.state || state,
        zip: cu.Zip || cu.zip || cu.ZipCode || "",
        phone: cu.Phone || cu.phone || cu.PhoneNumber || "",
        referenceId: String(cu.CU_NUMBER || cu.cu_number || cu.CharterNumber || cu.CHARTER_NUM || ""),
        source: "NCUA" as const,
      }));
    }

    // Fallback: try the institutions search
    const fallbackUrl = `https://www.ncua.gov/analysis/credit-union-corporate-call-report-data/credit-union-branch-information`;
    console.log("NCUA primary endpoint returned", resp.status, "- trying alternate approach");
  } catch (e) {
    console.error("NCUA API error:", e);
  }

  // Fallback: use FDIC-style query for credit unions
  // NCUA data is also partially available through FFIEC
  try {
    const ffiecUrl = new URL("https://banks.data.fdic.gov/api/institutions");
    let filters = `STNAME:"${state}" AND SPECGRP:6`;
    if (city) filters += ` AND CITY:"${city.toUpperCase()}"`;
    ffiecUrl.searchParams.set("filters", filters);
    ffiecUrl.searchParams.set("fields", "NAME,CITY,STALP,ADDRESS,ZIP,OFFDOM,CERT,SPECGRP,INSTCAT");
    ffiecUrl.searchParams.set("limit", "15");
    ffiecUrl.searchParams.set("sort_by", "NAME");
    ffiecUrl.searchParams.set("sort_order", "ASC");

    const resp2 = await fetch(ffiecUrl.toString());
    if (resp2.ok) {
      const data2 = await resp2.json();
      const institutions = data2?.data || [];
      if (institutions.length > 0) {
        return institutions.map((inst: any) => {
          const d = inst.data || inst;
          return {
            name: d.NAME || d.name || "Unknown Institution",
            type: "Credit Union" as const,
            address: d.ADDRESS || d.address || "",
            city: d.CITY || d.city || "",
            state: d.STALP || d.stalp || state,
            zip: d.ZIP || d.zip || "",
            phone: d.OFFDOM || "",
            referenceId: String(d.CERT || ""),
            source: "FDIC" as const,
          };
        });
      }
    }
  } catch (e2) {
    console.error("FDIC fallback for CUs error:", e2);
  }

  return [];
}

async function searchFDIC(state: string, city?: string, isCDFI = false): Promise<LenderResult[]> {
  const url = new URL("https://banks.data.fdic.gov/api/institutions");
  
  let filters = `STNAME:"${state}"`;
  if (city) filters += ` AND CITY:"${city.toUpperCase()}"`;
  if (isCDFI) {
    filters += ` AND SPECGRP:5`;
  } else {
    // Community banks - exclude credit unions (INSTCAT 450 = savings banks, others are commercial)
    filters += ` AND ACTIVE:1`;
  }
  
  url.searchParams.set("filters", filters);
  url.searchParams.set("fields", "NAME,CITY,STALP,ADDRESS,ZIP,OFFDOM,CERT,SPECGRP,ASSET,INSTCAT");
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
      const specgrp = String(d.SPECGRP || "");
      let type: LenderResult["type"] = "Community Bank";
      if (isCDFI || specgrp === "5") type = "CDFI";

      return {
        name: d.NAME || "Unknown Bank",
        type,
        address: d.ADDRESS || "",
        city: d.CITY || "",
        state: d.STALP || state,
        zip: d.ZIP || "",
        phone: d.OFFDOM || "",
        referenceId: String(d.CERT || ""),
        source: "FDIC" as const,
      };
    });
  } catch (e) {
    console.error("FDIC API error:", e);
    return [];
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { state, city, lenderType }: SearchParams = await req.json();

    if (!state) {
      return new Response(JSON.stringify({ error: "State is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let results: LenderResult[] = [];
    let broadened = false;

    if (lenderType === "credit_union") {
      results = await searchNCUA(state, city);
      if (results.length === 0 && city) {
        results = await searchNCUA(state);
        broadened = true;
      }
    } else if (lenderType === "cdfi") {
      results = await searchFDIC(state, city, true);
      if (results.length === 0 && city) {
        results = await searchFDIC(state, undefined, true);
        broadened = true;
      }
    } else if (lenderType === "community_bank") {
      results = await searchFDIC(state, city, false);
      if (results.length === 0 && city) {
        results = await searchFDIC(state, undefined, false);
        broadened = true;
      }
    } else {
      // "all" or "sba_preferred" - search both
      const [ncuaResults, fdicResults, cdfiResults] = await Promise.all([
        searchNCUA(state, city),
        searchFDIC(state, city, false),
        searchFDIC(state, city, true),
      ]);
      results = [...ncuaResults, ...fdicResults, ...cdfiResults];

      if (results.length === 0 && city) {
        const [ncua2, fdic2, cdfi2] = await Promise.all([
          searchNCUA(state),
          searchFDIC(state, undefined, false),
          searchFDIC(state, undefined, true),
        ]);
        results = [...ncua2, ...fdic2, ...cdfi2];
        broadened = true;
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
      searchedCity: city || null,
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

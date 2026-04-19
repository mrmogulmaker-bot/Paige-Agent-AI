import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.75.0";
import { z } from "https://esm.sh/zod@3.22.4";
import { getLendersForState, type SbaLender, type SbaLoanType } from "../_shared/sba-lender-data.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const bodySchema = z.object({
  state: z.string().length(2),
  city: z.string().max(120).optional(),
  loan_type: z.enum(["7a", "504", "microloan", "sba_express", "community_advantage", "all"]).optional(),
  loan_amount: z.number().positive().max(10_000_000).optional(),
});

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    // JWT validation (verify_jwt=true in config; double-check anyway)
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const token = authHeader.replace("Bearer ", "");
    const { data: claims, error: claimsErr } = await supabase.auth.getClaims(token);
    if (claimsErr || !claims?.claims) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const parsed = bodySchema.safeParse(await req.json());
    if (!parsed.success) {
      return new Response(
        JSON.stringify({ error: parsed.error.flatten().fieldErrors }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }
    const { state, city, loan_type = "all", loan_amount } = parsed.data;

    const all = getLendersForState(state);

    let filtered: SbaLender[] = all;

    if (loan_type !== "all") {
      filtered = filtered.filter((l) => l.loan_types.includes(loan_type as Exclude<SbaLoanType, "all">));
    }

    if (loan_amount != null) {
      filtered = filtered.filter((l) => {
        const max = l.max_loan_amount ?? Infinity;
        const min = l.min_loan_amount ?? 0;
        return loan_amount >= min && loan_amount <= max;
      });
    }

    if (city) {
      const cityLower = city.toLowerCase();
      const cityMatches = filtered.filter((l) => l.city.toLowerCase() === cityLower && l.state.toUpperCase() === state.toUpperCase());
      // If we have direct city matches, prepend them; otherwise return the broader state set
      if (cityMatches.length > 0) {
        const rest = filtered.filter((l) => !cityMatches.includes(l));
        filtered = [...cityMatches, ...rest];
      }
    }

    // De-dup by name (state-specific entries may overlap with national list)
    const seen = new Set<string>();
    const unique = filtered.filter((l) => {
      const key = l.name.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    const top = unique.slice(0, 10);

    return new Response(
      JSON.stringify({
        success: true,
        searched_state: state.toUpperCase(),
        searched_city: city || null,
        loan_type,
        loan_amount: loan_amount ?? null,
        count: top.length,
        lenders: top.map((l) => ({
          name: l.name,
          city: l.city,
          state: l.state,
          phone: l.phone || null,
          website: l.website || null,
          loan_types: l.loan_types,
          max_loan_amount: l.max_loan_amount ?? null,
          min_loan_amount: l.min_loan_amount ?? null,
          national: l.national,
          serves_minority_focused: l.serves_minority_focused ?? false,
          notes: l.notes || null,
          label: "SBA-Approved Lender",
        })),
        source: "SBA public lender activity reports (FY2024-2025) + Microloan intermediary list",
        disclaimer: "SBA lender lists update periodically. Confirm current SBA participation, rates, and program availability directly with each lender or at sba.gov/funding-programs.",
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    console.error("[search-sba-lenders] error:", err);
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { gatewayCompat } from "../_shared/claude.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.75.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const anonClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );
    const { data: { user }, error: userError } = await anonClient.auth.getUser();
    if (userError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Check role - must be admin or coach
    const { data: roles } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id);

    const userRoles = roles?.map((r: any) => r.role) || [];
    if (!userRoles.includes("admin") && !userRoles.includes("coach")) {
      return new Response(JSON.stringify({ error: "Access denied. Admin or coach role required." }), { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const { searchCriteria, isDeepResearch, clientUserId } = await req.json();

    if (!searchCriteria?.location?.state) {
      return new Response(JSON.stringify({ error: "Location (state) is required" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const LOVABLE_API_KEY = "unused";
    if (!LOVABLE_API_KEY) {
      return new Response(JSON.stringify({ error: "AI service not configured" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Build the search prompt
    const { location, fundingAmountMin, fundingAmountMax, fundingTypes, entityType, timeInBusiness, creditScoreMin, creditScoreMax } = searchCriteria;
    
    const fundingTypesStr = fundingTypes?.join(", ") || "all types";
    const amountRange = fundingAmountMin && fundingAmountMax 
      ? `$${fundingAmountMin.toLocaleString()} - $${fundingAmountMax.toLocaleString()}`
      : "any amount";

    const prompt = `You are a commercial lending research specialist. Find real lenders that match these criteria:

SEARCH CRITERIA:
- Location: ${location.city ? location.city + ", " : ""}${location.state}
- Funding Amount: ${amountRange}
- Funding Types: ${fundingTypesStr}
- Entity Type: ${entityType || "any"}
- Time in Business: ${timeInBusiness || "any"}
- Credit Score Range: ${creditScoreMin || "any"} - ${creditScoreMax || "any"}

Return a JSON array of lender objects. Each lender must have:
- name: string (full legal name)
- type: string (one of: "Local Bank", "Credit Union", "Regional Bank", "SBA Preferred Lender", "CDFI", "Commercial Lender", "Online Lender")
- products: string[] (specific products offered)
- minimumRequirements: string (brief summary)
- estimatedRates: string (rate range if known, or "Contact for rates")
- contactInfo: string (phone or general contact)
- website: string (URL)
- locationMatch: string (how this lender serves the target area)
- notes: string (any relevant notes about this lender)

Find at least 8-12 lenders across multiple categories. Focus on lenders actually operating in or serving ${location.state}. Include a mix of local banks, credit unions, SBA lenders, and CDFIs.

IMPORTANT: Return ONLY a valid JSON array, no other text.`;

    const deepResearchPrompt = isDeepResearch ? `\n\nAdditionally, after the lender list, provide a comprehensive market commentary section covering:
1. Current lending environment in ${location.state} for ${fundingTypesStr}
2. Interest rate trends and expectations
3. Common approval barriers for this borrower profile
4. Strategic recommendations for application sequencing
5. Alternative funding sources if traditional lending is challenging

Format the commentary as detailed paragraphs, not bullet points. Be specific about ${location.state} market conditions.

Return your response as a JSON object with two keys:
- "lenders": the array of lender objects described above
- "marketCommentary": a string with the market analysis text` : "";

    const finalPrompt = isDeepResearch 
      ? prompt.replace("IMPORTANT: Return ONLY a valid JSON array, no other text.", "") + deepResearchPrompt
      : prompt;

    // Call AI
    const aiResponse = await gatewayCompat("anthropic", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: "You are a commercial lending research specialist with deep knowledge of banks, credit unions, SBA lenders, CDFIs, and alternative lenders across the United States. Always return valid JSON." },
          { role: "user", content: finalPrompt },
        ],
      }),
    });

    if (!aiResponse.ok) {
      if (aiResponse.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limit exceeded. Please try again in a moment." }), { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      if (aiResponse.status === 402) {
        return new Response(JSON.stringify({ error: "AI credits exhausted. Please add funds." }), { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      throw new Error(`AI request failed: ${aiResponse.status}`);
    }

    const aiData = await aiResponse.json();
    const content = aiData.choices?.[0]?.message?.content || "";

    // Parse the response
    let lenders: any[] = [];
    let marketCommentary: string | null = null;

    try {
      // Clean up markdown code blocks if present
      const cleaned = content.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
      const parsed = JSON.parse(cleaned);
      
      if (Array.isArray(parsed)) {
        lenders = parsed;
      } else if (parsed.lenders) {
        lenders = parsed.lenders;
        marketCommentary = parsed.marketCommentary || null;
      }
    } catch (e) {
      console.error("Failed to parse AI response:", e);
      // Try to extract JSON array from the text
      const match = content.match(/\[[\s\S]*\]/);
      if (match) {
        try {
          lenders = JSON.parse(match[0]);
        } catch {
          console.error("Could not extract lender array from response");
        }
      }
    }

    // Save to database
    const { data: saved, error: saveError } = await supabase
      .from("lender_research_results")
      .insert({
        user_id: user.id,
        client_user_id: clientUserId || null,
        search_criteria: searchCriteria,
        results: lenders,
        market_commentary: marketCommentary,
        is_deep_research: isDeepResearch || false,
        search_status: "completed",
      })
      .select()
      .single();

    if (saveError) {
      console.error("Error saving results:", saveError);
    }

    return new Response(JSON.stringify({
      success: true,
      lenders,
      marketCommentary,
      savedId: saved?.id,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });

  } catch (error) {
    console.error("Lender research error:", error);
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

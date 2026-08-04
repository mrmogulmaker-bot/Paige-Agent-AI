import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

import { gatewayCompat } from "../_shared/claude.ts";
import { resolveOperatorIdentity, signatureLine } from "../_shared/operator-identity.ts";

// Resolve the authenticated caller's tenant from their JWT (present-only; null when
// unresolvable). Mirrors current_user_tenant_id(): active_tenant_id first, else the
// caller's first active tenant_members row. The letter's signing identity comes from
// THIS tenant's operator identity — never a hardcoded operator (§45/§9).
async function resolveCallerTenantId(
  admin: ReturnType<typeof createClient>,
  userId: string,
): Promise<string | null> {
  const [{ data: profile }, { data: memberships }] = await Promise.all([
    admin.from("profiles").select("active_tenant_id").eq("user_id", userId).maybeSingle(),
    admin
      .from("tenant_members")
      .select("tenant_id")
      .eq("user_id", userId)
      .eq("status", "active")
      .order("joined_at", { ascending: true })
      .limit(1),
  ]);
  const active = (profile as { active_tenant_id?: string | null } | null)?.active_tenant_id;
  if (active) return active;
  const first = (memberships as Array<{ tenant_id?: string }> | null)?.[0]?.tenant_id;
  return first ?? null;
}
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const LOVABLE_API_KEY = "unused";
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    const { outreach_type, lender_name, funding_product, client_context, followup_details, milestones, notes, compliance_review } = await req.json();

    if (!outreach_type || !client_context) {
      return new Response(JSON.stringify({ error: "outreach_type and client_context required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Resolve the operator identity of the CALLER'S tenant (§45/§9). The signing firm,
    // the advisor, and the sign-off are the tenant's OWN — resolved present-only from
    // the seam, never a hardcoded operator ("Project Mogul Enterprise" / "Antonio Cook").
    const admin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { persistSession: false } },
    );
    let tenantId: string | null = null;
    const authHeader = req.headers.get("Authorization");
    if (authHeader) {
      const { data: userData } = await admin.auth.getUser(authHeader.replace("Bearer ", ""));
      if (userData?.user) tenantId = await resolveCallerTenantId(admin, userData.user.id);
    }
    const operator = await resolveOperatorIdentity(admin, tenantId);

    // Present-only firm/advisor strings. product_name floors to the tenant's OWN name
    // inside the seam, so when a tenant resolves this is never an operator string; when
    // NOTHING resolves (unauthenticated), degrade to a neutral, brand-free noun.
    const firmName = operator.legal_entity_name ?? operator.product_name ?? "the funding advisory practice";
    const advisorClause = operator.signer_name
      ? ` led by ${operator.signer_name}${operator.signer_title ? ` (${operator.signer_title})` : ""}`
      : "";
    // signatureLine() is "" when nothing resolves — fall back to the neutral firm noun.
    const signOff = signatureLine(operator) || `Sign letters from "${firmName}" unless otherwise specified.`;

    const typeLabels: Record<string, string> = {
      lender_introduction: "Lender Introduction Letter",
      application_cover: "Application Cover Letter",
      lender_followup: "Lender Follow-Up Email",
      client_progress_update: "Client Progress Update",
    };

    const contextBlock = `
CLIENT PROFILE:
- Name: ${client_context.full_name || "N/A"}
- Entity Type: ${client_context.entity_type || "N/A"}
- Entity Name: ${client_context.entity_name || "N/A"}
- Funding Readiness Score: ${client_context.pme_score || "N/A"}/1000
- FICO Score Range: ${client_context.fico_score || "N/A"}
- BUILD Score: ${client_context.build_score || "N/A"}
- Total Funding Secured: $${client_context.funding_total || 0}
- Financial Summary: ${client_context.financial_summary || "N/A"}
- Milestones Completed: ${client_context.milestones_completed?.join(", ") || "None recorded"}
- Time in Business: ${client_context.time_in_business || "N/A"}
- Revenue Band: ${client_context.revenue_band || "N/A"}
`;

    let typeSpecificPrompt = "";

    switch (outreach_type) {
      case "lender_introduction":
        typeSpecificPrompt = `Write a professional Lender Introduction Letter from ${firmName} to ${lender_name || "the lender"} introducing this client for ${funding_product || "funding"}. The letter should establish ${firmName}'s credibility as a funding advisory firm, present the client's qualifications, and request a meeting or application review. Format as a formal business letter.`;
        break;
      case "application_cover":
        typeSpecificPrompt = `Write a professional Application Cover Letter to accompany a funding application to ${lender_name || "the lender"} for ${funding_product || "funding"}. Highlight the client's strengths, address potential concerns proactively, and frame the client as a strong candidate. Format as a formal cover letter.`;
        break;
      case "lender_followup":
        typeSpecificPrompt = `Write a professional follow-up email to ${lender_name || "the lender"} regarding a funding inquiry. Original outreach date: ${followup_details?.original_date || "recently"}. Days since follow-up was due: ${followup_details?.days_overdue || "N/A"}. Be polite but assertive, reference the original communication, and request a status update. Format as a professional email.`;
        break;
      case "client_progress_update":
        typeSpecificPrompt = `Write a professional client progress update that can be shared with lenders or stakeholders. Reference these completed milestones: ${milestones?.join(", ") || "N/A"}. ${notes ? `Additional context: ${notes}` : ""} Highlight the client's trajectory and readiness. Format as a professional update memo.`;
        break;
    }

    const systemPrompt = `You are a professional business writing assistant for ${firmName}, a funding advisory firm${advisorClause}. You write polished, compliant outreach documents for lender communications.

CRITICAL RULES:
- NEVER guarantee funding approval or specific terms
- NEVER provide legal advice
- NEVER use language that could be interpreted as broker solicitation
- Frame everything as financial education and advisory services
- Use professional, confident language that positions ${firmName} as a credible advisory firm
- Include appropriate disclaimers where needed
- Be specific with client data but never overpromise

${signOff}`;

    const messages = [
      { role: "system", content: systemPrompt },
      { role: "user", content: `${typeSpecificPrompt}\n\n${contextBlock}\n\nGenerate the complete ${typeLabels[outreach_type] || outreach_type}. Output ONLY the letter/email content, no meta-commentary.` },
    ];

    // Generate the draft
    const response = await gatewayCompat("anthropic", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages,
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error("AI gateway error:", response.status, errText);
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limit exceeded. Please try again shortly." }), {
          status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: "AI credits exhausted. Please add funds." }), {
          status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      throw new Error(`AI gateway error: ${response.status}`);
    }

    const aiResult = await response.json();
    const draftContent = aiResult.choices?.[0]?.message?.content || "";

    let complianceFlags: Array<{ phrase: string; concern: string; suggestion: string }> = [];

    // Compliance review if requested
    if (compliance_review) {
      const complianceResponse = await gatewayCompat("anthropic", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${LOVABLE_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "google/gemini-3-flash-preview",
          messages: [
            { role: "system", content: "You are a compliance reviewer for a financial advisory firm. Scan text for language that could be interpreted as: funding guarantees, legal advice, broker solicitation, misleading promises, or FCRA/CROA violations. Return ONLY a JSON array of flagged items." },
            { role: "user", content: `Review this outreach draft for compliance issues. Return a JSON array where each item has: "phrase" (the exact problematic phrase), "concern" (why it's flagged), "suggestion" (compliant replacement). If no issues found, return an empty array [].\n\nDraft:\n${draftContent}` },
          ],
          tools: [{
            type: "function",
            function: {
              name: "report_compliance_flags",
              description: "Report compliance flags found in the draft",
              parameters: {
                type: "object",
                properties: {
                  flags: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        phrase: { type: "string" },
                        concern: { type: "string" },
                        suggestion: { type: "string" },
                      },
                      required: ["phrase", "concern", "suggestion"],
                    },
                  },
                },
                required: ["flags"],
              },
            },
          }],
          tool_choice: { type: "function", function: { name: "report_compliance_flags" } },
        }),
      });

      if (complianceResponse.ok) {
        const compResult = await complianceResponse.json();
        const toolCall = compResult.choices?.[0]?.message?.tool_calls?.[0];
        if (toolCall?.function?.arguments) {
          try {
            const parsed = JSON.parse(toolCall.function.arguments);
            complianceFlags = parsed.flags || [];
          } catch { /* ignore parse errors */ }
        }
      }
    }

    return new Response(JSON.stringify({
      draft: draftContent,
      compliance_flags: complianceFlags,
      compliance_status: complianceFlags.length > 0 ? "flagged" : "passed",
    }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Outreach generation error:", error);
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

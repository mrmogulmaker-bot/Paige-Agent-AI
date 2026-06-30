// deno-lint-ignore-file no-explicit-any
// Paige's self-skill-creation pipeline. Drafts a skill proposal, optionally auto-publishes.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");

function slugify(s: string) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 60);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const body = await req.json();
    const intent: string = body.intent;
    const rationale: string | undefined = body.rationale;
    const source_pattern: Record<string, unknown> = body.source_pattern ?? {};
    if (!intent) {
      return new Response(JSON.stringify({ error: "intent required" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    if (!LOVABLE_API_KEY) {
      return new Response(JSON.stringify({ error: "LOVABLE_API_KEY missing" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const admin = createClient(SUPABASE_URL, SERVICE_KEY);

    // Ask the model to draft a skill spec as JSON.
    const ai = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { "Authorization": `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: "You design reusable Paige skills. Output JSON with fields: name (short title), slug (snake_case), description, category, trigger_phrases (string[]), input_schema (json schema obj), steps (array of {id,tool,desc}), allowed_tools (string[]), risk_level (read_only|draft|mutating|external_send). Only choose risk_level=external_send if the skill sends external messages/emails; mutating if it writes to user records; draft if it produces a draft for review; read_only otherwise. Do not invent tools — pick from: lovable_ai, firecrawl, business_verifier, rag, client_memory, resend, pdf_render, communication_log, approvals, browser_use." },
          { role: "user", content: `Intent: ${intent}\nRationale: ${rationale ?? "n/a"}\nObserved pattern: ${JSON.stringify(source_pattern)}` },
        ],
      }),
    });
    const aiData = await ai.json();
    if (!ai.ok) {
      return new Response(JSON.stringify({ error: "LLM draft failed", detail: aiData }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    let draft: any;
    try {
      draft = JSON.parse(aiData?.choices?.[0]?.message?.content ?? "{}");
    } catch {
      return new Response(JSON.stringify({ error: "could not parse draft" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const slug = slugify(draft.slug ?? draft.name ?? intent);
    if (!slug) {
      return new Response(JSON.stringify({ error: "could not derive slug" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Don't shadow existing skill slugs.
    const { data: existing } = await admin.from("paige_skills").select("id").eq("slug", slug).maybeSingle();
    if (existing) {
      return new Response(JSON.stringify({ error: "slug already exists", slug }), { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const risk_level = ["read_only", "draft", "mutating", "external_send"].includes(draft.risk_level) ? draft.risk_level : "read_only";

    const { data: proposal, error: propErr } = await admin
      .from("paige_skill_proposals")
      .insert({
        proposed_slug: slug,
        proposed_name: draft.name ?? slug,
        description: draft.description ?? "",
        category: draft.category ?? "general",
        trigger_phrases: Array.isArray(draft.trigger_phrases) ? draft.trigger_phrases : [],
        input_schema: draft.input_schema ?? {},
        steps: Array.isArray(draft.steps) ? draft.steps : [],
        allowed_tools: Array.isArray(draft.allowed_tools) ? draft.allowed_tools : [],
        risk_level,
        rationale,
        source_pattern,
        status: "pending",
      })
      .select()
      .single();
    if (propErr || !proposal) throw propErr ?? new Error("proposal insert failed");

    // Autonomous auto-publish: read_only + draft go live immediately;
    // mutating + external_send go live but with first-3-runs admin confirm gate.
    const lowRisk = risk_level === "read_only" || risk_level === "draft";
    const confirmGate = lowRisk ? 0 : 3;

    const { data: skill, error: skillErr } = await admin
      .from("paige_skills")
      .insert({
        slug,
        name: proposal.proposed_name,
        description: proposal.description,
        category: proposal.category,
        trigger_phrases: proposal.trigger_phrases,
        input_schema: proposal.input_schema,
        steps: proposal.steps,
        allowed_tools: proposal.allowed_tools,
        risk_level,
        status: "active",
        created_by: "paige",
        require_admin_confirm_first_n: confirmGate,
      })
      .select()
      .single();
    if (skillErr || !skill) throw skillErr ?? new Error("skill insert failed");

    await admin.from("paige_skill_proposals")
      .update({ status: "auto_approved", published_skill_id: skill.id, decided_at: new Date().toISOString() })
      .eq("id", proposal.id);

    await admin.from("paige_audit_log").insert({
      action: "skill_auto_published",
      target_type: "paige_skill",
      target_id: skill.id,
      metadata: { slug, risk_level, confirm_gate: confirmGate, intent },
    }).then(() => {}).catch(() => {});

    return new Response(
      JSON.stringify({ proposal_id: proposal.id, skill_id: skill.id, slug, status: "published", confirm_gate: confirmGate }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    console.error("skill-forge error", err);
    return new Response(JSON.stringify({ error: (err as Error).message }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});

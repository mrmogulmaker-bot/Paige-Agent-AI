// deno-lint-ignore-file no-explicit-any
// Paige's self-skill-creation pipeline. Drafts a skill proposal, optionally auto-publishes.
// AUTHORS `paige_skills` rows (concept 1 in docs/doctrine/skills-vocabulary.md — executable
// recipes) — NOT `paige_subagents` (that's subagent-forge, concept 3) and NOT
// `marketplace_items` (concept 2). If you're adding a team MEMBER, use subagent-forge instead.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

import { gatewayCompat } from "../_shared/claude.ts";
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

function slugify(s: string) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 60);
}

// The 12 canonical §15 skill categories — the ONLY values `paige_skills.category` accepts once the
// DB CHECK (migration 20260830000000) is live. A forged skill's LLM-chosen category is clamped to one
// of these so a forge can NEVER violate the CHECK (§37 producer inventory: skill-forge is the sole
// non-canonical producer). Mirrors docs/PAIGE-MASTER-PROJECT-REFERENCE.md §15.
const CANONICAL_CATEGORIES = [
  "vision_strategy", "client_delivery", "sales_growth", "marketing_content", "documents",
  "analytics_interpretation", "team_management", "financial_ops", "compliance_legal",
  "operations_process", "agent_orchestration", "superpowers",
] as const;

// Map an arbitrary LLM category string to a canonical §15 value. Exact match wins; otherwise a light
// keyword map; otherwise the generic operational bucket (never the old free-text "general", which the
// CHECK rejects). Belt to the prompt's suspenders — the LLM can still hallucinate a category.
function canonicalCategory(raw: unknown): string {
  const v = String(raw ?? "").trim().toLowerCase().replace(/[\s-]+/g, "_");
  if ((CANONICAL_CATEGORIES as readonly string[]).includes(v)) return v;
  const SYN: Array<[RegExp, string]> = [
    [/vision|strateg|planning|roadmap|okr|research/, "vision_strategy"],
    [/client|delivery|fulfil|onboard|kickoff|milestone/, "client_delivery"],
    [/sales|growth|outreach|lead|pipeline|proposal|prospect/, "sales_growth"],
    [/marketing|content|social|campaign|seo|newsletter|ad_/, "marketing_content"],
    [/document|^doc|letter|contract|report|deck|worksheet|checklist/, "documents"],
    [/analytic|metric|reporting|dashboard|insight|kpi/, "analytics_interpretation"],
    [/team|hr\b|hiring|people|interview|talent|onboarding_hire/, "team_management"],
    [/financ|invoice|billing|payment|dunning|cash|tax|revenue/, "financial_ops"],
    [/complian|legal|nda|policy|risk|contract_review|verification/, "compliance_legal"],
    [/operation|process|\bops\b|runbook|sop|vendor|capacity|general/, "operations_process"],
    [/orchestrat|\bagent|deleg|subagent|compose/, "agent_orchestration"],
    [/superpower|docx|pptx|xlsx|pdf|canvas|design|image|brand/, "superpowers"],
  ];
  for (const [re, val] of SYN) if (re.test(v)) return val;
  return "operations_process";
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

    const admin = createClient(SUPABASE_URL, SERVICE_KEY);

    // Ask the model to draft a skill spec as JSON.
    const ai = await gatewayCompat("anthropic", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: "You design reusable Paige skills. Output JSON with fields: name (short title), slug (snake_case), description, category, trigger_phrases (string[]), input_schema (json schema obj), steps (array of {id,tool,desc}), allowed_tools (string[]), risk_level (read_only|draft|mutating|external_send). category MUST be exactly one of: vision_strategy, client_delivery, sales_growth, marketing_content, documents, analytics_interpretation, team_management, financial_ops, compliance_legal, operations_process, agent_orchestration, superpowers — pick the closest fit. Only choose risk_level=external_send if the skill sends external messages/emails; mutating if it writes to user records; draft if it produces a draft for review; read_only otherwise. Do not invent tools — pick from: paige_ai, firecrawl, business_verifier, rag, client_memory, resend, pdf_render, communication_log, approvals, browser_use." },
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
    // Clamp to a canonical §15 category so the paige_skills CHECK (migration 20260830000000) can never
    // reject a forge (§37). Stored on the proposal too so proposal + published skill agree.
    const category = canonicalCategory(draft.category);

    const { data: proposal, error: propErr } = await admin
      .from("paige_skill_proposals")
      .insert({
        proposed_slug: slug,
        proposed_name: draft.name ?? slug,
        description: draft.description ?? "",
        category,
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

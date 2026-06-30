// Sub-Agent Factory — Section 18.5
// Lets Paige (and admins) propose new sub-agents. Soft proposals auto-ship.
// Hard proposals (need new edge function) route to the Approvals Hub.

import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

const DAILY_PROPOSAL_CAP = 10;
const SLUG_RE = /^[a-z][a-z0-9-]{2,40}$/;
const VALID_DOMAINS = new Set([
  "fundability", "compliance", "credit", "funding", "research",
  "outreach", "intake", "sales", "coaching", "ops", "support",
  "marketing", "analytics", "automation",
]);
// Soft agents may never request these data scopes — keeps Paige from
// auto-spinning an agent that touches raw PII/financial tables.
const PROTECTED_SCOPES = new Set([
  "credit_report_personal_info", "credit_accounts", "credit_negative_items",
  "banking_relationships", "connected_bank_accounts",
  "plaid_transactions", "credit_inquiries", "tier_state",
  "user_roles", "_internal_secrets", "connected_bank_account_secrets",
]);

function ok(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
    status,
  });
}
function fail(error: string, status = 400, details?: unknown) {
  return new Response(JSON.stringify({ ok: false, error, details }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
    status,
  });
}

async function getCaller(req: Request) {
  const auth = req.headers.get("Authorization");
  if (!auth?.startsWith("Bearer ")) return { userId: null as string | null, isAdmin: false };
  const { data } = await supabase.auth.getUser(auth.slice(7));
  const userId = data.user?.id ?? null;
  if (!userId) return { userId: null, isAdmin: false };
  const { data: roles } = await supabase
    .from("user_roles").select("role").eq("user_id", userId);
  const isAdmin = (roles ?? []).some((r: { role: string }) => r.role === "admin");
  return { userId, isAdmin };
}

async function quotaToday() {
  const today = new Date().toISOString().slice(0, 10);
  const { data } = await supabase
    .from("paige_subagent_factory_quota")
    .select("*").eq("quota_date", today).maybeSingle();
  return data ?? { quota_date: today, proposals_count: 0, soft_shipped: 0, hard_shipped: 0 };
}

async function bumpQuota(field: "proposals_count" | "soft_shipped" | "hard_shipped") {
  const today = new Date().toISOString().slice(0, 10);
  const cur = await quotaToday();
  const next = { ...cur, [field]: (cur as Record<string, number>)[field] + 1 };
  await supabase
    .from("paige_subagent_factory_quota")
    .upsert({ quota_date: today, ...next }, { onConflict: "quota_date" });
}

// Doctrine §116 enforcement: scan proposed system_prompt for hardcoded
// real-person names ("First Last") and business-suffix patterns.
const SAFE_NAME_ALLOWLIST = new Set([
  "Mogul Maker", "Maker Academy", "Mogul Academy",
  "Paige Agent", "Lovable Cloud", "Lovable AI",
  "First Last", "John Doe", "Jane Doe",
  "United States", "New York", "Los Angeles",
]);
const BUSINESS_SUFFIX_RE = /\b[A-Z][A-Za-z0-9&'-]+(?:\s+[A-Z][A-Za-z0-9&'-]+)*\s+(LLC|Inc|Corp|Corporation|Capital|Group|Holdings|Partners|Ventures|Bank|Financial)\b/;
const FIRST_LAST_RE = /\b[A-Z][a-z]{2,}\s+[A-Z][a-z]{2,}\b/g;

function scanDoctrine116(prompt: string): string | null {
  const biz = prompt.match(BUSINESS_SUFFIX_RE);
  if (biz) return `business-name pattern: "${biz[0]}"`;
  const matches = prompt.match(FIRST_LAST_RE) ?? [];
  for (const m of matches) {
    if (!SAFE_NAME_ALLOWLIST.has(m)) return `first+last name pattern: "${m}"`;
  }
  return null;
}

function validateProposal(p: Record<string, unknown>) {
  const errors: string[] = [];
  const slug = String(p.slug ?? "").toLowerCase();
  if (!SLUG_RE.test(slug)) errors.push("slug must match ^[a-z][a-z0-9-]{2,40}$");
  if (!p.name || String(p.name).length < 3) errors.push("name required (min 3 chars)");
  if (!p.domain || !VALID_DOMAINS.has(String(p.domain))) {
    errors.push(`domain must be one of: ${[...VALID_DOMAINS].join(", ")}`);
  }
  if (!p.description || String(p.description).length < 20) errors.push("description required (min 20 chars)");
  if (!p.rationale || String(p.rationale).length < 20) errors.push("rationale required (explain why this agent is needed)");
  if (!p.system_prompt || String(p.system_prompt).length < 50) errors.push("system_prompt required (min 50 chars)");
  const runtime = String(p.runtime ?? "soft");
  if (!["soft", "local", "langgraph"].includes(runtime)) errors.push("runtime must be soft|local|langgraph");

  const scopes = (p.data_scopes ?? []) as string[];
  if (runtime === "soft") {
    for (const s of scopes) {
      if (PROTECTED_SCOPES.has(s)) errors.push(`soft agents may not access protected scope: ${s}`);
    }
  }

  if (p.system_prompt) {
    const hit = scanDoctrine116(String(p.system_prompt));
    if (hit) {
      errors.push(
        `Doctrine §116: sub-agent prompts must use archetype phrasing only. ` +
        `Replace named individuals with 'a client', 'the contact', 'their business'. Matched ${hit}.`,
      );
    }
  }

  return { slug, runtime, errors };
}

async function actionPropose(body: Record<string, unknown>, caller: { userId: string | null; isAdmin: boolean }) {
  const { slug, runtime, errors } = validateProposal(body);
  if (errors.length) return fail("Validation failed", 422, errors);

  // Slug must not collide with an existing agent
  const { data: existing } = await supabase
    .from("paige_subagents").select("slug").eq("slug", slug).maybeSingle();
  if (existing) return fail(`slug already in use: ${slug}`, 409);

  const quota = await quotaToday();
  if (quota.proposals_count >= DAILY_PROPOSAL_CAP && !caller.isAdmin) {
    return fail(`daily proposal cap reached (${DAILY_PROPOSAL_CAP}). Try again tomorrow or have an admin override.`, 429);
  }

  const { data: proposal, error } = await supabase
    .from("paige_subagent_proposals")
    .insert({
      proposed_slug: slug,
      proposed_name: body.name,
      domain: body.domain,
      description: body.description,
      rationale: body.rationale,
      runtime,
      system_prompt: body.system_prompt,
      input_schema: body.input_schema ?? {},
      output_schema: body.output_schema ?? {},
      triggers: body.triggers ?? [],
      data_scopes: body.data_scopes ?? [],
      config: body.config ?? {},
      status: "proposed",
      proposed_by: caller.userId,
      proposed_by_agent: body.proposed_by_agent ?? "paige-orchestrator",
    })
    .select("*").single();
  if (error) return fail(error.message, 500);
  await bumpQuota("proposals_count");

  // Soft proposals: auto-ship. Hard proposals: route to Approvals Hub.
  if (runtime === "soft") {
    return await shipProposal(proposal.id, caller.userId);
  }
  return await routeForApproval(proposal.id, caller.userId);
}

async function shipProposal(proposalId: string, actorId: string | null) {
  const { data: p, error: fetchErr } = await supabase
    .from("paige_subagent_proposals").select("*").eq("id", proposalId).single();
  if (fetchErr || !p) return fail("Proposal not found", 404);
  if (p.status === "live") return ok({ ok: true, message: "Already live", proposal: p });

  // Insert into registry
  const { data: agent, error: insErr } = await supabase
    .from("paige_subagents")
    .insert({
      slug: p.proposed_slug,
      name: p.proposed_name,
      domain: p.domain,
      description: p.description,
      runtime: p.runtime,
      system_prompt: p.system_prompt,
      input_schema: p.input_schema,
      output_schema: p.output_schema,
      triggers: p.triggers,
      config: p.config,
      enabled: true,
      auto_generated: true,
      created_by: actorId,
      display_order: 999,
    })
    .select("id,slug").single();
  if (insErr) {
    await supabase.from("paige_subagent_proposals")
      .update({ status: "failed", error: insErr.message, reviewed_at: new Date().toISOString() })
      .eq("id", proposalId);
    return fail(insErr.message, 500);
  }

  await supabase.from("paige_subagent_proposals").update({
    status: "live",
    resulting_subagent_id: agent.id,
    reviewed_by: actorId,
    reviewed_at: new Date().toISOString(),
  }).eq("id", proposalId);
  await bumpQuota(p.runtime === "soft" ? "soft_shipped" : "hard_shipped");

  return ok({ ok: true, message: "Sub-agent is live", slug: agent.slug, id: agent.id, runtime: p.runtime });
}

async function routeForApproval(proposalId: string, actorId: string | null) {
  const { data: p } = await supabase
    .from("paige_subagent_proposals").select("*").eq("id", proposalId).single();
  if (!p) return fail("Proposal not found", 404);

  const { data: approval, error } = await supabase
    .from("paige_pending_approvals")
    .insert({
      approval_type: "subagent_creation",
      title: `New sub-agent: ${p.proposed_name}`,
      summary: `${p.description}\n\nWhy: ${p.rationale}`,
      status: "pending",
      severity: p.runtime === "langgraph" ? "high" : "medium",
      requested_by: actorId,
      payload: { proposal_id: proposalId, slug: p.proposed_slug, runtime: p.runtime, domain: p.domain },
    })
    .select("id").single();
  if (error) return fail(`Approval routing failed: ${error.message}`, 500);

  await supabase.from("paige_subagent_proposals")
    .update({ approval_id: approval.id, status: "proposed" })
    .eq("id", proposalId);

  return ok({
    ok: true,
    message: "Hard proposal routed to the Approvals Hub for admin sign-off.",
    proposal_id: proposalId,
    approval_id: approval.id,
    status: "pending_approval",
  });
}

async function actionApprove(body: Record<string, unknown>, caller: { userId: string | null; isAdmin: boolean }) {
  if (!caller.isAdmin) return fail("Admin only", 403);
  const id = String(body.proposal_id ?? "");
  if (!id) return fail("proposal_id required", 400);
  const { data: p } = await supabase
    .from("paige_subagent_proposals").select("*").eq("id", id).single();
  if (!p) return fail("Not found", 404);
  if (p.status === "live") return ok({ ok: true, message: "Already live" });
  return await shipProposal(id, caller.userId);
}

async function actionReject(body: Record<string, unknown>, caller: { userId: string | null; isAdmin: boolean }) {
  if (!caller.isAdmin) return fail("Admin only", 403);
  const id = String(body.proposal_id ?? "");
  if (!id) return fail("proposal_id required", 400);
  const { error } = await supabase
    .from("paige_subagent_proposals")
    .update({
      status: "rejected",
      reviewed_by: caller.userId,
      reviewed_at: new Date().toISOString(),
      review_notes: String(body.notes ?? ""),
    }).eq("id", id);
  if (error) return fail(error.message, 500);
  return ok({ ok: true });
}

async function actionList(body: Record<string, unknown>) {
  const status = body.status ? String(body.status) : null;
  let q = supabase.from("paige_subagent_proposals")
    .select("*").order("created_at", { ascending: false }).limit(50);
  if (status) q = q.eq("status", status);
  const { data, error } = await q;
  if (error) return fail(error.message, 500);
  const quota = await quotaToday();
  return ok({ ok: true, proposals: data ?? [], quota, cap: DAILY_PROPOSAL_CAP });
}

async function actionDisable(body: Record<string, unknown>, caller: { userId: string | null; isAdmin: boolean }) {
  if (!caller.isAdmin) return fail("Admin only", 403);
  const slug = String(body.slug ?? "");
  if (!slug) return fail("slug required", 400);
  const { error } = await supabase.from("paige_subagents")
    .update({ enabled: false, auto_disabled_reason: String(body.reason ?? "manual disable") })
    .eq("slug", slug);
  if (error) return fail(error.message, 500);
  return ok({ ok: true });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  let body: Record<string, unknown>;
  try { body = await req.json() as Record<string, unknown>; }
  catch { return fail("Invalid JSON", 400); }

  const caller = await getCaller(req);
  const action = String(body.action ?? "propose");

  try {
    switch (action) {
      case "propose":  return await actionPropose(body, caller);
      case "approve":  return await actionApprove(body, caller);
      case "reject":   return await actionReject(body, caller);
      case "list":     return await actionList(body);
      case "disable":  return await actionDisable(body, caller);
      default: return fail(`Unknown action: ${action}`, 400);
    }
  } catch (e) {
    console.error("[subagent-forge]", e);
    return fail((e as Error).message ?? "Internal error", 500);
  }
});

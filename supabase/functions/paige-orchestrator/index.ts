// Paige Orchestrator — Section 18 doctrine
// Tool-deferral pattern: exposes tool_search + tool_invoke to Paige.
// Routes invocations to local Edge Functions or to LangGraph via paige-bridge.

import { createClient } from "npm:@supabase/supabase-js@2";
import { routedChatCompletion, type JobKind } from "../_shared/model-router.ts";
import { looksLikeFinanceAgent } from "../_shared/finance-gate.ts";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const LANGGRAPH_BRIDGE_URL = Deno.env.get("LANGGRAPH_BRIDGE_URL") ?? "";
const LANGGRAPH_BRIDGE_KEY = Deno.env.get("LANGGRAPH_BRIDGE_API_KEY") ?? "";

const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

// A tenant_id must be a real uuid before it ever touches a PostgREST filter (§9): the tenant scope is
// the ONLY isolation boundary here because this fn queries with the SERVICE-ROLE client (RLS is bypassed).
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
// §2/#206: funding is an opt-in offer, never a default — a tenant without funding enabled must not see
// or invoke a funding/credit sub-agent. Classification (domain OR keyword) is the ONE shared home in
// _shared/finance-gate.ts, identical to the gate subagent-forge applies at creation time (§18).

/** Resolved, TRUSTED tenant scope for a request. tenant_id is a validated uuid or null (null = the caller
 *  sees only platform-default agents — safe). Never derived from an unverified request body for a user. */
interface TenantScope {
  tenantId: string | null;
  fundingEnabled: boolean;
  callerId: string | null;
}

/**
 * §9 tenant resolution — the security boundary. TWO trusted paths, never trust a user's body tenant_id:
 *   • SERVICE-ROLE caller (e.g. paige-ai-chat, which already resolved tenant from the user's JWT upstream):
 *     accept a uuid-VALIDATED body.tenant_id + body.funding_enabled. A malformed tenant_id is rejected
 *     (400) so it can never reach the filter.
 *   • USER (or anon) caller: derive tenant SERVER-SIDE from the JWT via get_paige_persona_context()
 *     (SECURITY DEFINER, resolves from auth.uid()), which returns the verified tenant_id AND funding_enabled.
 *     body.tenant_id is IGNORED entirely. An anon token (no user) resolves to null → defaults only.
 * Returns null tenantId on any miss (honest degrade to platform-defaults, never fail-open to all tenants).
 */
async function resolveTenantScope(req: Request, payload: OrchestratorRequest): Promise<TenantScope | { error: string; status: number }> {
  const auth = req.headers.get("Authorization");
  if (!auth?.startsWith("Bearer ")) return { error: "Missing bearer token", status: 401 };
  const token = auth.slice(7);
  // Defense-in-depth (§9/§13): trust the service path only on an EXACT match to the real service-role
  // key — not on an unverified `role` claim decoded from the token. This removes the silent dependency
  // on the gateway's verify_jwt=true; even if that config ever changed, a forged `role:service_role`
  // token can't enter the trusted branch. Internal callers (paige-ai-chat, paige-mcp) send this literal.
  const isServiceRole = token === SERVICE_ROLE_KEY;

  if (isServiceRole) {
    // Trusted internal caller — it resolved tenant upstream. Still uuid-validate before the filter (§9).
    const bodyTenant = (payload as { tenant_id?: string | null }).tenant_id ?? null;
    if (bodyTenant !== null && !UUID_RE.test(String(bodyTenant))) {
      return { error: "Invalid tenant_id", status: 400 };
    }
    const fundingEnabled = (payload as { funding_enabled?: boolean }).funding_enabled === true;
    return { tenantId: bodyTenant, fundingEnabled, callerId: payload.context?.user_id ?? null };
  }

  // User/anon caller — derive server-side; the body's tenant_id is never trusted.
  const authed = createClient(SUPABASE_URL, ANON_KEY, { global: { headers: { Authorization: auth } } });
  const { data: userData } = await authed.auth.getUser(token);
  const callerId = userData.user?.id ?? null;
  let tenantId: string | null = null;
  let fundingEnabled = false;
  try {
    const { data, error } = await authed.rpc("get_paige_persona_context");
    if (!error) {
      const row = Array.isArray(data) ? data[0] : data;
      const t = row?.tenant_id ?? null;
      tenantId = typeof t === "string" && UUID_RE.test(t) ? t : null;
      fundingEnabled = row?.funding_enabled === true;
    }
  } catch (_e) {
    tenantId = null; // honest degrade to platform-defaults; never widen scope on an error
  }
  return { tenantId, fundingEnabled, callerId };
}

type Action = "tool_search" | "tool_invoke" | "list_subagents";

interface OrchestratorRequest {
  action: Action;
  query?: string;
  domain?: string;
  slug?: string;
  input?: Record<string, unknown>;
  context?: {
    contact_id?: string;
    conversation_id?: string;
    user_id?: string;
  };
}

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

async function searchSubagents(query?: string, domain?: string, tenantId?: string | null, fundingEnabled = false) {
  let q = supabase
    .from("paige_subagents")
    // system_prompt is selected only so the §2 finance filter (below) sees the SAME signal fields the
    // tool_invoke guard does — keeps the listing gate symmetric with the invoke gate. It is filtered
    // out of the returned rows before they leave this function (see below).
    .select("slug,name,domain,description,runtime,triggers,display_order,system_prompt")
    .eq("enabled", true)
    .order("display_order");

  // §9 isolation: platform defaults (tenant_id null) + THIS tenant's own agents only. tenantId is a
  // trusted, uuid-validated value from resolveTenantScope (never a raw request body) — the filter is
  // parameterized (no string-interpolated injection): null tenant → defaults only.
  q = tenantId ? q.or(`tenant_id.is.null,tenant_id.eq.${tenantId}`) : q.is("tenant_id", null);

  if (domain) q = q.ilike("domain", `%${domain}%`);
  const { data, error } = await q;
  if (error) throw error;

  // §2/#206: hide funding/credit agents (by domain OR keyword) from a tenant that hasn't opted in.
  // system_prompt was selected ONLY to feed that classifier — strip it before any row leaves this
  // function so an agent's internal prompt never rides out in a tool_search response (§9/§13).
  const raw = data ?? [];
  const rows = (fundingEnabled ? raw : raw.filter((r) => !looksLikeFinanceAgent(r)))
    .map(({ system_prompt: _sp, ...rest }) => rest);

  if (!query) return rows;

  const needle = query.toLowerCase();
  return rows
    .map((row) => {
      const hay = [
        row.name,
        row.description,
        row.domain,
        ...(row.triggers ?? []),
      ]
        .join(" ")
        .toLowerCase();
      let score = 0;
      if (hay.includes(needle)) score += 5;
      for (const t of row.triggers ?? []) {
        if (needle.includes(String(t).toLowerCase())) score += 3;
      }
      return { ...row, score };
    })
    .filter((r) => r.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 8)
    .map(({ score: _s, ...rest }) => rest);
}

async function logInvocation(row: Record<string, unknown>) {
  const { data, error } = await supabase
    .from("paige_subagent_invocations")
    .insert(row)
    .select("id")
    .single();
  if (error) console.error("[orchestrator] log insert failed:", error.message);
  return data?.id as string | undefined;
}

async function updateInvocation(id: string, patch: Record<string, unknown>) {
  await supabase.from("paige_subagent_invocations").update(patch).eq("id", id);
}

async function invokeLocal(
  fnName: string,
  input: Record<string, unknown>,
  context: OrchestratorRequest["context"],
) {
  const url = `${SUPABASE_URL}/functions/v1/${fnName}`;
  const resp = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
      apikey: SERVICE_ROLE_KEY,
      "X-Orchestrator-Call": "1",
    },
    body: JSON.stringify({ input, context }),
  });
  const text = await resp.text();
  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    body = { raw: text };
  }
  return { status: resp.status, body };
}

async function dispatchLangGraph(
  graph: string,
  input: Record<string, unknown>,
  context: OrchestratorRequest["context"],
) {
  if (!LANGGRAPH_BRIDGE_URL || !LANGGRAPH_BRIDGE_KEY) {
    return {
      status: 503,
      body: {
        ok: false,
        error: "LangGraph bridge not configured",
        hint: "Set LANGGRAPH_BRIDGE_URL and LANGGRAPH_BRIDGE_API_KEY",
      },
    };
  }
  const resp = await fetch(LANGGRAPH_BRIDGE_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${LANGGRAPH_BRIDGE_KEY}`,
    },
    body: JSON.stringify({ graph, input, context }),
  });
  const text = await resp.text();
  let body: unknown;
  try { body = JSON.parse(text); } catch { body = { raw: text }; }
  return { status: resp.status, body };
}

// Soft sub-agent runtime — prompt-only, executed against the Lovable AI Gateway.
// No new edge function required; Paige can spin these up on her own.
async function invokeSoft(
  agent: { slug: string; name: string; system_prompt: string | null; config: Record<string, unknown> | null },
  input: Record<string, unknown>,
  _context: OrchestratorRequest["context"],
) {
  if (!agent.system_prompt) return { status: 500, body: { ok: false, error: `Soft agent ${agent.slug} missing system_prompt` } };
  const cfg = (agent.config ?? {}) as Record<string, unknown>;
  // §14 model routing: every agent picks the cheapest-capable model per its job tier.
  // Default 'internal_first_draft' (open-model-eligible) — a sub-agent's output is an
  // internal draft Paige integrates/reviews; an agent can override job_kind in its config
  // (e.g. a client-facing final → 'client_copy_final', which routes to Claude reasoning).
  const jobKind = (typeof cfg.job_kind === "string" ? cfg.job_kind : "internal_first_draft") as JobKind;
  const userPayload = typeof input === "string" ? input : JSON.stringify(input);
  try {
    const data = await routedChatCompletion(jobKind, {
      messages: [
        { role: "system", content: agent.system_prompt },
        { role: "user", content: userPayload },
      ],
      max_tokens: 2048,
    });
    const answer = (data as { choices?: Array<{ message?: { content?: string } }> })?.choices?.[0]?.message?.content ?? "";
    if (!answer) return { status: 502, body: { ok: false, error: "Model returned no content" } };
    return { status: 200, body: { ok: true, agent: agent.slug, answer } };
  } catch (e) {
    return { status: 502, body: { ok: false, error: e instanceof Error ? e.message : "model_error" } };
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  let payload: OrchestratorRequest;
  try {
    payload = (await req.json()) as OrchestratorRequest;
  } catch {
    return fail("Invalid JSON body", 400);
  }

  // §9 SECURITY: derive the tenant scope from a TRUSTED source (service-role body or JWT-derived), never
  // from an unverified user body. This is the only tenant boundary (service-role client bypasses RLS).
  const scope = await resolveTenantScope(req, payload);
  if ("error" in scope) return fail(scope.error, scope.status);
  const { tenantId, fundingEnabled, callerId } = scope;
  const ctx = { ...payload.context, user_id: payload.context?.user_id ?? callerId ?? undefined };

  try {
    if (payload.action === "list_subagents" || payload.action === "tool_search") {
      const matches = await searchSubagents(payload.query, payload.domain, tenantId, fundingEnabled);
      return ok({ ok: true, matches });
    }

    if (payload.action !== "tool_invoke") {
      return fail(`Unknown action: ${String(payload.action)}`, 400);
    }
    if (!payload.slug) return fail("Missing slug for tool_invoke", 400);

    let invQ = supabase
      .from("paige_subagents")
      .select("slug,name,domain,description,runtime,edge_function,langgraph_graph,enabled,system_prompt,config,tenant_id")
      .eq("slug", payload.slug);
    // §9 isolation: only a platform default or THIS tenant's own agent is invocable. Parameterized, and
    // tenantId is a trusted uuid-or-null from resolveTenantScope (no request-body injection).
    invQ = tenantId ? invQ.or(`tenant_id.is.null,tenant_id.eq.${tenantId}`) : invQ.is("tenant_id", null);
    const { data: agent, error } = await invQ.maybeSingle();
    if (error) throw error;
    if (!agent) return fail(`Unknown sub-agent: ${payload.slug}`, 404);
    // §2/#206: a funding/credit agent (by domain OR keyword) is invocable only by a funding-enabled
    // tenant. Return the SAME 404 as an unknown agent — never disclose that a gated agent exists.
    if (!fundingEnabled && looksLikeFinanceAgent(agent)) {
      return fail(`Unknown sub-agent: ${payload.slug}`, 404);
    }
    if (!agent.enabled) return fail(`Sub-agent disabled: ${payload.slug}`, 403);

    const startedAt = Date.now();
    const invocationId = await logInvocation({
      subagent_slug: agent.slug,
      invoked_by: ctx.user_id ?? null,
      contact_id: ctx.contact_id ?? null,
      conversation_id: ctx.conversation_id ?? null,
      input: payload.input ?? {},
      status: "pending",
    });

    let result: { status: number; body: unknown };
    if (agent.runtime === "local") {
      if (!agent.edge_function) return fail(`Sub-agent ${agent.slug} has no edge_function configured`, 500);
      result = await invokeLocal(agent.edge_function, payload.input ?? {}, ctx);
    } else if (agent.runtime === "soft") {
      result = await invokeSoft(
        { slug: agent.slug, name: agent.name, system_prompt: agent.system_prompt, config: agent.config },
        payload.input ?? {},
        ctx,
      );
    } else {
      if (!agent.langgraph_graph) return fail(`Sub-agent ${agent.slug} has no langgraph_graph configured`, 500);
      result = await dispatchLangGraph(agent.langgraph_graph, payload.input ?? {}, ctx);
    }

    const latency = Date.now() - startedAt;
    const success = result.status >= 200 && result.status < 300;
    const isDispatch = agent.runtime === "langgraph" && success;

    if (invocationId) {
      await updateInvocation(invocationId, {
        status: success ? (isDispatch ? "dispatched" : "succeeded") : "failed",
        latency_ms: latency,
        output: result.body,
        error: success
          ? null
          : typeof result.body === "object" && result.body
          ? JSON.stringify(result.body).slice(0, 500)
          : String(result.body).slice(0, 500),
        langgraph_run_id:
          isDispatch && typeof result.body === "object" && result.body
            ? (result.body as Record<string, unknown>).run_id as string | undefined ?? null
            : null,
      });
    }

    return ok(
      {
        ok: success,
        subagent: agent.slug,
        runtime: agent.runtime,
        latency_ms: latency,
        result: result.body,
      },
      success ? 200 : result.status,
    );
  } catch (e) {
    console.error("[orchestrator] error", e);
    return fail((e as Error).message ?? "Internal error", 500);
  }
});

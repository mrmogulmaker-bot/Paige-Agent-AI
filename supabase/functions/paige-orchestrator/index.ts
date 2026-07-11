// Paige Orchestrator — Section 18 doctrine
// Tool-deferral pattern: exposes tool_search + tool_invoke to Paige.
// Routes invocations to local Edge Functions or to LangGraph via paige-bridge.

import { createClient } from "npm:@supabase/supabase-js@2";
import { routedChatCompletion, type JobKind } from "../_shared/model-router.ts";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const LANGGRAPH_BRIDGE_URL = Deno.env.get("LANGGRAPH_BRIDGE_URL") ?? "";
const LANGGRAPH_BRIDGE_KEY = Deno.env.get("LANGGRAPH_BRIDGE_API_KEY") ?? "";

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

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

async function getCallerUserId(req: Request): Promise<string | null> {
  const auth = req.headers.get("Authorization");
  if (!auth?.startsWith("Bearer ")) return null;
  const token = auth.slice(7);
  const { data } = await supabase.auth.getUser(token);
  return data.user?.id ?? null;
}

async function searchSubagents(query?: string, domain?: string, tenantId?: string | null) {
  let q = supabase
    .from("paige_subagents")
    .select("slug,name,domain,description,runtime,triggers,display_order")
    .eq("enabled", true)
    // §9 isolation: platform defaults (tenant_id null) + this tenant's own agents only.
    .or(`tenant_id.is.null${tenantId ? `,tenant_id.eq.${tenantId}` : ""}`)
    .order("display_order");

  if (domain) q = q.ilike("domain", `%${domain}%`);
  const { data, error } = await q;
  if (error) throw error;

  if (!query) return data ?? [];

  const needle = query.toLowerCase();
  return (data ?? [])
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

  const callerId = await getCallerUserId(req);
  const ctx = { ...payload.context, user_id: payload.context?.user_id ?? callerId ?? undefined };
  // §9: tenant scope for who Paige can see/invoke. paige-ai-chat passes it from personaCtx.
  const tenantId = (payload as { tenant_id?: string | null }).tenant_id ?? null;

  try {
    if (payload.action === "list_subagents" || payload.action === "tool_search") {
      const matches = await searchSubagents(payload.query, payload.domain, tenantId);
      return ok({ ok: true, matches });
    }

    if (payload.action !== "tool_invoke") {
      return fail(`Unknown action: ${String(payload.action)}`, 400);
    }
    if (!payload.slug) return fail("Missing slug for tool_invoke", 400);

    const { data: agent, error } = await supabase
      .from("paige_subagents")
      .select("slug,name,runtime,edge_function,langgraph_graph,enabled,system_prompt,config,tenant_id")
      .eq("slug", payload.slug)
      // §9 isolation: only a platform default or THIS tenant's own agent is invocable.
      .or(`tenant_id.is.null${tenantId ? `,tenant_id.eq.${tenantId}` : ""}`)
      .maybeSingle();
    if (error) throw error;
    if (!agent) return fail(`Unknown sub-agent: ${payload.slug}`, 404);
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

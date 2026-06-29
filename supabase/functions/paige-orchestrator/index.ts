// Paige Orchestrator — Section 18 doctrine
// Tool-deferral pattern: exposes tool_search + tool_invoke to Paige.
// Routes invocations to local Edge Functions or to LangGraph via paige-bridge.

import { createClient } from "npm:@supabase/supabase-js@2";
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

async function searchSubagents(query?: string, domain?: string) {
  let q = supabase
    .from("paige_subagents")
    .select("slug,name,domain,description,runtime,triggers,display_order")
    .eq("enabled", true)
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
  try {
    body = JSON.parse(text);
  } catch {
    body = { raw: text };
  }
  return { status: resp.status, body };
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

  try {
    if (payload.action === "list_subagents" || payload.action === "tool_search") {
      const matches = await searchSubagents(payload.query, payload.domain);
      return ok({ ok: true, matches });
    }

    if (payload.action !== "tool_invoke") {
      return fail(`Unknown action: ${String(payload.action)}`, 400);
    }
    if (!payload.slug) return fail("Missing slug for tool_invoke", 400);

    const { data: agent, error } = await supabase
      .from("paige_subagents")
      .select("slug,name,runtime,edge_function,langgraph_graph,enabled")
      .eq("slug", payload.slug)
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
      if (!agent.edge_function) {
        return fail(`Sub-agent ${agent.slug} has no edge_function configured`, 500);
      }
      result = await invokeLocal(agent.edge_function, payload.input ?? {}, ctx);
    } else {
      if (!agent.langgraph_graph) {
        return fail(`Sub-agent ${agent.slug} has no langgraph_graph configured`, 500);
      }
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

// Customer-Scoped Paige (CSP) router — Ship #3.5 + Task #20 Phase 2.1 memory.
// Loads a per-contact context bundle via load_contact_context / load_self_context,
// mints/resumes a paige_chat_threads row, appends user + assistant turns via
// paige_chat_turn_append RPC. Enforces §189 feature gate + §194 monitoring framing.

import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

const MODEL = "google/gemini-2.5-flash";
const PRIOR_TURN_LIMIT = 20;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function redactKeys(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(redactKeys);
  if (v && typeof v === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
      const lk = k.toLowerCase();
      if (
        lk.endsWith("_ct") || lk.endsWith("_encrypted") ||
        lk.includes("ssn") || lk.includes("secret") ||
        lk.includes("access_token") || lk.includes("refresh_token") ||
        lk === "token" || lk === "password"
      ) continue;
      out[k] = redactKeys(val);
    }
    return out;
  }
  return v;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "POST only" }, 405);

  const authz = req.headers.get("authorization") ?? "";
  if (!authz.toLowerCase().startsWith("bearer ")) return json({ error: "Unauthorized" }, 401);

  const client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: authz } },
    auth: { persistSession: false },
  });

  const { data: userRes, error: userErr } = await client.auth.getUser();
  if (userErr || !userRes?.user) return json({ error: "Unauthorized" }, 401);

  // Site 2: resolve caller for system-prompt injection.
  let callerRole = "team member";
  let callerDisplayName = "an authenticated user";
  try {
    const [profRes, rolesRes] = await Promise.all([
      client.from("profiles").select("full_name").eq("user_id", userRes.user.id).maybeSingle(),
      client.from("user_roles").select("role").eq("user_id", userRes.user.id),
    ]);
    if (profRes.data?.full_name) callerDisplayName = String(profRes.data.full_name);
    if (rolesRes.data && rolesRes.data.length > 0) {
      const priority = ["super_admin", "admin", "coach", "broker", "client", "user"];
      const roles = (rolesRes.data as Array<{ role: string }>).map((r) => String(r.role));
      for (const p of priority) {
        if (roles.includes(p)) { callerRole = p; break; }
      }
      if (callerRole === "team member" && roles.length > 0) callerRole = roles[0];
    }
  } catch { /* non-fatal */ }

  let body: {
    contact_id?: string;
    self?: boolean;
    user_prompt?: string;
    scopes?: string[];
    thread_id?: string;
  };
  try { body = await req.json(); } catch { return json({ error: "Invalid JSON" }, 400); }
  const prompt = (body.user_prompt ?? "").toString().trim();
  if (!prompt) return json({ error: "user_prompt is required" }, 400);
  if (prompt.length > 4000) return json({ error: "user_prompt too long" }, 400);

  const scopesUsed = body.scopes && body.scopes.length ? body.scopes : ["contact"];

  // Load context (RLS applies)
  const rpc = body.self
    ? await client.rpc("load_self_context")
    : await client.rpc("load_contact_context", {
        p_contact_id: body.contact_id,
        p_scopes: scopesUsed,
      });

  if (rpc.error) return json({ error: rpc.error.message }, 400);
  const ctx = rpc.data as {
    ok: boolean; error?: string; message?: string;
    bundle?: unknown; surfaces_used?: string[]; load_id?: string; row_count?: number;
  };
  if (!ctx?.ok) {
    return json({
      ok: false,
      error: ctx?.error ?? "CONTEXT_UNAVAILABLE",
      message: ctx?.message ?? "Paige could not load context for this contact.",
      load_id: ctx?.load_id,
    }, ctx?.error === "CONSENT_NOT_GRANTED" ? 403 : 422);
  }

  const safeBundle = redactKeys(ctx.bundle ?? {});

  // Contact display name from bundle
  let contactDisplayName = "this contact";
  if (!body.self && ctx.bundle && typeof ctx.bundle === "object") {
    const arr = (ctx.bundle as Record<string, unknown>).contact;
    if (Array.isArray(arr) && arr.length > 0) {
      const c = arr[0] as Record<string, unknown>;
      const full = `${(c.first_name as string) ?? ""} ${(c.last_name as string) ?? ""}`.trim();
      contactDisplayName = full || (c.entity_name as string | undefined) || "this contact";
    }
  }

  // ==========================================================================
  // Task #20 — mint or resume thread
  // ==========================================================================
  let threadId: string | null = body.thread_id ?? null;
  let priorTurns: Array<{ role: string; content: string }> = [];

  if (threadId) {
    const { data: turns, error: turnsErr } = await client
      .from("paige_chat_turns")
      .select("role, content, created_at")
      .eq("thread_id", threadId)
      .in("role", ["user", "assistant"])
      .order("created_at", { ascending: true })
      .limit(PRIOR_TURN_LIMIT);
    if (turnsErr) return json({ ok: false, error: "TURN_LOAD_FAILED", message: turnsErr.message }, 400);
    priorTurns = (turns ?? []).map((t) => ({ role: String(t.role), content: String(t.content) }));
  } else {
    // Mint thread. Consent has passed via load_contact_context.
    const consentSnapshot = {
      checked_at: new Date().toISOString(),
      consent_flag: true,
      source: body.self ? "self_mode" : "clients.paige_shared_context_consent",
      source_row_id: body.self ? userRes.user.id : (body.contact_id ?? null),
      caller_user_id: userRes.user.id,
      scopes_requested: scopesUsed,
    };
    const title = prompt.split(/\s+/).slice(0, 8).join(" ").slice(0, 120);
    const { data: newId, error: createErr } = await client.rpc(
      "paige_chat_thread_create",
      {
        p_contact_id: body.self ? null : (body.contact_id ?? null),
        p_lens: body.self ? "client" : "coach",
        p_title: title,
        p_consent_snapshot: consentSnapshot,
      },
    );
    if (createErr) return json({ ok: false, error: "THREAD_CREATE_FAILED", message: createErr.message }, 400);
    threadId = newId as string;
  }

  if (!LOVABLE_API_KEY) {
    return json({
      ok: true,
      answer: "AI is not configured on this environment.",
      surfaces_used: ctx.surfaces_used ?? [],
      load_id: ctx.load_id,
      thread_id: threadId,
    });
  }

  const identityLine = body.self
    ? `You are speaking with ${callerRole} ${callerDisplayName}. They are asking about their own workspace.`
    : `You are speaking with ${callerRole} ${callerDisplayName}. They are asking about contact ${body.contact_id} (${contactDisplayName}).`;

  const system = [
    identityLine,
    "You are Paige — a compliance-first business-growth assistant.",
    "Answer ONLY from the CONTEXT bundle provided below. Do not invent facts.",
    "If the bundle is insufficient, say exactly what is missing and stop.",
    "You are a credit MONITORING and credit BUILDING platform. NEVER use the phrase 'credit repair' — Doctrine §194.",
    "Never guarantee approval or funding. Never claim to remove negatives. No legal or tax advice.",
    "Doctrine §116: never name another specific client, coach, or customer — use archetype phrasing.",
    "Keep replies under 220 words unless the user asks for detail.",
  ].join("\n");

  // Assemble message list: system + prior turns + current user turn (with bundle)
  const messages: Array<{ role: string; content: string }> = [
    { role: "system", content: system },
  ];
  for (const t of priorTurns) {
    messages.push({ role: t.role === "assistant" ? "assistant" : "user", content: t.content });
  }
  const userTurn = [
    "CONTEXT (JSON, redacted):",
    "```json",
    JSON.stringify(safeBundle).slice(0, 24_000),
    "```",
    "",
    "QUESTION:",
    prompt,
  ].join("\n");
  messages.push({ role: "user", content: userTurn });

  const t0 = Date.now();
  const aiRes = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", "Lovable-API-Key": LOVABLE_API_KEY },
    body: JSON.stringify({ model: MODEL, messages }),
  });
  if (!aiRes.ok) {
    const detail = (await aiRes.text()).slice(0, 500);
    return json({ ok: false, error: `AI gateway ${aiRes.status}`, detail, thread_id: threadId }, 502);
  }
  const j = await aiRes.json();
  const answer = j?.choices?.[0]?.message?.content ?? "";
  const latencyMs = Date.now() - t0;
  const tokensUsed = Number(j?.usage?.total_tokens ?? 0) || null;

  // Append user turn (raw prompt only — bundle is per-turn state, kept in bundle_ref)
  const bundleRef = {
    surfaces_used: ctx.surfaces_used ?? [],
    row_count: ctx.row_count ?? 0,
    scopes: scopesUsed,
  };
  const { error: userAppendErr } = await client.rpc("paige_chat_turn_append", {
    p_thread_id: threadId,
    p_role: "user",
    p_content: prompt,
    p_surfaces_used: ctx.surfaces_used ?? [],
    p_load_id: ctx.load_id ?? null,
    p_model: null,
    p_tokens_used: null,
    p_latency_ms: null,
    p_bundle_ref: bundleRef,
  });
  if (userAppendErr) {
    return json({ ok: false, error: "TURN_APPEND_FAILED", message: userAppendErr.message, thread_id: threadId }, 400);
  }

  const { error: asstAppendErr } = await client.rpc("paige_chat_turn_append", {
    p_thread_id: threadId,
    p_role: "assistant",
    p_content: answer,
    p_surfaces_used: ctx.surfaces_used ?? [],
    p_load_id: ctx.load_id ?? null,
    p_model: MODEL,
    p_tokens_used: tokensUsed,
    p_latency_ms: latencyMs,
    p_bundle_ref: bundleRef,
  });
  if (asstAppendErr) {
    // Don't fail the response — answer is already produced. Log and continue.
    console.error("assistant turn append failed:", asstAppendErr.message);
  }

  return json({
    ok: true,
    answer,
    surfaces_used: ctx.surfaces_used ?? [],
    row_count: ctx.row_count ?? 0,
    load_id: ctx.load_id,
    thread_id: threadId,
    prior_turn_count: priorTurns.length,
  });
});

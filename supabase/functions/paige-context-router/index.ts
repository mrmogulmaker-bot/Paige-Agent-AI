// Customer-Scoped Paige (CSP) router — Ship #3.5.
// Loads a per-contact context bundle via load_contact_context / load_self_context
// (SECURITY INVOKER — caller RLS applies), then asks Lovable AI to answer ONLY from
// that bundle. Enforces §189 feature gate + §194 monitoring-not-repair framing.

import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

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

  // Site 2 (Phase 1 coach identity): resolve caller for system-prompt injection.
  // Non-fatal on failure — falls back to generic labels.
  let callerRole = "team member";
  let callerDisplayName = "an authenticated user";
  try {
    const [profRes, rolesRes] = await Promise.all([
      client.from("profiles").select("full_name").eq("user_id", userRes.user.id).maybeSingle(),
      client.from("user_roles").select("role").eq("user_id", userRes.user.id),
    ]);
    if (profRes.data?.full_name) callerDisplayName = String(profRes.data.full_name);
    if (rolesRes.data && rolesRes.data.length > 0) {
      // Priority order verified against SELECT DISTINCT role FROM user_roles:
      // enum values in this project = super_admin, admin, coach, broker, client, user.
      // No platform_admin / platform_owner / tenant_admin / staff exist here.
      const priority = ["super_admin", "admin", "coach", "broker", "client", "user"];
      const roles = (rolesRes.data as Array<{ role: string }>).map((r) => String(r.role));
      for (const p of priority) {
        if (roles.includes(p)) { callerRole = p; break; }
      }
      // Fallback: unknown role name not in priority list — use first returned.
      if (callerRole === "team member" && roles.length > 0) callerRole = roles[0];
    }
  } catch { /* non-fatal */ }

  let body: { contact_id?: string; self?: boolean; user_prompt?: string; scopes?: string[] };
  try { body = await req.json(); } catch { return json({ error: "Invalid JSON" }, 400); }
  const prompt = (body.user_prompt ?? "").toString().trim();
  if (!prompt) return json({ error: "user_prompt is required" }, 400);
  if (prompt.length > 4000) return json({ error: "user_prompt too long" }, 400);

  // Load context (RLS applies)
  const rpc = body.self
    ? await client.rpc("load_self_context")
    : await client.rpc("load_contact_context", {
        p_contact_id: body.contact_id,
        p_scopes: body.scopes && body.scopes.length ? body.scopes : ["contact"],
      });

  if (rpc.error) return json({ error: rpc.error.message }, 400);
  const ctx = rpc.data as { ok: boolean; error?: string; message?: string; bundle?: unknown; surfaces_used?: string[]; load_id?: string; row_count?: number };
  if (!ctx?.ok) {
    return json({
      ok: false,
      error: ctx?.error ?? "CONTEXT_UNAVAILABLE",
      message: ctx?.message ?? "Paige could not load context for this contact.",
      load_id: ctx?.load_id,
    }, ctx?.error === "CONSENT_NOT_GRANTED" ? 403 : 422);
  }

  const safeBundle = redactKeys(ctx.bundle ?? {});

  // Contact display name pulled from bundle (registry-whitelisted client fields).
  let contactDisplayName = "this contact";
  if (!body.self && ctx.bundle && typeof ctx.bundle === "object") {
    const arr = (ctx.bundle as Record<string, unknown>).contact;
    if (Array.isArray(arr) && arr.length > 0) {
      const c = arr[0] as Record<string, unknown>;
      const full = `${(c.first_name as string) ?? ""} ${(c.last_name as string) ?? ""}`.trim();
      contactDisplayName = full || (c.entity_name as string | undefined) || "this contact";
    }
  }

  if (!LOVABLE_API_KEY) {
    return json({
      ok: true,
      answer: "AI is not configured on this environment.",
      surfaces_used: ctx.surfaces_used ?? [],
      load_id: ctx.load_id,
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

  const user = [
    "CONTEXT (JSON, redacted):",
    "```json",
    JSON.stringify(safeBundle).slice(0, 24_000),
    "```",
    "",
    "QUESTION:",
    prompt,
  ].join("\n");

  const aiRes = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", "Lovable-API-Key": LOVABLE_API_KEY },
    body: JSON.stringify({
      model: "google/gemini-2.5-flash",
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
    }),
  });
  if (!aiRes.ok) {
    const detail = (await aiRes.text()).slice(0, 500);
    return json({ ok: false, error: `AI gateway ${aiRes.status}`, detail }, 502);
  }
  const j = await aiRes.json();
  const answer = j?.choices?.[0]?.message?.content ?? "";

  return json({
    ok: true,
    answer,
    surfaces_used: ctx.surfaces_used ?? [],
    row_count: ctx.row_count ?? 0,
    load_id: ctx.load_id,
  });
});

// Paige MCP Server — Phase 1 (API-key auth, CRM tools).
// Hosted at https://<project>/functions/v1/paige-mcp (custom domain mcp.paigeagent.ai later).
// Auth: Bearer PAIGE_MCP_PLATFORM_KEY in Authorization header.
// Spec: docs/PAIGE-MCP-CONTRACT.md (to be drafted Phase 2).
//
// Tool catalog v1 (10 CRM tools):
//   search_contacts, get_contact, update_contact_stage, add_contact_note
//   list_deals, move_deal_stage, create_deal
//   list_tasks, create_task, complete_task

import { Hono } from "npm:hono@4";
import { McpServer, StreamableHttpTransport } from "npm:mcp-lite@^0.10.0";
import { createClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const PLATFORM_KEY = Deno.env.get("PAIGE_MCP_PLATFORM_KEY") ?? "";

const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

function ok(payload: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(payload, null, 2) }] };
}
function err(message: string) {
  return { content: [{ type: "text" as const, text: JSON.stringify({ error: message }) }], isError: true };
}

async function audit(actor: string, action: string, target_type: string | null, target_id: string | null, payload: Record<string, unknown>) {
  try {
    await admin.from("paige_audit_log").insert({
      actor_user_id: null,
      actor_role: `mcp:${actor}`,
      action,
      target_type,
      target_id,
      payload,
    });
  } catch (e) {
    console.error("[paige-mcp] audit failed", (e as Error).message);
  }
}

const server = new McpServer({ name: "paige-agent-ai", version: "1.0.0" });

// ---------- Contacts ----------
server.tool({
  name: "search_contacts",
  description: "Search Paige contacts (clients table) by name, email, phone, or company. Returns up to `limit` matches with the fields the CRM UI shows. Use this before any other contact tool to resolve a contact_id.",
  inputSchema: {
    type: "object",
    properties: {
      query: { type: "string", description: "Free-text match across first/last name, email, phone, entity_name." },
      lifecycle_stage: { type: "string", description: "Optional filter, e.g. 'qualifying', 'self_serve', 'active'." },
      limit: { type: "integer", minimum: 1, maximum: 50, default: 20 },
    },
    required: ["query"],
  },
  handler: async ({ query, lifecycle_stage, limit = 20 }: any) => {
    const safe = String(query).replace(/[,()]/g, " ").trim();
    let q = admin
      .from("clients")
      .select("id, first_name, last_name, email, phone, entity_name, lifecycle_stage, tier, status, assigned_coach_user_id, updated_at")
      .or(`first_name.ilike.%${safe}%,last_name.ilike.%${safe}%,email.ilike.%${safe}%,phone.ilike.%${safe}%,entity_name.ilike.%${safe}%`)
      .order("updated_at", { ascending: false })
      .limit(limit);
    if (lifecycle_stage) q = q.eq("lifecycle_stage", lifecycle_stage);
    const { data, error } = await q;
    if (error) return err(error.message);
    return ok({ items: data ?? [], count: (data ?? []).length });
  },
});

server.tool({
  name: "get_contact",
  description: "Fetch a single contact's full Paige profile, including funding goal, address, owner/coach assignments, and notes.",
  inputSchema: {
    type: "object",
    properties: { contact_id: { type: "string", description: "clients.id (uuid)" } },
    required: ["contact_id"],
  },
  handler: async ({ contact_id }: any) => {
    const { data, error } = await admin.from("clients").select("*").eq("id", contact_id).maybeSingle();
    if (error) return err(error.message);
    if (!data) return err("contact_not_found");
    return ok({ contact: data, paige_url: `https://paigeagent.ai/admin/contacts/${contact_id}` });
  },
});

server.tool({
  name: "update_contact_stage",
  description: "Move a contact through the lifecycle pipeline (e.g. lead → qualifying → active → won). Idempotent — calling with the current stage is a no-op.",
  inputSchema: {
    type: "object",
    properties: {
      contact_id: { type: "string" },
      lifecycle_stage: { type: "string", description: "New value, e.g. 'lead', 'qualifying', 'active', 'won', 'lost', 'self_serve'." },
      reason: { type: "string", description: "Short note explaining the move; written to current_notes." },
    },
    required: ["contact_id", "lifecycle_stage"],
  },
  handler: async ({ contact_id, lifecycle_stage, reason }: any) => {
    const patch: Record<string, unknown> = { lifecycle_stage };
    if (reason) patch.current_notes = String(reason).slice(0, 4000);
    const { data, error } = await admin.from("clients").update(patch).eq("id", contact_id).select("id, lifecycle_stage").maybeSingle();
    if (error) return err(error.message);
    if (!data) return err("contact_not_found");
    await audit("platform", "update_contact_stage", "client", contact_id, { lifecycle_stage, reason });
    return ok({ ok: true, contact_id, lifecycle_stage: data.lifecycle_stage });
  },
});

server.tool({
  name: "add_contact_note",
  description: "Append a timestamped note to a contact's current_notes field. Use for short observations; for structured activity use create_task or deal_activities.",
  inputSchema: {
    type: "object",
    properties: {
      contact_id: { type: "string" },
      note: { type: "string", description: "Plain text, max 2000 chars." },
    },
    required: ["contact_id", "note"],
  },
  handler: async ({ contact_id, note }: any) => {
    const { data: existing, error: readErr } = await admin.from("clients").select("current_notes").eq("id", contact_id).maybeSingle();
    if (readErr) return err(readErr.message);
    if (!existing) return err("contact_not_found");
    const stamp = new Date().toISOString();
    const next = `${existing.current_notes ?? ""}\n\n[${stamp} · MCP] ${String(note).slice(0, 2000)}`.trim();
    const { error } = await admin.from("clients").update({ current_notes: next }).eq("id", contact_id);
    if (error) return err(error.message);
    await audit("platform", "add_contact_note", "client", contact_id, { length: String(note).length });
    return ok({ ok: true, contact_id, appended_at: stamp });
  },
});

// ---------- Deals ----------
server.tool({
  name: "list_deals",
  description: "List deals on a pipeline, optionally filtered by stage, owner, or contact. Returns up to 50.",
  inputSchema: {
    type: "object",
    properties: {
      pipeline_id: { type: "string" },
      stage_id: { type: "string" },
      contact_id: { type: "string", description: "Filter to deals attached to this clients.id" },
      status: { type: "string", description: "open | won | lost" },
      limit: { type: "integer", minimum: 1, maximum: 50, default: 25 },
    },
  },
  handler: async ({ pipeline_id, stage_id, contact_id, status, limit = 25 }: any) => {
    let q = admin
      .from("deals")
      .select("id, title, pipeline_id, stage_id, contact_client_id, owner_user_id, value_cents, currency, status, expected_close_date, updated_at")
      .order("updated_at", { ascending: false })
      .limit(limit);
    if (pipeline_id) q = q.eq("pipeline_id", pipeline_id);
    if (stage_id) q = q.eq("stage_id", stage_id);
    if (contact_id) q = q.eq("contact_client_id", contact_id);
    if (status) q = q.eq("status", status);
    const { data, error } = await q;
    if (error) return err(error.message);
    return ok({ items: data ?? [] });
  },
});

server.tool({
  name: "move_deal_stage",
  description: "Move a deal to a different pipeline stage. Logs a deal_activities row so the change appears in the CRM timeline.",
  inputSchema: {
    type: "object",
    properties: {
      deal_id: { type: "string" },
      stage_id: { type: "string", description: "pipeline_stages.id" },
      reason: { type: "string" },
    },
    required: ["deal_id", "stage_id"],
  },
  handler: async ({ deal_id, stage_id, reason }: any) => {
    const { data, error } = await admin.from("deals").update({ stage_id }).eq("id", deal_id).select("id, stage_id, pipeline_id").maybeSingle();
    if (error) return err(error.message);
    if (!data) return err("deal_not_found");
    await admin.from("deal_activities").insert({
      deal_id,
      type: "stage_change",
      summary: `Moved to stage ${stage_id}${reason ? ` — ${String(reason).slice(0, 200)}` : ""}`,
      payload: { stage_id, source: "mcp" },
    });
    await audit("platform", "move_deal_stage", "deal", deal_id, { stage_id, reason });
    return ok({ ok: true, deal_id, stage_id: data.stage_id });
  },
});

server.tool({
  name: "create_deal",
  description: "Create a new deal on a pipeline. If `stage_id` is omitted the deal lands on the pipeline's first stage. Value should be sent in cents.",
  inputSchema: {
    type: "object",
    properties: {
      title: { type: "string" },
      pipeline_id: { type: "string" },
      stage_id: { type: "string" },
      contact_id: { type: "string", description: "clients.id of the linked contact" },
      value_cents: { type: "integer", minimum: 0 },
      currency: { type: "string", default: "USD" },
      expected_close_date: { type: "string", description: "ISO date, e.g. 2026-08-15" },
      source: { type: "string" },
    },
    required: ["title", "pipeline_id"],
  },
  handler: async ({ title, pipeline_id, stage_id, contact_id, value_cents, currency = "USD", expected_close_date, source }: any) => {
    let resolvedStage = stage_id;
    if (!resolvedStage) {
      const { data: stages } = await admin
        .from("pipeline_stages")
        .select("id")
        .eq("pipeline_id", pipeline_id)
        .order("position", { ascending: true })
        .limit(1);
      resolvedStage = stages?.[0]?.id;
      if (!resolvedStage) return err("pipeline_has_no_stages");
    }
    const { data, error } = await admin
      .from("deals")
      .insert({
        title,
        pipeline_id,
        stage_id: resolvedStage,
        contact_client_id: contact_id ?? null,
        value_cents: value_cents ?? null,
        currency,
        expected_close_date: expected_close_date ?? null,
        source: source ?? "mcp",
        status: "open",
      })
      .select("id")
      .single();
    if (error) return err(error.message);
    await audit("platform", "create_deal", "deal", data.id, { title, pipeline_id, stage_id: resolvedStage });
    return ok({ ok: true, deal_id: data.id, paige_url: `https://paigeagent.ai/admin/pipeline?deal=${data.id}` });
  },
});

// ---------- Tasks ----------
server.tool({
  name: "list_tasks",
  description: "List tasks, optionally scoped to an owner, deal, or status. Returns up to 50.",
  inputSchema: {
    type: "object",
    properties: {
      owner_user_id: { type: "string" },
      deal_id: { type: "string" },
      status: { type: "string", description: "Task status, typically 'open' | 'done' | 'snoozed'." },
      limit: { type: "integer", minimum: 1, maximum: 50, default: 25 },
    },
  },
  handler: async ({ owner_user_id, deal_id, status, limit = 25 }: any) => {
    let q = admin
      .from("tasks")
      .select("id, user_id, deal_id, title, description, status, due_date, created_at")
      .order("due_date", { ascending: true, nullsFirst: false })
      .limit(limit);
    if (owner_user_id) q = q.eq("user_id", owner_user_id);
    if (deal_id) q = q.eq("deal_id", deal_id);
    if (status) q = q.eq("status", status);
    const { data, error } = await q;
    if (error) return err(error.message);
    return ok({ items: data ?? [] });
  },
});

server.tool({
  name: "create_task",
  description: "Create a CRM task. Either `owner_user_id` or `deal_id` should be provided so the task surfaces somewhere.",
  inputSchema: {
    type: "object",
    properties: {
      title: { type: "string" },
      description: { type: "string" },
      owner_user_id: { type: "string", description: "Profiles/auth user id of the assignee." },
      deal_id: { type: "string" },
      due_date: { type: "string", description: "ISO timestamp." },
      track: { type: "string", description: "Free-form bucket, e.g. 'sales', 'cs', 'btf'." },
    },
    required: ["title"],
  },
  handler: async ({ title, description, owner_user_id, deal_id, due_date, track }: any) => {
    const { data, error } = await admin
      .from("tasks")
      .insert({
        title,
        description: description ?? null,
        user_id: owner_user_id ?? null,
        deal_id: deal_id ?? null,
        due_date: due_date ?? null,
        track: track ?? "sales",
        status: "open",
      })
      .select("id")
      .single();
    if (error) return err(error.message);
    await audit("platform", "create_task", "task", data.id, { title, owner_user_id, deal_id });
    return ok({ ok: true, task_id: data.id });
  },
});

server.tool({
  name: "complete_task",
  description: "Mark a task as done.",
  inputSchema: {
    type: "object",
    properties: { task_id: { type: "string" } },
    required: ["task_id"],
  },
  handler: async ({ task_id }: any) => {
    const { data, error } = await admin.from("tasks").update({ status: "done" }).eq("id", task_id).select("id").maybeSingle();
    if (error) return err(error.message);
    if (!data) return err("task_not_found");
    await audit("platform", "complete_task", "task", task_id, {});
    return ok({ ok: true, task_id });
  },
});

// ---------- HTTP + auth wrapper ----------
const app = new Hono();
const transport = new StreamableHttpTransport();

app.options("/*", (c) => {
  return c.body(null, 204, {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, content-type, mcp-session-id, accept",
    "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
    "Access-Control-Max-Age": "86400",
  });
});

app.all("/*", async (c) => {
  if (!PLATFORM_KEY) {
    return c.json({ error: "server_misconfigured", detail: "PAIGE_MCP_PLATFORM_KEY not set" }, 500);
  }
  const auth = c.req.header("authorization") ?? "";
  const presented = auth.replace(/^Bearer\s+/i, "").trim();
  if (presented !== PLATFORM_KEY) {
    return c.json({ error: "unauthorized" }, 401, {
      "WWW-Authenticate": 'Bearer realm="paige-mcp"',
    });
  }
  const res = await transport.handleRequest(c.req.raw, server);
  // Mirror permissive CORS on responses
  res.headers.set("Access-Control-Allow-Origin", "*");
  return res;
});

Deno.serve(app.fetch);

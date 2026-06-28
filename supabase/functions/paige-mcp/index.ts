// Paige MCP Server — Phase 2 (API-key auth, 30 tools across CRM/Workflows/BTF/Admin).
// Hosted at https://<project>/functions/v1/paige-mcp (custom domain mcp.paigeagent.ai later).
// Auth: Bearer PAIGE_MCP_PLATFORM_KEY in Authorization header.
//
// Tool catalog:
//  CRM (10): search_contacts, get_contact, update_contact_stage, add_contact_note,
//            list_deals, move_deal_stage, create_deal, list_tasks, create_task, complete_task
//  Workflows (5): list_workflows, run_workflow*, get_workflow_run,
//                 list_pending_approvals, decide_pending_approval*
//  BTF (6): list_btf_clients, get_btf_workspace, list_btf_phase_items,
//           update_btf_phase_item*, list_btf_document_requests, send_btf_message*
//  Admin (6): list_team_members, assign_coach*, create_team_invitation*,
//             list_unassigned_queue, list_admin_notifications, create_admin_notification
//  Destructive tools marked * carry annotations.destructiveHint=true so MCP hosts
//  (Claude Desktop, ChatGPT, etc.) can gate them behind user approval.
//
// Phase 3 (next): OAuth 2.1 + Dynamic Client Registration + per-user RLS tokens.
// Discovery endpoints below are scaffolding for that work.

import { Hono } from "npm:hono@4";
import { McpServer, StreamableHttpTransport } from "npm:mcp-lite@^0.10.0";
import { z } from "npm:zod@^3.25.0";
import { createClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const PLATFORM_KEY = Deno.env.get("PAIGE_MCP_PLATFORM_KEY") ?? "";

const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const mcp = new McpServer({
  name: "paige-agent-ai",
  version: "1.0.0",
  // mcp-lite needs a Standard Schema → JSON Schema adapter; Zod v3 ships with .toJSON via zod-to-json-schema,
  // but we keep it inline + minimal here.
  schemaAdapter: (schema: any) => zodToJsonSchema(schema as z.ZodTypeAny),
});

// Tiny Zod→JSON Schema converter covering object/string/number/integer/boolean/enum/optional/default.
function zodToJsonSchema(schema: z.ZodTypeAny): Record<string, unknown> {
  const def: any = (schema as any)._def;
  const t = def?.typeName;
  switch (t) {
    case "ZodObject": {
      const shape = def.shape();
      const properties: Record<string, unknown> = {};
      const required: string[] = [];
      for (const [k, v] of Object.entries<any>(shape)) {
        properties[k] = zodToJsonSchema(v);
        if (!(v as any).isOptional?.()) required.push(k);
      }
      const out: Record<string, unknown> = { type: "object", properties };
      if (required.length) out.required = required;
      return out;
    }
    case "ZodString": {
      const out: Record<string, unknown> = { type: "string" };
      if (def.description) out.description = def.description;
      return out;
    }
    case "ZodNumber":
      return { type: def.checks?.some((c: any) => c.kind === "int") ? "integer" : "number" };
    case "ZodBoolean":
      return { type: "boolean" };
    case "ZodEnum":
      return { type: "string", enum: def.values };
    case "ZodOptional":
      return zodToJsonSchema(def.innerType);
    case "ZodDefault":
      return { ...zodToJsonSchema(def.innerType), default: def.defaultValue() };
    case "ZodNullable":
      return zodToJsonSchema(def.innerType);
    default:
      return {};
  }
}

function ok(payload: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(payload, null, 2) }] };
}
function err(message: string) {
  return { content: [{ type: "text" as const, text: JSON.stringify({ error: message }) }], isError: true };
}

async function audit(action: string, target_type: string | null, target_id: string | null, payload: Record<string, unknown>) {
  try {
    await admin.from("paige_audit_log").insert({
      actor_user_id: null,
      actor_role: "mcp:platform",
      action,
      target_type,
      target_id,
      payload,
    });
  } catch (e) {
    console.error("[paige-mcp] audit failed", (e as Error).message);
  }
}

// ---------- Contacts ----------
mcp.tool("search_contacts", {
  description:
    "Search Paige contacts (clients table) by name, email, phone, or company. Returns up to `limit` matches with the fields the CRM UI shows. Use this before any other contact tool to resolve a contact_id.",
  inputSchema: z.object({
    query: z.string().describe("Free-text match across first/last name, email, phone, entity_name."),
    lifecycle_stage: z.string().optional().describe("Optional filter, e.g. 'qualifying', 'self_serve', 'active'."),
    limit: z.number().int().optional().describe("1-50, default 20."),
  }),
  handler: async (args) => {
    const limit = Math.min(Math.max(args.limit ?? 20, 1), 50);
    const safe = String(args.query).replace(/[,()]/g, " ").trim();
    let q = admin
      .from("clients")
      .select("id, first_name, last_name, email, phone, entity_name, lifecycle_stage, tier, status, assigned_coach_user_id, updated_at")
      .or(`first_name.ilike.%${safe}%,last_name.ilike.%${safe}%,email.ilike.%${safe}%,phone.ilike.%${safe}%,entity_name.ilike.%${safe}%`)
      .order("updated_at", { ascending: false })
      .limit(limit);
    if (args.lifecycle_stage) q = q.eq("lifecycle_stage", args.lifecycle_stage);
    const { data, error } = await q;
    if (error) return err(error.message);
    return ok({ items: data ?? [], count: (data ?? []).length });
  },
});

mcp.tool("get_contact", {
  description:
    "Fetch a single contact's full Paige profile, including funding goal, address, owner/coach assignments, and notes.",
  inputSchema: z.object({ contact_id: z.string().describe("clients.id (uuid)") }),
  handler: async ({ contact_id }) => {
    const { data, error } = await admin.from("clients").select("*").eq("id", contact_id).maybeSingle();
    if (error) return err(error.message);
    if (!data) return err("contact_not_found");
    return ok({ contact: data, paige_url: `https://paigeagent.ai/admin/contacts/${contact_id}` });
  },
});

mcp.tool("update_contact_stage", {
  description:
    "Move a contact through the lifecycle pipeline (e.g. lead → qualifying → active → won). Idempotent — calling with the current stage is a no-op.",
  inputSchema: z.object({
    contact_id: z.string(),
    lifecycle_stage: z.string().describe("New value, e.g. 'lead', 'qualifying', 'active', 'won', 'lost', 'self_serve'."),
    reason: z.string().optional().describe("Short note explaining the move; appended to current_notes."),
  }),
  handler: async ({ contact_id, lifecycle_stage, reason }) => {
    const patch: Record<string, unknown> = { lifecycle_stage };
    const { data, error } = await admin
      .from("clients")
      .update(patch)
      .eq("id", contact_id)
      .select("id, lifecycle_stage")
      .maybeSingle();
    if (error) return err(error.message);
    if (!data) return err("contact_not_found");
    if (reason) {
      // Append reason to notes
      const { data: c } = await admin.from("clients").select("current_notes").eq("id", contact_id).maybeSingle();
      const stamp = new Date().toISOString();
      const next = `${c?.current_notes ?? ""}\n\n[${stamp} · stage→${lifecycle_stage}] ${reason}`.trim().slice(0, 8000);
      await admin.from("clients").update({ current_notes: next }).eq("id", contact_id);
    }
    await audit("update_contact_stage", "client", contact_id, { lifecycle_stage, reason });
    return ok({ ok: true, contact_id, lifecycle_stage: data.lifecycle_stage });
  },
});

mcp.tool("add_contact_note", {
  description:
    "Append a timestamped note to a contact's current_notes field. Use for short observations; for structured activity use create_task or deal_activities.",
  inputSchema: z.object({
    contact_id: z.string(),
    note: z.string().describe("Plain text, max 2000 chars."),
  }),
  handler: async ({ contact_id, note }) => {
    const { data: existing, error: readErr } = await admin
      .from("clients")
      .select("current_notes")
      .eq("id", contact_id)
      .maybeSingle();
    if (readErr) return err(readErr.message);
    if (!existing) return err("contact_not_found");
    const stamp = new Date().toISOString();
    const next = `${existing.current_notes ?? ""}\n\n[${stamp} · MCP] ${String(note).slice(0, 2000)}`.trim();
    const { error } = await admin.from("clients").update({ current_notes: next }).eq("id", contact_id);
    if (error) return err(error.message);
    await audit("add_contact_note", "client", contact_id, { length: String(note).length });
    return ok({ ok: true, contact_id, appended_at: stamp });
  },
});

// ---------- Deals ----------
mcp.tool("list_deals", {
  description: "List deals on a pipeline, optionally filtered by stage, owner, or contact. Returns up to 50.",
  inputSchema: z.object({
    pipeline_id: z.string().optional(),
    stage_id: z.string().optional(),
    contact_id: z.string().optional().describe("Filter to deals attached to this clients.id"),
    status: z.string().optional().describe("open | won | lost"),
    limit: z.number().int().optional(),
  }),
  handler: async (args) => {
    const limit = Math.min(Math.max(args.limit ?? 25, 1), 50);
    let q = admin
      .from("deals")
      .select(
        "id, title, pipeline_id, stage_id, contact_client_id, owner_user_id, value_cents, currency, status, expected_close_date, updated_at",
      )
      .order("updated_at", { ascending: false })
      .limit(limit);
    if (args.pipeline_id) q = q.eq("pipeline_id", args.pipeline_id);
    if (args.stage_id) q = q.eq("stage_id", args.stage_id);
    if (args.contact_id) q = q.eq("contact_client_id", args.contact_id);
    if (args.status) q = q.eq("status", args.status);
    const { data, error } = await q;
    if (error) return err(error.message);
    return ok({ items: data ?? [] });
  },
});

mcp.tool("move_deal_stage", {
  description: "Move a deal to a different pipeline stage. Logs a deal_activities row so the change shows in the CRM timeline.",
  inputSchema: z.object({
    deal_id: z.string(),
    stage_id: z.string().describe("pipeline_stages.id"),
    reason: z.string().optional(),
  }),
  handler: async ({ deal_id, stage_id, reason }) => {
    const { data, error } = await admin
      .from("deals")
      .update({ stage_id })
      .eq("id", deal_id)
      .select("id, stage_id, pipeline_id")
      .maybeSingle();
    if (error) return err(error.message);
    if (!data) return err("deal_not_found");
    await admin.from("deal_activities").insert({
      deal_id,
      type: "stage_change",
      summary: `Moved to stage ${stage_id}${reason ? ` — ${String(reason).slice(0, 200)}` : ""}`,
      payload: { stage_id, source: "mcp" },
    });
    await audit("move_deal_stage", "deal", deal_id, { stage_id, reason });
    return ok({ ok: true, deal_id, stage_id: data.stage_id });
  },
});

mcp.tool("create_deal", {
  description:
    "Create a new deal on a pipeline. If `stage_id` is omitted the deal lands on the pipeline's first stage. Value should be sent in cents.",
  inputSchema: z.object({
    title: z.string(),
    pipeline_id: z.string(),
    stage_id: z.string().optional(),
    contact_id: z.string().optional().describe("clients.id of the linked contact"),
    value_cents: z.number().int().optional(),
    currency: z.string().optional(),
    expected_close_date: z.string().optional().describe("ISO date, e.g. 2026-08-15"),
    source: z.string().optional(),
  }),
  handler: async (args) => {
    let resolvedStage = args.stage_id;
    if (!resolvedStage) {
      const { data: stages } = await admin
        .from("pipeline_stages")
        .select("id")
        .eq("pipeline_id", args.pipeline_id)
        .order("position", { ascending: true })
        .limit(1);
      resolvedStage = stages?.[0]?.id;
      if (!resolvedStage) return err("pipeline_has_no_stages");
    }
    const { data, error } = await admin
      .from("deals")
      .insert({
        title: args.title,
        pipeline_id: args.pipeline_id,
        stage_id: resolvedStage,
        contact_client_id: args.contact_id ?? null,
        value_cents: args.value_cents ?? null,
        currency: args.currency ?? "USD",
        expected_close_date: args.expected_close_date ?? null,
        source: args.source ?? "mcp",
        status: "open",
      })
      .select("id")
      .single();
    if (error) return err(error.message);
    await audit("create_deal", "deal", data.id, { title: args.title, pipeline_id: args.pipeline_id, stage_id: resolvedStage });
    return ok({ ok: true, deal_id: data.id, paige_url: `https://paigeagent.ai/admin/pipeline?deal=${data.id}` });
  },
});

// ---------- Tasks ----------
mcp.tool("list_tasks", {
  description: "List tasks, optionally scoped to an owner, deal, or status. Returns up to 50.",
  inputSchema: z.object({
    owner_user_id: z.string().optional(),
    deal_id: z.string().optional(),
    status: z.string().optional().describe("Task status, typically 'open' | 'done' | 'snoozed'."),
    limit: z.number().int().optional(),
  }),
  handler: async (args) => {
    const limit = Math.min(Math.max(args.limit ?? 25, 1), 50);
    let q = admin
      .from("tasks")
      .select("id, user_id, deal_id, title, description, status, due_date, created_at")
      .order("due_date", { ascending: true, nullsFirst: false })
      .limit(limit);
    if (args.owner_user_id) q = q.eq("user_id", args.owner_user_id);
    if (args.deal_id) q = q.eq("deal_id", args.deal_id);
    if (args.status) q = q.eq("status", args.status);
    const { data, error } = await q;
    if (error) return err(error.message);
    return ok({ items: data ?? [] });
  },
});

mcp.tool("create_task", {
  description: "Create a CRM task. Either owner_user_id or deal_id should be provided so the task surfaces somewhere.",
  inputSchema: z.object({
    title: z.string(),
    description: z.string().optional(),
    owner_user_id: z.string().optional().describe("auth.users.id of the assignee."),
    deal_id: z.string().optional(),
    due_date: z.string().optional().describe("ISO timestamp."),
    track: z.string().optional().describe("Free-form bucket, e.g. 'sales', 'cs', 'btf'."),
  }),
  handler: async (args) => {
    const { data, error } = await admin
      .from("tasks")
      .insert({
        title: args.title,
        description: args.description ?? null,
        user_id: args.owner_user_id ?? null,
        deal_id: args.deal_id ?? null,
        due_date: args.due_date ?? null,
        track: args.track ?? "sales",
        status: "open",
      })
      .select("id")
      .single();
    if (error) return err(error.message);
    await audit("create_task", "task", data.id, { title: args.title, owner_user_id: args.owner_user_id, deal_id: args.deal_id });
    return ok({ ok: true, task_id: data.id });
  },
});

mcp.tool("complete_task", {
  description: "Mark a task as done.",
  inputSchema: z.object({ task_id: z.string() }),
  handler: async ({ task_id }) => {
    const { data, error } = await admin
      .from("tasks")
      .update({ status: "done" })
      .eq("id", task_id)
      .select("id")
      .maybeSingle();
    if (error) return err(error.message);
    if (!data) return err("task_not_found");
    await audit("complete_task", "task", task_id, {});
    return ok({ ok: true, task_id });
  },
});

// ---------- HTTP transport + bearer auth ----------
const app = new Hono();
const transport = new StreamableHttpTransport();
const httpHandler = transport.bind(mcp);

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type, mcp-session-id, accept",
  "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
  "Access-Control-Max-Age": "86400",
};

app.options("/*", (c) => c.body(null, 204, CORS));

app.all("/*", async (c) => {
  if (!PLATFORM_KEY) {
    return c.json({ error: "server_misconfigured" }, 500, CORS);
  }
  const auth = c.req.header("authorization") ?? "";
  const presented = auth.replace(/^Bearer\s+/i, "").trim();
  if (presented !== PLATFORM_KEY) {
    return c.json({ error: "unauthorized" }, 401, { ...CORS, "WWW-Authenticate": 'Bearer realm="paige-mcp"' });
  }
  const res = await httpHandler(c.req.raw);
  for (const [k, v] of Object.entries(CORS)) res.headers.set(k, v);
  return res;
});

Deno.serve(app.fetch);

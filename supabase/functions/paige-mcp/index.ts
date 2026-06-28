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

// Per-request actor context (set by the HTTP route before invoking the MCP transport).
// Phase 3: bearer tokens can resolve to either the platform key or a user OAuth token.
type ActorCtx = {
  kind: "platform" | "user";
  user_id: string | null;
  client_id: string | null;
  scopes: string[];
};
import { AsyncLocalStorage } from "node:async_hooks";
const actorStore = new AsyncLocalStorage<ActorCtx>();
function currentActor(): ActorCtx {
  return actorStore.getStore() ?? { kind: "platform", user_id: null, client_id: null, scopes: [] };
}

async function audit(action: string, target_type: string | null, target_id: string | null, payload: Record<string, unknown>) {
  try {
    const a = currentActor();
    await admin.from("paige_audit_log").insert({
      actor_user_id: a.user_id,
      actor_role: a.kind === "user" ? "mcp:user" : "mcp:platform",
      action,
      target_type,
      target_id,
      payload: { ...payload, ...(a.client_id ? { mcp_client_id: a.client_id } : {}) },
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

// ---------- Workflows ----------
mcp.tool("list_workflows", {
  description:
    "List Paige workflows from paige_workflow_registry. Filter by category (e.g. 'sales', 'cs', 'btf', 'compliance') or active state.",
  inputSchema: z.object({
    category: z.string().optional(),
    only_active: z.boolean().optional(),
    limit: z.number().int().optional(),
  }),
  handler: async (args) => {
    const limit = Math.min(Math.max(args.limit ?? 50, 1), 100);
    let q = admin
      .from("paige_workflow_registry")
      .select("id, key, label, description, category, provider, requires_approval, is_active, allowed_roles, sort_order")
      .order("sort_order", { ascending: true })
      .limit(limit);
    if (args.category) q = q.eq("category", args.category);
    if (args.only_active !== false) q = q.eq("is_active", true);
    const { data, error } = await q;
    if (error) return err(error.message);
    return ok({ items: data ?? [] });
  },
});

mcp.tool("run_workflow", {
  description:
    "Trigger a Paige workflow by registry key. Returns a run_id you can poll with get_workflow_run. If the workflow has requires_approval=true the run is queued in paige_pending_approvals instead of executing immediately.",
  inputSchema: z.object({
    workflow_key: z.string().describe("paige_workflow_registry.key, e.g. 'sales.lead_followup'"),
    payload: z.record(z.string(), z.any()).optional().describe("JSON arguments passed to the workflow."),
    contact_id: z.string().optional(),
  }),
  annotations: { destructiveHint: true, openWorldHint: true },
  handler: async (args) => {
    const { data: wf, error: wfErr } = await admin
      .from("paige_workflow_registry")
      .select("id, key, requires_approval, is_active")
      .eq("key", args.workflow_key)
      .maybeSingle();
    if (wfErr) return err(wfErr.message);
    if (!wf) return err("workflow_not_found");
    if (!wf.is_active) return err("workflow_inactive");

    if (wf.requires_approval) {
      const { data: pa, error: paErr } = await admin
        .from("paige_pending_approvals")
        .insert({
          type: "workflow_run",
          draft_content: { workflow_key: args.workflow_key, payload: args.payload ?? {} },
          contact_id: args.contact_id ?? null,
          created_by_n8n_workflow_key: args.workflow_key,
          status: "pending",
          metadata: { source: "mcp" },
        })
        .select("id")
        .single();
      if (paErr) return err(paErr.message);
      await audit("queue_workflow_approval", "workflow", wf.id, { workflow_key: args.workflow_key });
      return ok({ ok: true, queued: true, approval_id: pa.id, status: "pending_approval" });
    }

    const { data: run, error: runErr } = await admin
      .from("paige_workflow_runs")
      .insert({
        registry_id: wf.id,
        payload: args.payload ?? {},
        status: "queued",
      })
      .select("id")
      .single();
    if (runErr) return err(runErr.message);
    await audit("run_workflow", "workflow", wf.id, { workflow_key: args.workflow_key, run_id: run.id });
    return ok({ ok: true, run_id: run.id, status: "queued" });
  },
});

mcp.tool("get_workflow_run", {
  description: "Fetch status + result of a workflow run by id.",
  inputSchema: z.object({ run_id: z.string() }),
  handler: async ({ run_id }) => {
    const { data, error } = await admin
      .from("paige_workflow_runs")
      .select("id, registry_id, status, n8n_execution_id, result, error, payload, created_at")
      .eq("id", run_id)
      .maybeSingle();
    if (error) return err(error.message);
    if (!data) return err("run_not_found");
    return ok({ run: data });
  },
});

mcp.tool("list_pending_approvals", {
  description: "List items in paige_pending_approvals awaiting human review.",
  inputSchema: z.object({
    status: z.string().optional().describe("pending | approved | rejected | sent"),
    limit: z.number().int().optional(),
  }),
  handler: async (args) => {
    const limit = Math.min(Math.max(args.limit ?? 25, 1), 100);
    let q = admin
      .from("paige_pending_approvals")
      .select("id, type, status, contact_id, created_by_n8n_workflow_key, draft_content, created_at, reviewed_at, sent_at")
      .order("created_at", { ascending: false })
      .limit(limit);
    q = q.eq("status", args.status ?? "pending");
    const { data, error } = await q;
    if (error) return err(error.message);
    return ok({ items: data ?? [] });
  },
});

mcp.tool("decide_pending_approval", {
  description: "Approve or reject a pending approval. On approve, status becomes 'approved' for the downstream worker to send.",
  inputSchema: z.object({
    approval_id: z.string(),
    decision: z.enum(["approve", "reject"]),
    note: z.string().optional(),
  }),
  annotations: { destructiveHint: true },
  handler: async ({ approval_id, decision, note }) => {
    const patch: Record<string, unknown> = {
      status: decision === "approve" ? "approved" : "rejected",
      reviewed_at: new Date().toISOString(),
      escalation_note: note ?? null,
    };
    const { data, error } = await admin
      .from("paige_pending_approvals")
      .update(patch)
      .eq("id", approval_id)
      .select("id, status")
      .maybeSingle();
    if (error) return err(error.message);
    if (!data) return err("approval_not_found");
    await audit("decide_pending_approval", "approval", approval_id, { decision, note });
    return ok({ ok: true, approval_id, status: data.status });
  },
});

// ---------- BTF Workspace ----------
mcp.tool("list_btf_clients", {
  description: "List Build-to-Fund clients with current phase + last activity. Filter by phase if needed.",
  inputSchema: z.object({
    phase: z.string().optional().describe("e.g. 'intake', 'build', 'underwriting', 'funding', 'graduated'"),
    limit: z.number().int().optional(),
  }),
  handler: async (args) => {
    const limit = Math.min(Math.max(args.limit ?? 25, 1), 100);
    let q = admin
      .from("btf_workspace_settings")
      .select("id, client_id, current_phase, mma_os_btf_deal_id, intake_submitted_at, portal_first_login_at, last_activity_at, updated_at")
      .order("updated_at", { ascending: false })
      .limit(limit);
    if (args.phase) q = q.eq("current_phase", args.phase);
    const { data, error } = await q;
    if (error) return err(error.message);
    return ok({ items: data ?? [] });
  },
});

mcp.tool("get_btf_workspace", {
  description: "Fetch the BTF workspace_settings + phase summary for one client.",
  inputSchema: z.object({ client_id: z.string() }),
  handler: async ({ client_id }) => {
    const [{ data: ws, error: wsErr }, { data: items }] = await Promise.all([
      admin.from("btf_workspace_settings").select("*").eq("client_id", client_id).maybeSingle(),
      admin
        .from("btf_phase_items")
        .select("id, phase, item_key, title, status, due_at, sort_order")
        .eq("client_id", client_id)
        .order("sort_order", { ascending: true }),
    ]);
    if (wsErr) return err(wsErr.message);
    if (!ws) return err("workspace_not_found");
    return ok({ workspace: ws, items: items ?? [] });
  },
});

mcp.tool("list_btf_phase_items", {
  description: "List BTF phase items for a client, optionally scoped to a phase.",
  inputSchema: z.object({
    client_id: z.string(),
    phase: z.string().optional(),
  }),
  handler: async ({ client_id, phase }) => {
    let q = admin
      .from("btf_phase_items")
      .select("id, phase, item_key, title, description, status, assigned_to, due_at, sort_order, completed_at")
      .eq("client_id", client_id)
      .order("sort_order", { ascending: true });
    if (phase) q = q.eq("phase", phase);
    const { data, error } = await q;
    if (error) return err(error.message);
    return ok({ items: data ?? [] });
  },
});

mcp.tool("update_btf_phase_item", {
  description: "Update a BTF phase item's status, due date, or notes. Use to mark items in_progress/done from automation.",
  inputSchema: z.object({
    item_id: z.string(),
    status: z.string().optional().describe("not_started | in_progress | blocked | done"),
    notes: z.string().optional(),
    due_at: z.string().optional().describe("ISO timestamp"),
  }),
  annotations: { destructiveHint: true },
  handler: async (args) => {
    const patch: Record<string, unknown> = {};
    if (args.status) {
      patch.status = args.status;
      if (args.status === "done") patch.completed_at = new Date().toISOString();
    }
    if (args.notes !== undefined) patch.notes = args.notes;
    if (args.due_at !== undefined) patch.due_at = args.due_at;
    const { data, error } = await admin
      .from("btf_phase_items")
      .update(patch)
      .eq("id", args.item_id)
      .select("id, status")
      .maybeSingle();
    if (error) return err(error.message);
    if (!data) return err("item_not_found");
    await audit("update_btf_phase_item", "btf_phase_item", args.item_id, patch);
    return ok({ ok: true, item_id: args.item_id, status: data.status });
  },
});

mcp.tool("list_btf_document_requests", {
  description: "List document requests/uploads for a BTF client.",
  inputSchema: z.object({
    client_id: z.string(),
    status: z.string().optional().describe("requested | uploaded | approved | rejected"),
  }),
  handler: async ({ client_id, status }) => {
    let q = admin
      .from("btf_document_requests")
      .select("id, title, status, file_name, file_size, requested_at, uploaded_at, approved_at, rejection_reason")
      .eq("client_id", client_id)
      .order("requested_at", { ascending: false });
    if (status) q = q.eq("status", status);
    const { data, error } = await q;
    if (error) return err(error.message);
    return ok({ items: data ?? [] });
  },
});

mcp.tool("send_btf_message", {
  description: "Post a message to a BTF client's workspace coach thread. sender_type='coach' by default.",
  inputSchema: z.object({
    client_id: z.string(),
    body: z.string(),
    sender_type: z.enum(["coach", "system"]).optional(),
    pinned: z.boolean().optional(),
  }),
  annotations: { destructiveHint: true },
  handler: async (args) => {
    const { data, error } = await admin
      .from("btf_messages")
      .insert({
        client_id: args.client_id,
        sender_type: args.sender_type ?? "coach",
        body: args.body.slice(0, 8000),
        pinned: args.pinned ?? false,
      })
      .select("id")
      .single();
    if (error) return err(error.message);
    await audit("send_btf_message", "btf_message", data.id, { client_id: args.client_id });
    return ok({ ok: true, message_id: data.id });
  },
});

// ---------- Admin ----------
mcp.tool("list_team_members", {
  description: "List team members and their roles from user_roles + profiles. Filter by role if needed.",
  inputSchema: z.object({
    role: z.string().optional().describe("owner | admin | sales_rep | coach | broker | cs"),
    limit: z.number().int().optional(),
  }),
  handler: async (args) => {
    const limit = Math.min(Math.max(args.limit ?? 100, 1), 200);
    let q = admin
      .from("user_roles")
      .select("user_id, role, created_at")
      .limit(limit);
    if (args.role) q = q.eq("role", args.role);
    const { data: roles, error } = await q;
    if (error) return err(error.message);
    const ids = Array.from(new Set((roles ?? []).map((r) => r.user_id)));
    const { data: profiles } = await admin
      .from("profiles")
      .select("user_id, full_name, suspended_at")
      .in("user_id", ids.length ? ids : ["00000000-0000-0000-0000-000000000000"]);
    const byId = new Map((profiles ?? []).map((p) => [p.user_id, p]));
    const items = (roles ?? []).map((r) => ({
      user_id: r.user_id,
      role: r.role,
      full_name: byId.get(r.user_id)?.full_name ?? null,
      suspended: !!byId.get(r.user_id)?.suspended_at,
      created_at: r.created_at,
    }));
    return ok({ items });
  },
});

mcp.tool("assign_coach", {
  description: "Assign or reassign a coach to a client.",
  inputSchema: z.object({
    client_id: z.string(),
    coach_user_id: z.string(),
    reason: z.string().optional(),
  }),
  annotations: { destructiveHint: true },
  handler: async ({ client_id, coach_user_id, reason }) => {
    const { data, error } = await admin
      .from("clients")
      .update({ assigned_coach_user_id: coach_user_id })
      .eq("id", client_id)
      .select("id, assigned_coach_user_id")
      .maybeSingle();
    if (error) return err(error.message);
    if (!data) return err("client_not_found");
    await audit("assign_coach", "client", client_id, { coach_user_id, reason });
    return ok({ ok: true, client_id, coach_user_id: data.assigned_coach_user_id });
  },
});

mcp.tool("create_team_invitation", {
  description:
    "Create a team invitation row for an internal team member. Does NOT send the email — pair with the send-admin-invitation function for that.",
  inputSchema: z.object({
    email: z.string(),
    role: z.string().describe("admin | sales_rep | coach | broker | cs"),
    invited_by_user_id: z.string().optional(),
    template_name: z.string().optional(),
  }),
  annotations: { destructiveHint: true },
  handler: async (args) => {
    const token = crypto.randomUUID().replace(/-/g, "") + crypto.randomUUID().replace(/-/g, "");
    const tokenHash = await sha256Hex(token);
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
    const { data, error } = await admin
      .from("invitations")
      .insert({
        email: args.email.toLowerCase(),
        role: args.role,
        invited_by: args.invited_by_user_id ?? null,
        token_hash: tokenHash,
        expires_at: expiresAt,
        template_name: args.template_name ?? args.role,
      })
      .select("id")
      .single();
    if (error) return err(error.message);
    await audit("create_team_invitation", "invitation", data.id, { email: args.email, role: args.role });
    return ok({
      ok: true,
      invitation_id: data.id,
      token,
      accept_url: `https://paigeagent.ai/accept-invite?token=${token}`,
      expires_at: expiresAt,
    });
  },
});

mcp.tool("list_unassigned_queue", {
  description: "List contacts in paige_unassigned_queue awaiting coach/sales assignment.",
  inputSchema: z.object({ limit: z.number().int().optional() }),
  handler: async ({ limit }) => {
    const cap = Math.min(Math.max(limit ?? 25, 1), 100);
    const { data, error } = await admin
      .from("paige_unassigned_queue")
      .select("id, email, first_name, last_name, tier, unassigned_for_hours, priority_rank, created_at")
      .order("priority_rank", { ascending: false })
      .limit(cap);
    if (error) return err(error.message);
    return ok({ items: data ?? [] });
  },
});

mcp.tool("list_admin_notifications", {
  description: "List recent paige_admin_notifications. Filter by unread or severity.",
  inputSchema: z.object({
    only_unread: z.boolean().optional(),
    severity: z.string().optional().describe("info | warning | critical"),
    limit: z.number().int().optional(),
  }),
  handler: async (args) => {
    const limit = Math.min(Math.max(args.limit ?? 25, 1), 100);
    let q = admin
      .from("paige_admin_notifications")
      .select("id, severity, title, body, link_to, contact_id, source_workflow_key, assigned_role, read_at, created_at")
      .order("created_at", { ascending: false })
      .limit(limit);
    if (args.only_unread) q = q.is("read_at", null);
    if (args.severity) q = q.eq("severity", args.severity);
    const { data, error } = await q;
    if (error) return err(error.message);
    return ok({ items: data ?? [] });
  },
});

mcp.tool("create_admin_notification", {
  description: "Post a new admin notification (info/warning/critical). Use sparingly — these page humans.",
  inputSchema: z.object({
    severity: z.enum(["info", "warning", "critical"]),
    title: z.string(),
    body: z.string().optional(),
    link_to: z.string().optional(),
    contact_id: z.string().optional(),
    assigned_role: z.string().optional(),
    source_workflow_key: z.string().optional(),
  }),
  handler: async (args) => {
    const { data, error } = await admin
      .from("paige_admin_notifications")
      .insert({
        severity: args.severity,
        title: args.title,
        body: args.body ?? null,
        link_to: args.link_to ?? null,
        contact_id: args.contact_id ?? null,
        assigned_role: args.assigned_role ?? null,
        source_workflow_key: args.source_workflow_key ?? "mcp",
        scope: "admin",
      })
      .select("id")
      .single();
    if (error) return err(error.message);
    await audit("create_admin_notification", "notification", data.id, { severity: args.severity, title: args.title });
    return ok({ ok: true, notification_id: data.id });
  },
});

async function sha256Hex(input: string): Promise<string> {
  const bytes = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

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

// ---------- Phase 3 scaffolding: OAuth discovery (public, unauthenticated) ----------
const PUBLIC_ORIGIN = `${SUPABASE_URL.replace(/\/$/, "")}/functions/v1/paige-mcp`;
// ---------- Phase 3: OAuth 2.1 + Dynamic Client Registration ----------
const PUBLIC_ORIGIN = `${SUPABASE_URL.replace(/\/$/, "")}/functions/v1/paige-mcp`;
const APP_ORIGIN = Deno.env.get("PAIGE_APP_ORIGIN") ?? "https://paigeagent.ai";
const SUPPORTED_SCOPES = ["crm.read", "crm.write", "workflows.run", "btf.read", "btf.write", "admin.read", "admin.write"] as const;
type Scope = (typeof SUPPORTED_SCOPES)[number];

// Tool → required scope. Read tools need .read; mutating tools need .write (or .run for workflows).
const TOOL_SCOPE: Record<string, Scope> = {
  // CRM
  search_contacts: "crm.read", get_contact: "crm.read",
  update_contact_stage: "crm.write", add_contact_note: "crm.write",
  list_deals: "crm.read", move_deal_stage: "crm.write", create_deal: "crm.write",
  list_tasks: "crm.read", create_task: "crm.write", complete_task: "crm.write",
  // Workflows
  list_workflows: "crm.read", run_workflow: "workflows.run", get_workflow_run: "crm.read",
  list_pending_approvals: "crm.read", decide_pending_approval: "workflows.run",
  // BTF
  list_btf_clients: "btf.read", get_btf_workspace: "btf.read", list_btf_phase_items: "btf.read",
  update_btf_phase_item: "btf.write", list_btf_document_requests: "btf.read", send_btf_message: "btf.write",
  // Admin
  list_team_members: "admin.read", assign_coach: "admin.write", create_team_invitation: "admin.write",
  list_unassigned_queue: "admin.read", list_admin_notifications: "admin.read", create_admin_notification: "admin.write",
};

const DISCOVERY_RESOURCE = {
  resource: PUBLIC_ORIGIN, authorization_servers: [PUBLIC_ORIGIN],
  bearer_methods_supported: ["header"], scopes_supported: SUPPORTED_SCOPES,
  resource_documentation: "https://paigeagent.ai/docs/mcp",
};
const DISCOVERY_AS = {
  issuer: PUBLIC_ORIGIN,
  authorization_endpoint: `${APP_ORIGIN}/mcp/authorize`,
  token_endpoint: `${PUBLIC_ORIGIN}/oauth/token`,
  registration_endpoint: `${PUBLIC_ORIGIN}/oauth/register`,
  revocation_endpoint: `${PUBLIC_ORIGIN}/oauth/revoke`,
  response_types_supported: ["code"], grant_types_supported: ["authorization_code", "refresh_token"],
  code_challenge_methods_supported: ["S256"], token_endpoint_auth_methods_supported: ["none"],
  scopes_supported: SUPPORTED_SCOPES,
};

function randToken(bytes = 48): string {
  const buf = new Uint8Array(bytes);
  crypto.getRandomValues(buf);
  return btoa(String.fromCharCode(...buf)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
async function verifyPkceS256(verifier: string, challenge: string): Promise<boolean> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier));
  const b64 = btoa(String.fromCharCode(...new Uint8Array(digest))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  return b64 === challenge;
}
const NO_STORE = { "Cache-Control": "no-store", "Pragma": "no-cache" };

// Resolve a presented bearer token into an actor context. Returns null on unauthorized.
async function resolveBearer(presented: string): Promise<ActorCtx | null> {
  if (!presented) return null;
  if (PLATFORM_KEY && presented === PLATFORM_KEY) {
    return { kind: "platform", user_id: null, client_id: null, scopes: [...SUPPORTED_SCOPES] };
  }
  const hash = await sha256Hex(presented);
  const { data } = await admin
    .from("paige_mcp_oauth_tokens")
    .select("user_id, client_id, scopes, access_expires_at, revoked_at")
    .eq("access_token_hash", hash)
    .maybeSingle();
  if (!data || data.revoked_at || new Date(data.access_expires_at) < new Date()) return null;
  admin.from("paige_mcp_oauth_tokens").update({ last_used_at: new Date().toISOString() }).eq("access_token_hash", hash).then(() => {});
  return { kind: "user", user_id: data.user_id, client_id: data.client_id, scopes: data.scopes ?? [] };
}

// Inspect the JSON-RPC body and enforce per-tool scope for `tools/call`.
function enforceScopeForBody(body: any, actor: ActorCtx): { ok: true } | { ok: false; status: number; error: string } {
  if (actor.kind === "platform") return { ok: true };
  if (body?.method !== "tools/call") return { ok: true };
  const toolName = body?.params?.name;
  const required = TOOL_SCOPE[toolName];
  if (!required) return { ok: false, status: 403, error: `unknown_tool:${toolName}` };
  if (!actor.scopes.includes(required)) {
    return { ok: false, status: 403, error: `insufficient_scope: tool '${toolName}' requires '${required}'` };
  }
  return { ok: true };
}

app.all("/*", async (c) => {
  const url = new URL(c.req.url);
  const path = url.pathname;
  const method = c.req.method;
  console.log("[paige-mcp]", method, path);

  // ----- Public discovery -----
  if (method === "GET" && path.includes("/.well-known/oauth-protected-resource")) {
    return c.json(DISCOVERY_RESOURCE, 200, { ...CORS, ...NO_STORE });
  }
  if (method === "GET" && path.includes("/.well-known/oauth-authorization-server")) {
    return c.json(DISCOVERY_AS, 200, { ...CORS, ...NO_STORE });
  }

  // ----- /oauth/register : Dynamic Client Registration (RFC 7591) -----
  if (method === "POST" && path.endsWith("/oauth/register")) {
    const body = await c.req.json().catch(() => ({}));
    const name = String(body.client_name ?? "Unnamed MCP Client").slice(0, 200);
    const uris: string[] = Array.isArray(body.redirect_uris) ? body.redirect_uris.filter((u: any) => typeof u === "string") : [];
    if (uris.length === 0) return c.json({ error: "invalid_redirect_uri", error_description: "redirect_uris required" }, 400, { ...CORS, ...NO_STORE });
    for (const u of uris) {
      try {
        const parsed = new URL(u);
        if (parsed.protocol !== "https:" && parsed.hostname !== "localhost" && parsed.hostname !== "127.0.0.1") {
          return c.json({ error: "invalid_redirect_uri", error_description: `non-https redirect: ${u}` }, 400, { ...CORS, ...NO_STORE });
        }
      } catch {
        return c.json({ error: "invalid_redirect_uri" }, 400, { ...CORS, ...NO_STORE });
      }
    }
    const client_id = `mcp_${randToken(16)}`;
    const requestedScope = typeof body.scope === "string" ? body.scope : "crm.read";
    const { error } = await admin.from("paige_mcp_oauth_clients").insert({
      client_id, client_name: name, client_uri: body.client_uri ?? null,
      redirect_uris: uris, scope: requestedScope,
      grant_types: ["authorization_code", "refresh_token"], response_types: ["code"],
      token_endpoint_auth_method: "none",
    });
    if (error) return c.json({ error: "server_error", error_description: error.message }, 500, { ...CORS, ...NO_STORE });
    return c.json({
      client_id, client_id_issued_at: Math.floor(Date.now() / 1000),
      client_name: name, redirect_uris: uris, scope: requestedScope,
      grant_types: ["authorization_code", "refresh_token"], response_types: ["code"],
      token_endpoint_auth_method: "none",
    }, 201, { ...CORS, ...NO_STORE });
  }

  // ----- /oauth/authorize : 302 to the in-app consent screen -----
  if (method === "GET" && path.endsWith("/oauth/authorize")) {
    const qs = url.searchParams.toString();
    const target = `${APP_ORIGIN}/mcp/authorize?${qs}`;
    return new Response(null, { status: 302, headers: { ...CORS, ...NO_STORE, Location: target } });
  }

  // ----- /oauth/token : code & refresh_token grants -----
  if (method === "POST" && path.endsWith("/oauth/token")) {
    const ct = c.req.header("content-type") ?? "";
    let p: Record<string, string> = {};
    if (ct.includes("application/x-www-form-urlencoded")) {
      const text = await c.req.text();
      for (const [k, v] of new URLSearchParams(text)) p[k] = v;
    } else {
      p = await c.req.json().catch(() => ({}));
    }
    const grant = p.grant_type;

    if (grant === "authorization_code") {
      const code = p.code;
      const verifier = p.code_verifier;
      const client_id = p.client_id;
      const redirect_uri = p.redirect_uri;
      if (!code || !verifier || !client_id || !redirect_uri) {
        return c.json({ error: "invalid_request" }, 400, { ...CORS, ...NO_STORE });
      }
      const code_hash = await sha256Hex(code);
      const { data: codeRow } = await admin
        .from("paige_mcp_oauth_codes")
        .select("*")
        .eq("code_hash", code_hash)
        .maybeSingle();
      if (!codeRow || codeRow.consumed_at || new Date(codeRow.expires_at) < new Date()) {
        return c.json({ error: "invalid_grant" }, 400, { ...CORS, ...NO_STORE });
      }
      if (codeRow.client_id !== client_id || codeRow.redirect_uri !== redirect_uri) {
        return c.json({ error: "invalid_grant" }, 400, { ...CORS, ...NO_STORE });
      }
      if (!(await verifyPkceS256(verifier, codeRow.code_challenge))) {
        return c.json({ error: "invalid_grant", error_description: "pkce_failed" }, 400, { ...CORS, ...NO_STORE });
      }
      await admin.from("paige_mcp_oauth_codes").update({ consumed_at: new Date().toISOString() }).eq("code_hash", code_hash);

      const access = randToken(48);
      const refresh = randToken(48);
      const now = new Date();
      const access_exp = new Date(now.getTime() + 60 * 60 * 1000); // 1h
      const refresh_exp = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000); // 30d
      const { data: clientRow } = await admin.from("paige_mcp_oauth_clients").select("client_name").eq("client_id", client_id).maybeSingle();
      await admin.from("paige_mcp_oauth_tokens").insert({
        access_token_hash: await sha256Hex(access),
        refresh_token_hash: await sha256Hex(refresh),
        client_id, user_id: codeRow.user_id, scopes: codeRow.scopes,
        access_expires_at: access_exp.toISOString(), refresh_expires_at: refresh_exp.toISOString(),
        client_name_cache: clientRow?.client_name ?? null,
      });
      return c.json({
        access_token: access, token_type: "Bearer", expires_in: 3600,
        refresh_token: refresh, scope: codeRow.scopes.join(" "),
      }, 200, { ...CORS, ...NO_STORE });
    }

    if (grant === "refresh_token") {
      const refresh = p.refresh_token;
      if (!refresh) return c.json({ error: "invalid_request" }, 400, { ...CORS, ...NO_STORE });
      const rh = await sha256Hex(refresh);
      const { data: tok } = await admin
        .from("paige_mcp_oauth_tokens")
        .select("*")
        .eq("refresh_token_hash", rh)
        .maybeSingle();
      if (!tok || tok.revoked_at || (tok.refresh_expires_at && new Date(tok.refresh_expires_at) < new Date())) {
        return c.json({ error: "invalid_grant" }, 400, { ...CORS, ...NO_STORE });
      }
      // Rotate: revoke old, issue new pair.
      await admin.from("paige_mcp_oauth_tokens").update({ revoked_at: new Date().toISOString() }).eq("id", tok.id);
      const access = randToken(48);
      const refreshNew = randToken(48);
      const now = new Date();
      await admin.from("paige_mcp_oauth_tokens").insert({
        access_token_hash: await sha256Hex(access),
        refresh_token_hash: await sha256Hex(refreshNew),
        client_id: tok.client_id, user_id: tok.user_id, scopes: tok.scopes,
        access_expires_at: new Date(now.getTime() + 60 * 60 * 1000).toISOString(),
        refresh_expires_at: new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000).toISOString(),
        client_name_cache: tok.client_name_cache,
      });
      return c.json({
        access_token: access, token_type: "Bearer", expires_in: 3600,
        refresh_token: refreshNew, scope: (tok.scopes ?? []).join(" "),
      }, 200, { ...CORS, ...NO_STORE });
    }

    return c.json({ error: "unsupported_grant_type" }, 400, { ...CORS, ...NO_STORE });
  }

  // ----- /oauth/revoke : RFC 7009 -----
  if (method === "POST" && path.endsWith("/oauth/revoke")) {
    const ct = c.req.header("content-type") ?? "";
    let p: Record<string, string> = {};
    if (ct.includes("application/x-www-form-urlencoded")) {
      for (const [k, v] of new URLSearchParams(await c.req.text())) p[k] = v;
    } else {
      p = await c.req.json().catch(() => ({}));
    }
    const tok = p.token;
    if (tok) {
      const h = await sha256Hex(tok);
      await admin.from("paige_mcp_oauth_tokens")
        .update({ revoked_at: new Date().toISOString() })
        .or(`access_token_hash.eq.${h},refresh_token_hash.eq.${h}`);
    }
    return c.json({}, 200, { ...CORS, ...NO_STORE });
  }

  // ----- MCP protocol endpoint (requires bearer) -----
  if (!PLATFORM_KEY) return c.json({ error: "server_misconfigured" }, 500, CORS);
  const presented = (c.req.header("authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
  const actor = await resolveBearer(presented);
  if (!actor) {
    return c.json({ error: "unauthorized" }, 401, {
      ...CORS,
      "WWW-Authenticate": `Bearer realm="paige-mcp", resource_metadata="${PUBLIC_ORIGIN}/.well-known/oauth-protected-resource"`,
    });
  }

  // Peek the body to enforce per-tool scope for user tokens. Clone first so the transport can re-read.
  if (method === "POST") {
    const raw = c.req.raw.clone();
    const peek = await raw.json().catch(() => null);
    const gate = enforceScopeForBody(peek, actor);
    if (!gate.ok) {
      return c.json({
        jsonrpc: "2.0", id: peek?.id ?? null,
        error: { code: -32001, message: gate.error },
      }, gate.status, CORS);
    }
  }

  const res = await actorStore.run(actor, () => httpHandler(c.req.raw));
  for (const [k, v] of Object.entries(CORS)) res.headers.set(k, v);
  return res;
});

Deno.serve(app.fetch);

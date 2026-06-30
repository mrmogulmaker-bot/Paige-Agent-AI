// Paige MCP Server — Phase 2 (API-key auth, 30 tools across CRM/Workflows/BTF/Admin).
// Hosted at https://<project>/functions/v1/paige-mcp (custom domain mcp.paigeagent.ai later).
// Auth: Bearer PAIGE_MCP_PLATFORM_KEY in Authorization header.
//
// Tool catalog:
//  CRM (10): search_contacts, get_contact, update_contact_stage [DEPRECATED → update_lifecycle_stage], add_contact_note,
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
const MMA_OS_CLAUDE_PLATFORM_KEY = Deno.env.get("MMA_OS_CLAUDE_PLATFORM_KEY") ?? "";
const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY") ?? "";

// Registered platform keys: label → secret value. Empty values are filtered.
const PLATFORM_KEYS: Array<{ label: string; value: string }> = [
  { label: "paige_default", value: PLATFORM_KEY },
  { label: "mma_os_claude", value: MMA_OS_CLAUDE_PLATFORM_KEY },
].filter((k) => k.value.length > 0);

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

// Workflow dispatcher lives in _shared so the pg_cron sweeper
// (dispatch-queued-workflow-runs) can re-use the same routing logic.
import { dispatchWorkflowRun, MMA_TENANT_ID } from "../_shared/workflowDispatch.ts";

// Doctrine §118 master-only MCP tools. Hidden from tools/list when caller's
// tenant != MMA. These are forward-looking — none are implemented yet but the
// gate is in place so any future addition is opt-out by default.
const MASTER_ONLY_TOOLS = new Set<string>([
  "list_tenants",
  "switch_active_tenant",
  "update_tenant_features",
]);

// Resolve the actor's effective tenant_id WITHOUT falling back to MMA.
// Platform-key callers → MMA (they ARE the platform owner).
// User callers → their profiles.active_tenant_id, or null if unset.
async function actorTenantId(): Promise<string | null> {
  const actor = currentActor();
  if (actor.kind === "platform") return MMA_TENANT_ID;
  if (!actor.user_id) return null;
  const { data } = await admin
    .from("profiles")
    .select("active_tenant_id")
    .eq("user_id", actor.user_id)
    .maybeSingle();
  return (data?.active_tenant_id as string | null) ?? null;
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
    "DEPRECATED — use `update_lifecycle_stage` instead. Free-form predecessor that accepts any string for `lifecycle_stage`. Kept for backward compatibility with existing automations; will be removed in a future release. New callers should use update_lifecycle_stage (Doctrine §111 enum-validated).",
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
  description: "List tasks, optionally scoped to an owner (assignee auth.users.id), deal, status, or track. Returns up to 50.",
  inputSchema: z.object({
    owner_user_id: z.string().optional(),
    deal_id: z.string().optional(),
    status: z.enum(["pending", "in_progress", "completed", "cancelled"]).optional(),
    track: z.string().optional(),
    limit: z.number().int().optional(),
  }),
  handler: async (args) => {
    const limit = Math.min(Math.max(args.limit ?? 25, 1), 50);
    let q = admin
      .from("tasks")
      .select("id, user_id, deal_id, biz_id, title, description, status, track, due_date, metadata, created_at, updated_at")
      .order("due_date", { ascending: true, nullsFirst: false })
      .limit(limit);
    if (args.owner_user_id) q = q.eq("user_id", args.owner_user_id);
    if (args.deal_id) q = q.eq("deal_id", args.deal_id);
    if (args.status) q = q.eq("status", args.status);
    if (args.track) q = q.eq("track", args.track);
    const { data, error } = await q;
    if (error) return err(error.message);
    return ok({ items: data ?? [] });
  },
});

mcp.tool("create_task", {
  description: "Create a task assigned to a user (auth.users.id). owner_user_id is required because tasks.user_id is NOT NULL. Status defaults to 'pending'.",
  inputSchema: z.object({
    owner_user_id: z.string().describe("auth.users.id of the assignee. REQUIRED."),
    title: z.string(),
    description: z.string().optional(),
    deal_id: z.string().optional(),
    due_date: z.string().optional().describe("ISO timestamp."),
    track: z.string().optional().describe("Free-form bucket, e.g. 'sales', 'cs', 'btf', 'BUILD'."),
    status: z.enum(["pending", "in_progress", "completed", "cancelled"]).optional(),
    metadata: z.record(z.string(), z.any()).optional(),
  }),
  handler: async (args) => {
    const { data, error } = await admin
      .from("tasks")
      .insert({
        user_id: args.owner_user_id,
        title: args.title,
        description: args.description ?? null,
        deal_id: args.deal_id ?? null,
        due_date: args.due_date ?? null,
        track: args.track ?? null,
        status: args.status ?? "pending",
        metadata: args.metadata ?? null,
      })
      .select("id")
      .single();
    if (error) return err(error.message);
    await audit("create_task", "task", data.id, { title: args.title, owner_user_id: args.owner_user_id, deal_id: args.deal_id });
    return ok({ ok: true, task_id: data.id });
  },
});

mcp.tool("update_task", {
  description: "Update a task's fields. Any omitted field is left unchanged.",
  inputSchema: z.object({
    task_id: z.string(),
    title: z.string().optional(),
    description: z.string().nullable().optional(),
    status: z.enum(["pending", "in_progress", "completed", "cancelled"]).optional(),
    track: z.string().nullable().optional(),
    due_date: z.string().nullable().optional(),
    metadata: z.record(z.string(), z.any()).nullable().optional(),
  }),
  annotations: { destructiveHint: true },
  handler: async (args) => {
    const patch: Record<string, unknown> = {};
    if (args.title !== undefined) patch.title = args.title;
    if (args.description !== undefined) patch.description = args.description;
    if (args.status !== undefined) patch.status = args.status;
    if (args.track !== undefined) patch.track = args.track;
    if (args.due_date !== undefined) patch.due_date = args.due_date;
    if (args.metadata !== undefined) patch.metadata = args.metadata;
    if (Object.keys(patch).length === 0) return err("no_fields_to_update");
    const { data, error } = await admin.from("tasks").update(patch).eq("id", args.task_id).select("id").maybeSingle();
    if (error) return err(error.message);
    if (!data) return err("task_not_found");
    await audit("update_task", "task", args.task_id, patch);
    return ok({ ok: true, task_id: args.task_id });
  },
});

mcp.tool("complete_task", {
  description: "Mark a task as completed.",
  inputSchema: z.object({ task_id: z.string() }),
  handler: async ({ task_id }) => {
    const { data, error } = await admin
      .from("tasks")
      .update({ status: "completed" })
      .eq("id", task_id)
      .select("id")
      .maybeSingle();
    if (error) return err(error.message);
    if (!data) return err("task_not_found");
    await audit("complete_task", "task", task_id, {});
    return ok({ ok: true, task_id });
  },
});

mcp.tool("reopen_task", {
  description: "Move a task back to 'pending' (undo complete/cancel).",
  inputSchema: z.object({ task_id: z.string() }),
  handler: async ({ task_id }) => {
    const { data, error } = await admin
      .from("tasks")
      .update({ status: "pending" })
      .eq("id", task_id)
      .select("id")
      .maybeSingle();
    if (error) return err(error.message);
    if (!data) return err("task_not_found");
    await audit("reopen_task", "task", task_id, {});
    return ok({ ok: true, task_id });
  },
});

mcp.tool("delete_task", {
  description: "Permanently delete a task. Destructive — prefer update_task(status='cancelled') when reversibility matters.",
  inputSchema: z.object({ task_id: z.string() }),
  annotations: { destructiveHint: true },
  handler: async ({ task_id }) => {
    const { error } = await admin.from("tasks").delete().eq("id", task_id);
    if (error) return err(error.message);
    await audit("delete_task", "task", task_id, {});
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
    const tenantId = await actorTenantId();
    let q = admin
      .from("paige_workflow_registry")
      .select("id, key, label, description, category, provider, requires_approval, is_active, allowed_roles, sort_order, tenant_id")
      .order("sort_order", { ascending: true })
      .limit(limit);
    if (args.category) q = q.eq("category", args.category);
    if (args.only_active !== false) q = q.eq("is_active", true);
    // Doctrine §118: caller sees platform-default rows (tenant_id IS NULL) plus
    // rows owned by their tenant. Platform/MMA callers therefore see MMA rows too.
    if (tenantId) q = q.or(`tenant_id.is.null,tenant_id.eq.${tenantId}`);
    else q = q.is("tenant_id", null);
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
    payload: z
      .union([z.record(z.string(), z.any()), z.string()])
      .optional()
      .describe("JSON arguments passed to the workflow. Accepts an object or a JSON-encoded string."),
    contact_id: z.string().optional(),
  }),
  annotations: { destructiveHint: true, openWorldHint: true },
  handler: async (args) => {
    // Coerce payload: accept object OR JSON string (some MCP clients stringify nested args).
    let payload: Record<string, unknown> = {};
    if (args.payload != null) {
      if (typeof args.payload === "string") {
        const trimmed = args.payload.trim();
        if (trimmed.length > 0) {
          try {
            const parsed = JSON.parse(trimmed);
            if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
              payload = parsed as Record<string, unknown>;
            } else {
              return err("payload_must_be_json_object");
            }
          } catch {
            return err("payload_invalid_json");
          }
        }
      } else {
        payload = args.payload as Record<string, unknown>;
      }
    }

    const { data: wf, error: wfErr } = await admin
      .from("paige_workflow_registry")
      .select("id, key, requires_approval, is_active, provider, n8n_webhook_url, needs_n8n_link, langgraph_graph_id, direct_function_name, tenant_id")
      .eq("key", args.workflow_key)
      .maybeSingle();
    if (wfErr) return err(wfErr.message);
    if (!wf) return err("workflow_not_found");
    if (!wf.is_active) return err("workflow_inactive");

    // Doctrine §118: tenant-scoped workflows are only runnable by their owner tenant.
    const callerTenantId = await actorTenantId();
    if (wf.tenant_id && wf.tenant_id !== callerTenantId) {
      return err("workflow_restricted_to_owning_tenant");
    }

    if (wf.requires_approval) {
      const { data: pa, error: paErr } = await admin
        .from("paige_pending_approvals")
        .insert({
          type: "workflow_run",
          draft_content: { workflow_key: args.workflow_key, payload },
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
        payload,
        status: "queued",
      })
      .select("id")
      .single();
    if (runErr) return err(runErr.message);
    await audit("run_workflow", "workflow", wf.id, { workflow_key: args.workflow_key, run_id: run.id });

    // Inline dispatch — route the queued run to its declared provider.
    const dispatch = await dispatchWorkflowRun({
      runId: run.id,
      provider: wf.provider,
      n8nWebhookUrl: wf.n8n_webhook_url,
      needsN8nLink: wf.needs_n8n_link,
      langgraphGraphId: wf.langgraph_graph_id,
      directFunctionName: wf.direct_function_name,
      payload,
      callerTenantId,
    });

    return ok({
      ok: true,
      run_id: run.id,
      status: dispatch.status,
      provider: wf.provider,
      n8n_execution_id: dispatch.executionId ?? null,
      dispatch_error: dispatch.error ?? null,
    });
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
  description:
    "List items in paige_pending_approvals awaiting human review. Supports filtering by category, contact, assignee, and risk level. Returns enriched rows from paige_approval_queue_v including SLA state and assigned reviewer.",
  inputSchema: z.object({
    status: z.string().optional().describe("pending | approved | rejected | changes_requested | escalated | skipped | sent"),
    category: z.string().optional().describe("e.g. refund | dispute_letter | campaign | ai_draft | field_ingest"),
    contact_id: z.string().uuid().optional(),
    assigned_to_user_id: z.string().uuid().optional(),
    risk_level: z.enum(["low", "medium", "high"]).optional(),
    only_overdue: z.boolean().optional(),
    limit: z.number().int().optional(),
  }),
  handler: async (args) => {
    const limit = Math.min(Math.max(args.limit ?? 25, 1), 100);
    let q = admin
      .from("paige_approval_queue_v")
      .select("*")
      .order("priority", { ascending: true, nullsFirst: false })
      .order("sla_due_at", { ascending: true, nullsFirst: false })
      .limit(limit);
    q = q.eq("status", args.status ?? "pending");
    if (args.category) q = q.eq("category", args.category);
    if (args.contact_id) q = q.eq("contact_id", args.contact_id);
    if (args.assigned_to_user_id) q = q.eq("assigned_to_user_id", args.assigned_to_user_id);
    if (args.risk_level) q = q.eq("risk_level", args.risk_level);
    if (args.only_overdue) q = q.eq("sla_state", "overdue");
    const { data, error } = await q;
    if (error) return err(error.message);
    return ok({ items: data ?? [] });
  },
});

mcp.tool("decide_pending_approval", {
  description:
    "Approve, reject, request_changes, or escalate a pending approval. Provide a rationale for any non-approve decision. On approve, status becomes 'approved' for the downstream worker to send.",
  inputSchema: z.object({
    approval_id: z.string(),
    decision: z.enum(["approve", "reject", "request_changes", "escalate"]),
    note: z.string().optional(),
  }),
  annotations: { destructiveHint: true },
  handler: async ({ approval_id, decision, note }) => {
    if (decision !== "approve" && !note?.trim()) {
      return err("note_required_for_non_approve_decision");
    }
    const statusMap: Record<string, string> = {
      approve: "approved",
      reject: "rejected",
      request_changes: "changes_requested",
      escalate: "escalated",
    };
    const patch: Record<string, unknown> = {
      status: statusMap[decision],
      reviewed_at: new Date().toISOString(),
      decision_rationale: note ?? null,
      escalation_note: decision === "escalate" ? note : null,
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

mcp.tool("create_approval", {
  description:
    "File a new item for human review. Use when a coach, agent, or external LLM wants a teammate to sign off before action (e.g., refund > $X, legal-sensitive dispute letter, campaign launch, AI draft). The tenant's policy engine auto-routes based on category and assigns SLA + reviewer role.",
  inputSchema: z.object({
    category: z.enum([
      "refund", "dispute_letter", "campaign", "ai_draft",
      "field_ingest", "workflow", "compliance", "legal", "other",
    ]),
    summary: z.string().describe("One-line description of what needs approval."),
    draft_content: z.record(z.any()).optional().describe("The proposed action payload (email body, refund amount, etc.)"),
    contact_id: z.string().uuid().optional(),
    conversation_id: z.string().uuid().optional(),
    risk_level: z.enum(["low", "medium", "high"]).optional(),
    priority: z.number().int().min(1).max(5).optional(),
  }),
  handler: async (args) => {
    const { data, error } = await admin
      .from("paige_pending_approvals")
      .insert({
        type: args.category,
        category: args.category,
        summary: args.summary,
        draft_content: args.draft_content ?? {},
        contact_id: args.contact_id ?? null,
        conversation_id: args.conversation_id ?? null,
        risk_level: args.risk_level ?? "medium",
        priority: args.priority ?? 3,
        source: "mcp",
        status: "pending",
      })
      .select("id, status, requires_role, sla_due_at, assigned_to_user_id")
      .maybeSingle();
    if (error) return err(error.message);
    await audit("create_approval", "approval", data?.id ?? "", { category: args.category });
    return ok({ ok: true, approval: data });
  },
});

mcp.tool("claim_approval", {
  description:
    "Claim ownership of a pending approval so other reviewers know you're handling it. Reassigns assigned_to_user_id to the calling user.",
  inputSchema: z.object({ approval_id: z.string() }),
  handler: async ({ approval_id }, ctx) => {
    const userId = (ctx as any)?.userId;
    if (!userId) return err("missing_user");
    const { data, error } = await admin
      .from("paige_pending_approvals")
      .update({ assigned_to_user_id: userId, claimed_at: new Date().toISOString() })
      .eq("id", approval_id)
      .select("id, assigned_to_user_id")
      .maybeSingle();
    if (error) return err(error.message);
    if (!data) return err("approval_not_found");
    await audit("claim_approval", "approval", approval_id, {});
    return ok({ ok: true, approval_id, assigned_to_user_id: data.assigned_to_user_id });
  },
});

mcp.tool("comment_on_approval", {
  description:
    "Post a comment on an approval so other reviewers and the original submitter can see context, questions, or guidance.",
  inputSchema: z.object({
    approval_id: z.string(),
    body: z.string().min(1),
  }),
  handler: async ({ approval_id, body }, ctx) => {
    const userId = (ctx as any)?.userId;
    if (!userId) return err("missing_user");
    const { data, error } = await admin
      .from("paige_approval_comments")
      .insert({ approval_id, author_id: userId, body })
      .select("id, created_at")
      .maybeSingle();
    if (error) return err(error.message);
    await audit("comment_on_approval", "approval", approval_id, { length: body.length });
    return ok({ ok: true, comment: data });
  },
});

mcp.tool("list_approval_comments", {
  description: "Read the discussion thread on an approval.",
  inputSchema: z.object({ approval_id: z.string() }),
  handler: async ({ approval_id }) => {
    const { data, error } = await admin
      .from("paige_approval_comments")
      .select("id, author_id, body, created_at")
      .eq("approval_id", approval_id)
      .order("created_at", { ascending: true });
    if (error) return err(error.message);
    return ok({ items: data ?? [] });
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

// ---------- Coach Ops ----------
mcp.tool("list_coaches", {
  description: "List all coaches with their profile metadata (specialties, capacity, accepting-new-clients) and live client counts.",
  inputSchema: z.object({
    accepting_only: z.boolean().optional().describe("If true, return only coaches accepting new clients."),
    specialty: z.string().optional().describe("Filter by a single specialty tag, e.g. 'personal_credit'."),
  }),
  handler: async ({ accepting_only, specialty }) => {
    const { data: roles, error: rolesErr } = await admin.from("user_roles").select("user_id").eq("role", "coach");
    if (rolesErr) return err(rolesErr.message);
    const ids = (roles ?? []).map((r: any) => r.user_id);
    if (!ids.length) return ok({ items: [] });
    const [profilesRes, clientsRes] = await Promise.all([
      admin.from("profiles").select("user_id, full_name, coach_specialties, coach_capacity, coach_accepting_clients, coach_bio, coach_timezone, suspended_at").in("user_id", ids),
      admin.from("clients").select("assigned_coach_user_id, status").in("assigned_coach_user_id", ids),
    ]);
    const items = ids.map((id) => {
      const p: any = (profilesRes.data || []).find((x: any) => x.user_id === id) || {};
      const assigned = (clientsRes.data || []).filter((c: any) => c.assigned_coach_user_id === id);
      return {
        user_id: id,
        full_name: p.full_name ?? null,
        specialties: p.coach_specialties ?? [],
        capacity: p.coach_capacity ?? null,
        accepting_clients: p.coach_accepting_clients ?? true,
        bio: p.coach_bio ?? null,
        timezone: p.coach_timezone ?? null,
        suspended: !!p.suspended_at,
        active_clients: assigned.filter((c: any) => (c.status ?? "active") === "active").length,
        total_clients: assigned.length,
      };
    }).filter((c) => {
      if (accepting_only && !c.accepting_clients) return false;
      if (specialty && !(c.specialties as string[]).includes(specialty)) return false;
      return true;
    });
    return ok({ items });
  },
});

mcp.tool("add_coach_role", {
  description: "Grant the 'coach' role to an existing user. Idempotent.",
  inputSchema: z.object({ user_id: z.string() }),
  annotations: { destructiveHint: true },
  handler: async ({ user_id }) => {
    const { error } = await admin.from("user_roles").upsert({ user_id, role: "coach" }, { onConflict: "user_id,role" });
    if (error) return err(error.message);
    await audit("add_coach_role", "user", user_id, {});
    return ok({ ok: true });
  },
});

mcp.tool("remove_coach_role", {
  description: "Revoke the 'coach' role. Blocked if the coach still has active clients — reassign them first via assign_coach or bulk_assign_clients_to_coach.",
  inputSchema: z.object({ user_id: z.string() }),
  annotations: { destructiveHint: true },
  handler: async ({ user_id }) => {
    const { data, error } = await admin.rpc("admin_remove_coach_role", { _user_id: user_id });
    if (error) return err(error.message);
    await audit("remove_coach_role", "user", user_id, { result: data });
    return ok(data);
  },
});

mcp.tool("update_coach_profile", {
  description: "Update a coach's specialties, capacity, accepting-new-clients toggle, bio, or timezone. Omitted fields are left unchanged.",
  inputSchema: z.object({
    user_id: z.string(),
    specialties: z.array(z.string()).optional(),
    capacity: z.number().int().optional(),
    accepting_clients: z.boolean().optional(),
    bio: z.string().optional(),
    timezone: z.string().optional(),
  }),
  handler: async (args) => {
    const patch: Record<string, unknown> = {};
    if (args.specialties !== undefined) patch.coach_specialties = args.specialties;
    if (args.capacity !== undefined) patch.coach_capacity = args.capacity;
    if (args.accepting_clients !== undefined) patch.coach_accepting_clients = args.accepting_clients;
    if (args.bio !== undefined) patch.coach_bio = args.bio;
    if (args.timezone !== undefined) patch.coach_timezone = args.timezone;
    if (Object.keys(patch).length === 0) return err("no_fields_to_update");
    const { error } = await admin.from("profiles").update(patch).eq("user_id", args.user_id);
    if (error) return err(error.message);
    await audit("update_coach_profile", "user", args.user_id, patch);
    return ok({ ok: true });
  },
});

mcp.tool("bulk_assign_clients_to_coach", {
  description: "Assign many clients to one coach in a single call. Returns the number of rows updated.",
  inputSchema: z.object({
    coach_user_id: z.string(),
    client_ids: z.array(z.string()).describe("Array of clients.id UUIDs."),
  }),
  annotations: { destructiveHint: true },
  handler: async ({ coach_user_id, client_ids }) => {
    const { data, error } = await admin.rpc("admin_bulk_assign_coach", { _coach: coach_user_id, _client_ids: client_ids });
    if (error) return err(error.message);
    await audit("bulk_assign_clients_to_coach", "user", coach_user_id, { count: client_ids.length });
    return ok(data);
  },
});

mcp.tool("get_coach_performance", {
  description: "Performance snapshot for a coach: active clients vs capacity, open/completed task counts (30d), pipeline value, and last activity.",
  inputSchema: z.object({ coach_user_id: z.string() }),
  handler: async ({ coach_user_id }) => {
    const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const [prof, clientsRes, openTasksRes, doneTasksRes, dealsRes] = await Promise.all([
      admin.from("profiles").select("full_name, coach_capacity, coach_accepting_clients").eq("user_id", coach_user_id).maybeSingle(),
      admin.from("clients").select("id, status").eq("assigned_coach_user_id", coach_user_id),
      admin.from("tasks").select("id", { count: "exact", head: true }).eq("user_id", coach_user_id).in("status", ["pending", "in_progress"]),
      admin.from("tasks").select("id", { count: "exact", head: true }).eq("user_id", coach_user_id).eq("status", "completed").gte("updated_at", since),
      admin.from("deals").select("amount").eq("owner_user_id", coach_user_id),
    ]);
    const clients = clientsRes.data ?? [];
    const pipeline_value = (dealsRes.data ?? []).reduce((s: number, d: any) => s + Number(d.amount || 0), 0);
    return ok({
      coach_user_id,
      full_name: prof.data?.full_name ?? null,
      capacity: prof.data?.coach_capacity ?? null,
      accepting_clients: prof.data?.coach_accepting_clients ?? true,
      active_clients: clients.filter((c: any) => (c.status ?? "active") === "active").length,
      total_clients: clients.length,
      open_tasks: openTasksRes.count ?? 0,
      completed_tasks_30d: doneTasksRes.count ?? 0,
      pipeline_value,
    });
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

// ---------- Email Templates (DB-stored, key-addressable) ----------
mcp.tool("list_email_templates", {
  description:
    "List rows from public.email_templates. Filter by category, product_scope, or active. Read-only catalog browse.",
  inputSchema: z.object({
    category: z.string().optional().describe("e.g. 'btf_lifecycle', 'btf_education', 'btf_stall'"),
    product_scope: z.string().optional().describe("e.g. 'btf', 'launchpad', 'mma'"),
    active: z.boolean().optional(),
    limit: z.number().int().optional().describe("1-200, default 100"),
  }),
  handler: async (args) => {
    const limit = Math.min(Math.max(args.limit ?? 100, 1), 200);
    let q = admin
      .from("email_templates")
      .select("template_key, subject, preheader, variables, category, product_scope, active, notes, updated_at")
      .order("template_key", { ascending: true })
      .limit(limit);
    if (args.category) q = q.eq("category", args.category);
    if (args.product_scope) q = q.eq("product_scope", args.product_scope);
    if (typeof args.active === "boolean") q = q.eq("active", args.active);
    const { data, error } = await q;
    if (error) return err(error.message);
    return ok({ items: data ?? [], count: (data ?? []).length });
  },
});

mcp.tool("upsert_email_template", {
  description:
    "Insert or update an email template by template_key. Stores markdown source of truth; rendering happens at send time. Use for the canonical BTF/launchpad/mma email libraries.",
  inputSchema: z.object({
    template_key: z.string().describe("Stable kebab-case key, e.g. 'btf-welcome-day-1'"),
    subject: z.string(),
    preheader: z.string().optional(),
    body_markdown: z.string().describe("Source of truth. Use {{var_name}} for substitutions."),
    variables: z.array(z.string()).optional().describe("Declared variable names for editor hints"),
    category: z.string().describe("'btf_lifecycle' | 'btf_education' | 'btf_stall' | etc."),
    product_scope: z.string().describe("'btf' | 'launchpad' | 'mma'"),
    active: z.boolean().optional(),
    notes: z.string().optional().describe("Voice/context notes for human editors"),
  }),
  annotations: { destructiveHint: true },
  handler: async (args) => {
    const row = {
      template_key: args.template_key,
      subject: args.subject,
      preheader: args.preheader ?? null,
      body_markdown: args.body_markdown,
      variables: args.variables ?? [],
      category: args.category,
      product_scope: args.product_scope,
      active: args.active ?? true,
      notes: args.notes ?? null,
      updated_at: new Date().toISOString(),
    };
    const { data, error } = await admin
      .from("email_templates")
      .upsert(row, { onConflict: "template_key" })
      .select("template_key, updated_at")
      .single();
    if (error) return err(error.message);
    await audit("upsert_email_template", "email_template", data.template_key, {
      category: args.category, product_scope: args.product_scope,
    });
    return ok({ ok: true, template_key: data.template_key, updated_at: data.updated_at });
  },
});

// Minimal mustache-style renderer: replaces {{var}} with vars[var]. Returns missing-var error on first miss.
function renderMustache(tpl: string, vars: Record<string, unknown>): { ok: true; out: string } | { ok: false; missing: string } {
  const pattern = /\{\{\s*([\w.]+)\s*\}\}/g;
  let missing: string | null = null;
  const out = tpl.replace(pattern, (_m, name: string) => {
    if (missing) return "";
    if (Object.prototype.hasOwnProperty.call(vars, name)) {
      const v = (vars as any)[name];
      return v == null ? "" : String(v);
    }
    missing = name;
    return "";
  });
  if (missing) return { ok: false, missing };
  return { ok: true, out };
}

// Markdown → minimal HTML (paragraphs, line breaks, **bold**, *italic*, [text](url)). No HTML injection from vars
// since vars are substituted before this step but values are escaped first.
function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
function mdToHtml(md: string): string {
  const blocks = md.split(/\n{2,}/).map((block) => {
    const escaped = escapeHtml(block)
      .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
      .replace(/\*([^*]+)\*/g, "<em>$1</em>")
      .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>')
      .replace(/\n/g, "<br/>");
    return `<p>${escaped}</p>`;
  });
  return blocks.join("\n");
}

// Per-product_scope sender map. Each `from` must be on a domain verified in the Resend
// account that holds RESEND_API_KEY. BTF/MMA route to MMA's verified portal subdomain so
// white-labeled customer emails never expose Paige branding (Doctrine §46 + §123).
const SCOPE_SENDERS: Record<string, { from: string; name: string; reply_to: string }> = {
  btf: {
    from: "alerts@portal.mogulmakeracademy.com",
    name: "Mogul Maker Academy",
    reply_to: "coach@mogulmakeracademy.com",
  },
  mma: {
    from: "alerts@portal.mogulmakeracademy.com",
    name: "Mogul Maker Academy",
    reply_to: "coach@mogulmakeracademy.com",
  },
  // launchpad: add once launchpad.mogulmakeracademy.com (or designated subdomain) is verified in Resend.
  paige: {
    from: "hello@notify.paigeagent.ai",
    name: "Paige",
    reply_to: "support@paigeagent.ai",
  },
};
const DEFAULT_SCOPE_SENDER = SCOPE_SENDERS.btf;

mcp.tool("send_btf_template_email", {
  description:
    "Look up an email_templates row by template_key, render {{vars}}, and send via Resend. From-address is auto-selected by the template's product_scope (BTF/MMA → portal.mogulmakeracademy.com; Paige internal → notify.paigeagent.ai). Override with `from_override` for one-off sends. Sends real customer email — use idempotency in the caller.",
  inputSchema: z.object({
    to_email: z.string().describe("Recipient email"),
    template_key: z.string().describe("public.email_templates.template_key"),
    vars: z.record(z.any()).optional().describe("Variable values for {{var}} substitution"),
    from_name: z.string().optional(),
    from_override: z.string().email().optional()
      .describe("Full from address (e.g. 'alerts@portal.mogulmakeracademy.com'). Must be a domain verified in Resend. Overrides product_scope default."),
    reply_to: z.string().optional(),
  }),
  annotations: { destructiveHint: true },
  handler: async (args) => {
    // Per-key check happens below after we know the template's product_scope.
    const vars = args.vars ?? {};

    const { data: tpl, error: tplErr } = await admin
      .from("email_templates")
      .select("template_key, subject, preheader, body_markdown, active, product_scope")
      .eq("template_key", args.template_key)
      .maybeSingle();
    if (tplErr) return err(tplErr.message);
    if (!tpl) return err(`template_not_found:${args.template_key}`);
    if (!tpl.active) return err(`template_inactive:${args.template_key}`);

    // Suppression check
    const { data: sup } = await admin
      .from("suppressed_emails").select("email").eq("email", args.to_email.toLowerCase()).maybeSingle();
    if (sup) return err(`recipient_suppressed:${args.to_email}`);

    const subjectR = renderMustache(tpl.subject, vars);
    if (!subjectR.ok) return err(`missing_var:${subjectR.missing} (subject)`);
    const bodyR = renderMustache(tpl.body_markdown, vars);
    if (!bodyR.ok) return err(`missing_var:${bodyR.missing} (body)`);
    const preheaderR = tpl.preheader ? renderMustache(tpl.preheader, vars) : { ok: true as const, out: "" };
    if (!preheaderR.ok) return err(`missing_var:${preheaderR.missing} (preheader)`);

    const html = (preheaderR.out ? `<div style="display:none;max-height:0;overflow:hidden">${escapeHtml(preheaderR.out)}</div>` : "") + mdToHtml(bodyR.out);

    const scopeCfg = SCOPE_SENDERS[tpl.product_scope] ?? DEFAULT_SCOPE_SENDER;
    const fromName = args.from_name ?? scopeCfg.name;
    const fromEmail = args.from_override ?? scopeCfg.from;
    const fromAddr = `${fromName} <${fromEmail}>`;
    const replyTo = args.reply_to ?? scopeCfg.reply_to;

    // Single shared Resend account authenticates sends from both notify.paigeagent.ai
    // (Paige scope) and portal.mogulmakeracademy.com (BTF/MMA scope). sender_account
    // is retained in logs/audits as a constant for historical continuity.
    const apiKey = RESEND_API_KEY;
    const senderAccount = "mma_os_shared" as const;
    if (!apiKey) return err("resend_not_configured");

    const resendRes = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: fromAddr,
        to: [args.to_email],
        subject: subjectR.out,
        html,
        reply_to: replyTo,
        tags: [
          { name: "template_key", value: tpl.template_key.replace(/[^a-zA-Z0-9_-]/g, "_") },
          { name: "product_scope", value: tpl.product_scope },
          { name: "sender_account", value: senderAccount },
        ],
      }),
    });
    const payload = await resendRes.json().catch(() => ({}));
    if (!resendRes.ok) {
      await audit("send_btf_template_email_failed", "email_template", tpl.template_key, {
        to: args.to_email, from: fromEmail, sender_account: senderAccount, status: resendRes.status, payload,
      });
      return err(`resend_${resendRes.status}: ${JSON.stringify(payload)}`);
    }

    const messageId = payload?.id ?? null;
    const sentAt = new Date().toISOString();
    await admin.from("email_send_log").insert({
      template_name: tpl.template_key,
      recipient_email: args.to_email.toLowerCase(),
      message_id: messageId,
      status: "sent",
      sender_account: senderAccount,
      metadata: { product_scope: tpl.product_scope, from: fromEmail, sender_account: senderAccount, via: "mcp.send_btf_template_email" },
    }).then(() => {}, () => {});
    await audit("send_btf_template_email", "email_template", tpl.template_key, {
      to: args.to_email, from: fromEmail, sender_account: senderAccount, message_id: messageId,
    });

    return ok({ ok: true, message_id: messageId, from: fromEmail, template_key: tpl.template_key, sent_at: sentAt });
  },
});


// ---------- Batch #1 (Doctrine §119 reversible-ops) ----------
// Helper: resolve a tenant_id for the actor. User actors → their active_tenant_id.
// Platform actors → optional explicit arg, falling back to the MMA tenant (slug='mma').
async function resolveTenantId(explicit?: string | null): Promise<string | null> {
  if (explicit) return explicit;
  const actor = currentActor();
  if (actor.kind === "user" && actor.user_id) {
    const { data } = await admin.from("profiles").select("active_tenant_id").eq("user_id", actor.user_id).maybeSingle();
    if (data?.active_tenant_id) return data.active_tenant_id as string;
  }
  // Platform fallback (single-tenant phase): MMA workspace.
  const { data: mma } = await admin.from("tenants").select("id").eq("slug", "mma").maybeSingle();
  return (mma?.id as string) ?? null;
}

// ---------- Contacts (extended) ----------
mcp.tool("create_contact", {
  description:
    "Create a new contact (clients row) in the caller's tenant. Returns the new contact_id. Tenant is auto-resolved from the caller (user's active tenant, or MMA for platform callers).",
  inputSchema: z.object({
    first_name: z.string(),
    last_name: z.string().optional(),
    email: z.string().optional(),
    phone: z.string().optional(),
    entity_name: z.string().optional(),
    source: z.string().optional(),
    lifecycle_stage: z.string().optional().describe("Default 'new_lead'."),
    notes: z.string().optional().describe("Seeded into current_notes."),
    tenant_id: z.string().optional().describe("Override the auto-resolved tenant_id (platform-only)."),
  }),
  handler: async (args) => {
    const tenant_id = await resolveTenantId(args.tenant_id ?? null);
    const row: Record<string, unknown> = {
      first_name: args.first_name,
      last_name: args.last_name ?? null,
      email: args.email ?? null,
      phone: args.phone ?? null,
      entity_name: args.entity_name ?? null,
      source: args.source ?? "mcp",
      lifecycle_stage: args.lifecycle_stage ?? "new_lead",
      status: "active",
      current_notes: args.notes ?? null,
      tenant_id,
    };
    const { data, error } = await admin.from("clients").insert(row).select("id, created_at").single();
    if (error) return err(error.message);
    await audit("create_contact", "client", data.id, { email: args.email ?? null, tenant_id });
    return ok({ ok: true, contact_id: data.id, created_at: data.created_at, tenant_id });
  },
});

mcp.tool("update_lifecycle_stage", {
  description:
    "Update a contact's lifecycle stage per Doctrine §111 (new_lead, qualified, nurturing, hot_lead, negotiating, won, client_active, client_paused, client_churned, client_funded, client_alumni).",
  inputSchema: z.object({
    contact_id: z.string(),
    new_stage: z.enum([
      "new_lead", "qualified", "nurturing", "hot_lead", "negotiating",
      "won", "client_active", "client_paused", "client_churned", "client_funded", "client_alumni",
    ]),
    reason: z.string().optional(),
  }),
  handler: async ({ contact_id, new_stage, reason }) => {
    const { data: cur } = await admin.from("clients").select("lifecycle_stage").eq("id", contact_id).maybeSingle();
    if (!cur) return err("contact_not_found");
    const old_stage = (cur.lifecycle_stage as string | null) ?? null;
    const { error } = await admin.from("clients").update({ lifecycle_stage: new_stage }).eq("id", contact_id);
    if (error) return err(error.message);
    if (reason) {
      const { data: c } = await admin.from("clients").select("current_notes").eq("id", contact_id).maybeSingle();
      const stamp = new Date().toISOString();
      const next = `${c?.current_notes ?? ""}\n\n[${stamp} · lifecycle ${old_stage ?? "∅"}→${new_stage}] ${reason}`.trim().slice(0, 8000);
      await admin.from("clients").update({ current_notes: next }).eq("id", contact_id);
    }
    await audit("update_lifecycle_stage", "client", contact_id, { old_stage, new_stage, reason: reason ?? null });
    return ok({ ok: true, contact_id, old_stage, new_stage });
  },
});

// ---------- BTF onboarding ----------
mcp.tool("start_btf_onboarding", {
  description:
    "Kick off the 6-step BTF onboarding wizard for a paying contact. Generates a magic-link, sends the welcome email, and sets onboarding_stage='invited'. Tenant must have features.btf_enabled=true.",
  inputSchema: z.object({
    contact_id: z.string(),
    payment_plan: z.enum(["btf_pif", "btf_split", "btf_getstarted"]).describe("Selected payment plan; stamped on the contact for downstream routing."),
    notes: z.string().optional(),
  }),
  annotations: { destructiveHint: true },
  handler: async ({ contact_id, payment_plan, notes }) => {
    // Stamp payment plan + optional notes BEFORE invoking the edge function so the welcome email picks it up.
    const patch: Record<string, unknown> = { primary_offer: payment_plan };
    if (notes) {
      const { data: c } = await admin.from("clients").select("current_notes").eq("id", contact_id).maybeSingle();
      const stamp = new Date().toISOString();
      patch.current_notes = `${c?.current_notes ?? ""}\n\n[${stamp} · btf onboarding · ${payment_plan}] ${notes}`.trim().slice(0, 8000);
    }
    await admin.from("clients").update(patch).eq("id", contact_id);

    const res = await fetch(`${SUPABASE_URL}/functions/v1/start-btf-onboarding`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
        apikey: SERVICE_ROLE_KEY,
      },
      body: JSON.stringify({ client_id: contact_id }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok || body?.ok === false) {
      return err(`start_btf_onboarding_${res.status}: ${body?.error ?? "unknown"}`);
    }
    await audit("start_btf_onboarding", "client", contact_id, { payment_plan });
    return ok({
      ok: true,
      onboarding_session_id: contact_id, // Paige uses the contact as the wizard session anchor.
      magic_link_url: body?.onboard_url ?? null,
      email_sent: body?.email_sent ?? false,
      payment_plan,
    });
  },
});

mcp.tool("resend_btf_invite", {
  description:
    "Resend a BTF workspace invite. Mints a fresh magic-link token, supersedes any prior unused link, and sends the white-labeled welcome email again.",
  inputSchema: z.object({ contact_id: z.string() }),
  annotations: { destructiveHint: true },
  handler: async ({ contact_id }) => {
    const { data: c } = await admin
      .from("clients")
      .select("id, email, first_name, last_name")
      .eq("id", contact_id)
      .maybeSingle();
    if (!c) return err("contact_not_found");
    if (!c.email) return err("contact_missing_email");

    // Mark prior unused invites for this client as superseded.
    await admin
      .from("btf_workspace_invites")
      .update({ metadata: { superseded_at: new Date().toISOString(), superseded_by: "mcp_resend" } })
      .eq("client_id", contact_id)
      .is("used_at", null);

    const res = await fetch(`${SUPABASE_URL}/functions/v1/invite-btf-client`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
        apikey: SERVICE_ROLE_KEY,
      },
      body: JSON.stringify({
        paige_client_id: contact_id,
        contact_email: c.email,
        full_name: `${c.first_name ?? ""} ${c.last_name ?? ""}`.trim() || null,
      }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok || body?.ok === false) {
      return err(`resend_btf_invite_${res.status}: ${body?.error ?? "unknown"}`);
    }
    await audit("resend_btf_invite", "client", contact_id, { email: c.email });
    return ok({
      ok: true,
      new_magic_link_url: body?.invite_url ?? null,
      expires_at: body?.expires_at ?? null,
      previous_link_revoked: true,
      email_sent: body?.email_sent ?? false,
    });
  },
});

// ---------- Read-only BTF / agreements / payments ----------
mcp.tool("list_signed_agreements", {
  description: "List signed service agreements in the caller's tenant (paige_signed_agreements). Paginated.",
  inputSchema: z.object({
    contact_id: z.string().optional(),
    since: z.string().optional().describe("ISO timestamp; filters signed_at >= since."),
    limit: z.number().int().optional().describe("1-200, default 50."),
  }),
  handler: async (args) => {
    const limit = Math.min(Math.max(args.limit ?? 50, 1), 200);
    let q = admin
      .from("paige_signed_agreements")
      .select("id, client_id, agreement_template_key, agreement_version, signed_pdf_path, signature_data, signed_at, created_at")
      .order("signed_at", { ascending: false })
      .limit(limit);
    if (args.contact_id) q = q.eq("client_id", args.contact_id);
    if (args.since) q = q.gte("signed_at", args.since);
    const { data, error } = await q;
    if (error) return err(error.message);
    const items = (data ?? []).map((row: any) => ({
      agreement_id: row.id,
      contact_id: row.client_id,
      signed_at: row.signed_at,
      signer_name: row.signature_data?.signer_name ?? row.signature_data?.full_name ?? null,
      document_url: row.signed_pdf_path,
      agreement_template_key: row.agreement_template_key,
      agreement_version: row.agreement_version,
    }));
    return ok({ items, count: items.length });
  },
});

mcp.tool("list_intake_submissions", {
  description: "List BTF intake submissions (paige_client_intake_submissions). Filter by contact or status.",
  inputSchema: z.object({
    contact_id: z.string().optional(),
    status: z.enum(["in_progress", "submitted", "all"]).optional(),
    limit: z.number().int().optional(),
  }),
  handler: async (args) => {
    const limit = Math.min(Math.max(args.limit ?? 50, 1), 200);
    let q = admin
      .from("paige_client_intake_submissions")
      .select("id, client_id, section, payload, submitted_at, created_at, updated_at")
      .order("updated_at", { ascending: false })
      .limit(limit);
    if (args.contact_id) q = q.eq("client_id", args.contact_id);
    if (args.status === "submitted") q = q.not("submitted_at", "is", null);
    else if (args.status === "in_progress") q = q.is("submitted_at", null);
    const { data, error } = await q;
    if (error) return err(error.message);
    const items = (data ?? []).map((row: any) => ({
      submission_id: row.id,
      contact_id: row.client_id,
      section: row.section,
      status: row.submitted_at ? "submitted" : "in_progress",
      submitted_at: row.submitted_at,
      updated_at: row.updated_at,
      sections_completed: row.payload ? Object.keys(row.payload).length : 0,
    }));
    return ok({ items, count: items.length });
  },
});

mcp.tool("list_payment_authorizations", {
  description: "List Stripe payment authorizations (paige_payment_authorizations). Filter by contact or date.",
  inputSchema: z.object({
    contact_id: z.string().optional(),
    since: z.string().optional().describe("ISO timestamp; filters authorized_at >= since."),
    limit: z.number().int().optional(),
  }),
  handler: async (args) => {
    const limit = Math.min(Math.max(args.limit ?? 50, 1), 200);
    let q = admin
      .from("paige_payment_authorizations")
      .select("id, client_id, plan_selected, stripe_customer_id, stripe_payment_method_id, stripe_subscription_id, authorized_at, status, created_at")
      .order("authorized_at", { ascending: false, nullsFirst: false })
      .limit(limit);
    if (args.contact_id) q = q.eq("client_id", args.contact_id);
    if (args.since) q = q.gte("authorized_at", args.since);
    const { data, error } = await q;
    if (error) return err(error.message);
    const items = (data ?? []).map((row: any) => ({
      auth_id: row.id,
      contact_id: row.client_id,
      payment_plan: row.plan_selected,
      stripe_customer_id: row.stripe_customer_id,
      stripe_subscription_id: row.stripe_subscription_id,
      status: row.status,
      authorized_at: row.authorized_at,
    }));
    return ok({ items, count: items.length });
  },
});

// ---------- Sender identity (debug) ----------
mcp.tool("resolve_sender_identity", {
  description:
    "Read-only debug tool. Returns the from-address, display name, and reply-to a given tenant + product_scope combo would produce, without sending an email. Use to verify domain config after changes.",
  inputSchema: z.object({
    tenant_id: z.string().optional().describe("Defaults to caller's tenant."),
    product_scope: z.string().optional().describe("Optional, e.g. 'btf' or 'paige'. Currently advisory."),
  }),
  handler: async (args) => {
    const tenant_id = await resolveTenantId(args.tenant_id ?? null);
    if (!tenant_id) return err("tenant_not_resolved");
    const { data, error } = await admin.rpc("tenant_sender_identity", { _tenant_id: tenant_id });
    if (error) return err(error.message);
    if (!data) return err("tenant_not_found");
    return ok({
      tenant_id,
      product_scope: args.product_scope ?? null,
      identity: data,
      from_address: (data as any)?.from_address ?? null,
      from_name: (data as any)?.from_name ?? null,
      reply_to: (data as any)?.reply_to ?? null,
    });
  },
});


// ============================================================================
// Batch #2 (Doctrine §119) — observability + comms + invoicing
// ============================================================================

// ---------- list_workflow_runs ----------
mcp.tool("list_workflow_runs", {
  description:
    "List recent workflow runs in the caller's tenant. Filter by registry_key, status, triggered_by, or since timestamp. Read-only observability into paige_workflow_runs without needing the UI.",
  inputSchema: z.object({
    registry_key: z.string().optional(),
    status: z.enum(["queued", "running", "succeeded", "failed", "cancelled"]).optional(),
    triggered_by: z.string().optional(),
    since: z.string().optional().describe("ISO timestamp"),
    limit: z.number().int().optional(),
  }),
  handler: async (args) => {
    const tenantId = await actorTenantId();
    const limit = Math.min(Math.max(args.limit ?? 50, 1), 200);
    let regIdFilter: string | null = null;
    if (args.registry_key) {
      const { data: reg } = await admin
        .from("paige_workflow_registry").select("id").eq("key", args.registry_key).maybeSingle();
      if (!reg) return ok({ items: [], total: 0 });
      regIdFilter = reg.id as string;
    }
    let q = admin
      .from("paige_workflow_runs")
      .select("id, registry_id, status, n8n_execution_id, langgraph_thread_id, retry_count, error, triggered_by, created_at, completed_at, last_dispatched_at, paige_workflow_registry(key, provider, tenant_id)", { count: "exact" })
      .order("created_at", { ascending: false })
      .limit(limit);
    if (regIdFilter) q = q.eq("registry_id", regIdFilter);
    if (args.status) q = q.eq("status", args.status);
    if (args.triggered_by) q = q.eq("triggered_by", args.triggered_by);
    if (args.since) q = q.gte("created_at", args.since);
    const { data, error, count } = await q;
    if (error) return err(error.message);
    // Tenant scope: only runs whose registry tenant_id is null OR matches caller.
    const filtered = (data ?? []).filter((r: any) => {
      const t = r.paige_workflow_registry?.tenant_id ?? null;
      return t === null || t === tenantId;
    }).map((r: any) => {
      const duration = r.completed_at && r.created_at
        ? new Date(r.completed_at).getTime() - new Date(r.created_at).getTime() : null;
      return {
        run_id: r.id,
        registry_key: r.paige_workflow_registry?.key ?? null,
        status: r.status,
        provider: r.paige_workflow_registry?.provider ?? null,
        triggered_by: r.triggered_by,
        retry_count: r.retry_count,
        execution_id: r.n8n_execution_id,
        thread_id: r.langgraph_thread_id,
        created_at: r.created_at,
        completed_at: r.completed_at,
        duration_ms: duration,
        error: r.error,
      };
    });
    return ok({ items: filtered, total: count ?? filtered.length });
  },
});

// ---------- cancel_workflow_run ----------
mcp.tool("cancel_workflow_run", {
  description:
    "Cancel a running or queued workflow run. For langgraph_bridge calls the bridge /cancel verb; for n8n calls stop-execution; for direct_edge_function marks the row cancelled. Audited.",
  inputSchema: z.object({
    run_id: z.string(),
    reason: z.string().optional(),
  }),
  annotations: { destructiveHint: true },
  handler: async ({ run_id, reason }) => {
    const tenantId = await actorTenantId();
    const { data: row } = await admin
      .from("paige_workflow_runs")
      .select("id, status, n8n_execution_id, langgraph_thread_id, registry_id, paige_workflow_registry(provider, n8n_webhook_url, tenant_id)")
      .eq("id", run_id).maybeSingle();
    if (!row) return err("run_not_found");
    const reg: any = (row as any).paige_workflow_registry;
    if (reg?.tenant_id && reg.tenant_id !== tenantId) return err("run_restricted_to_owning_tenant");
    if (["succeeded", "failed", "cancelled"].includes(row.status as string)) {
      return err(`run_already_terminal:${row.status}`);
    }
    const prior = row.status as string;
    const provider = reg?.provider as string | null;
    let providerNote: string | null = null;

    if (provider === "langgraph_bridge") {
      const bUrl = Deno.env.get("MMA_OS_LANGGRAPH_BRIDGE_URL");
      const bKey = Deno.env.get("MMA_OS_LANGGRAPH_BRIDGE_KEY");
      if (bUrl && bKey && (row as any).n8n_execution_id) {
        try {
          const r = await fetch(bUrl, {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${bKey}` },
            body: JSON.stringify({
              verb: "cancel_run",
              thread_id: (row as any).langgraph_thread_id,
              run_id: (row as any).n8n_execution_id,
            }),
          });
          providerNote = `bridge_${r.status}`;
        } catch (e) { providerNote = `bridge_err:${(e as Error).message.slice(0, 80)}`; }
      }
    }
    // n8n cancel could be added when n8n API key is available; for now mark row cancelled.

    const { error } = await admin.from("paige_workflow_runs").update({
      status: "cancelled",
      error: reason ? `cancelled: ${reason}` : "cancelled",
      completed_at: new Date().toISOString(),
    }).eq("id", run_id);
    if (error) return err(error.message);
    await audit("cancel_workflow_run", "workflow_run", run_id, { reason: reason ?? null, prior, provider_note: providerNote });
    return ok({ run_id, prior_status: prior, new_status: "cancelled", provider_note: providerNote });
  },
});

// ---------- register_workflow ----------
mcp.tool("register_workflow", {
  description:
    "Register a new workflow in the caller's tenant's registry. Master tenant can use any provider; sub-tenants are restricted to provider='webhook_external' or 'direct_edge_function'. Doctrine §118 + §119.",
  inputSchema: z.object({
    key: z.string().describe("snake_case, unique per tenant"),
    label: z.string(),
    description: z.string(),
    category: z.string(),
    provider: z.enum(["n8n", "langgraph", "langgraph_bridge", "direct_edge_function", "webhook_external", "cron_only"]),
    provider_config: z.record(z.string(), z.any()).optional(),
    requires_approval: z.boolean().optional(),
    allowed_roles: z.array(z.string()).optional(),
  }),
  annotations: { destructiveHint: false },
  handler: async (args) => {
    const tenantId = await actorTenantId();
    if (!tenantId) return err("tenant_not_resolved");
    // §118: only MMA may register MMA-infra providers.
    const platformOwnerProviders = new Set(["n8n", "langgraph", "langgraph_bridge"]);
    if (platformOwnerProviders.has(args.provider) && tenantId !== MMA_TENANT_ID) {
      return err("provider_restricted_to_platform_owner");
    }
    const cfg = args.provider_config ?? {};
    const row: Record<string, unknown> = {
      key: args.key,
      label: args.label,
      description: args.description,
      category: args.category,
      provider: args.provider,
      n8n_webhook_url: (cfg.n8n_webhook_url as string) ?? null,
      needs_n8n_link: false,
      langgraph_graph_id: (cfg.langgraph_graph_id as string) ?? (cfg.assistant_id as string) ?? null,
      direct_function_name: (cfg.direct_function_name as string) ?? null,
      requires_approval: args.requires_approval ?? false,
      allowed_roles: args.allowed_roles ?? ["admin", "super_admin"],
      is_active: true,
      tenant_id: tenantId === MMA_TENANT_ID ? null : tenantId,
    };
    const { data, error } = await admin.from("paige_workflow_registry").insert(row).select("id, key, tenant_id, created_at").single();
    if (error) return err(error.message);
    await audit("register_workflow", "workflow_registry", data.id, { key: args.key, provider: args.provider, tenant_id: data.tenant_id });
    return ok({ registry_id: data.id, key: data.key, tenant_id: data.tenant_id, created_at: data.created_at });
  },
});

// ---------- send_transactional_email ----------
mcp.tool("send_transactional_email", {
  description:
    "Send a one-off transactional email. Either provide template_key (rendered server-side) OR raw subject + body_html. From-address auto-resolves from tenant + product_scope.",
  inputSchema: z.object({
    to: z.string().describe("recipient email"),
    template_key: z.string().optional(),
    subject: z.string().optional(),
    body_html: z.string().optional(),
    body_text: z.string().optional(),
    template_variables: z.record(z.string(), z.any()).optional(),
    product_scope: z.string().optional(),
    contact_id: z.string().optional(),
    tenant_id: z.string().optional(),
  }),
  annotations: { destructiveHint: false },
  handler: async (args) => {
    if (!args.template_key && (!args.subject || !args.body_html)) {
      return err("must_provide_template_key_or_subject_and_body_html");
    }
    const tenant_id = await resolveTenantId(args.tenant_id ?? null);
    if (!tenant_id) return err("tenant_not_resolved");
    const { data: idn } = await admin.rpc("tenant_sender_identity", { _tenant_id: tenant_id });
    const fromAddress = (idn as any)?.from_address as string | undefined;
    const fromName = (idn as any)?.from_name as string | undefined;
    const replyTo = (idn as any)?.reply_to as string | undefined;
    if (!fromAddress) return err("from_address_not_resolved");

    let subject = args.subject ?? "";
    let html = args.body_html ?? "";
    let text = args.body_text ?? "";

    if (args.template_key) {
      const { data: tpl, error: tErr } = await admin
        .from("email_templates")
        .select("subject, body_html, body_text")
        .eq("key", args.template_key)
        .maybeSingle();
      if (tErr) return err(tErr.message);
      if (!tpl) return err("template_not_found");
      const vars = args.template_variables ?? {};
      const interp = (s: string) =>
        s.replace(/\{\{\s*([a-zA-Z0-9_.]+)\s*\}\}/g, (_, k) => String(vars[k] ?? ""));
      subject = interp(tpl.subject ?? "");
      html = interp(tpl.body_html ?? "");
      text = interp(tpl.body_text ?? "");
    }

    if (!RESEND_API_KEY) return err("resend_not_configured");
    const send_id = crypto.randomUUID();
    const fromHeader = fromName ? `${fromName} <${fromAddress}>` : fromAddress;
    let resendId: string | null = null;
    let status: "sent" | "failed" = "sent";
    let errorMsg: string | null = null;
    try {
      const r = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${RESEND_API_KEY}` },
        body: JSON.stringify({
          from: fromHeader,
          to: [args.to],
          subject,
          html,
          text: text || undefined,
          reply_to: replyTo || undefined,
          headers: { "X-Paige-Send-Id": send_id },
        }),
      });
      const j = await r.json().catch(() => ({} as any));
      if (!r.ok) { status = "failed"; errorMsg = (j as any)?.message ?? `resend_${r.status}`; }
      else resendId = (j as any)?.id ?? null;
    } catch (e) {
      status = "failed";
      errorMsg = (e as Error).message.slice(0, 300);
    }
    try {
      await admin.from("email_send_log").insert({
        id: send_id,
        tenant_id,
        contact_id: args.contact_id ?? null,
        recipient_email: args.to,
        from_address: fromAddress,
        subject,
        template_key: args.template_key ?? null,
        product_scope: args.product_scope ?? null,
        status,
        provider_message_id: resendId,
        error_message: errorMsg,
      });
    } catch { /* log table may not have all columns — non-fatal */ }
    await audit("send_transactional_email", "email", send_id, {
      to: args.to, template_key: args.template_key ?? null, status, tenant_id,
    });
    return ok({ send_id, resend_id: resendId, status, from: fromHeader, to: args.to, error: errorMsg });
  },
});

// ---------- send_sms ----------
mcp.tool("send_sms", {
  description:
    "Send a one-off SMS via Twilio. From-number from TWILIO_PHONE_NUMBER. Auto-appends 'Reply STOP to unsubscribe.' for A2P 10DLC compliance. Respects opt-out flag on contact when contact_id supplied.",
  inputSchema: z.object({
    to_phone: z.string().describe("E.164, e.g. +14705944470"),
    body: z.string(),
    contact_id: z.string().optional(),
    provider: z.enum(["twilio"]).optional(),
  }),
  annotations: { destructiveHint: false },
  handler: async (args) => {
    if (args.body.length > 1600) return err("body_too_long_max_1600");
    if (args.contact_id) {
      const { data: c } = await admin
        .from("clients").select("sms_opt_out, phone").eq("id", args.contact_id).maybeSingle();
      if (c && (c as any).sms_opt_out === true) {
        return ok({ send_id: null, status: "blocked_by_optout", from_phone: null, to: args.to_phone });
      }
    }
    const accountSid = Deno.env.get("TWILIO_ACCOUNT_SID");
    const authToken = Deno.env.get("TWILIO_AUTH_TOKEN");
    const fromPhone = Deno.env.get("TWILIO_PHONE_NUMBER");
    if (!accountSid || !authToken || !fromPhone) return err("twilio_not_configured");
    const send_id = crypto.randomUUID();
    const STOP_SUFFIX = " Reply STOP to unsubscribe.";
    const fullBody = args.body.includes("STOP") ? args.body : (args.body + STOP_SUFFIX).slice(0, 1600);
    const segments = Math.max(1, Math.ceil(fullBody.length / 160));
    let providerMsgId: string | null = null;
    let status: "sent" | "failed" = "sent";
    let errorMsg: string | null = null;
    try {
      const body = new URLSearchParams({ To: args.to_phone, From: fromPhone, Body: fullBody });
      const r = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`, {
        method: "POST",
        headers: {
          Authorization: `Basic ${btoa(`${accountSid}:${authToken}`)}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: body.toString(),
      });
      const j = await r.json().catch(() => ({} as any));
      if (!r.ok) { status = "failed"; errorMsg = (j as any)?.message ?? `twilio_${r.status}`; }
      else providerMsgId = (j as any)?.sid ?? null;
    } catch (e) {
      status = "failed";
      errorMsg = (e as Error).message.slice(0, 300);
    }
    await audit("send_sms", "sms", send_id, { to: args.to_phone, contact_id: args.contact_id ?? null, status });
    return {
      content: [{ type: "text" as const, text: JSON.stringify({
        send_id, provider_message_id: providerMsgId, status, from_phone: fromPhone, segments, error: errorMsg,
      }, null, 2) }],
    };
  },
});

// ---------- create_invoice ----------
const BTF_PLANS: Record<string, { description: string; total_cents: number; line_items: any[] }> = {
  btf_pif:        { description: "BUILD-to-FUND — Paid in Full",  total_cents: 499700, line_items: [{ description: "BUILD-to-FUND Program (Paid in Full)", amount_cents: 499700, quantity: 1 }] },
  btf_split:      { description: "BUILD-to-FUND — 3-Pay Split",   total_cents: 499700, line_items: [{ description: "BUILD-to-FUND Program (Split Pay, payment 1 of 3)", amount_cents: 166600, quantity: 1 }] },
  btf_getstarted: { description: "BUILD-to-FUND — Get Started",   total_cents: 99700,  line_items: [{ description: "BUILD-to-FUND Get Started Deposit", amount_cents: 99700, quantity: 1 }] },
};

mcp.tool("create_invoice", {
  description:
    "Create a draft invoice for a contact (optionally tied to a deal). Use payment_plan_key for BTF presets (btf_pif|btf_split|btf_getstarted). Returns invoice_id + hosted_invoice_url. Stripe Connect placeholder mode supported.",
  inputSchema: z.object({
    contact_id: z.string(),
    deal_id: z.string().optional(),
    amount_cents: z.number().int().optional(),
    currency: z.string().optional(),
    line_items: z.array(z.object({
      description: z.string(),
      amount_cents: z.number().int(),
      quantity: z.number().int().optional(),
    })).optional(),
    due_date: z.string().optional().describe("YYYY-MM-DD"),
    memo: z.string().optional(),
    payment_plan_key: z.enum(["btf_pif", "btf_split", "btf_getstarted"]).optional(),
  }),
  annotations: { destructiveHint: false },
  handler: async (args) => {
    const tenant_id = await resolveTenantId(null);
    if (!tenant_id) return err("tenant_not_resolved");
    const { data: contact } = await admin
      .from("clients").select("id, tenant_id").eq("id", args.contact_id).maybeSingle();
    if (!contact) return err("contact_not_found");

    let lineItems = args.line_items ?? [];
    let amountTotal = args.amount_cents ?? 0;
    if (args.payment_plan_key) {
      const plan = BTF_PLANS[args.payment_plan_key];
      lineItems = plan.line_items;
      amountTotal = plan.total_cents;
    }
    if (lineItems.length > 0 && !args.amount_cents) {
      amountTotal = lineItems.reduce((s, li) => s + li.amount_cents * (li.quantity ?? 1), 0);
    }
    if (amountTotal <= 0) return err("amount_total_must_be_positive");

    const dueDate = args.due_date ?? new Date(Date.now() + 30 * 86400_000).toISOString().slice(0, 10);
    const { data: actor } = await admin.from("paige_workflow_registry").select("id").limit(0);
    void actor;
    const createdBy = currentActor().user_id;

    const { data: inv, error } = await admin.from("paige_invoices").insert({
      tenant_id,
      contact_id: args.contact_id,
      deal_id: args.deal_id ?? null,
      status: "draft",
      amount_total_cents: amountTotal,
      currency: (args.currency ?? "USD").toUpperCase(),
      line_items: lineItems,
      due_date: dueDate,
      memo: args.memo ?? null,
      payment_plan_key: args.payment_plan_key ?? null,
      hosted_invoice_url: null, // populated when send_invoice runs (Stripe Connect or fallback)
      created_by: createdBy,
    }).select("id, invoice_number, status, amount_total_cents, hosted_invoice_url").single();
    if (error) return err(error.message);
    await audit("create_invoice", "invoice", inv.id, {
      contact_id: args.contact_id, amount_cents: amountTotal, payment_plan_key: args.payment_plan_key ?? null,
    });
    return ok({
      invoice_id: inv.id,
      invoice_number: inv.invoice_number,
      hosted_invoice_url: inv.hosted_invoice_url ?? null,
      status: inv.status,
      amount_total_cents: inv.amount_total_cents,
    });
  },
});

// ---------- send_invoice ----------
mcp.tool("send_invoice", {
  description:
    "Deliver a previously-created draft invoice. Emails the contact with the hosted invoice link and marks status='sent'. Separate from create_invoice so callers can review the draft first.",
  inputSchema: z.object({
    invoice_id: z.string(),
    custom_message: z.string().optional(),
  }),
  annotations: { destructiveHint: false },
  handler: async (args) => {
    const { data: inv, error: iErr } = await admin
      .from("paige_invoices")
      .select("id, tenant_id, contact_id, status, invoice_number, amount_total_cents, currency, hosted_invoice_url, memo")
      .eq("id", args.invoice_id).maybeSingle();
    if (iErr) return err(iErr.message);
    if (!inv) return err("invoice_not_found");
    if (inv.status !== "draft") return err(`invoice_not_draft:${inv.status}`);

    const { data: contact } = await admin
      .from("clients").select("email, first_name, last_name").eq("id", inv.contact_id).maybeSingle();
    if (!contact?.email) return err("contact_email_missing");

    // Stripe Connect hosted URL — placeholder fallback (BYPASS_STRIPE_CONNECT) when not configured.
    let hostedUrl = inv.hosted_invoice_url
      ?? `${Deno.env.get("PAIGE_APP_ORIGIN") ?? "https://paigeagent.ai"}/i/${inv.invoice_number}`;

    if (!RESEND_API_KEY) return err("resend_not_configured");
    const { data: idn } = await admin.rpc("tenant_sender_identity", { _tenant_id: inv.tenant_id });
    const fromAddress = (idn as any)?.from_address as string | undefined;
    const fromName = (idn as any)?.from_name as string | undefined;
    if (!fromAddress) return err("from_address_not_resolved");
    const fromHeader = fromName ? `${fromName} <${fromAddress}>` : fromAddress;

    const amountFmt = `$${(inv.amount_total_cents / 100).toFixed(2)} ${inv.currency}`;
    const greeting = contact.first_name ? `Hi ${contact.first_name},` : "Hi,";
    const intro = args.custom_message ? `<p>${args.custom_message}</p>` : "";
    const html = `<!doctype html><html><body style="font-family:Inter,Arial,sans-serif;color:#111">
      <p>${greeting}</p>${intro}
      <p>Your invoice <strong>${inv.invoice_number}</strong> for <strong>${amountFmt}</strong> is ready.</p>
      <p><a href="${hostedUrl}" style="display:inline-block;padding:12px 20px;background:#CFAE70;color:#000;text-decoration:none;border-radius:6px;font-weight:600">View & Pay Invoice</a></p>
      ${inv.memo ? `<p style="color:#555;font-size:14px">${inv.memo}</p>` : ""}
      <p>Thanks!</p>
    </body></html>`;

    const send_id = crypto.randomUUID();
    let resendErr: string | null = null;
    try {
      const r = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${RESEND_API_KEY}` },
        body: JSON.stringify({
          from: fromHeader,
          to: [contact.email],
          subject: `Invoice ${inv.invoice_number} — ${amountFmt}`,
          html,
          headers: { "X-Paige-Send-Id": send_id },
        }),
      });
      if (!r.ok) {
        const j = await r.json().catch(() => ({} as any));
        resendErr = (j as any)?.message ?? `resend_${r.status}`;
      }
    } catch (e) {
      resendErr = (e as Error).message.slice(0, 300);
    }
    if (resendErr) return err(`email_send_failed: ${resendErr}`);

    await admin.from("paige_invoices").update({
      status: "sent",
      sent_at: new Date().toISOString(),
      sent_to_email: contact.email,
      hosted_invoice_url: hostedUrl,
    }).eq("id", inv.id);
    await audit("send_invoice", "invoice", inv.id, { to: contact.email, send_id });

    return ok({
      invoice_id: inv.id,
      status: "sent",
      sent_to_email: contact.email,
      send_id,
      hosted_invoice_url: hostedUrl,
    });
  },
});











async function sha256Hex(input: string): Promise<string> {
  const bytes = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

// ---------- Batch #3: Field-Ops Ingestion (voice/chat from external LLMs) ----------
// All tools below stage writes through `paige_ingestion_proposals` so that:
//   1. Every ingest is auditable + reversible.
//   2. Hallucination guards (range checks, conflict deltas, fuzzy-match disambiguation) run before commit.
//   3. Tenant scoping is enforced on every read/write.
//   4. Admins can review `needs_review` items in /admin/approvals.
//
// Tools: search_clients_fuzzy, propose_client_update, confirm_proposal, reject_proposal,
//        ingest_credit_scores, ingest_banking_snapshot, append_client_memory,
//        list_my_proposals.

const BUREAUS = ["TU", "EX", "EQ"] as const;
const SCORE_SOURCES = [
  "soft_pull",
  "hard_pull",
  "client_self_reported",
  "report_upload",
  "monitoring_service",
  "voice_dictation",
] as const;
const CONFIDENCE = ["high", "medium", "low"] as const;

async function tenantScopedClient(client_id: string): Promise<{ ok: boolean; tenant_id: string | null; reason?: string }> {
  const tid = await actorTenantId();
  const { data, error } = await admin
    .from("clients")
    .select("id, tenant_id")
    .eq("id", client_id)
    .maybeSingle();
  if (error) return { ok: false, tenant_id: null, reason: error.message };
  if (!data) return { ok: false, tenant_id: null, reason: "client_not_found" };
  // Master tenant (MMA) can reach across; everyone else is hard-scoped.
  if (tid !== MMA_TENANT_ID && data.tenant_id !== tid) {
    return { ok: false, tenant_id: data.tenant_id as string | null, reason: "cross_tenant_forbidden" };
  }
  return { ok: true, tenant_id: data.tenant_id as string | null };
}

async function recordProposal(input: {
  client_id: string | null;
  tool_name: string;
  target_table: string | null;
  payload: Record<string, unknown>;
  diff: Record<string, unknown>;
  confidence: typeof CONFIDENCE[number];
  source: string;
  external_llm_model?: string | null;
  review_reason?: string | null;
  auto_status?: "pending" | "needs_review";
}): Promise<{ id: string } | null> {
  const actor = currentActor();
  const tenant_id = input.client_id
    ? (await admin.from("clients").select("tenant_id").eq("id", input.client_id).maybeSingle()).data?.tenant_id ?? null
    : await actorTenantId();
  const { data, error } = await admin
    .from("paige_ingestion_proposals")
    .insert({
      tenant_id,
      actor_user_id: actor.user_id,
      actor_role: actor.kind === "user" ? "mcp:user" : "mcp:platform",
      actor_label: actor.client_id ?? null,
      client_id: input.client_id,
      tool_name: input.tool_name,
      target_table: input.target_table,
      payload: input.payload,
      diff: input.diff,
      status: input.auto_status ?? "pending",
      confidence: input.confidence,
      source: input.source,
      external_llm_model: input.external_llm_model ?? null,
      review_reason: input.review_reason ?? null,
    })
    .select("id")
    .single();
  if (error) {
    console.error("[paige-mcp] recordProposal failed", error.message);
    return null;
  }
  return { id: data.id };
}

mcp.tool("search_clients_fuzzy", {
  description:
    "Voice/chat friendly fuzzy contact lookup. Use this BEFORE any ingest_* tool to resolve which client a teammate is talking about. Returns ranked candidates and a `disambiguation_required` flag when more than one strong match is found.",
  inputSchema: z.object({
    query: z.string().describe('Free text: "Marcus from Atlanta", "the Johnson LLC client", an email, or a phone fragment.'),
    limit: z.number().int().optional(),
  }),
  handler: async ({ query, limit }) => {
    const max = Math.min(Math.max(limit ?? 8, 1), 25);
    const tid = await actorTenantId();
    const safe = String(query).replace(/[,()%]/g, " ").trim();
    if (!safe) return err("empty_query");
    let q = admin
      .from("clients")
      .select("id, first_name, last_name, email, phone, entity_name, city, state, lifecycle_stage, tenant_id, updated_at")
      .or(
        `first_name.ilike.%${safe}%,last_name.ilike.%${safe}%,email.ilike.%${safe}%,phone.ilike.%${safe}%,entity_name.ilike.%${safe}%,city.ilike.%${safe}%`,
      )
      .order("updated_at", { ascending: false })
      .limit(max);
    if (tid && tid !== MMA_TENANT_ID) q = q.eq("tenant_id", tid);
    const { data, error } = await q;
    if (error) return err(error.message);
    const items = data ?? [];
    return ok({
      items,
      count: items.length,
      disambiguation_required: items.length > 1,
      hint:
        items.length === 0
          ? "No match. Ask the teammate for an email, phone, or company name."
          : items.length === 1
            ? "Single match. Safe to proceed with the returned id."
            : "Multiple matches. Read the list back to the teammate and ask which client they mean before calling any ingest_* tool.",
    });
  },
});

mcp.tool("propose_client_update", {
  description:
    "Stage a free-form update against a single contact. DOES NOT WRITE. Returns a proposal_id and a diff that the connected LLM MUST read back to the teammate before calling `confirm_proposal`. Use this for ad-hoc changes that don't have a dedicated ingest_* tool.",
  inputSchema: z.object({
    client_id: z.string(),
    updates: z.record(z.any()).describe("Partial fields on clients (whitelisted): first_name, last_name, email, phone, entity_name, entity_type, street_address, city, state, zip_code, funding_goal, monthly_revenue, primary_offer, lifecycle_stage, tier, source, title, website, current_notes."),
    confidence: z.enum(CONFIDENCE).describe("high = teammate confirmed verbatim, medium = paraphrased, low = unsure/approximate."),
    external_llm_model: z.string().optional(),
    review_reason: z.string().optional().describe("Why this might need human review."),
  }),
  handler: async ({ client_id, updates, confidence, external_llm_model, review_reason }) => {
    const scope = await tenantScopedClient(client_id);
    if (!scope.ok) return err(scope.reason ?? "scope_denied");
    const ALLOWED = new Set([
      "first_name","last_name","email","phone","entity_name","entity_type",
      "street_address","city","state","zip_code","funding_goal","monthly_revenue",
      "primary_offer","lifecycle_stage","tier","source","title","website","current_notes",
    ]);
    const clean: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(updates ?? {})) if (ALLOWED.has(k)) clean[k] = v;
    if (Object.keys(clean).length === 0) return err("no_whitelisted_fields");

    const { data: current } = await admin.from("clients").select(Object.keys(clean).join(",")).eq("id", client_id).maybeSingle();
    const diff: Record<string, { from: unknown; to: unknown }> = {};
    for (const [k, v] of Object.entries(clean)) {
      diff[k] = { from: (current as Record<string, unknown> | null)?.[k] ?? null, to: v };
    }

    const needsReview = confidence === "low" || !!review_reason;
    const proposal = await recordProposal({
      client_id,
      tool_name: "propose_client_update",
      target_table: "clients",
      payload: { updates: clean },
      diff,
      confidence,
      source: "mcp:field_ops",
      external_llm_model,
      review_reason: needsReview ? (review_reason ?? "low_confidence") : null,
      auto_status: needsReview ? "needs_review" : "pending",
    });
    if (!proposal) return err("proposal_insert_failed");
    await audit("propose_client_update", "client", client_id, { proposal_id: proposal.id, fields: Object.keys(clean) });
    return ok({
      proposal_id: proposal.id,
      client_id,
      diff,
      status: needsReview ? "needs_review" : "pending",
      next_step: needsReview
        ? "Routed to admin /admin/approvals. Do not call confirm_proposal."
        : "Read the diff back to the teammate verbatim, then call confirm_proposal with this proposal_id once they say yes.",
    });
  },
});

mcp.tool("ingest_credit_scores", {
  description:
    'Record one or more bureau credit scores for a client. Each score must include bureau (TU/EX/EQ), score (300-850), source, and a pulled_on date. Auto-flags as needs_review if (a) confidence=low, (b) score differs from the most recent stored estimate for that bureau by >40 points, or (c) the score falls outside 300-850. On confirm, writes to profiles.estimated_fico_* (when client has a linked user) AND always logs a structured client_memory entry.',
  inputSchema: z.object({
    client_id: z.string(),
    scores: z.array(
      z.object({
        bureau: z.enum(BUREAUS),
        score: z.number().int(),
        source: z.enum(SCORE_SOURCES),
        pulled_on: z.string().describe("ISO date, e.g. 2026-06-29."),
      }),
    ),
    confidence: z.enum(CONFIDENCE),
    external_llm_model: z.string().optional(),
    auto_confirm: z.boolean().optional().describe("If true AND no review flags, apply immediately without a second tool call. Default false."),
  }),
  handler: async (args) => {
    const scope = await tenantScopedClient(args.client_id);
    if (!scope.ok) return err(scope.reason ?? "scope_denied");

    // Validation
    const reviewReasons: string[] = [];
    for (const s of args.scores) {
      if (s.score < 300 || s.score > 850) reviewReasons.push(`score_out_of_range:${s.bureau}:${s.score}`);
      if (Number.isNaN(Date.parse(s.pulled_on))) reviewReasons.push(`bad_date:${s.bureau}`);
    }
    if (args.confidence === "low") reviewReasons.push("low_confidence");

    // Conflict detection against profiles.estimated_fico_* via linked_user_id
    const { data: client } = await admin
      .from("clients")
      .select("id, linked_user_id, first_name, last_name")
      .eq("id", args.client_id)
      .maybeSingle();
    let priorScores: Record<string, number | null> = {};
    if (client?.linked_user_id) {
      const { data: prof } = await admin
        .from("profiles")
        .select("estimated_fico_tu, estimated_fico_ex, estimated_fico_eq")
        .eq("user_id", client.linked_user_id)
        .maybeSingle();
      priorScores = {
        TU: (prof?.estimated_fico_tu as number | null) ?? null,
        EX: (prof?.estimated_fico_ex as number | null) ?? null,
        EQ: (prof?.estimated_fico_eq as number | null) ?? null,
      };
      for (const s of args.scores) {
        const prior = priorScores[s.bureau];
        if (prior != null && Math.abs(prior - s.score) > 40) {
          reviewReasons.push(`large_delta:${s.bureau}:${prior}->${s.score}`);
        }
      }
    }

    const needsReview = reviewReasons.length > 0;
    const diff: Record<string, unknown> = {};
    for (const s of args.scores) diff[`fico_${s.bureau.toLowerCase()}`] = { from: priorScores[s.bureau] ?? null, to: s.score, source: s.source, pulled_on: s.pulled_on };

    const proposal = await recordProposal({
      client_id: args.client_id,
      tool_name: "ingest_credit_scores",
      target_table: "profiles",
      payload: { scores: args.scores },
      diff,
      confidence: args.confidence,
      source: "mcp:field_ops",
      external_llm_model: args.external_llm_model,
      review_reason: needsReview ? reviewReasons.join(", ") : null,
      auto_status: needsReview ? "needs_review" : "pending",
    });
    if (!proposal) return err("proposal_insert_failed");
    await audit("ingest_credit_scores", "client", args.client_id, { proposal_id: proposal.id, count: args.scores.length, needs_review: needsReview });

    if (!needsReview && args.auto_confirm) {
      const applied = await applyProposal(proposal.id);
      if (!applied.ok) return err(applied.reason ?? "apply_failed");
      return ok({ proposal_id: proposal.id, status: "applied", applied: applied.applied, client_id: args.client_id });
    }

    return ok({
      proposal_id: proposal.id,
      status: needsReview ? "needs_review" : "pending",
      diff,
      review_reasons: reviewReasons,
      next_step: needsReview
        ? "Routed to /admin/approvals for human review. Do NOT confirm."
        : 'Read the scores back verbatim ("TransUnion 520 from a soft pull on 2026-06-29 — correct?"). Then call confirm_proposal.',
    });
  },
});

mcp.tool("ingest_banking_snapshot", {
  description:
    "Stage a manual banking snapshot for a client (current balance, avg daily balance, NSFs in last 30d, monthly deposits). Goes through the same proposal workflow as ingest_credit_scores. Applied write lands in manual_banking_entries on confirm.",
  inputSchema: z.object({
    client_id: z.string(),
    bank_name: z.string(),
    current_balance: z.number().optional(),
    avg_daily_balance: z.number().optional(),
    nsf_count_30d: z.number().int().optional(),
    monthly_deposits: z.number().optional(),
    period_label: z.string().optional().describe('Free text e.g. "June 2026" or "Last 30 days".'),
    confidence: z.enum(CONFIDENCE),
    external_llm_model: z.string().optional(),
  }),
  handler: async (args) => {
    const scope = await tenantScopedClient(args.client_id);
    if (!scope.ok) return err(scope.reason ?? "scope_denied");
    const review: string[] = [];
    if ((args.current_balance ?? 0) < 0) review.push("negative_balance");
    if ((args.nsf_count_30d ?? 0) > 20) review.push("high_nsf_count");
    if (args.confidence === "low") review.push("low_confidence");

    const proposal = await recordProposal({
      client_id: args.client_id,
      tool_name: "ingest_banking_snapshot",
      target_table: "manual_banking_entries",
      payload: args,
      diff: { snapshot: args },
      confidence: args.confidence,
      source: "mcp:field_ops",
      external_llm_model: args.external_llm_model,
      review_reason: review.length ? review.join(", ") : null,
      auto_status: review.length ? "needs_review" : "pending",
    });
    if (!proposal) return err("proposal_insert_failed");
    await audit("ingest_banking_snapshot", "client", args.client_id, { proposal_id: proposal.id });
    return ok({
      proposal_id: proposal.id,
      status: review.length ? "needs_review" : "pending",
      review_reasons: review,
      next_step: review.length
        ? "Routed to /admin/approvals."
        : "Read snapshot back to teammate, then call confirm_proposal.",
    });
  },
});

mcp.tool("append_client_memory", {
  description:
    "Append a structured coach/agent note to a client's long-term memory. Goes straight into client_memory once confirmed. Use this for context Paige should remember (e.g. \"client just had a baby\", \"prefers SBA over MCA\", \"working on Equifax disputes only\").",
  inputSchema: z.object({
    client_id: z.string(),
    note: z.string().describe("Plain text, max 4000 chars."),
    category: z.enum(["coach_note", "session_summary", "milestone_completed", "lender_researched"]).default("coach_note"),
    confidence: z.enum(CONFIDENCE),
    auto_confirm: z.boolean().optional(),
    external_llm_model: z.string().optional(),
  }),
  handler: async (args) => {
    const scope = await tenantScopedClient(args.client_id);
    if (!scope.ok) return err(scope.reason ?? "scope_denied");
    const text = String(args.note).slice(0, 4000);
    const needsReview = args.confidence === "low";
    const proposal = await recordProposal({
      client_id: args.client_id,
      tool_name: "append_client_memory",
      target_table: "client_memory",
      payload: { note: text, category: args.category },
      diff: { note: { to: text, category: args.category } },
      confidence: args.confidence,
      source: "mcp:field_ops",
      external_llm_model: args.external_llm_model,
      review_reason: needsReview ? "low_confidence" : null,
      auto_status: needsReview ? "needs_review" : "pending",
    });
    if (!proposal) return err("proposal_insert_failed");
    await audit("append_client_memory", "client", args.client_id, { proposal_id: proposal.id });

    if (!needsReview && args.auto_confirm) {
      const applied = await applyProposal(proposal.id);
      if (!applied.ok) return err(applied.reason ?? "apply_failed");
      return ok({ proposal_id: proposal.id, status: "applied", applied: applied.applied });
    }
    return ok({
      proposal_id: proposal.id,
      status: needsReview ? "needs_review" : "pending",
      next_step: needsReview ? "Routed to /admin/approvals." : "Read back to teammate, then call confirm_proposal.",
    });
  },
});

mcp.tool("confirm_proposal", {
  description:
    "Commit a staged ingestion proposal after the teammate has verified the diff verbatim. Applies the write to the underlying table (profiles / client_memory / manual_banking_entries / clients) and stamps `applied`. Rejects proposals that are expired, already-decided, or in needs_review (those require admin sign-off).",
  inputSchema: z.object({ proposal_id: z.string() }),
  handler: async ({ proposal_id }) => {
    const applied = await applyProposal(proposal_id);
    if (!applied.ok) return err(applied.reason ?? "apply_failed");
    return ok({ proposal_id, status: "applied", applied: applied.applied });
  },
});

mcp.tool("reject_proposal", {
  description: "Discard a staged proposal. Use when the teammate corrects themselves before confirming.",
  inputSchema: z.object({ proposal_id: z.string(), reason: z.string().optional() }),
  handler: async ({ proposal_id, reason }) => {
    const actor = currentActor();
    const { error } = await admin
      .from("paige_ingestion_proposals")
      .update({ status: "rejected", decided_at: new Date().toISOString(), decided_by: actor.user_id, review_reason: reason ?? null })
      .eq("id", proposal_id)
      .in("status", ["pending", "needs_review"]);
    if (error) return err(error.message);
    await audit("reject_proposal", "proposal", proposal_id, { reason: reason ?? null });
    return ok({ proposal_id, status: "rejected" });
  },
});

mcp.tool("list_my_proposals", {
  description: "List recent ingestion proposals the caller created. Useful for status checks (\"did that update go through?\").",
  inputSchema: z.object({
    status: z.enum(["pending", "needs_review", "applied", "rejected", "expired"]).optional(),
    limit: z.number().int().optional(),
  }),
  handler: async ({ status, limit }) => {
    const max = Math.min(Math.max(limit ?? 20, 1), 100);
    const actor = currentActor();
    let q = admin
      .from("paige_ingestion_proposals")
      .select("id, client_id, tool_name, status, confidence, review_reason, created_at, decided_at")
      .order("created_at", { ascending: false })
      .limit(max);
    if (actor.user_id) q = q.eq("actor_user_id", actor.user_id);
    if (status) q = q.eq("status", status);
    const { data, error } = await q;
    if (error) return err(error.message);
    return ok({ items: data ?? [], count: (data ?? []).length });
  },
});

// Shared committer used by confirm_proposal and ingest_*({auto_confirm:true}).
async function applyProposal(proposal_id: string): Promise<{ ok: boolean; applied?: Record<string, unknown>; reason?: string }> {
  const { data: prop, error } = await admin
    .from("paige_ingestion_proposals")
    .select("*")
    .eq("id", proposal_id)
    .maybeSingle();
  if (error) return { ok: false, reason: error.message };
  if (!prop) return { ok: false, reason: "proposal_not_found" };
  if (prop.status !== "pending") return { ok: false, reason: `proposal_status_${prop.status}` };
  if (prop.expires_at && new Date(prop.expires_at) < new Date()) {
    await admin.from("paige_ingestion_proposals").update({ status: "expired" }).eq("id", proposal_id);
    return { ok: false, reason: "proposal_expired" };
  }

  const actor = currentActor();
  const payload = (prop.payload ?? {}) as Record<string, any>;
  const applied: Record<string, unknown> = {};

  try {
    switch (prop.tool_name) {
      case "propose_client_update": {
        const updates = payload.updates ?? {};
        const { error: upErr } = await admin.from("clients").update(updates).eq("id", prop.client_id);
        if (upErr) throw upErr;
        applied.clients = { id: prop.client_id, updated_fields: Object.keys(updates) };
        break;
      }
      case "ingest_credit_scores": {
        const { data: cli } = await admin.from("clients").select("linked_user_id").eq("id", prop.client_id).maybeSingle();
        const scores = payload.scores ?? [];
        if (cli?.linked_user_id) {
          const patch: Record<string, number | string> = {};
          for (const s of scores) {
            if (s.bureau === "TU") patch.estimated_fico_tu = s.score;
            if (s.bureau === "EX") patch.estimated_fico_ex = s.score;
            if (s.bureau === "EQ") patch.estimated_fico_eq = s.score;
          }
          if (Object.keys(patch).length) {
            const { error: pErr } = await admin.from("profiles").update(patch).eq("user_id", cli.linked_user_id);
            if (pErr) throw pErr;
            applied.profiles = { user_id: cli.linked_user_id, patch };
          }
        }
        // Always log a structured memory entry so non-linked clients still capture history.
        const summary = scores
          .map((s: any) => `${s.bureau} ${s.score} (${s.source}, ${s.pulled_on})`)
          .join("; ");
        const { error: mErr } = await admin.from("client_memory").insert({
          client_user_id: actor.user_id ?? "00000000-0000-0000-0000-000000000000",
          client_id: prop.client_id,
          memory_type: "report_upload",
          content: `Credit scores ingested via MCP field-ops: ${summary}`,
          metadata: { proposal_id, scores, source: "mcp:field_ops", external_llm_model: prop.external_llm_model ?? null },
        });
        if (mErr) console.error("[apply credit_scores] memory insert failed", mErr.message);
        applied.client_memory = { logged: true };
        break;
      }
      case "ingest_banking_snapshot": {
        const { data: cli } = await admin
          .from("clients")
          .select("linked_user_id")
          .eq("id", prop.client_id)
          .maybeSingle();
        if (!cli?.linked_user_id) {
          // No linked auth user — capture the snapshot as a structured memory entry instead.
          await admin.from("client_memory").insert({
            client_user_id: actor.user_id ?? "00000000-0000-0000-0000-000000000000",
            client_id: prop.client_id,
            memory_type: "session_summary",
            content: `Banking snapshot (no linked user): ${JSON.stringify(payload)}`,
            metadata: { proposal_id, source: "mcp:field_ops:banking_no_link" },
          });
          applied.client_memory = { logged: true, note: "client has no linked_user_id; stored in memory" };
        } else {
          const { data: bRow, error: bErr } = await admin
            .from("manual_banking_entries")
            .upsert(
              {
                user_id: cli.linked_user_id,
                avg_daily_balance: payload.avg_daily_balance ?? 0,
                avg_monthly_revenue: payload.monthly_deposits ?? 0,
                monthly_nsf_count: payload.nsf_count_30d ?? 0,
              },
              { onConflict: "user_id" },
            )
            .select("id")
            .single();
          if (bErr) throw bErr;
          applied.manual_banking_entries = { id: bRow?.id, user_id: cli.linked_user_id };
        }
        break;
      }
      case "append_client_memory": {
        const { data: mRow, error: mErr } = await admin
          .from("client_memory")
          .insert({
            client_user_id: actor.user_id ?? "00000000-0000-0000-0000-000000000000",
            client_id: prop.client_id,
            memory_type: payload.category ?? "coach_note",
            content: payload.note,
            metadata: { proposal_id, source: "mcp:field_ops", external_llm_model: prop.external_llm_model ?? null },
          })
          .select("id")
          .single();
        if (mErr) throw mErr;
        applied.client_memory = { id: mRow?.id };
        break;
      }
      default:
        return { ok: false, reason: `unknown_tool:${prop.tool_name}` };
    }
  } catch (e) {
    const msg = (e as Error).message;
    await admin
      .from("paige_ingestion_proposals")
      .update({ status: "needs_review", review_reason: `apply_failed: ${msg}` })
      .eq("id", proposal_id);
    return { ok: false, reason: `apply_failed:${msg}` };
  }

  await admin
    .from("paige_ingestion_proposals")
    .update({ status: "applied", decided_at: new Date().toISOString(), decided_by: actor.user_id, applied_row_ids: applied })
    .eq("id", proposal_id);
  await audit("apply_proposal", "proposal", proposal_id, { tool: prop.tool_name, applied });
  return { ok: true, applied };
}

// ---------- Pass 5: Orchestrator bridge (Section 18) ----------
// Exposes Paige's sub-agent roster to external MCP clients (Claude Desktop, ChatGPT, voice).
// Routes through `paige-orchestrator` which honors the tool-deferral pattern + logs every invocation.
const ORCHESTRATOR_URL = `${SUPABASE_URL.replace(/\/$/, "")}/functions/v1/paige-orchestrator`;

async function callOrchestrator(body: Record<string, unknown>) {
  const resp = await fetch(ORCHESTRATOR_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
      apikey: SERVICE_ROLE_KEY,
      "X-Orchestrator-Call": "paige-mcp",
    },
    body: JSON.stringify(body),
  });
  const text = await resp.text();
  try { return { status: resp.status, body: JSON.parse(text) }; }
  catch { return { status: resp.status, body: { raw: text } }; }
}

mcp.tool("list_subagents", {
  description:
    "List Paige's specialized sub-agents (Fundability Diagnostician, Legal & Compliance Reviewer, Business Credit Strategist, Funding Path Architect, Data Consistency Auditor, Market Research, Financial Research, Content Drafter, Intake Concierge, Sales Pipeline, Coach Copilot). Use this before `delegate_to_subagent` to discover the right slug + input schema. Optional `query` keyword + `domain` filter (fundability / compliance / credit / funding / research / outreach / intake / sales / coaching).",
  inputSchema: z.object({
    query: z.string().optional().describe("Keyword match across name, description, triggers."),
    domain: z.string().optional().describe("Filter by domain (partial match)."),
  }),
  handler: async ({ query, domain }) => {
    const r = await callOrchestrator({ action: "tool_search", query, domain });
    if (r.status >= 300) return err(`orchestrator_error_${r.status}`);
    return ok(r.body);
  },
});

mcp.tool("delegate_to_subagent", {
  description:
    "Delegate a task to one of Paige's specialized sub-agents. Call `list_subagents` first to resolve the correct `slug`. Pass a sub-agent-specific `input` object (e.g. {client_id} for fundability/compliance; {query} for market_research; {lender_name} for financial_research). Returns the sub-agent's structured findings. Every invocation is logged in paige_subagent_invocations for audit + UI surfacing.",
  inputSchema: z.object({
    slug: z.string().describe("Sub-agent slug from list_subagents (e.g. 'fundability-diagnostician')."),
    input: z.record(z.any()).optional().describe("Sub-agent-specific arguments."),
    contact_id: z.string().optional().describe("Optional client UUID for context + logging."),
    conversation_id: z.string().optional().describe("Optional Paige conversation ID for thread linking."),
  }),
  handler: async ({ slug, input, contact_id, conversation_id }) => {
    const actor = currentActor();
    const r = await callOrchestrator({
      action: "tool_invoke",
      slug,
      input: input ?? {},
      context: { contact_id, conversation_id, user_id: actor.user_id ?? undefined },
    });
    await audit("delegate_to_subagent", "subagent", slug, { contact_id: contact_id ?? null, status: r.status });
    if (r.status >= 300) return err(typeof r.body === "object" ? JSON.stringify(r.body) : String(r.body));
    return ok(r.body);
  },
});

mcp.tool("get_subagent_history", {
  description:
    "Read recent sub-agent invocation history (status, latency, output) for audit + debugging. Filter by `slug` or `contact_id`.",
  inputSchema: z.object({
    slug: z.string().optional(),
    contact_id: z.string().optional(),
    limit: z.number().int().optional().describe("1–50, default 20."),
  }),
  handler: async ({ slug, contact_id, limit }) => {
    const max = Math.min(Math.max(limit ?? 20, 1), 50);
    let q = admin
      .from("paige_subagent_invocations")
      .select("id, subagent_slug, contact_id, conversation_id, status, latency_ms, error, created_at")
      .order("created_at", { ascending: false })
      .limit(max);
    if (slug) q = q.eq("subagent_slug", slug);
    if (contact_id) q = q.eq("contact_id", contact_id);
    const { data, error } = await q;
    if (error) return err(error.message);
    return ok({ items: data ?? [], count: (data ?? []).length });
  },
});

// ---------- Sub-Agent Factory (Section 18.5) — Paige proposes new sub-agents ----------
mcp.tool("propose_subagent", {
  description:
    "Propose a new sub-agent. SOFT proposals (runtime='soft') ship live instantly — prompt-only, runs on the AI Gateway, may not access protected financial/PII tables. HARD proposals (runtime='local' or 'langgraph') route to the Approvals Hub for admin sign-off because they require new edge function code. Use when the user requests an analysis pattern that doesn't fit any existing sub-agent (call list_subagents first to check). Provide a clear `rationale` — admins will read it.",
  inputSchema: z.object({
    slug: z.string().describe("kebab-case, e.g. 'churn-risk-scout'. Must be unique."),
    name: z.string(),
    domain: z.enum(["fundability","compliance","credit","funding","research","outreach","intake","sales","coaching","ops","support","marketing","analytics","automation"]),
    description: z.string().describe("What the agent does (≥20 chars)."),
    rationale: z.string().describe("Why this agent is needed (≥20 chars). Admins read this."),
    runtime: z.enum(["soft","local","langgraph"]).default("soft"),
    system_prompt: z.string().describe("The agent's system prompt (≥50 chars). Be specific about persona, constraints, output format."),
    triggers: z.array(z.string()).optional().describe("Keyword triggers e.g. ['churn', 'retention risk']"),
    data_scopes: z.array(z.string()).optional().describe("Tables the agent reads. Soft agents may NOT include protected scopes (credit/banking/etc)."),
    input_schema: z.record(z.string(), z.unknown()).optional(),
    output_schema: z.record(z.string(), z.unknown()).optional(),
    config: z.record(z.string(), z.unknown()).optional().describe("Optional config, e.g. {model: 'google/gemini-2.5-pro'}"),
  }),
  handler: async (args) => {
    const r = await fetch(`${SUPABASE_URL}/functions/v1/subagent-forge`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${SERVICE_ROLE_KEY}`, apikey: SERVICE_ROLE_KEY },
      body: JSON.stringify({ action: "propose", ...args, proposed_by_agent: "paige-mcp" }),
    });
    const body = await r.json().catch(() => ({}));
    await audit("propose_subagent", "subagent_proposal", args.slug, { runtime: args.runtime, status: r.status });
    if (r.status >= 300) return err(typeof body === "object" ? JSON.stringify(body) : String(body));
    return ok(body);
  },
});

mcp.tool("list_subagent_proposals", {
  description: "List recent sub-agent proposals (proposed, approved, rejected, live, failed). Includes today's quota usage.",
  inputSchema: z.object({
    status: z.enum(["proposed","approved","rejected","generated","live","failed"]).optional(),
  }),
  handler: async ({ status }) => {
    const r = await fetch(`${SUPABASE_URL}/functions/v1/subagent-forge`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${SERVICE_ROLE_KEY}`, apikey: SERVICE_ROLE_KEY },
      body: JSON.stringify({ action: "list", status }),
    });
    const body = await r.json().catch(() => ({}));
    if (r.status >= 300) return err(typeof body === "object" ? JSON.stringify(body) : String(body));
    return ok(body);
  },
});

mcp.tool("approve_subagent_proposal", {
  description: "Admin only. Approve a hard sub-agent proposal and ship it live.",
  inputSchema: z.object({ proposal_id: z.string() }),
  handler: async ({ proposal_id }, ctx) => {
    const userId = (ctx as { userId?: string })?.userId;
    const r = await fetch(`${SUPABASE_URL}/functions/v1/subagent-forge`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${SERVICE_ROLE_KEY}`, apikey: SERVICE_ROLE_KEY,
        "X-Acting-User": userId ?? "",
      },
      body: JSON.stringify({ action: "approve", proposal_id }),
    });
    const body = await r.json().catch(() => ({}));
    await audit("approve_subagent_proposal", "subagent_proposal", proposal_id, { status: r.status });
    if (r.status >= 300) return err(typeof body === "object" ? JSON.stringify(body) : String(body));
    return ok(body);
  },
});


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
  list_tasks: "crm.read", create_task: "crm.write", update_task: "crm.write",
  complete_task: "crm.write", reopen_task: "crm.write", delete_task: "crm.write",
  // Workflows
  list_workflows: "crm.read", run_workflow: "workflows.run", get_workflow_run: "crm.read",
  list_pending_approvals: "crm.read", decide_pending_approval: "workflows.run",
  create_approval: "crm.write", claim_approval: "crm.write",
  comment_on_approval: "crm.write", list_approval_comments: "crm.read",
  // BTF
  list_btf_clients: "btf.read", get_btf_workspace: "btf.read", list_btf_phase_items: "btf.read",
  update_btf_phase_item: "btf.write", list_btf_document_requests: "btf.read", send_btf_message: "btf.write",
  // Admin
  list_team_members: "admin.read", assign_coach: "admin.write", create_team_invitation: "admin.write",
  list_unassigned_queue: "admin.read", list_admin_notifications: "admin.read", create_admin_notification: "admin.write",
  // Email templates
  list_email_templates: "admin.read", upsert_email_template: "admin.write", send_btf_template_email: "btf.write",
  // Batch #1 (Doctrine §119)
  create_contact: "crm.write", update_lifecycle_stage: "crm.write",
  start_btf_onboarding: "btf.write", resend_btf_invite: "btf.write",
  list_signed_agreements: "btf.read", list_intake_submissions: "btf.read",
  list_payment_authorizations: "btf.read",
  resolve_sender_identity: "admin.read",
  // Batch #2 (Doctrine §119) — observability + comms + invoicing
  list_workflow_runs: "crm.read",
  cancel_workflow_run: "workflows.run",
  register_workflow: "admin.write",
  send_transactional_email: "crm.write",
  send_sms: "crm.write",
  create_invoice: "crm.write",
  send_invoice: "crm.write",
  // Coach Ops
  list_coaches: "admin.read",
  add_coach_role: "admin.write",
  remove_coach_role: "admin.write",
  update_coach_profile: "admin.write",
  bulk_assign_clients_to_coach: "admin.write",
  get_coach_performance: "admin.read",
  // Pass 5: Orchestrator / sub-agents
  list_subagents: "crm.read",
  delegate_to_subagent: "workflows.run",
  get_subagent_history: "crm.read",
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
  for (const k of PLATFORM_KEYS) {
    if (presented === k.value) {
      return { kind: "platform", user_id: null, client_id: k.label, scopes: [...SUPPORTED_SCOPES] };
    }
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
  if (PLATFORM_KEYS.length === 0) return c.json({ error: "server_misconfigured" }, 500, CORS);
  const presented = (c.req.header("authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
  const actor = await resolveBearer(presented);
  if (!actor) {
    return c.json({ error: "unauthorized" }, 401, {
      ...CORS,
      "WWW-Authenticate": `Bearer realm="paige-mcp", resource_metadata="${APP_ORIGIN}/.well-known/oauth-protected-resource"`,
    });
  }

  // Peek the body to enforce per-tool scope for user tokens. Clone first so the transport can re-read.
  let peekedBody: any = null;
  if (method === "POST") {
    const raw = c.req.raw.clone();
    peekedBody = await raw.json().catch(() => null);
    const gate = enforceScopeForBody(peekedBody, actor);
    if (!gate.ok) {
      return c.json({
        jsonrpc: "2.0", id: peekedBody?.id ?? null,
        error: { code: -32001, message: gate.error },
      }, gate.status, CORS);
    }
  }

  const res = await actorStore.run(actor, () => httpHandler(c.req.raw));

  // Doctrine §118: filter master-only tools out of tools/list for non-MMA callers.
  if (method === "POST" && peekedBody?.method === "tools/list") {
    try {
      const callerTenant = await actorStore.run(actor, () => actorTenantId());
      if (callerTenant !== MMA_TENANT_ID) {
        const cloned = res.clone();
        const text = await cloned.text();
        // Handle both plain JSON and SSE event-stream responses from mcp-lite.
        const ct = res.headers.get("content-type") ?? "";
        if (ct.includes("application/json")) {
          const body = JSON.parse(text);
          if (Array.isArray(body?.result?.tools)) {
            body.result.tools = body.result.tools.filter(
              (t: any) => !MASTER_ONLY_TOOLS.has(t?.name),
            );
          }
          const filtered = new Response(JSON.stringify(body), {
            status: res.status,
            headers: res.headers,
          });
          for (const [k, v] of Object.entries(CORS)) filtered.headers.set(k, v);
          return filtered;
        } else if (ct.includes("text/event-stream")) {
          // SSE frames like: "data: {...}\n\n". Rewrite each JSON payload.
          const rewritten = text.replace(/^data: (\{.*\})$/gm, (_m, json) => {
            try {
              const body = JSON.parse(json);
              if (Array.isArray(body?.result?.tools)) {
                body.result.tools = body.result.tools.filter(
                  (t: any) => !MASTER_ONLY_TOOLS.has(t?.name),
                );
              }
              return `data: ${JSON.stringify(body)}`;
            } catch {
              return `data: ${json}`;
            }
          });
          const filtered = new Response(rewritten, { status: res.status, headers: res.headers });
          for (const [k, v] of Object.entries(CORS)) filtered.headers.set(k, v);
          return filtered;
        }
      }
    } catch (e) {
      console.error("[paige-mcp] tools/list filter failed", (e as Error).message);
    }
  }

  for (const [k, v] of Object.entries(CORS)) res.headers.set(k, v);
  return res;
});

Deno.serve(app.fetch);

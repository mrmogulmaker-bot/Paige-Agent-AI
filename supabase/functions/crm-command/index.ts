import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.75.0";
import { z } from "https://esm.sh/zod@3.22.4";
import { confirmFingerprint } from "../_shared/confirm-fingerprint.ts";
import { decideGovernedExecution } from "../_shared/paige-spine/governedExecution.ts";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Content-Type": "application/json",
};

const ACTION_CAPABILITY = {
  "contact.create": "crm_create_contact",
  "contact.update": "crm_update_contact",
  "contact.archive": "crm_update_contact",
  "contact.restore": "crm_update_contact",
  "contact.link_company": "crm_update_contact",
  "contact.unlink_company": "crm_update_contact",
  "company.create": "business_create",
  "company.update": "business_update",
  "company.archive": "business_update",
  "company.restore": "business_update",
  "task.create": "crm_create_task",
  "task.update": "crm_update_task",
  "task.assign": "plan_assign_task",
  "task.reschedule": "crm_update_task",
  "task.complete": "crm_update_task",
  "task.reopen": "crm_update_task",
  "activity.log": "crm_log_activity",
  "deal.create": "deal_create",
  "deal.move": "deal_move_stage",
  "deal.close": "deal_move_stage",
  "deal.reopen": "deal_move_stage",
} as const;

type CrmAction = keyof typeof ACTION_CAPABILITY;
type JsonObject = Record<string, unknown>;

const commandSchema = z.object({
  action: z.enum(Object.keys(ACTION_CAPABILITY) as [CrmAction, ...CrmAction[]]),
  contact_id: z.string().uuid().optional(),
  company_id: z.string().uuid().optional(),
  task_id: z.string().uuid().optional(),
  deal_id: z.string().uuid().optional(),
  stage_id: z.string().uuid().optional(),
  owner_user_id: z.string().uuid().optional(),
  title: z.string().trim().min(1).max(300).optional(),
  value_cents: z.number().int().nonnegative().optional(),
  currency: z.string().regex(/^[A-Z]{3}$/).optional(),
  expected_close_date: z.string().date().optional(),
  offer_type: z.string().trim().max(120).optional(),
  tags: z.array(z.string().trim().min(1).max(80)).max(50).optional(),
  notes: z.string().max(10000).optional(),
  outcome_type: z.enum(["won", "lost", "not_fit", "closed_without_decision"] as const).optional(),
  outcome_date: z.string().date().optional(),
  pipeline_id: z.string().uuid().optional(),
  target_stage_id: z.string().uuid().optional(),
  expected_version: z.number().int().positive().optional(),
  expected_target_version: z.number().int().positive().optional(),
  reason: z.string().trim().max(500).optional(),
  expected_updated_at: z.string().datetime({ offset: true }).optional(),
  patch: z.record(z.unknown()).optional(),
}).strict().superRefine((command, ctx) => {
  const requireField = (field: keyof typeof command) => {
    if (command[field] === undefined) ctx.addIssue({ code: z.ZodIssueCode.custom, path: [field], message: `${String(field)} is required for ${command.action}` });
  };
  if (command.action.startsWith("contact.") && command.action !== "contact.create") {
    requireField("contact_id"); requireField("expected_updated_at");
  }
  if (command.action === "contact.link_company") requireField("company_id");
  if (command.action === "contact.create" || command.action === "contact.update" || command.action === "company.create" || command.action === "company.update") requireField("patch");
  if (command.action === "company.create") requireField("contact_id");
  if (command.action.startsWith("company.") && command.action !== "company.create") {
    requireField("company_id"); requireField("expected_updated_at");
  }
  if (command.action === "task.create") requireField("patch");
  if (command.action.startsWith("task.") && command.action !== "task.create") {
    requireField("task_id"); requireField("expected_updated_at");
  }
  if (["task.update", "task.assign", "task.reschedule"].includes(command.action)) requireField("patch");
  if (command.action === "activity.log") { requireField("contact_id"); requireField("patch"); }
  if (command.action === "deal.create") { requireField("title"); requireField("pipeline_id"); requireField("stage_id"); }
  if (command.action === "deal.move") {
    requireField("deal_id"); requireField("pipeline_id"); requireField("target_stage_id"); requireField("expected_version"); requireField("expected_target_version");
  }
  if (command.action === "deal.close") { requireField("deal_id"); requireField("expected_version"); requireField("outcome_type"); }
  if (command.action === "deal.reopen") { requireField("deal_id"); requireField("expected_version"); requireField("target_stage_id"); }
});

const bodySchema = z.object({
  command: commandSchema,
  idempotency_key: z.string().trim().min(1).max(200),
  approved_fingerprint: z.string().regex(/^[0-9a-f]{16}$/).optional(),
}).strict();

function object(value: unknown): JsonObject | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as JsonObject : null;
}

function response(status: number, body: JsonObject): Response {
  return new Response(JSON.stringify(body), { status, headers: cors });
}

function summaryFor(command: z.infer<typeof commandSchema>): string {
  const target = command.contact_id ?? command.company_id ?? command.task_id ?? command.deal_id ?? "a new record";
  return `${command.action.replaceAll("_", " ")} for ${target}`;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  if (req.method !== "POST") return response(405, { ok: false, code: "METHOD_NOT_ALLOWED" });

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return response(401, { ok: false, code: "CRM_AUTH_REQUIRED" });

  const url = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !anonKey || !serviceKey) return response(503, { ok: false, code: "CRM_SERVER_NOT_CONFIGURED" });

  const caller = createClient(url, anonKey, { global: { headers: { Authorization: authHeader } } });
  const admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: { user }, error: authError } = await caller.auth.getUser();
  if (authError || !user) return response(401, { ok: false, code: "CRM_AUTH_INVALID" });

  let body: z.infer<typeof bodySchema>;
  try {
    body = bodySchema.parse(await req.json());
  } catch (error) {
    return response(400, {
      ok: false,
      code: "CRM_COMMAND_INVALID",
      details: error instanceof z.ZodError ? error.issues.map((issue) => ({ path: issue.path.join("."), code: issue.code })) : undefined,
    });
  }

  const { data: tenantId, error: tenantError } = await caller.rpc("current_user_tenant_id");
  if (tenantError || typeof tenantId !== "string") {
    return response(403, { ok: false, code: "CRM_TENANT_REQUIRED" });
  }

  const { data: member, error: memberError } = await admin.from("tenant_members")
    .select("role,status")
    .eq("tenant_id", tenantId)
    .eq("user_id", user.id)
    .eq("status", "active")
    .maybeSingle();
  const role = typeof member?.role === "string" ? member.role : null;
  const accessAllowed = !memberError && ["owner", "admin", "coach"].includes(role ?? "");
  const capability = ACTION_CAPABILITY[body.command.action];
  const requestArgs = { command: body.command, idempotency_key: body.idempotency_key };

  let lane = "unresolved";
  const { data: resolvedLane, error: laneError } = await caller.rpc("resolve_tool_autonomy", {
    _tenant_id: tenantId,
    _tool_key: capability,
  });
  if (!laneError && typeof resolvedLane === "string" && ["auto", "confirm", "off"].includes(resolvedLane)) {
    lane = resolvedLane;
  }
  // Assignment changes whose queue owns the work. It always uses the existing
  // confirmation store even when the workspace ordinary-action lane is auto.
  if (body.command.action === "task.assign" && lane === "auto") lane = "confirm";
  if (["deal.close", "deal.reopen"].includes(body.command.action) && lane === "auto") lane = "confirm";
  if (body.command.action === "deal.create" && body.command.owner_user_id && body.command.owner_user_id !== user.id && lane === "auto") lane = "confirm";

  const requestNonce = crypto.randomUUID();
  let claimedArgs: JsonObject | null | undefined;
  if (body.approved_fingerprint !== undefined) {
    claimedArgs = null;
    const { data: claimed, error: claimError } = await admin.from("paige_pending_confirmations")
      .update({ consumed_at: new Date().toISOString() })
      .eq("user_id", user.id)
      .eq("tenant_id", tenantId)
      .eq("tool_name", capability)
      .eq("fingerprint", body.approved_fingerprint)
      .is("thread_id", null)
      .is("scoped_client_id", null)
      .is("consumed_at", null)
      .not("server_issued_at", "is", null)
      .not("issued_in_request", "is", null)
      .neq("issued_in_request", requestNonce)
      .gt("expires_at", new Date().toISOString())
      .select("args")
      .maybeSingle();
    const stored = object(claimed?.args);
    if (!claimError && stored) claimedArgs = stored;
  }

  const decision = decideGovernedExecution({
    caller: {
      authenticated: true,
      userId: user.id,
      principal: "person",
      tenantId,
      tenantSource: "server",
      door: "other",
      access: { allowed: accessAllowed, reason: "An active owner, admin, or assigned coach role is required." },
    },
    capability: {
      id: capability,
      effect: "mutate",
      outcomeChannel: "record_capability_run",
      availability: "unknown",
    },
    approval: {
      autonomyLane: lane,
      ...(claimedArgs !== undefined ? { claimedArgs, claimedFor: capability } : {}),
    },
    requestArgs,
  });

  const decidedRequest = decision.kind === "execute" ? object(decision.args) : null;
  const auditedCommand = object(decidedRequest?.command) ?? body.command;
  const auditedAction = typeof auditedCommand.action === "string" ? auditedCommand.action : body.command.action;
  const auditedContactId = typeof auditedCommand.contact_id === "string" ? auditedCommand.contact_id : null;
  const auditedCompanyId = typeof auditedCommand.company_id === "string" ? auditedCommand.company_id : null;
  const auditedTaskId = typeof auditedCommand.task_id === "string" ? auditedCommand.task_id : null;
  const auditedDealId = typeof auditedCommand.deal_id === "string" ? auditedCommand.deal_id : null;

  const auditPayload = {
    capability,
    command_action: auditedAction,
    effect: "mutate",
    principal: "person",
    decision: decision.kind,
    refusal_code: decision.kind === "refuse" ? decision.code : null,
    risk: decision.risk,
    lane_requested: decision.audit.laneRequested,
    lane_effective: decision.audit.laneEffective,
    clamped: decision.audit.clamped,
  };
  const { error: auditError } = await admin.from("paige_audit_log").insert({
    actor_user_id: user.id,
    actor_role: `crm:${role ?? "none"}`,
    action: "crm.governed_decision",
    target_type: auditedAction.startsWith("contact.") ? "contact" : auditedAction.startsWith("company.") ? "company" : auditedAction.startsWith("task.") ? "task" : auditedAction.startsWith("deal.") ? "deal" : "activity",
    target_id: auditedContactId ?? auditedCompanyId ?? auditedTaskId ?? auditedDealId,
    tenant_id: tenantId,
    payload: auditPayload,
  });

  if (decision.kind === "refuse") {
    return response(403, { ok: false, outcome: "refused", code: decision.code, message: decision.message, audit_recorded: !auditError });
  }
  if (auditError) {
    return response(503, { ok: false, outcome: "refused", code: "CRM_DECISION_RECEIPT_FAILED" });
  }

  if (decision.kind === "propose") {
    const fingerprint = await confirmFingerprint(capability, requestArgs);
    const summary = summaryFor(body.command);
    let { data: proposal, error: proposalError } = await admin.from("paige_pending_confirmations").insert({
      user_id: user.id,
      tenant_id: tenantId,
      thread_id: null,
      scoped_client_id: null,
      tool_name: capability,
      fingerprint,
      issued_in_request: requestNonce,
      server_issued_at: new Date().toISOString(),
      args: requestArgs,
      summary,
    }).select("summary,expires_at").maybeSingle();
    if (proposalError?.code === "23505") {
      const existing = await admin.from("paige_pending_confirmations")
        .select("summary,expires_at")
        .eq("user_id", user.id)
        .eq("tenant_id", tenantId)
        .eq("tool_name", capability)
        .eq("fingerprint", fingerprint)
        .is("thread_id", null)
        .is("scoped_client_id", null)
        .is("consumed_at", null)
        .not("server_issued_at", "is", null)
        .gt("expires_at", new Date().toISOString())
        .maybeSingle();
      proposal = existing.data;
      proposalError = existing.error;
    }
    if (proposalError || !proposal) return response(503, { ok: false, outcome: "refused", code: "CRM_APPROVAL_STORE_UNAVAILABLE" });
    return response(202, {
      ok: false,
      outcome: "approval_required",
      fingerprint,
      summary: proposal.summary ?? summary,
      expires_at: proposal.expires_at ?? null,
      revalidate: decision.revalidate,
    });
  }

  const decidedArgs = decidedRequest;
  const decidedCommand = object(decidedArgs?.command);
  const decidedKey = decidedArgs?.idempotency_key;
  if (!decidedCommand || typeof decidedKey !== "string") {
    return response(403, { ok: false, outcome: "refused", code: "CRM_APPROVAL_CLAIM_INVALID" });
  }

  const executionCommand = typeof decidedCommand.action === "string" && decidedCommand.action.startsWith("deal.")
    ? { ...decidedCommand, approval_channel: decision.audit.laneEffective === "confirm" ? "operator_card" : "standing_autonomy_setting" }
    : decidedCommand;
  const { data: result, error: commandError } = await admin.rpc("execute_crm_command", {
    _tenant_id: tenantId,
    _actor_id: user.id,
    _command: executionCommand,
    _idempotency_key: decidedKey,
  });
  if (commandError) {
    const code = /^(CRM|PIPELINE)_[A-Z0-9_:,-]+$/.test(commandError.message ?? "") ? commandError.message : "CRM_COMMAND_FAILED";
    return response(code.includes("VERSION_CONFLICT") ? 409 : 422, { ok: false, outcome: "failed", code });
  }

  return response(200, {
    ...(object(result) ?? { ok: false, outcome: "failed" }),
    capability,
    record_locator: {
      surface: body.command.action.startsWith("deal.") ? "campaigns" : body.command.action.startsWith("task.") ? "command-center" : "clients",
      tab: body.command.action.startsWith("deal.") ? "pipeline" : body.command.action.startsWith("company.") ? "companies" : body.command.action.startsWith("task.") ? "tasks" : "people",
      record_id: object(result)?.readback && object(object(result)?.readback)?.id ?? null,
    },
  });
});
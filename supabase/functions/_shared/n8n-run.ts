// _shared/n8n-run.ts — the ONE home (§18) for firing an n8n workflow webhook and polling an execution,
// parameterized by an EXPLICIT tenant + a service-role admin client.
//
// WHY THIS EXISTS. `paige-n8n` is the JWT-admin-gated control surface: it resolves the caller's tenant
// FROM the JWT and drives that tenant's own n8n instance. The Layer-C n8n ActionAdapter is headless — it
// runs inside the governed event engine with a SERVICE-ROLE client and the authoritative tenant already
// resolved from the claimed event, and NO JWT — so it cannot go through `paige-n8n`'s HTTP door
// (that door 401s without a user JWT). Rather than fork a second n8n client (owner: "reuse paige-n8n
// run/execution_get via a shared seam — never a forked n8n client"), the fire/poll CORE lives here and
// BOTH callers drive it: `paige-n8n` after its JWT tenant-resolution, and the adapter with the engine's
// server-resolved tenant.
//
// SECURITY (preserved verbatim from paige-n8n). Creds are decrypted server-side only via the
// service-role-only `get_tenant_n8n_secret` RPC, keyed on an EXPLICIT tenant id (never a request body);
// `fireN8nWebhook`/`getN8nExecution` resolve creds INTERNALLY and never return the API key, so it stays
// inside this seam. The stored instance URL is vetted by the shared ssrfGuard (`assertPublicHttpUrl`)
// BEFORE any outbound call, so a bad address costs no request and never carries the key. Every REST call
// and the webhook fire go through `safeFetch`: https-only, embedded-credential URLs refused, every
// resolved address numerically validated, redirects refused (3xx raises), a bounded wall clock and a
// bounded response body. A truncated body is a FAILURE (`response_too_large`), never a short success.

import { assertPublicHttpUrl, safeFetch, SsrfError } from "./ssrfGuard.ts";

/** The minimal service-role client surface this seam needs (the `get_tenant_n8n_secret` RPC). */
export type N8nRunDb = {
  rpc: (fn: string, args: Record<string, unknown>) => Promise<{ data: any; error: any }>;
};

/** Nothing an n8n instance can say is worth more of this seam than these. */
const N8N_TIMEOUT_MS = 15_000;
const N8N_MAX_BYTES = 2_097_152; // 2 MiB — larger than any /api/v1 answer we consume.

/** What a REST call site sees — Response-shaped so the existing paige-n8n branches read unchanged. */
export type N8nResult = {
  ok: boolean;
  status: number;
  text: () => string;
  // deno-lint-ignore no-explicit-any
  json: () => any;
  /** The body hit the read cap — the instance answered with more than we will hold. */
  truncated: boolean;
};

/**
 * One n8n REST call through the shared guard. A 3xx RAISES rather than arriving as a non-ok result
 * (the n8n API has no reason to redirect); a truncated body RAISES `response_too_large` (half a JSON
 * document does not parse, and a truncated create/list must never read as an empty/absent result).
 * MOVED verbatim from paige-n8n — the transport is unchanged, it simply lives in the shared home now.
 */
export async function n8nFetch(baseUrl: string, apiKey: string, path: string, init: RequestInit = {}): Promise<N8nResult> {
  const url = `${baseUrl.replace(/\/$/, "")}/api/v1${path}`;
  const res = await safeFetch(url, {
    ...init,
    headers: { "X-N8N-API-KEY": apiKey, "Content-Type": "application/json", Accept: "application/json", ...(init.headers || {}) },
  }, { timeoutMs: N8N_TIMEOUT_MS, maxBytes: N8N_MAX_BYTES });
  if (res.truncated) throw new SsrfError("response_too_large");
  return {
    ok: res.status >= 200 && res.status < 300,
    status: res.status,
    text: () => res.body,
    json: () => { try { return JSON.parse(res.body); } catch { return null; } },
    truncated: res.truncated,
  };
}

/** The resolved connection for a tenant, or an honest not-connected/unsafe reason. The apiKey is present
 *  ONLY on `configured:true` and is for a caller that legitimately holds it server-side (paige-n8n's other
 *  actions); the fire/poll helpers below resolve it internally and never expose it. */
export type N8nConnectionRefused = { configured: false; reason: "not_connected" | "unsafe_instance_url" | "secret_lookup_failed"; detail?: string };
export type N8nConnection =
  | { configured: true; baseUrl: string; apiKey: string }
  | N8nConnectionRefused;

/**
 * Resolve a tenant's n8n connection: the service-role-only `get_tenant_n8n_secret` RPC (explicit tenant),
 * then the SSRF vet of the stored instance URL BEFORE any outbound use — so a bad URL costs no request and
 * never carries the key. Returns an honest not-connected / unsafe reason rather than throwing on the
 * expected cases; a genuinely unexpected secret-lookup error is `secret_lookup_failed`.
 */
export async function resolveN8nConnection(admin: N8nRunDb, tenantId: string): Promise<N8nConnection> {
  const { data: secret, error } = await admin.rpc("get_tenant_n8n_secret", { _tenant_id: tenantId });
  if (error) return { configured: false, reason: "secret_lookup_failed", detail: error.message ?? String(error) };
  if (!secret?.configured) return { configured: false, reason: "not_connected" };
  const baseUrl: string = secret.base_url;
  const apiKey: string = secret.api_key;
  try {
    await assertPublicHttpUrl(`${baseUrl.replace(/\/$/, "")}/api/v1`);
  } catch (e) {
    // The stable reason only — never echo the address back (for the creds case that would put the
    // secret in the reply).
    return { configured: false, reason: "unsafe_instance_url", detail: e instanceof SsrfError ? e.reason : "blocked" };
  }
  return { configured: true, baseUrl, apiKey };
}

// ── The fire (run) core ────────────────────────────────────────────────────────────────────────────

export type FireN8nInput = {
  /** resolve the webhook path from this workflow (fetches the workflow, finds its webhook node). */
  workflowId?: string;
  /** OR an explicit webhook path (skips the workflow fetch). */
  webhookPath?: string;
  /** HTTP method for the webhook (default POST). */
  method?: string;
  /** the JSON body posted to the webhook. */
  payload?: unknown;
};

/** The projected result of a fire — the SAME shape paige-n8n's `run` case returns to the model, plus the
 *  `connected`/expected-failure discriminants a programmatic caller (the adapter) maps from. The workflow's
 *  own response body is NEVER included (it is arbitrary third-party text); only the typed outcome is. */
export type FireN8nResult = {
  connected: boolean;
  /** an expected pre-fire refusal (no webhook / inactive / missing target); nothing was sent. */
  refusal?: "not_connected" | "unsafe_instance_url" | "not_webhook_triggered" | "workflow_inactive" | "workflow_or_path_required" | "secret_lookup_failed" | "n8n_error";
  detail?: string;
  workflow_name?: string | null;
  webhook_path?: string | null;
  fired?: boolean;            // LAYER 1 — the webhook accepted the request (2xx)
  http_status?: number;
  verified?: boolean;         // did the workflow return a machine-readable outcome?
  delivered?: boolean | null; // LAYER 2 — true | false | null(unknown)
  outcome_source?: "response_body" | "none";
  channels?: { sms_sent: boolean | null; email_sent: boolean | null; tags_added: unknown };
  errors?: string[];
  execution_id?: string | null; // LAYER 3 — feed to getN8nExecution to turn null into fact
  outcome?: Record<string, unknown> | null;
  note?: string;
  verify_hint?: string | null;
};

/**
 * Fire a workflow by hitting its webhook trigger — how n8n automations are actually invoked. Resolves
 * creds internally (key never leaves this seam), resolves the webhook path from the workflow when only a
 * workflow_id is given, fires through the guard, and projects the response into the typed outcome. Never
 * throws for an expected case (not connected / no webhook / inactive / non-2xx) — returns a `refusal`.
 */
export async function fireN8nWebhook(admin: N8nRunDb, tenantId: string, input: FireN8nInput): Promise<FireN8nResult> {
  const conn = await resolveN8nConnection(admin, tenantId);
  if (!conn.configured) { const c = conn as N8nConnectionRefused; return { connected: false, refusal: c.reason, detail: c.detail }; }
  const { baseUrl, apiKey } = conn;

  let path: string | undefined = input.webhookPath;
  let wfName: string | null = null;
  if (!path && input.workflowId) {
    const wres = await n8nFetch(baseUrl, apiKey, `/workflows/${encodeURIComponent(input.workflowId)}`);
    if (!wres.ok) return { connected: true, refusal: "n8n_error", detail: `n8n_${wres.status}` };
    const wf = wres.json();
    wfName = typeof wf?.name === "string" ? wf.name : null;
    const nodes: any[] = wf?.nodes ?? [];
    const hook = nodes.find((n) => typeof n?.type === "string" && n.type.toLowerCase().includes("webhook"));
    path = hook?.parameters?.path;
    if (!path) {
      const isSub = nodes.some((n) => typeof n?.type === "string" && n.type.toLowerCase().includes("executeworkflowtrigger"));
      return {
        connected: true, refusal: "not_webhook_triggered", workflow_name: wfName,
        detail: isSub
          ? "That's a reusable SUB-workflow — it's meant to be CALLED by other workflows (it has no webhook), so it can't be fired standalone through the API. Offer to build a small webhook-trigger workflow that calls it (webhook → Execute Workflow → this sub-workflow); then you can fire that webhook anytime with the inputs it expects."
          : "This workflow has no webhook trigger (it likely runs on a schedule or is called by another workflow), so it can't be fired directly. Offer to add a webhook trigger, or trigger it from its own flow.",
      };
    }
    if (!wf?.active) {
      return { connected: true, refusal: "workflow_inactive", workflow_name: wfName, detail: "This workflow is turned off, so its webhook won't respond. Offer to turn it on first (n8n_activate_workflow), then run it." };
    }
  }
  if (!path) return { connected: true, refusal: "workflow_or_path_required", detail: "Provide a workflow_id (to resolve its webhook) or an explicit webhook_path." };

  const webhookUrl = `${baseUrl.replace(/\/$/, "")}/webhook/${String(path).replace(/^\//, "")}`;
  const method = String(input.method || "POST").toUpperCase();
  const hookRes = await safeFetch(webhookUrl, {
    method,
    headers: { "Content-Type": "application/json" },
    body: method === "GET" || method === "HEAD" ? undefined : JSON.stringify(input.payload ?? {}),
  }, { timeoutMs: N8N_TIMEOUT_MS, maxBytes: N8N_MAX_BYTES });

  const hookOk = hookRes.status >= 200 && hookRes.status < 300;
  const respText = hookRes.body.slice(0, 4000);
  let parsed: any = null; try { parsed = JSON.parse(respText); } catch { /* non-JSON body */ }
  const o = parsed && typeof parsed === "object" ? parsed : {};
  const hasOutcome = ["smsSent", "emailSent", "telegramSent", "tagsAdded", "errors", "contactId", "messageId"].some((k) => k in o);
  const errs = Array.isArray(o.errors) ? o.errors.map(String) : [];
  const sms = "smsSent" in o ? o.smsSent === true : null;
  const email = "emailSent" in o ? o.emailSent === true : null;
  const tags = "tagsAdded" in o ? o.tagsAdded : null;
  let delivered: boolean | null = null;
  if (hasOutcome) {
    const anyTrue = sms === true || email === true;
    const anyClaim = sms !== null || email !== null;
    delivered = errs.length ? false : anyTrue ? true : anyClaim ? false : null;
  }
  const executionId = o.executionId ?? o.execution_id ?? hookRes.headers.get("x-execution-id") ?? null;
  return {
    connected: true,
    workflow_name: wfName,
    webhook_path: String(path),
    fired: hookOk,
    http_status: hookRes.status,
    verified: hasOutcome,
    delivered,
    outcome_source: hasOutcome ? "response_body" : "none",
    channels: { sms_sent: sms, email_sent: email, tags_added: tags },
    errors: errs,
    execution_id: executionId,
    outcome: hasOutcome ? {
      contactId: o.contactId ?? null, messageId: o.messageId ?? null,
      smsSent: sms, emailSent: email, telegramSent: o.telegramSent ?? null,
      tagsAdded: tags, name: o.name ?? null, errors: errs,
    } : null,
    note: !hookOk
      ? "The webhook returned a non-2xx — the workflow may be inactive, or the path/payload didn't match. Nothing was sent."
      : hasOutcome
        ? (delivered
            ? "Fired AND the workflow confirmed the send in its response."
            : `Fired, but the workflow reported it did NOT send${errs.length ? " — errors: " + errs.join("; ") : " (no channel resolved, or a required field like a link preset was missing)"}. Do NOT tell the operator it was delivered.`)
        : "Fired: the webhook accepted the request, but this workflow returned no machine-readable send outcome, so delivery is UNCONFIRMED. Say 'fired, delivery unconfirmed' and verify with n8n_execution_get before claiming a send.",
    verify_hint: hasOutcome
      ? null
      : (executionId
          ? `Run execution_get on execution_id ${executionId} to read the real send result.`
          : "Run the executions action on this workflow and then execution_get on the newest run id to confirm before telling the operator it went out."),
  };
}

// ── The poll (execution_get) core ─────────────────────────────────────────────────────────────────

/** The projected result of a poll — the SAME shape paige-n8n's `execution_get` case returns. The raw
 *  result/run-data envelope is NEVER included (arbitrary third-party text); only the typed fields are. */
export type GetN8nExecutionResult = {
  connected: boolean;
  refusal?: "not_connected" | "unsafe_instance_url" | "secret_lookup_failed" | "execution_not_found" | "n8n_error";
  detail?: string;
  execution_id?: string;
  workflow_id?: string | null;
  status?: string;
  finished?: boolean;
  started_at?: string | null;
  stopped_at?: string | null;
  delivered?: boolean | null;
  outcome_source?: "execution_check";
  channels?: { sms_sent: boolean | null; email_sent: boolean | null; tags_added: unknown };
  errors?: string[];
  last_node?: string | null;
  failed_node?: string | null;
  node_error?: string | null;
  verify_hint?: string;
};

/**
 * Poll one execution's stored result. Resolves creds internally, reads `/executions/{id}?includeData=true`
 * through the guard, and projects into the typed fields. A 404 is an honest `execution_not_found`; an
 * in-flight run (`running`/`waiting`) is reported as such so a caller does not read it as finished.
 */
export async function getN8nExecution(admin: N8nRunDb, tenantId: string, executionId: string): Promise<GetN8nExecutionResult> {
  const conn = await resolveN8nConnection(admin, tenantId);
  if (!conn.configured) { const c = conn as N8nConnectionRefused; return { connected: false, refusal: c.reason, detail: c.detail }; }
  const { baseUrl, apiKey } = conn;

  const res = await n8nFetch(baseUrl, apiKey, `/executions/${encodeURIComponent(executionId)}?includeData=true`);
  if (res.status === 404) return { connected: true, refusal: "execution_not_found", detail: "No execution with that id.", execution_id: String(executionId) };
  if (!res.ok) return { connected: true, refusal: "n8n_error", detail: `n8n_${res.status}`, execution_id: String(executionId) };
  const ex = res.json();
  const rd = ex?.data?.resultData ?? {};
  const lastNode: string | null = rd?.lastNodeExecuted ?? null;
  const lastJson = (() => {
    try { return rd?.runData?.[lastNode ?? ""]?.[0]?.data?.main?.[0]?.[0]?.json ?? null; } catch { return null; }
  })();
  const o = lastJson && typeof lastJson === "object" ? lastJson : {};
  const errs = Array.isArray(o.errors) ? o.errors.map(String) : [];
  const sms = "smsSent" in o ? o.smsSent === true : null;
  const email = "emailSent" in o ? o.emailSent === true : null;
  const tags = "tagsAdded" in o ? o.tagsAdded : null;
  const status: string = ex?.status ?? (ex?.finished ? "success" : "unknown");
  let delivered: boolean | null = null;
  if (status === "success" && (sms !== null || email !== null)) delivered = errs.length ? false : (sms === true || email === true) ? true : false;
  const nodes = Object.entries(rd?.runData ?? {}).map(([name, runs]: any) => ({
    name, status: runs?.[0]?.error ? "error" : "success", error: runs?.[0]?.error?.message ?? null,
  }));
  const nodeError = nodes.find((n) => n.status === "error") ?? null;
  return {
    connected: true,
    execution_id: String(executionId),
    workflow_id: ex?.workflowId ?? null,
    status, finished: !!ex?.finished,
    started_at: ex?.startedAt ?? null, stopped_at: ex?.stoppedAt ?? null,
    delivered, outcome_source: "execution_check",
    channels: { sms_sent: sms, email_sent: email, tags_added: tags },
    errors: errs,
    last_node: lastNode,
    failed_node: nodeError?.name ?? null,
    node_error: nodeError ? `${nodeError.name}: ${nodeError.error}` : (rd?.error?.message ?? null),
    verify_hint: status === "running" || status === "waiting"
      ? "Still in flight — delivery not yet knowable. Re-check in a moment."
      : (delivered === true ? "Confirmed from the stored execution — the send went out."
         : delivered === false ? "Confirmed from the stored execution — it did NOT send; see errors[]. Do not tell the operator it went out."
         : "Execution finished but reported no channel outcome — delivery remains unconfirmed."),
  };
}

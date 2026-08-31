// paige-n8n — per-tenant n8n control surface. One tenant-scoped edge function
// that lets the operator (and Paige, on their behalf) drive their OWN n8n
// instance: test, list, get, create, update, activate/deactivate, delete
// workflows, and read executions — via the n8n public REST API (/api/v1,
// header X-N8N-API-KEY).
//
// Security:
//  • The caller's JWT resolves their tenant (current_user_tenant_id); admin-gated.
//    A tenant can only ever reach ITS OWN connection — never another tenant's.
//  • The n8n API key is decrypted server-side only, via the service-role-only
//    get_tenant_n8n_secret RPC. It never touches the browser or Paige's context.
//  • The tenant-supplied instance URL goes through the SHARED guard
//    (`_shared/ssrfGuard.ts` safeFetch): https only, NO credentials embedded in the
//    URL, numeric validation of every resolved address, redirects refused rather
//    than followed, and a bounded wall clock and response size on every call.
//
//    This function used to carry its own copy of that validator. The copy checked
//    the hostname and nothing else, so `https://real.n8n.cloud@evil.example/` — which
//    the setter accepted, and which READS as real.n8n.cloud in Settings — vetted as
//    `evil.example`, passed, and received this workspace's `X-N8N-API-KEY`. Driven,
//    the handler returned `{ok:true}` while the key left the process. The hostname
//    check was not wrong; it was not the whole URL.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { contactHintsFromPayload, emitAutomationRail } from "../_shared/railAutomation.ts";
import { assertPublicHttpUrl, safeFetch, SsrfError } from "../_shared/ssrfGuard.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

// Local, network-free structural check of a workflow graph. Run before a create/
// update POST so a malformed graph yields SPECIFIC, self-repairable errors instead
// of an opaque n8n 400 (root cause of the "n8n integration is hitting an error").
function validateWorkflow(body: any) {
  const errors: string[] = [], warnings: string[] = [];
  const nodes: any[] = Array.isArray(body?.nodes) ? body.nodes : [];
  if (!body?.name || typeof body.name !== "string") errors.push("name must be a non-empty string");
  if (!nodes.length) errors.push("nodes must be a non-empty array");
  const names = new Set<string>();
  for (const n of nodes) {
    for (const k of ["name", "type", "typeVersion", "position", "parameters"]) {
      if (n?.[k] === undefined) errors.push(`node '${n?.name ?? "?"}' missing ${k}`);
    }
    if (n?.name) { if (names.has(n.name)) errors.push(`duplicate node name '${n.name}'`); names.add(n.name); }
    for (const k of ["id", "webhookId", "credentials", "active", "pinData"]) {
      if (k in (n ?? {})) warnings.push(`node '${n?.name}' has '${k}' — n8n rejects extra node-level props; strip before create`);
    }
  }
  const conns = body?.connections ?? {};
  for (const src of Object.keys(conns)) {
    if (!names.has(src)) errors.push(`connections references unknown source node '${src}' (must key by node NAME, not id)`);
    for (const arr of Object.values<any>(conns[src] ?? {})) {
      for (const group of (arr ?? [])) {
        for (const c of (group ?? [])) {
          if (c?.node && !names.has(c.node)) errors.push(`connection targets unknown node '${c.node}'`);
        }
      }
    }
  }
  const triggers = nodes.filter((n) => /trigger|webhook/i.test(n?.type ?? ""));
  const trigger = triggers[0] ?? null;
  if (triggers.length === 0) errors.push("no trigger node found");
  if (triggers.length > 1) warnings.push(`${triggers.length} trigger nodes — confirm intentional`);
  const isSub = /executeworkflowtrigger/i.test(trigger?.type ?? "");
  if (isSub) warnings.push("trigger is executeWorkflowTrigger — a sub-workflow, NOT REST-fireable; wrap in a webhook to fire it");
  const fireable = /webhook/i.test(trigger?.type ?? "");
  return { valid: errors.length === 0, errors, warnings, fireable, trigger: trigger ? { type: trigger.type, node: trigger.name } : null };
}

/**
 * What a call site sees. Deliberately Response-shaped — `ok`, `status`, `text()`,
 * `json()` — so the ten existing call sites read exactly as they did, and the change
 * is the transport underneath rather than a rewrite of every branch.
 */
type N8nResult = {
  ok: boolean;
  status: number;
  text: () => string;
  // deno-lint-ignore no-explicit-any
  json: () => any;
  /** The body hit the read cap. The instance answered with more than we will hold. */
  truncated: boolean;
};

/** Nothing an n8n instance can say is worth more of this function than these. */
const N8N_TIMEOUT_MS = 15_000;
const N8N_MAX_BYTES = 2_097_152; // 2 MiB — larger than any /api/v1 answer we consume.

/**
 * One n8n REST call through the shared guard.
 *
 * A 3xx now RAISES rather than arriving as a non-ok result. That is stricter than
 * before and deliberately so: the n8n API has no reason to redirect, and refusing has
 * no window between the check and the connect the way re-validating a hop would.
 */
async function n8nFetch(baseUrl: string, apiKey: string, path: string, init: RequestInit = {}): Promise<N8nResult> {
  const url = `${baseUrl.replace(/\/$/, "")}/api/v1${path}`;
  const res = await safeFetch(url, {
    ...init,
    headers: { "X-N8N-API-KEY": apiKey, "Content-Type": "application/json", Accept: "application/json", ...(init.headers || {}) },
  }, { timeoutMs: N8N_TIMEOUT_MS, maxBytes: N8N_MAX_BYTES });
  // A body that hit the cap is a FAILURE here, not a short success. Half a JSON document
  // does not parse, `json()` turned that into `null`, and `ok` stayed true because the
  // status was 200 — so an oversized listing was reported as "this workspace has no
  // workflows", and a create or update whose response was truncated reported no id while
  // the workflow had in fact been created on the instance. Raising is what makes every
  // existing call site handle it, rather than each one having to remember a flag.
  if (res.truncated) throw new SsrfError("response_too_large");
  return {
    ok: res.status >= 200 && res.status < 300,
    status: res.status,
    text: () => res.body,
    json: () => { try { return JSON.parse(res.body); } catch { return null; } },
    truncated: res.truncated,
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const anon = Deno.env.get("SUPABASE_ANON_KEY")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const authHeader = req.headers.get("Authorization") ?? "";

  // 1. Authenticate the caller and resolve their tenant from the JWT.
  const userClient = createClient(supabaseUrl, anon, { global: { headers: { Authorization: authHeader } } });
  const { data: { user } } = await userClient.auth.getUser();
  if (!user) return json({ error: "unauthorized" }, 401);

  const admin = createClient(supabaseUrl, serviceKey);
  const { data: isAdmin } = await admin.rpc("has_role", { _user_id: user.id, _role: "admin" });
  if (!isAdmin) return json({ error: "forbidden", detail: "n8n control is admin-only." }, 403);

  // current_user_tenant_id runs in the caller's JWT context → their own tenant.
  const { data: tenantId, error: tErr } = await userClient.rpc("current_user_tenant_id");
  if (tErr || !tenantId) return json({ error: "no_tenant" }, 400);

  const body = await req.json().catch(() => ({}));
  const action: string = body?.action ?? "";

  // 2. Pull the tenant's decrypted n8n creds (service-role-only RPC).
  const { data: secret, error: sErr } = await admin.rpc("get_tenant_n8n_secret", { _tenant_id: tenantId });
  if (sErr) return json({ error: "secret_lookup_failed" }, 500);
  if (!secret?.configured) {
    return json({ ok: false, error: "not_connected", detail: "This workspace hasn't connected an n8n account yet. Connect one in Settings → Integrations → n8n." });
  }
  const baseUrl: string = secret.base_url;
  const apiKey: string = secret.api_key;

  // Vet the stored address BEFORE anything is sent, so a bad one costs no outbound
  // request at all — and, more to the point, never carries the API key anywhere.
  try {
    await assertPublicHttpUrl(`${baseUrl.replace(/\/$/, "")}/api/v1`);
  } catch (e) {
    // The stable reason only. It names the shape of the problem without echoing the
    // address back, which for the credentials case would put the secret in the reply.
    return json({ error: "unsafe_instance_url", detail: e instanceof SsrfError ? e.reason : "blocked" }, 400);
  }

  const markSync = (status: string, lastError: string | null, count: number | null) =>
    admin.rpc("update_tenant_n8n_sync", { _tenant_id: tenantId, _status: status, _last_error: lastError, _workflow_count: count }).then(() => {}, () => {});

  try {
    switch (action) {
      case "test":
      case "list": {
        const res = await n8nFetch(baseUrl, apiKey, "/workflows?limit=200");
        if (!res.ok) {
          await markSync("error", `n8n ${res.status}`, null);
          return json({ error: `n8n_${res.status}` }, 502);
        }
        const data = await res.json();
        const items = (data?.data ?? []).map((w: any) => ({
          id: w.id, name: w.name, active: !!w.active,
          tags: (w.tags ?? []).map((t: any) => t.name), updatedAt: w.updatedAt,
        }));
        await markSync("connected", null, items.length);
        // Record the tenant's workflow inventory in the per-tenant registry so the
        // team can see what exists / is active (GHL-parity), and Paige keeps records.
        await admin.rpc("sync_tenant_workflows", { _tenant_id: tenantId, _workflows: items }).then(() => {}, () => {});
        return json(action === "test"
          ? { ok: true, connected: true, workflow_count: items.length }
          : { ok: true, workflows: items, count: items.length });
      }
      case "get": {
        if (!body.workflow_id) return json({ error: "workflow_id_required" }, 400);
        const res = await n8nFetch(baseUrl, apiKey, `/workflows/${encodeURIComponent(body.workflow_id)}`);
        if (!res.ok) return json({ error: `n8n_${res.status}` }, 502);
        // Bounded on the same principle as everything else here: node parameters hold
        // whatever a workflow author put in them, including URLs and credential-shaped
        // values, so the definition itself does not leave this function.
        const wfGet = await res.json();
        return json({ ok: true, workflow: {
          id: wfGet?.id ?? null, name: wfGet?.name ?? null, active: !!wfGet?.active,
          tags: (wfGet?.tags ?? []).map((t: any) => t?.name).filter(Boolean),
          node_count: Array.isArray(wfGet?.nodes) ? wfGet.nodes.length : null,
          updatedAt: wfGet?.updatedAt ?? null,
        } });
      }
      case "executions": {
        if (!body.workflow_id) return json({ error: "workflow_id_required" }, 400);
        const limit = Math.min(50, Math.max(1, Number(body.limit) || 10));
        const res = await n8nFetch(baseUrl, apiKey, `/executions?workflowId=${encodeURIComponent(body.workflow_id)}&limit=${limit}`);
        if (!res.ok) return json({ error: `n8n_${res.status}` }, 502);
        const data = await res.json();
        const runs = (data?.data ?? []).map((e: any) => ({
          id: e.id, finished: e.finished, mode: e.mode, status: e.status,
          startedAt: e.startedAt, stoppedAt: e.stoppedAt,
        }));
        return json({ ok: true, executions: runs, count: runs.length });
      }
      case "run": {
        // Fire a workflow by hitting its webhook trigger — this is how n8n
        // automations are actually invoked (the workflow must have a Webhook
        // node and be active). Accept an explicit webhook_path, or resolve it
        // from the workflow's webhook node.
        let path: string | undefined = body.webhook_path;
        let wfName: string | null = null;
        if (!path && body.workflow_id) {
          const wres = await n8nFetch(baseUrl, apiKey, `/workflows/${encodeURIComponent(body.workflow_id)}`);
          if (!wres.ok) return json({ error: `n8n_${wres.status}` }, 502);
          const wf = await wres.json();
          wfName = typeof wf?.name === "string" ? wf.name : null;
          const nodes: any[] = wf?.nodes ?? [];
          const hook = nodes.find((n) => typeof n?.type === "string" && n.type.toLowerCase().includes("webhook"));
          path = hook?.parameters?.path;
          // Return 200 with ok:false for these EXPECTED cases so functions.invoke
          // delivers the detail to Paige (a non-2xx would be collapsed to a generic
          // "non-2xx" error and she'd lose the explanation).
          if (!path) {
            const isSub = nodes.some((n) => typeof n?.type === "string" && n.type.toLowerCase().includes("executeworkflowtrigger"));
            return json({ ok: false, error: "not_webhook_triggered",
              detail: isSub
                ? "That's a reusable SUB-workflow — it's meant to be CALLED by other workflows (it has no webhook), so it can't be fired standalone through the API. Offer to build a small webhook-trigger workflow that calls it (webhook → Execute Workflow → this sub-workflow); then you can fire that webhook anytime with the inputs it expects."
                : "This workflow has no webhook trigger (it likely runs on a schedule or is called by another workflow), so it can't be fired directly. Offer to add a webhook trigger, or trigger it from its own flow." });
          }
          if (!wf?.active) {
            return json({ ok: false, error: "workflow_inactive", detail: "This workflow is turned off, so its webhook won't respond. Offer to turn it on first (n8n_activate_workflow), then run it." });
          }
        }
        if (!path) return json({ ok: false, error: "workflow_or_path_required", detail: "Provide a workflow_id (to resolve its webhook) or an explicit webhook_path." });
        const webhookUrl = `${baseUrl.replace(/\/$/, "")}/webhook/${String(path).replace(/^\//, "")}`;
        const method = String(body.method || "POST").toUpperCase();
        // Same guard as the REST path. The webhook is the more dangerous of the two —
        // it is a workflow trigger, and its response was previously read in full before
        // being sliced, so an enormous body was already spent by the time it was cut.
        const hookRes = await safeFetch(webhookUrl, {
          method,
          headers: { "Content-Type": "application/json" },
          body: method === "GET" || method === "HEAD" ? undefined : JSON.stringify(body.payload ?? {}),
        }, { timeoutMs: N8N_TIMEOUT_MS, maxBytes: N8N_MAX_BYTES });
        // `safeFetch` reports a status, not a Response, and a 3xx never reaches here
        // at all — it raises. So "accepted" is exactly 2xx.
        const hookOk = hookRes.status >= 200 && hookRes.status < 300;
        const respText = hookRes.body.slice(0, 4000);
        let parsed: any = null; try { parsed = JSON.parse(respText); } catch { /* non-JSON body */ }
        const o = parsed && typeof parsed === "object" ? parsed : {};
        // Any of these keys means the workflow reported a machine-readable send outcome.
        const hasOutcome = ["smsSent", "emailSent", "telegramSent", "tagsAdded", "errors", "contactId", "messageId"].some((k) => k in o);
        const errs = Array.isArray(o.errors) ? o.errors.map(String) : [];
        // Map straight through; a key the body OMITS is null, never false.
        const sms = "smsSent" in o ? o.smsSent === true : null;
        const email = "emailSent" in o ? o.emailSent === true : null;
        const tags = "tagsAdded" in o ? o.tagsAdded : null;
        // delivered truth-table: true ONLY when a channel is explicitly true AND no errors.
        let delivered: boolean | null = null;
        if (hasOutcome) {
          const anyTrue = sms === true || email === true;
          const anyClaim = sms !== null || email !== null;
          delivered = errs.length ? false : anyTrue ? true : anyClaim ? false : null;
        }
        const executionId = o.executionId ?? o.execution_id ?? hookRes.headers.get("x-execution-id") ?? null;
        // Rail (owner_ops) — the automation fired for the run's client (LAYER 1: the
        // webhook accepted it). Delivery/completion stays a separate concern (verified
        // via execution_get), so we file fired only, never a premature completed (§13).
        // Best-effort + non-blocking; skips unless a real client resolves from payload.
        if (hookOk) {
          const hints = contactHintsFromPayload(body.payload ?? {});
          await emitAutomationRail(admin, {
            tenantId, contactId: hints.contactId, email: hints.email, phone: hints.phone,
            workflowName: wfName, phase: "fired",
          });
        }
        return json({
          ok: true,                          // the edge function itself ran
          action: "run",
          workflow_id: body.workflow_id ?? null,
          webhook_path: String(path),
          fired: hookOk,                     // LAYER 1 — webhook accepted the request
          http_status: hookRes.status,
          verified: hasOutcome,              // did the workflow return a machine-readable outcome?
          delivered,                          // LAYER 2 — true | false | null(unknown). The headline field.
          outcome_source: hasOutcome ? "response_body" : "none",
          channels: { sms_sent: sms, email_sent: email, tags_added: tags },
          errors: errs,
          execution_id: executionId,          // LAYER 3 — feed to execution_get to turn null into fact
          outcome: hasOutcome ? {
            contactId: o.contactId ?? null, messageId: o.messageId ?? null,
            smsSent: sms, emailSent: email, telegramSent: o.telegramSent ?? null,
            tagsAdded: tags, name: o.name ?? null, errors: errs,
          } : null,
          // The webhook's own response body is NOT returned. It was read to extract the
          // typed outcome above and its job ends there: it is written by whatever the
          // workflow chose to return, so forwarding it hands an arbitrary third-party
          // string to every consumer of this response, the model included.
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
        });
      }
      case "create": {
        if (!body.name || !body.nodes) return json({ error: "name_and_nodes_required", detail: "Provide name plus a valid n8n workflow (nodes + connections)." }, 400);
        // Dry-check the graph BEFORE POSTing so a malformed workflow returns
        // specific, self-repairable errors instead of an opaque n8n 400.
        const cv = validateWorkflow(body);
        if (!cv.valid) return json({ ok: false, error: "invalid_workflow", detail: cv.errors.join("; "), validation: cv });
        // Create INACTIVE by default — authored workflows must be reviewed and
        // explicitly activated, never auto-live.
        const payload = {
          name: body.name,
          nodes: body.nodes,
          connections: body.connections ?? {},
          settings: body.settings ?? {},
        };
        const res = await n8nFetch(baseUrl, apiKey, "/workflows", { method: "POST", body: JSON.stringify(payload) });
        // Expected n8n rejection → 200 + ok:false so the real reason reaches Paige
        // (a 502 would be collapsed by functions.invoke to a generic non-2xx string).
        if (!res.ok) return json({ ok: false, error: `n8n_${res.status}` });
        const wf = await res.json();
        // Fold the Paige-authored workflow into the tenant's registry, tagged as hers.
        if (wf?.id) await admin.rpc("record_paige_workflow", { _tenant_id: tenantId, _n8n_workflow_id: wf.id, _name: wf.name }).then(() => {}, () => {});
        return json({ ok: true, workflow_id: wf?.id, name: wf?.name, active: !!wf?.active });
      }
      case "update": {
        if (!body.workflow_id) return json({ error: "workflow_id_required" }, 400);
        const payload: Record<string, unknown> = {};
        for (const k of ["name", "nodes", "connections", "settings"]) if (body[k] !== undefined) payload[k] = body[k];
        if (Object.keys(payload).length === 0) return json({ error: "nothing_to_update" }, 400);
        // Validate only when the caller is replacing the graph (nodes present).
        if (body.nodes !== undefined) {
          const uv = validateWorkflow({ name: body.name ?? "update", nodes: body.nodes, connections: body.connections });
          if (!uv.valid) return json({ ok: false, error: "invalid_workflow", detail: uv.errors.join("; "), validation: uv });
        }
        const res = await n8nFetch(baseUrl, apiKey, `/workflows/${encodeURIComponent(body.workflow_id)}`, { method: "PUT", body: JSON.stringify(payload) });
        if (!res.ok) return json({ ok: false, error: `n8n_${res.status}` });
        const wf = await res.json();
        return json({ ok: true, workflow_id: wf?.id, name: wf?.name, active: !!wf?.active });
      }
      case "validate": {
        const v = validateWorkflow(body);
        return json({ ok: v.valid, action: "validate", ...v });
      }
      case "execution_get": {
        if (!body.execution_id) return json({ ok: false, error: "execution_id_required", detail: "Provide the execution_id (from a run response or the executions list)." });
        const res = await n8nFetch(baseUrl, apiKey, `/executions/${encodeURIComponent(body.execution_id)}?includeData=true`);
        if (res.status === 404) return json({ ok: false, error: "execution_not_found", detail: "No execution with that id. Run the executions action to list recent runs for the workflow." });
        if (!res.ok) return json({ ok: false, error: `n8n_${res.status}` });
        const ex = await res.json();
        const rd = ex?.data?.resultData ?? {};
        const lastNode: string | null = rd?.lastNodeExecuted ?? null;
        // n8n nests final output at data.resultData.runData[<node>][0].data.main[0][0].json — extract defensively.
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
        // Compact per-node trace for failures — never dump the whole envelope.
        const nodes = Object.entries(rd?.runData ?? {}).map(([name, runs]: any) => ({
          name, status: runs?.[0]?.error ? "error" : "success", error: runs?.[0]?.error?.message ?? null,
        }));
        const nodeError = nodes.find((n) => n.status === "error") ?? null;
        return json({
          ok: true, action: "execution_get",
          execution_id: String(body.execution_id),
          workflow_id: ex?.workflowId ?? null,
          status, finished: !!ex?.finished,
          started_at: ex?.startedAt ?? null, stopped_at: ex?.stoppedAt ?? null,
          delivered, outcome_source: "execution_check",
          channels: { sms_sent: sms, email_sent: email, tags_added: tags },
          errors: errs,
          last_node: lastNode,
          // The failing node's NAME as its own typed field. It used to exist only inside
          // a formatted string ("Send: SMTP refused"), which no consumer could read a name
          // out of — the projection tried, got `undefined`, and reported no failing node
          // on every failed run while claiming in a comment that the name survived.
          failed_node: nodeError?.name ?? null,
          node_error: nodeError ? `${nodeError.name}: ${nodeError.error}` : (rd?.error?.message ?? null),
          // `result` (up to 4000 characters of whatever the last node emitted) and the
          // per-node `nodes` trace are NOT returned. They are the same arbitrary
          // third-party text as the webhook body removed elsewhere in this file, and the
          // typed fields above carry everything a caller acts on.
          verify_hint: status === "running" || status === "waiting"
            ? "Still in flight — delivery not yet knowable. Re-check in a moment."
            : (delivered === true ? "Confirmed from the stored execution — the send went out."
               : delivered === false ? "Confirmed from the stored execution — it did NOT send; see errors[]. Do not tell the operator it went out."
               : "Execution finished but reported no channel outcome — delivery remains unconfirmed."),
        });
      }
      case "activate":
      case "deactivate": {
        if (!body.workflow_id) return json({ error: "workflow_id_required" }, 400);
        const res = await n8nFetch(baseUrl, apiKey, `/workflows/${encodeURIComponent(body.workflow_id)}/${action}`, { method: "POST" });
        if (!res.ok) return json({ ok: false, error: `n8n_${res.status}` });
        const wf = await res.json();
        return json({ ok: true, workflow_id: wf?.id, active: !!wf?.active });
      }
      case "archive_workflow": {
        // PREFERRED default over delete — reversible ("park don't weave", §4).
        if (!body.workflow_id) return json({ ok: false, error: "workflow_id_required" });
        const d = await n8nFetch(baseUrl, apiKey, `/workflows/${encodeURIComponent(body.workflow_id)}/deactivate`, { method: "POST" });
        if (!d.ok) return json({ ok: false, error: `n8n_${d.status}` });
        const wf = await d.json();
        const name = String(wf?.name ?? "");
        if (!name.startsWith("[archived]")) {
          // Tag via name-prefix (works on all n8n versions).
          await n8nFetch(baseUrl, apiKey, `/workflows/${encodeURIComponent(body.workflow_id)}`, {
            method: "PUT", body: JSON.stringify({ name: `[archived] ${name}` }),
          }).catch(() => {});
        }
        return json({ ok: true, archived: true, workflow_id: body.workflow_id, active: false, note: "Deactivated and tagged [archived] — reversible. Restore with activate + update." });
      }
      case "delete_workflow": {
        // Permanent — only on an explicit "delete permanently".
        if (!body.workflow_id) return json({ ok: false, error: "workflow_id_required" });
        const res = await n8nFetch(baseUrl, apiKey, `/workflows/${encodeURIComponent(body.workflow_id)}`, { method: "DELETE" });
        if (!res.ok) return json({ ok: false, error: `n8n_${res.status}` });
        // Registry cleanup; if the RPC is absent, a subsequent list resync drops the ghost.
        await admin.rpc("forget_paige_workflow", { _tenant_id: tenantId, _n8n_workflow_id: body.workflow_id }).then(() => {}, () => {});
        return json({ ok: true, deleted: true, workflow_id: body.workflow_id, note: "Workflow permanently deleted from n8n." });
      }
      default:
        return json({ error: "unknown_action", detail: `Unknown n8n action: ${action}` }, 400);
    }
  } catch (e) {
    // A guard refusal is not an instance failure and is not reported as one: the
    // difference between "your n8n is down" and "that address was refused" is the
    // difference between waiting and fixing.
    if (e instanceof SsrfError) {
      // Three different things, told apart, because they ask different things of an admin.
      //
      // A REDIRECT is not a bad address. A healthy instance that has moved, or that sits
      // behind a proxy adding a trailing slash, redirects — and marking the whole
      // connection `unsafe_instance_url` told the admin their address pointed somewhere
      // private, which is both false and unactionable. It is the connection SETTING that
      // needs updating to whatever the instance now answers on.
      //
      // A TIMEOUT or a transport failure says nothing about the address at all and must
      // not put the connection into an error state that reads as misconfiguration.
      const redirected = e.reason === "url_redirect_refused";
      const unreachable = e.reason === "request_timed_out" || e.reason === "request_failed";
      // Distinct from an unreachable instance and from a bad address: the instance
      // answered, and answered with more than this function will hold.
      const tooLarge = e.reason === "response_too_large";
      // `markSync` records what is true: an address that resolves somewhere private is a
      // configuration error; a redirect or an outage is a state of the instance.
      await markSync("error", e.reason, null);
      if (tooLarge) return json({ error: "n8n_response_too_large", detail: e.reason }, 502);
      if (redirected) return json({ error: "instance_url_redirects", detail: e.reason }, 400);
      if (unreachable) return json({ error: "n8n_request_failed", detail: e.reason }, 502);
      return json({ error: "unsafe_instance_url", detail: e.reason }, 400);
    }
    const msg = e instanceof Error ? e.message : "n8n_request_failed";
    await markSync("error", msg.slice(0, 300), null);
    return json({ error: "n8n_request_failed", detail: msg }, 502);
  }
});

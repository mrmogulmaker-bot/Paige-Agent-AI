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
// The n8n REST/webhook transport, creds resolution, and the fire/poll cores live in the ONE shared home
// (§18) so the headless Layer-C n8n adapter drives n8n through the SAME SSRF-guarded, response-projected
// path — never a forked client. This control surface is one caller of that seam; the adapter is another.
import { n8nFetch, resolveN8nConnection, fireN8nWebhook, getN8nExecution, type N8nRunDb } from "../_shared/n8n-run.ts";
// SsrfError still classifies a guard refusal in the outer catch (the seam's calls throw it and it
// propagates up) — a refusal ("that address was refused") is told apart from an instance outage.
import { SsrfError } from "../_shared/ssrfGuard.ts";

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

// `n8nFetch` (the SSRF-guarded REST transport), the timeout/size caps, `resolveN8nConnection` (creds +
// URL vet), and the `fireN8nWebhook`/`getN8nExecution` cores now live in `../_shared/n8n-run.ts` — the ONE
// home shared with the Layer-C n8n adapter (§18). This surface imports them; the behavior is unchanged.

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
  // The shared n8n seam takes the minimal structural client (N8nRunDb); the supabase-js SupabaseClient's
  // rpc return type does not structurally match under Deno strict, so cast once at the boundary — the
  // established codebase idiom (cf. the drainer's `admin as unknown as EngineDb`).
  const n8nAdmin = admin as unknown as N8nRunDb;
  const { data: isAdmin } = await admin.rpc("has_role", { _user_id: user.id, _role: "admin" });
  if (!isAdmin) return json({ error: "forbidden", detail: "n8n control is admin-only." }, 403);

  // current_user_tenant_id runs in the caller's JWT context → their own tenant.
  const { data: tenantId, error: tErr } = await userClient.rpc("current_user_tenant_id");
  if (tErr || !tenantId) return json({ error: "no_tenant" }, 400);

  const body = await req.json().catch(() => ({}));
  const action: string = body?.action ?? "";

  // 2. Resolve the tenant's decrypted n8n creds + vet the stored instance URL, through the shared seam
  //    (service-role-only RPC; the URL is checked BEFORE anything is sent, so a bad one costs no outbound
  //    request and never carries the API key). Same responses as before — the resolution moved to the
  //    shared home, the branches are unchanged.
  const conn = await resolveN8nConnection(n8nAdmin, tenantId);
  if (!conn.configured) {
    if (conn.reason === "secret_lookup_failed") return json({ error: "secret_lookup_failed" }, 500);
    if (conn.reason === "not_connected") {
      return json({ ok: false, error: "not_connected", detail: "This workspace hasn't connected an n8n account yet. Connect one in Settings → Integrations → n8n." });
    }
    // unsafe_instance_url — the stable reason only, never the address (which would leak the secret).
    return json({ error: "unsafe_instance_url", detail: conn.detail ?? "blocked" }, 400);
  }
  const baseUrl: string = conn.baseUrl;
  const apiKey: string = conn.apiKey;

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
        // Fire a workflow by hitting its webhook trigger — this is how n8n automations are actually
        // invoked (the workflow must have a Webhook node and be active). Accept an explicit webhook_path,
        // or resolve it from the workflow's webhook node. The fire + response projection live in the
        // shared seam (`fireN8nWebhook`); this branch maps its result to the SAME responses as before and
        // keeps the owner Rail here (fired-only, never a premature completed — §13).
        const r = await fireN8nWebhook(n8nAdmin, tenantId, {
          workflowId: body.workflow_id, webhookPath: body.webhook_path, method: body.method, payload: body.payload,
        });
        if (r.refusal === "n8n_error") return json({ error: r.detail ?? "n8n_error" }, 502);
        // These EXPECTED cases return 200 + ok:false so functions.invoke delivers the detail to Paige
        // (a non-2xx would collapse to a generic "non-2xx" error and she'd lose the explanation).
        if (r.refusal === "not_webhook_triggered") return json({ ok: false, error: "not_webhook_triggered", detail: r.detail });
        if (r.refusal === "workflow_inactive") return json({ ok: false, error: "workflow_inactive", detail: r.detail });
        if (r.refusal === "workflow_or_path_required") return json({ ok: false, error: "workflow_or_path_required", detail: r.detail });
        // Rail (owner_ops) — the automation fired for the run's client (LAYER 1: the webhook accepted it).
        // Delivery/completion stays a separate concern (verified via execution_get). Best-effort +
        // non-blocking; skips unless a real client resolves from the payload.
        if (r.fired) {
          const hints = contactHintsFromPayload(body.payload ?? {});
          await emitAutomationRail(admin, {
            tenantId, contactId: hints.contactId, email: hints.email, phone: hints.phone,
            workflowName: r.workflow_name ?? null, phase: "fired",
          });
        }
        return json({
          ok: true,                          // the edge function itself ran
          action: "run",
          workflow_id: body.workflow_id ?? null,
          webhook_path: r.webhook_path,
          fired: r.fired,                    // LAYER 1 — webhook accepted the request
          http_status: r.http_status,
          verified: r.verified,              // did the workflow return a machine-readable outcome?
          delivered: r.delivered,            // LAYER 2 — true | false | null(unknown). The headline field.
          outcome_source: r.outcome_source,
          channels: r.channels,
          errors: r.errors,
          execution_id: r.execution_id,      // LAYER 3 — feed to execution_get to turn null into fact
          outcome: r.outcome,
          note: r.note,
          verify_hint: r.verify_hint,
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
        // The poll + typed projection live in the shared seam (`getN8nExecution`); this branch maps its
        // result to the SAME responses as before. (Creds are already resolved+vetted above, so the seam's
        // re-resolution succeeds for the same tenant; a creds refusal here would be defensive only.)
        const r = await getN8nExecution(n8nAdmin, tenantId, body.execution_id);
        if (r.refusal === "execution_not_found") return json({ ok: false, error: "execution_not_found", detail: "No execution with that id. Run the executions action to list recent runs for the workflow." });
        if (r.refusal) return json({ ok: false, error: r.detail ?? r.refusal });
        return json({
          ok: true, action: "execution_get",
          execution_id: r.execution_id,
          workflow_id: r.workflow_id,
          status: r.status, finished: r.finished,
          started_at: r.started_at, stopped_at: r.stopped_at,
          delivered: r.delivered, outcome_source: r.outcome_source,
          channels: r.channels,
          errors: r.errors,
          last_node: r.last_node,
          failed_node: r.failed_node,
          node_error: r.node_error,
          verify_hint: r.verify_hint,
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

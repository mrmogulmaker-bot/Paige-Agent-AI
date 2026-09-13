// Paige Runtime Harness — Layer C · C3: the n8n workflow-runtime ActionAdapter (ASYNC, poll readback).
//
// An n8n act runs a tenant's own n8n workflow by firing its webhook, then confirms the outcome by POLLING
// the execution (n8n exposes no completion callback, so poll is the only readback path). Both the fire and
// the poll go through the ONE shared seam (`_shared/n8n-run.ts`) that `paige-n8n` also drives — never a
// forked n8n client (§18). The seam resolves the tenant's creds internally (service-role RPC, explicit
// tenant), vets the instance URL (SSRF), and never lets the API key leave it.
//
// GOVERNANCE (unchanged by this adapter): `n8n_run_workflow` is HIGH risk (action-risk.ts). In the auto
// event drainer the governed decision clamps auto→confirm→propose→approval_pending, so an unattended n8n
// act HOLDS for approval and this dispatch is NEVER reached there. dispatch runs only for an `execute`
// decision (a human-approved act, via a future approval executor) — this adapter is the mechanism that
// path will use; it does not fire in the auto lane. (§13: built + unit-proven, does not fire unattended.)
//
// HONESTY & SAFETY (§13/§32):
//   * dispatch fires the webhook and returns `accepted_for_execution` + providerRef = the n8n execution id
//     (LAYER 3). It NEVER returns `executed` on a bare webhook 2xx — a fired webhook is queued, not
//     confirmed. A definitive pre-fire refusal (not connected, no webhook, inactive, bad workflow) or a
//     non-2xx webhook is TERMINAL `failed` (a retry cannot fix a missing connection or a wrong workflow).
//   * readback POLLS the execution: success (no node error) → `executed`; a node error / failed status →
//     `failed`; still running/waiting → `ambiguous` (re-poll, never blind re-fire); no execution id to
//     bind, execution-not-found, or an infra/connection error → `ambiguous` (cannot confirm — NEVER a
//     blind re-fire that could double-run a workflow). The send-channel `delivered` sub-outcome is carried
//     in `detail` honestly; it does not by itself flip a successful RUN to failed.
//   * the act's correlation ref is stamped into the webhook payload so the workflow can echo it; the
//     binding for the poll is the returned execution id (→ provider_ref, coalesced by the monotonic RPC).

import type { DispatchInput, DispatchResult } from "./adapters.ts";
import { fireN8nWebhook, getN8nExecution, type N8nRunDb } from "../n8n-run.ts";

/** Read the workflow target + payload from the governed args. Accepts `workflow_id` / `webhook_path`,
 *  an optional `method`, and a `payload` object. Neither id nor path is fatal here — `fireN8nWebhook`
 *  returns the `workflow_or_path_required` refusal, which dispatch maps to a terminal failed. */
function readN8nArgs(args: unknown): { workflowId?: string; webhookPath?: string; method?: string; payload: Record<string, unknown> } {
  const a = (args && typeof args === "object" ? args : {}) as Record<string, unknown>;
  const workflowId = typeof a.workflow_id === "string" && a.workflow_id.trim() ? a.workflow_id.trim() : undefined;
  const webhookPath = typeof a.webhook_path === "string" && a.webhook_path.trim() ? a.webhook_path.trim() : undefined;
  const method = typeof a.method === "string" && a.method.trim() ? a.method.trim() : undefined;
  const payload = (a.payload && typeof a.payload === "object" ? a.payload : {}) as Record<string, unknown>;
  return { workflowId, webhookPath, method, payload };
}

/** Refusals that mean "this can never run as asked" — a retry cannot fix them → terminal `failed`. */
const TERMINAL_FIRE_REFUSALS = new Set(["not_connected", "unsafe_instance_url", "not_webhook_triggered", "workflow_inactive", "workflow_or_path_required", "n8n_error", "secret_lookup_failed"]);

/** Stamp the act's correlation ref into the webhook payload so the workflow can echo it. Pure. */
function stampCorrelation(payload: Record<string, unknown>, correlationRef: string): Record<string, unknown> {
  return { ...payload, __paige_correlation: correlationRef };
}

/** PURE: map a `fireN8nWebhook` result to the dispatch outcome. accepted_for_execution on a fired webhook
 *  (queued, NOT confirmed — the poll is authoritative); a definitive refusal or a non-2xx is terminal
 *  `failed`; a fired webhook's execution id becomes the providerRef the readback polls. */
type FireResultLike = Awaited<ReturnType<typeof fireN8nWebhook>>;
function mapFireResult(r: FireResultLike): DispatchResult {
  if (r.refusal && TERMINAL_FIRE_REFUSALS.has(r.refusal)) {
    return { outcome: "failed", providerRef: null, error: r.refusal, detail: { reason: r.refusal, detail: r.detail ?? null } };
  }
  if (r.fired === false) {
    // The webhook answered non-2xx — nothing was sent, and a retry of the same call won't change it.
    return { outcome: "failed", providerRef: null, error: "webhook_rejected", detail: { http_status: r.http_status ?? null, note: r.note ?? null } };
  }
  return {
    outcome: "accepted_for_execution",
    providerRef: r.execution_id ?? null,
    detail: {
      fired: true, http_status: r.http_status ?? null, verified: r.verified ?? false,
      delivered: r.delivered ?? null, execution_id: r.execution_id ?? null, note: r.note ?? null,
    },
  };
}

/** PURE: map a `getN8nExecution` poll result (+ the providerRef it was polled by) to the readback outcome.
 *  success (no node error) → executed; a node error / non-success terminal → failed; still running/waiting
 *  → ambiguous; a refusal (not-found / connection / n8n error) → ambiguous (cannot confirm; never a blind
 *  re-fire). The send-channel `delivered` sub-outcome is carried in detail — it does NOT flip a successful
 *  RUN to failed. */
type ExecResultLike = Awaited<ReturnType<typeof getN8nExecution>>;
function mapExecutionResult(r: ExecResultLike, providerRef: string): DispatchResult {
  if (r.refusal) {
    return { outcome: "ambiguous", providerRef, detail: { reason: r.refusal, detail: r.detail ?? null }, error: r.detail ?? null };
  }
  const status = r.status ?? "unknown";
  if (status === "running" || status === "waiting") {
    return { outcome: "ambiguous", providerRef, detail: { reason: "in_flight", status }, error: null };
  }
  const hasErrors = Array.isArray(r.errors) && r.errors.length > 0;
  if (status === "success" && !hasErrors && !r.failed_node) {
    return { outcome: "executed", providerRef, detail: { status, delivered: r.delivered ?? null, channels: r.channels ?? null } };
  }
  return {
    outcome: "failed", providerRef,
    error: r.failed_node ? `n8n_node_failed:${r.failed_node}` : `n8n_status:${status}`,
    detail: { status, failed_node: r.failed_node ?? null, node_error: r.node_error ?? null, errors: r.errors ?? [], delivered: r.delivered ?? null },
  };
}

export const n8nExecuteAdapter = {
  /** dispatch: fire the webhook through the shared seam; map its result. A guard/transport THROW before we
   *  know whether the webhook was accepted → ambiguous (reconcile on readback, never a blind re-fire). */
  async dispatch(input: DispatchInput): Promise<DispatchResult> {
    const { workflowId, webhookPath, method, payload } = readN8nArgs(input.args);
    try {
      const r = await fireN8nWebhook(input.db as unknown as N8nRunDb, input.tenantId, {
        workflowId, webhookPath, method, payload: stampCorrelation(payload, input.correlationRef),
      });
      return mapFireResult(r);
    } catch (e) {
      return { outcome: "ambiguous", providerRef: null, detail: { reason: "dispatch_threw" }, error: e instanceof Error ? e.message : String(e) };
    }
  },

  /** readback: poll the execution by its id and map the result. No execution id to bind → ambiguous
   *  (never a blind re-fire that could double-run the workflow). */
  async readback(providerRef: string | null, input: DispatchInput): Promise<DispatchResult> {
    if (!providerRef) {
      return { outcome: "ambiguous", providerRef: null, detail: { reason: "no_execution_id_to_poll" }, error: null };
    }
    try {
      const r = await getN8nExecution(input.db as unknown as N8nRunDb, input.tenantId, providerRef);
      return mapExecutionResult(r, providerRef);
    } catch (e) {
      return { outcome: "ambiguous", providerRef, detail: { reason: "readback_threw" }, error: e instanceof Error ? e.message : String(e) };
    }
  },
} as const;

/** Exposed for unit tests — the pure mappers are network-free and cover every outcome path. */
export const __test = { readN8nArgs, stampCorrelation, mapFireResult, mapExecutionResult, TERMINAL_FIRE_REFUSALS };

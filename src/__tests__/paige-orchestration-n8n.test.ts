/**
 * Layer C · C3 — the governed n8n workflow-run ActionAdapter (ASYNC, poll readback).
 *
 * The adapter fires an n8n workflow webhook and confirms by POLLING the execution, both through the ONE
 * shared seam (`_shared/n8n-run.ts`) that `paige-n8n` also drives (never a forked client, §18). The
 * outcome MAPPING is pure and network-free:
 *   dispatch: a fired webhook → accepted_for_execution + the execution id to poll (NEVER executed on a
 *     bare 2xx); a definitive refusal / non-2xx → terminal failed.
 *   readback: poll → success→executed, node error / non-success→failed, in-flight→ambiguous,
 *     unbindable / not-found / infra→ambiguous (never a blind re-fire that could double-run a workflow).
 *
 * These tests cover every mapping directly (pure), plus the adapter→seam→mapper wiring end-to-end for the
 * not-connected path (real seam, returns before any network). The seam's real SSRF + response-projection
 * behavior is covered by the n8n smokes (smoke:n8n-ssrf, smoke:n8n-egress) against the live handler.
 * HIGH-risk governance (an n8n act HOLDS at approval_pending in the auto drainer, never dispatches) is
 * covered by the engine suite (paige-orchestration-engine.test.ts) and is unchanged by C3.
 */
import { describe, it, expect } from "vitest";
import {
  n8nExecuteAdapter,
  __test as n8nTest,
} from "../../supabase/functions/_shared/paige-orchestration/n8n-adapter.ts";
import type { DispatchInput, AdapterDb } from "../../supabase/functions/_shared/paige-orchestration/adapters.ts";

const { readN8nArgs, stampCorrelation, mapFireResult, mapExecutionResult } = n8nTest;

// ═══ Part A — readN8nArgs ════════════════════════════════════════════════════════════════════════════

describe("n8n adapter — readN8nArgs (governed args → fire target)", () => {
  it("reads workflow_id / webhook_path / method / payload; defaults payload to {}", () => {
    expect(readN8nArgs({ workflow_id: "wf1", method: "PUT", payload: { a: 1 } })).toEqual({ workflowId: "wf1", webhookPath: undefined, method: "PUT", payload: { a: 1 } });
    expect(readN8nArgs({ webhook_path: "hook/x" })).toEqual({ workflowId: undefined, webhookPath: "hook/x", method: undefined, payload: {} });
  });
  it("rejects blank / non-string ids and paths; a missing payload is an empty object", () => {
    const r = readN8nArgs({ workflow_id: "  ", webhook_path: 5, payload: "nope" });
    expect(r.workflowId).toBeUndefined();
    expect(r.webhookPath).toBeUndefined();
    expect(r.payload).toEqual({});
    expect(readN8nArgs(null).payload).toEqual({});
  });
});

// ═══ Part B — stampCorrelation ═══════════════════════════════════════════════════════════════════════

describe("n8n adapter — stampCorrelation (bind the fire to the act)", () => {
  it("adds __paige_correlation and preserves the caller payload", () => {
    expect(stampCorrelation({ name: "x" }, "corr-9")).toEqual({ name: "x", __paige_correlation: "corr-9" });
  });
  it("the correlation ref wins over a caller-supplied key of the same name (never spoofable)", () => {
    expect(stampCorrelation({ __paige_correlation: "forged" }, "corr-real").__paige_correlation).toBe("corr-real");
  });
});

// ═══ Part C — mapFireResult (dispatch outcome) ═══════════════════════════════════════════════════════

describe("n8n adapter — mapFireResult: fired→accepted (never executed on a bare 2xx), refusal/non-2xx→failed", () => {
  it("a fired webhook with an execution id → accepted_for_execution, providerRef = the execution id", () => {
    const r = mapFireResult({ connected: true, fired: true, http_status: 200, verified: false, delivered: null, execution_id: "exec-42", note: "fired" } as any);
    expect(r.outcome).toBe("accepted_for_execution");
    expect(r.providerRef).toBe("exec-42");
    expect((r.detail as any).fired).toBe(true);
  });
  it("a fired webhook with NO execution id → accepted_for_execution, providerRef null (readback will be ambiguous)", () => {
    const r = mapFireResult({ connected: true, fired: true, http_status: 202, execution_id: null } as any);
    expect(r.outcome).toBe("accepted_for_execution");
    expect(r.providerRef).toBeNull();
  });
  it("a non-2xx webhook → terminal failed (webhook_rejected), never accepted", () => {
    const r = mapFireResult({ connected: true, fired: false, http_status: 404, note: "non-2xx" } as any);
    expect(r.outcome).toBe("failed");
    expect(r.error).toBe("webhook_rejected");
  });
  it("every pre-fire refusal → terminal failed (a retry cannot fix a missing connection / wrong workflow)", () => {
    for (const refusal of ["not_connected", "unsafe_instance_url", "not_webhook_triggered", "workflow_inactive", "workflow_or_path_required", "n8n_error", "secret_lookup_failed"]) {
      const r = mapFireResult({ connected: refusal !== "not_connected", refusal, detail: "x" } as any);
      expect(r.outcome, refusal).toBe("failed");
      expect(r.error, refusal).toBe(refusal);
      expect(r.providerRef, refusal).toBeNull();
    }
  });
});

// ═══ Part D — mapExecutionResult (readback outcome) ══════════════════════════════════════════════════

describe("n8n adapter — mapExecutionResult: success→executed, error→failed, in-flight/unconfirmable→ambiguous", () => {
  it("status success, no errors, no failed node → executed (delivered carried in detail, does NOT flip a run)", () => {
    const ex = mapExecutionResult({ connected: true, status: "success", errors: [], failed_node: null, delivered: false, channels: { sms_sent: false, email_sent: null, tags_added: null } } as any, "exec-1");
    expect(ex.outcome).toBe("executed");
    expect((ex.detail as any).delivered).toBe(false); // honest: ran, but the send did not confirm
    const ex2 = mapExecutionResult({ connected: true, status: "success", errors: [], failed_node: null, delivered: true } as any, "exec-1");
    expect(ex2.outcome).toBe("executed");
  });
  it("still running / waiting → ambiguous (re-poll, never re-fire)", () => {
    expect(mapExecutionResult({ connected: true, status: "running" } as any, "e").outcome).toBe("ambiguous");
    expect(mapExecutionResult({ connected: true, status: "waiting" } as any, "e").outcome).toBe("ambiguous");
  });
  it("a node error / errors present / non-success terminal → failed", () => {
    expect(mapExecutionResult({ connected: true, status: "success", errors: [], failed_node: "Send SMS", node_error: "Send SMS: SMTP refused" } as any, "e").outcome).toBe("failed");
    expect(mapExecutionResult({ connected: true, status: "success", errors: ["boom"] } as any, "e").outcome).toBe("failed");
    expect(mapExecutionResult({ connected: true, status: "error" } as any, "e").outcome).toBe("failed");
    expect(mapExecutionResult({ connected: true, status: "crashed" } as any, "e").outcome).toBe("failed");
  });
  it("a refusal (execution_not_found / connection / n8n error) → ambiguous (cannot confirm; never re-fire)", () => {
    for (const refusal of ["execution_not_found", "n8n_error", "not_connected"]) {
      expect(mapExecutionResult({ connected: refusal !== "not_connected", refusal, detail: "x" } as any, "e").outcome, refusal).toBe("ambiguous");
    }
  });
});

// ═══ Part E — adapter integration through the REAL seam (network-free: not-connected + no-id) ═════════

// A fake service-role client whose get_tenant_n8n_secret says the tenant is NOT connected. The seam
// returns before any outbound call, so this exercises the whole dispatch path (readN8nArgs →
// stampCorrelation → fireN8nWebhook → mapFireResult) without touching the network.
function notConnectedDb(): AdapterDb {
  return {
    from: () => ({ select() { return this; }, eq() { return this; }, limit() { return this; }, then(f: any) { return Promise.resolve({ data: [], error: null }).then(f); } }) as any,
    rpc: async (fn: string) => (fn === "get_tenant_n8n_secret" ? { data: { configured: false }, error: null } : { data: null, error: null }),
  };
}

const dispatchInput = (over: Partial<DispatchInput> = {}): DispatchInput => ({
  tenantId: "t1", actionKind: "n8n_run_workflow", args: { workflow_id: "wf1", payload: { hi: 1 } },
  correlationRef: "corr-1", db: notConnectedDb(), subjectTable: "clients", subjectId: "c1", ...over,
});

describe("n8n adapter — dispatch/readback through the real seam (network-free paths)", () => {
  it("dispatch on a NOT-CONNECTED tenant → failed (not_connected), no network, honest terminal", async () => {
    const r = await n8nExecuteAdapter.dispatch(dispatchInput());
    expect(r.outcome).toBe("failed");
    expect(r.error).toBe("not_connected");
    expect(r.providerRef).toBeNull();
  });
  it("readback with NO providerRef → ambiguous (no execution id to bind; never a blind re-fire)", async () => {
    const r = await n8nExecuteAdapter.readback(null, dispatchInput());
    expect(r.outcome).toBe("ambiguous");
    expect((r.detail as any).reason).toBe("no_execution_id_to_poll");
  });
  it("readback on a NOT-CONNECTED tenant → ambiguous (cannot confirm; never re-fire)", async () => {
    const r = await n8nExecuteAdapter.readback("exec-1", dispatchInput());
    expect(r.outcome).toBe("ambiguous");
    expect((r.detail as any).reason).toBe("not_connected");
  });
});

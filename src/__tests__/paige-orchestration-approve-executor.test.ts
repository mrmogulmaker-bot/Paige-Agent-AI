/**
 * Layer C · C5 — the approval-executor (`_shared/paige-orchestration/approve-executor.ts`).
 * Proves the seam that drives a HELD (approval_pending) native act to execution on a human's approval:
 *   • happy path: approval_pending → redeem via the dedicated approve RPC → native dispatch → ledger executed;
 *   • idempotent/honest: a non-approval_pending row dispatches NOTHING and reports the persisted truth;
 *   • fail-closed: an n8n-sourced held act is not-supported-in-slice (never fired); a governed refusal and a
 *     tenant-integrity mismatch STOP before redeeming (nothing consumed, nothing dispatched);
 *   • already-redeemed: a concurrent redemption is detected (the approve RPC no-ops) and not re-dispatched.
 * The Gateway availability resolver is injected (test-only; production always uses the canonical Gateway).
 */
import { describe, it, expect } from "vitest";
import {
  executeApprovedLayerCAct,
  type ApproveExecutorDb,
} from "../../supabase/functions/_shared/paige-orchestration/approve-executor.ts";

// ── A chainable, thenable mock of the supabase-js surface the executor + native adapter use. ────────────
type Rows = Record<string, unknown[]>;
type Cfg = {
  rows: Rows;                                   // table → rows returned by a select
  rpc: Record<string, (args: any) => { data: any; error: any }>;
  calls: { rpc: Array<{ fn: string; args: any }> };
};
function mockDb(cfg: Cfg): ApproveExecutorDb {
  const makeQuery = (table: string) => {
    const q: any = {
      select() { return q; },
      eq() { return q; },
      order() { return q; },
      limit() { return q; },
      then(onF: any, onR: any) {
        return Promise.resolve({ data: cfg.rows[table] ?? [], error: null }).then(onF, onR);
      },
    };
    return q;
  };
  return {
    from: (t: string) => makeQuery(t),
    rpc: async (fn: string, args: Record<string, unknown>) => {
      cfg.calls.rpc.push({ fn, args });
      const h = cfg.rpc[fn];
      if (h) return h(args);
      return { data: null, error: null }; // best-effort telemetry rpcs (record_capability_run/record_rail_event/…)
    },
  };
}

const liveAvailability = () => Promise.resolve({ ok: true as const, status: { availability: "live" as const } });

// A native held act (crm.advance_journey_stage) at approval_pending, tenant-consistent.
const baseCfg = (over: Partial<Cfg["rows"]> = {}, rpcOver: Partial<Cfg["rpc"]> = {}): Cfg => ({
  calls: { rpc: [] },
  rows: {
    paige_act_executions: [{
      outcome: "approval_pending", capability_key: "crm.advance_journey_stage",
      correlation_ref: "corr-1", idempotency_key: "corr-1", tenant_id: "t1", automation_id: "a1", act_position: 1,
    }],
    paige_automation_acts: [{ action_kind: "crm.advance_journey_stage", config: { stage_slug: "engaged" } }],
    paige_native_events: [{ subject_table: "clients", subject_id: "c1", tenant_id: "t1" }],
    paige_automations: [{ name: "Welcome flow" }],
    paige_journey_stage_transitions: [{ id: "tr1", to_stage_slug: "engaged" }], // the reconcile confirmation
    ...over,
  },
  rpc: {
    paige_approve_act_execution: () => ({ data: { outcome: "accepted_for_execution" }, error: null }),
    set_journey_stage: () => ({ data: { unchanged: false }, error: null }), // changed → reconcile by correlation
    paige_record_act_execution: (a: any) => ({ data: { id: "row1", outcome: a._outcome }, error: null }),
    ...rpcOver,
  },
});

const run = (cfg: Cfg, over: Record<string, unknown> = {}) =>
  executeApprovedLayerCAct({ db: mockDb(cfg), eventId: "e1", actId: "act1", approverUserId: "u1", resolveAvailability: liveAvailability as any, ...over });

describe("approve-executor — happy path: a held native act is redeemed, dispatched, and executed", () => {
  it("redeems via the approve RPC, dispatches the native adapter, advances the ledger to executed", async () => {
    const cfg = baseCfg();
    const res = await run(cfg);
    expect(res.outcome).toBe("executed");
    expect(res.executed).toBe(true);
    expect(res.ok).toBe(true);
    const fns = cfg.calls.rpc.map((c) => c.fn);
    expect(fns).toContain("paige_approve_act_execution"); // the single sanctioned transition was invoked
    expect(fns).toContain("set_journey_stage");           // the native dispatch actually ran
    const finalWrite = cfg.calls.rpc.filter((c) => c.fn === "paige_record_act_execution").at(-1)!;
    expect(finalWrite.args._outcome).toBe("executed");    // ledger advanced to executed
    expect(finalWrite.args._settled_at).toBeTruthy();
  });

  it("a no-op advance (already on target stage) still executes, and suppresses the 'advanced' Rail", async () => {
    const cfg = baseCfg({}, { set_journey_stage: () => ({ data: { unchanged: true }, error: null }) });
    const res = await run(cfg);
    expect(res.outcome).toBe("executed");
    expect((res.detail as any).already_at_requested_stage).toBe(true);
    // no record_rail_event on an idempotent no-op
    expect(cfg.calls.rpc.map((c) => c.fn)).not.toContain("record_rail_event");
  });
});

describe("approve-executor — fail-closed + honest (nothing consumed, nothing dispatched)", () => {
  it("a non-approval_pending row dispatches nothing and reports the persisted outcome", async () => {
    const cfg = baseCfg({ paige_act_executions: [{ outcome: "executed", capability_key: "crm.advance_journey_stage", correlation_ref: "c", idempotency_key: "c", tenant_id: "t1", automation_id: "a1", act_position: 1 }] });
    const res = await run(cfg);
    expect(res.outcome).toBe("executed");
    expect(res.reason).toBe("not_pending_approval");
    expect(cfg.calls.rpc.map((c) => c.fn)).not.toContain("paige_approve_act_execution");
    expect(cfg.calls.rpc.map((c) => c.fn)).not.toContain("set_journey_stage");
  });

  it("an n8n-sourced held act is NOT supported in this slice and is never fired", async () => {
    const cfg = baseCfg({ paige_act_executions: [{ outcome: "approval_pending", capability_key: "n8n_run_workflow", correlation_ref: "c", idempotency_key: "c", tenant_id: "t1", automation_id: "a1", act_position: 1 }] });
    const res = await run(cfg);
    expect(res.outcome).toBe("approval_pending");
    expect(res.reason).toBe("not_supported_in_slice");
    expect(cfg.calls.rpc.map((c) => c.fn)).not.toContain("paige_approve_act_execution");
  });

  it("a tenant-integrity mismatch (event tenant ≠ ledger tenant) STOPS before redeeming", async () => {
    const cfg = baseCfg({ paige_native_events: [{ subject_table: "clients", subject_id: "c1", tenant_id: "OTHER" }] });
    const res = await run(cfg);
    expect(res.outcome).toBe("approval_pending");
    expect(res.reason).toBe("tenant_integrity_mismatch");
    expect(cfg.calls.rpc.map((c) => c.fn)).not.toContain("paige_approve_act_execution");
  });

  it("a governed refusal (unavailable capability) STOPS before redeeming — nothing consumed", async () => {
    const notForTier = () => Promise.resolve({ ok: true as const, status: { availability: "not_for_tier" as const } });
    const cfg = baseCfg();
    const res = await run(cfg, { resolveAvailability: notForTier });
    expect(res.outcome).toBe("approval_pending");
    expect(res.reason?.startsWith("governed_")).toBe(true);
    expect(cfg.calls.rpc.map((c) => c.fn)).not.toContain("paige_approve_act_execution");
    expect(cfg.calls.rpc.map((c) => c.fn)).not.toContain("set_journey_stage");
  });

  it("an availability infra error STOPS (retryable), never a false refusal or execution", async () => {
    const infra = () => Promise.resolve({ ok: false as const, error: "gateway_down" });
    const cfg = baseCfg();
    const res = await run(cfg, { resolveAvailability: infra });
    expect(res.reason).toBe("availability_infra_error");
    expect(cfg.calls.rpc.map((c) => c.fn)).not.toContain("paige_approve_act_execution");
  });
});

describe("approve-executor — already-redeemed (concurrency): the approve RPC no-op is detected, not re-dispatched", () => {
  it("when the approve RPC returns a non-accepted outcome, the executor stops and reports it (no dispatch)", async () => {
    const cfg = baseCfg({}, { paige_approve_act_execution: () => ({ data: { outcome: "executed" }, error: null }) });
    const res = await run(cfg);
    expect(res.outcome).toBe("executed");
    expect(res.executed).toBe(true);
    expect(res.reason).toBe("already_redeemed");
    expect(cfg.calls.rpc.map((c) => c.fn)).not.toContain("set_journey_stage"); // never re-dispatched
  });
});

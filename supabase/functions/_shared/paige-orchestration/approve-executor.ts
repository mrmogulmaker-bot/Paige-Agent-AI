// Paige Runtime Harness — Layer C · C5: the APPROVAL-EXECUTOR.
//
// A Layer-C act a human must confirm lands at `approval_pending` in `paige_act_executions` (engine.ts).
// Until C5 it dead-ended. This module is the seam that, on a human's approval, drives that held act to
// execution — WITHOUT a new engine and WITHOUT weakening the C4 monotonic contract:
//
//   1. re-resolve the capability's availability THROUGH the canonical Gateway (never cached, §C2 correction),
//   2. re-run the ONE governed pathway (`decideGovernedExecution`) with the human's yes expressed as the
//      approval claim (`claimedArgs` = the act's IMMUTABLE governed args, `claimedFor` = the capability id) → `execute`,
//   3. atomically REDEEM the approval via the dedicated `paige_approve_act_execution` RPC
//      (approval_pending → accepted_for_execution — the single sanctioned transition; idempotent),
//   4. DISPATCH through the already-registered ActionAdapter (native this slice) and read the outcome back,
//   5. advance the ledger accepted→executed|failed|ambiguous via the monotonic `paige_record_act_execution`,
//      and on a CONFIRMED executed file the capability receipt + owner Rail (Rail suppressed on an idempotent
//      no-op) — the same evidence engine.ts phase-5 files.
//
// IMMUTABLE ARGS (§P1, Codex peer-gate). The args + action_kind dispatched are read from the LEDGER ROW's own
// snapshot (`detail.snapshot_args`, captured by the engine when the act landed approval_pending; `capability_key`
// is the ledger's own action-kind snapshot) — NEVER the live `paige_automation_acts.config`, which a tenant admin
// can mutate between the hold and the approval. So approval executes exactly what the reviewer saw (§70.2).
//
// RESUMABLE / RECOVERABLE (§P3/§P4, Codex peer-gate + §13/§32). This seam accepts three inbound ledger states so
// a half-completed prior attempt is RECOVERABLE rather than stranded:
//   * approval_pending          → FRESH: availability → governed execute → redeem → dispatch → advance.
//   * accepted_for_execution    → RESUME: a prior attempt redeemed but its ledger-advance never persisted (a
//                                  write blip). Reconcile by correlation; if never landed, re-dispatch
//                                  (idempotent). The governed gate is NOT re-run — authorisation already
//                                  happened at redemption.
//   * ambiguous                 → RESUME: an unconfirmed prior dispatch. Reconcile by correlation ONLY —
//                                  NEVER a blind re-dispatch (owner rule, engine phase-5). Still unconfirmed →
//                                  report, consume NOTHING (the caller keeps the approval reclaimable).
// The caller (execute-approval) consumes the approval (stamps `approved`) ONLY for a terminal, durably-recorded
// outcome (executed | failed). ambiguous / accepted_for_execution / a governed refusal / a read blip consume
// NOTHING, so a re-approval re-enters here and reconciles.
//
// SCOPE (slice 1, §13): NATIVE acts only (the shipped `crm.advance_journey_stage`). An n8n-sourced held act
// is reported `not_supported_in_slice` and NEVER fired — the engine does not drive n8n dispatch yet (C3+),
// so approving one to real execution is later async work, not this seam.
//
// AUTHORITY (§9/§59): this module is called by `execute-approval` AFTER it has verified the JWT approver
// (admin/coach + active member of the act's tenant, or platform owner). The approver id is threaded here for
// the governed `principal:"person"` attribution (a `service` principal may not mutate — governedExecution.ts)
// and for the audit stamp on the approve RPC. The tenant is the AUTHORITATIVE one from the ledger row / event,
// never a request body.
//
// HONESTY (§13/§32): `executed` is returned ONLY after the adapter confirms (native reconciles by correlation,
// never a bare "ok"); a redemption that finds a terminal row STOPS and reports the persisted truth rather than
// re-dispatching; a definitive failure is terminal `failed`; an unconfirmable outcome is `ambiguous` (never a
// blind re-fire); a ledger-write failure after a real dispatch reports the PRIOR persisted state (never the
// adapter outcome), so the caller cannot record an outcome the ledger never persisted. Nothing here claims an
// act ran that only queued.

import {
  adapterForAction,
  resolveAdapterKind,
  type AdapterDb,
  type DispatchInput,
  type DispatchResult,
} from "./adapters.ts";
import { decideGovernedExecution } from "../paige-spine/governedExecution.ts";
import { resolveNativeCapabilityStatus } from "../paige-capability-status/gatherer.ts";
import { recordCapabilityRun, stableRunId } from "../capability-record.ts";
import { emitAutomationRail } from "../railAutomation.ts";

/** The minimal client surface the executor needs (a read chain + rpc) — kept structural so a fake proves it. */
export type ApproveExecutorDb = AdapterDb;

export type ApproveExecInput = {
  db: ApproveExecutorDb;
  eventId: string;
  actId: string;
  /** the JWT-verified approver (execute-approval resolved + authorised this person). */
  approverUserId: string;
  /** the tenant the caller was AUTHORISED against at the door (execute-approval verifies the approver is a
   *  member of the approval row's tenant). REQUIRED as a §9/§59 guard: the executor refuses unless the held
   *  act's ledger tenant EQUALS this — otherwise a caller authorised for tenant A could drive a held act in
   *  tenant B (the approval-row's tenant and the act's ledger tenant are decoupled; the approval row is
   *  insertable under a tenant-agnostic RLS policy). Fail-closed: absent or mismatched → refuse, nothing
   *  redeemed or dispatched. Typed nullable because the door's `approval.tenant_id` may be null (→ refused). */
  expectedTenantId?: string | null;
  /** TEST-INJECTION ONLY: override the Gateway availability resolver. Production omits this and the real
   *  canonical Gateway (`resolveNativeCapabilityStatus`) runs — never a Layer-C availability literal (C2
   *  correction). A test injects a fake so the executor is provable without mocking the whole Gateway. */
  resolveAvailability?: typeof resolveNativeCapabilityStatus;
};

/** The connector-neutral result the caller (execute-approval) records back onto the approval row. */
export type ApproveExecResult = {
  ok: boolean;
  /** the final ledger outcome after this call (executed | failed | ambiguous | the persisted state on a no-op). */
  outcome: string;
  executed: boolean;
  reason?: string;
  detail?: Record<string, unknown>;
};

// ── small typed row shapes for the loads (structural; a fake db returns these) ──────────────────────────
type LedgerRow = {
  outcome: string; capability_key: string | null; correlation_ref: string | null;
  idempotency_key: string; tenant_id: string; automation_id: string; act_position: number;
  detail: Record<string, unknown> | null;
};
type ActRow = { action_kind: string | null; config: Record<string, unknown> | null };
type EventRow = { subject_table: string; subject_id: string; tenant_id: string };

// The three inbound ledger states this seam can act on. Any other outcome is terminal/settled — the executor
// reports the persisted truth and dispatches nothing.
const RESUMABLE_OUTCOMES: ReadonlySet<string> = new Set(["approval_pending", "accepted_for_execution", "ambiguous"]);

async function readOne<T>(db: ApproveExecutorDb, table: string, match: Record<string, string>, cols: string): Promise<{ ok: true; row: T | null } | { ok: false; error: string }> {
  let q = db.from(table).select(cols);
  for (const [k, v] of Object.entries(match)) q = q.eq(k, v);
  const { data, error } = await q.limit(1);
  if (error) return { ok: false, error: (error as { message?: string }).message ?? String(error) };
  const rows = Array.isArray(data) ? data : [];
  return { ok: true, row: (rows[0] as T) ?? null };
}

/** The stable identity + subject an advance/receipt/Rail needs, reconstructed once from the ledger + event. */
type AdvanceBase = {
  eventId: string; actId: string; automationId: string; actPosition: number; tenantId: string;
  capabilityKey: string | null; correlationRef: string | null; idempotencyKey: string;
  automationName: string; subjectId: string; approverUserId: string;
};

/** Advance the ledger to a dispatch/reconcile result via the monotonic RPC, and (only for a CONFIRMED executed)
 *  file the capability receipt + owner Rail. Mirrors engine.ts phase-5 advanceNative (§18: a near-term dedup
 *  is tracked — extracting the engine closure would re-touch the hot path, so slice 1 keeps this parallel and
 *  the §39/§5 pass judges the tradeoff). Rail is suppressed on an idempotent no-op (already_at_requested_stage).
 *
 *  §P3 (Codex peer-gate): if the durable ledger write FAILS after a real dispatch, this returns the PRIOR
 *  persisted state (accepted_for_execution / ambiguous) with reason `ledger_write_failed` — NOT the adapter's
 *  outcome. The caller consumes only executed|failed, so it never stamps the approval `approved` for an outcome
 *  the ledger never recorded; the row stays reclaimable and a re-approval reconciles it (RESUME above). */
async function advanceLedger(
  db: ApproveExecutorDb, base: AdvanceBase, result: DispatchResult, priorOutcome: string,
): Promise<ApproveExecResult> {
  const settled = result.outcome === "executed" || result.outcome === "failed"; // ambiguous stays advanceable
  const nowIso = new Date().toISOString();
  // The row already exists (redeemed to accepted_for_execution, or already advanceable on a resume); this is the
  // monotonic accepted→executed|failed|ambiguous advance. The full identity (automation_id, idempotency_key) is
  // passed so the INSERT..ON CONFLICT tuple is valid and folds onto the SAME row (§C1 monotonic RPC).
  const { data, error } = await db.rpc("paige_record_act_execution", {
    _event_id: base.eventId, _automation_id: base.automationId, _act_id: base.actId, _act_position: base.actPosition,
    _tenant_id: base.tenantId, _adapter_kind: "native", _capability_key: base.capabilityKey,
    _effective_lane: "confirm", _outcome: result.outcome, _refusal_code: null,
    _idempotency_key: base.idempotencyKey, _correlation_ref: base.correlationRef,
    _provider_ref: result.providerRef ?? null, _detail: { approve: result.detail ?? {}, approved_by: base.approverUserId }, _error: result.error ?? null,
    _dispatched_at: nowIso, _settled_at: settled ? nowIso : null,
  });
  if (error || data == null) {
    // §P3: the effect may already have landed (dispatch ran) but the terminal advance did NOT persist — the row
    // is still at its PRIOR state. Report that persisted truth, NOT the adapter outcome, so the caller does not
    // consume it; carry the un-persisted attempted outcome in detail for traceability.
    return {
      ok: false, outcome: priorOutcome, executed: false, reason: "ledger_write_failed",
      detail: { attempted_outcome: result.outcome, dispatch: result.detail ?? {}, error: (error as { message?: string })?.message ?? null },
    };
  }
  const persisted = ((data as { outcome?: unknown }).outcome as string) ?? result.outcome;
  const rowId = (data as { id?: string }).id ?? null;

  if (persisted === "executed") {
    const detail = (result.detail ?? {}) as Record<string, unknown>;
    const wasNoop = detail.already_at_requested_stage === true;
    const runId = await stableRunId(["paige-cap-approve", base.eventId, base.actId]);
    await recordCapabilityRun(db, {
      tenantId: base.tenantId, actorId: base.approverUserId, capabilityKey: base.capabilityKey ?? "",
      outcome: "capability_succeeded", runId,
      detail: { correlation_ref: base.correlationRef, event_id: base.eventId, act_id: base.actId, contact_id: base.subjectId, approved: true, ...detail },
    });
    if (!wasNoop) {
      await emitAutomationRail(db, {
        tenantId: base.tenantId, contactId: base.subjectId, workflowName: base.automationName,
        phase: "completed", refTable: "paige_act_executions", refId: rowId,
      });
    }
  }
  return { ok: persisted === "executed", outcome: persisted, executed: persisted === "executed", detail: (result.detail ?? {}) as Record<string, unknown> };
}

const ambiguousFromThrow = (e: unknown, reason: string): DispatchResult =>
  ({ outcome: "ambiguous", providerRef: null, detail: { reason }, error: e instanceof Error ? e.message : String(e) });

/**
 * Drive a HELD native act to execution on a human's approval. Idempotent, resumable, and honest: a terminal
 * row returns the persisted state and dispatches nothing; a redeemed-but-unadvanced (accepted_for_execution)
 * or unconfirmed (ambiguous) row is RECONCILED by correlation, never blind re-fired.
 */
export async function executeApprovedLayerCAct(input: ApproveExecInput): Promise<ApproveExecResult> {
  const { db, eventId, actId, approverUserId } = input;

  // 1 — load the held ledger row (incl. its immutable detail snapshot).
  const led = await readOne<LedgerRow>(db, "paige_act_executions", { event_id: eventId, act_id: actId },
    "outcome, capability_key, correlation_ref, idempotency_key, tenant_id, automation_id, act_position, detail");
  if (led.ok === false) return { ok: false, outcome: "unknown", executed: false, reason: "ledger_read_error", detail: { error: led.error } };
  if (!led.row) return { ok: false, outcome: "absent", executed: false, reason: "act_execution_not_found" };
  const row = led.row;

  // §9/§59 TENANT-AUTHORIZATION GUARD (fail-closed), before ANY action on any inbound state. The caller was
  // authorised at the door against the APPROVAL row's tenant; this held act's LEDGER tenant must be the SAME.
  // They are decoupled — the approval row is insertable under a tenant-agnostic RLS policy, so a caller
  // authorised for tenant A could otherwise point a crafted approval at tenant B's held act and drive it via
  // the service-role client (a §9/§45/§59 cross-tenant IDOR gated only by UUID secrecy, which is no defense).
  if (!input.expectedTenantId || row.tenant_id !== input.expectedTenantId) {
    return { ok: false, outcome: row.outcome, executed: false, reason: "tenant_authorization_mismatch" };
  }

  // A terminal/settled row (executed / failed / cancelled / a settled non-execute) is not resumable — report
  // the persisted truth, dispatch nothing (§13). Only approval_pending / accepted_for_execution / ambiguous act.
  if (!RESUMABLE_OUTCOMES.has(row.outcome)) {
    return { ok: row.outcome === "executed", outcome: row.outcome, executed: row.outcome === "executed", reason: "not_pending_approval" };
  }

  // 2 — NATIVE only this slice. A non-native held act is reported and NEVER fired (§13). The adapter + capability
  //     resolve off the ledger's OWN capability_key snapshot (immutable), not the mutable act row.
  const adapterKind = resolveAdapterKind(row.capability_key);
  const adapter = adapterForAction(row.capability_key);
  const capability = adapter?.resolveCapability(row.capability_key ?? "");
  if (adapterKind !== "native" || !adapter || !capability || typeof adapter.dispatch !== "function" || typeof adapter.readback !== "function") {
    return { ok: false, outcome: row.outcome, executed: false, reason: "not_supported_in_slice", detail: { adapter_kind: adapterKind } };
  }

  // 3 — load the event to reconstruct the DispatchInput subject (immutable subject; tenant-integrity check).
  const evRes = await readOne<EventRow>(db, "paige_native_events", { id: eventId }, "subject_table, subject_id, tenant_id");
  if (evRes.ok === false) return { ok: false, outcome: row.outcome, executed: false, reason: "event_read_error", detail: { error: evRes.error } };
  if (!evRes.row) return { ok: false, outcome: row.outcome, executed: false, reason: "event_missing" };
  const tenantId = row.tenant_id;
  if (evRes.row.tenant_id !== tenantId) {
    return { ok: false, outcome: row.outcome, executed: false, reason: "tenant_integrity_mismatch" };
  }

  // §P1 — the governed args + action_kind come from the IMMUTABLE ledger snapshot, never the mutable act row.
  //   * args: the engine snapshotted them into detail.snapshot_args at approval_pending. Fall back to the live
  //     act config ONLY if the snapshot is absent (defensive — never reached for engine-produced rows), so a
  //     row minted before this fix still runs rather than stranding.
  //   * action_kind: the ledger's own capability_key snapshot (a tenant admin cannot mutate the held row).
  const actionKind = row.capability_key ?? "";
  const snap = (row.detail && typeof row.detail === "object") ? (row.detail as Record<string, unknown>).snapshot_args : undefined;
  let governedArgs: Record<string, unknown>;
  if (snap && typeof snap === "object") {
    governedArgs = snap as Record<string, unknown>;
  } else {
    const actRes = await readOne<ActRow>(db, "paige_automation_acts", { id: actId }, "action_kind, config");
    if (actRes.ok === false) return { ok: false, outcome: row.outcome, executed: false, reason: "act_read_error", detail: { error: actRes.error } };
    if (!actRes.row) return { ok: false, outcome: row.outcome, executed: false, reason: "act_missing" };
    governedArgs = (actRes.row.config ?? {}) as Record<string, unknown>;
  }

  const dispatchInput: DispatchInput = {
    tenantId, actionKind, args: governedArgs, correlationRef: row.correlation_ref ?? "",
    db, subjectTable: evRes.row.subject_table, subjectId: evRes.row.subject_id,
  };
  // The process name for the owner Rail label (best-effort; a read failure yields a blank the emitter humanizes).
  const autoRes = await readOne<{ name: string | null }>(db, "paige_automations", { id: row.automation_id }, "name");
  const automationName = (autoRes.ok && autoRes.row?.name) ? autoRes.row.name : "";
  const base: AdvanceBase = {
    eventId, actId, automationId: row.automation_id, actPosition: row.act_position, tenantId,
    capabilityKey: row.capability_key, correlationRef: row.correlation_ref, idempotencyKey: row.idempotency_key,
    automationName, subjectId: evRes.row.subject_id, approverUserId,
  };

  // ── RESUME: a redeemed-but-unadvanced (accepted_for_execution) or unconfirmed (ambiguous) row. Reconcile by
  //    correlation — NEVER re-run the governed gate (authorisation already happened at redemption). An
  //    accepted-but-never-landed row is re-dispatched (idempotent); an ambiguous row is NEVER blind re-dispatched
  //    (owner rule, engine phase-5). This is the recovery path for §P3/§P4.
  if (row.outcome === "accepted_for_execution" || row.outcome === "ambiguous") {
    let recon: DispatchResult;
    try { recon = await adapter.readback(null, dispatchInput); }
    catch (e) { recon = ambiguousFromThrow(e, "readback_threw"); }
    if (recon.outcome === "executed") return advanceLedger(db, base, recon, row.outcome); // our prior write landed
    if (row.outcome === "accepted_for_execution") {
      // redeemed but no transition stamped with our correlation → it never dispatched. Re-dispatch (idempotent).
      let dr: DispatchResult;
      try { dr = await adapter.dispatch(dispatchInput); } catch (e) { dr = ambiguousFromThrow(e, "adapter_threw"); }
      return advanceLedger(db, base, dr, "accepted_for_execution");
    }
    // ambiguous, still unconfirmed → report honestly and consume NOTHING (the caller keeps it reclaimable).
    return { ok: false, outcome: "ambiguous", executed: false, reason: "reconcile_unconfirmed", detail: (recon.detail ?? {}) as Record<string, unknown> };
  }

  // ── FRESH approval_pending: availability → governed execute → redeem → dispatch → advance.
  // 4 — re-resolve availability THROUGH the Gateway (approver + tenant + action_kind), never cached. Production
  //     uses the canonical resolver; a test may inject a fake (never a Layer-C literal in production).
  const resolveAvail = input.resolveAvailability ?? resolveNativeCapabilityStatus;
  const gw = await resolveAvail(db, { actorUserId: approverUserId, tenantId, actionKind });
  if (!gw.ok) return { ok: false, outcome: "approval_pending", executed: false, reason: "availability_infra_error" };

  // 5 — re-run the ONE governed pathway with the human's yes as the approval claim (the IMMUTABLE snapshot args)
  //     → expect `execute`.
  const decision = decideGovernedExecution({
    caller: { authenticated: true, userId: approverUserId, principal: "person", tenantId, tenantSource: "server", door: "automation", access: { allowed: true } },
    capability: { id: capability.id, effect: capability.effect, outcomeChannel: capability.outcomeChannel ?? "paige_act_executions", availability: gw.status.availability },
    approval: { autonomyLane: "confirm", claimedArgs: governedArgs, claimedFor: capability.id },
    requestArgs: governedArgs,
  });
  if (decision.kind !== "execute") {
    // The governed seam refused the approval (availability/authority/effect/claim) — surface it honestly; the
    // row stays approval_pending (nothing redeemed, nothing dispatched).
    const code = decision.kind === "refuse" ? decision.code : "not_executable";
    return { ok: false, outcome: "approval_pending", executed: false, reason: `governed_${code}` };
  }

  // 6 — REDEEM the approval atomically: approval_pending → accepted_for_execution (the sole sanctioned
  //     transition). The RPC returns the row's outcome AFTER the transition. It cannot distinguish "I redeemed
  //     it" from "a concurrent call already redeemed it" — both yield accepted_for_execution — so:
  //       * accepted_for_execution → proceed to dispatch (idempotent; the door's atomic claim already serialises
  //         approvals of one row, and set_journey_stage + the monotonic RPC converge a rare double-dispatch);
  //       * a TERMINAL outcome (executed/failed/cancelled) → a concurrent call already completed it. STOP and
  //         report the persisted truth (§13).
  const { data: appr, error: apprErr } = await db.rpc("paige_approve_act_execution", {
    _event_id: eventId, _act_id: actId, _approver_user_id: approverUserId,
  });
  if (apprErr || appr == null) return { ok: false, outcome: "approval_pending", executed: false, reason: "approve_transition_failed", detail: { error: (apprErr as { message?: string })?.message ?? null } };
  const apprOutcome = (appr as { outcome?: string }).outcome ?? "";
  if (apprOutcome !== "accepted_for_execution") {
    return { ok: apprOutcome === "executed", outcome: apprOutcome, executed: apprOutcome === "executed", reason: "already_redeemed" };
  }

  // 7 — DISPATCH through the native adapter, then advance the ledger + file receipt/Rail on a confirmed executed.
  //     The row is now accepted_for_execution (redeemed) — that is the priorOutcome reported if the advance
  //     write itself fails (§P3), so the caller never consumes an outcome the ledger did not persist.
  let dr: DispatchResult;
  try { dr = await adapter.dispatch({ ...dispatchInput, args: decision.args }); }
  catch (e) { dr = ambiguousFromThrow(e, "adapter_threw"); }
  return advanceLedger(db, base, dr, "accepted_for_execution");
}

/** Exposed for unit tests. */
export const __test = { advanceLedger, readOne };

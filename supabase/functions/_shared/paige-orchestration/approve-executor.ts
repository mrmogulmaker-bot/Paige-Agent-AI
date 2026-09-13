// Paige Runtime Harness — Layer C · C5: the APPROVAL-EXECUTOR.
//
// A Layer-C act a human must confirm lands at `approval_pending` in `paige_act_executions` (engine.ts).
// Until C5 it dead-ended. This module is the seam that, on a human's approval, drives that held act to
// execution — WITHOUT a new engine and WITHOUT weakening the C4 monotonic contract:
//
//   1. re-resolve the capability's availability THROUGH the canonical Gateway (never cached, §C2 correction),
//   2. re-run the ONE governed pathway (`decideGovernedExecution`) with the human's yes expressed as the
//      approval claim (`claimedArgs` = the act's governed args, `claimedFor` = the capability id) → `execute`,
//   3. atomically REDEEM the approval via the dedicated `paige_approve_act_execution` RPC
//      (approval_pending → accepted_for_execution — the single sanctioned transition; idempotent),
//   4. DISPATCH through the already-registered ActionAdapter (native this slice) and read the outcome back,
//   5. advance the ledger accepted→executed|failed|ambiguous via the monotonic `paige_record_act_execution`,
//      and on a CONFIRMED executed file the capability receipt + owner Rail (Rail suppressed on an idempotent
//      no-op) — the same evidence engine.ts phase-5 files.
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
// never a bare "ok"); a redemption that no-ops (already approved/executed by a prior call) STOPS and reports
// the persisted truth rather than re-dispatching; a definitive failure is terminal `failed`; an unconfirmable
// outcome is `ambiguous` (never a blind re-fire). Nothing here claims an act ran that only queued.

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
};
type ActRow = { action_kind: string | null; config: Record<string, unknown> | null };
type EventRow = { subject_table: string; subject_id: string; tenant_id: string };

async function readOne<T>(db: ApproveExecutorDb, table: string, match: Record<string, string>, cols: string): Promise<{ ok: true; row: T | null } | { ok: false; error: string }> {
  let q = db.from(table).select(cols);
  for (const [k, v] of Object.entries(match)) q = q.eq(k, v);
  const { data, error } = await q.limit(1);
  if (error) return { ok: false, error: (error as { message?: string }).message ?? String(error) };
  const rows = Array.isArray(data) ? data : [];
  return { ok: true, row: (rows[0] as T) ?? null };
}

/** Advance the ledger to a dispatch/reconcile result via the monotonic RPC, and (only for a CONFIRMED executed)
 *  file the capability receipt + owner Rail. Mirrors engine.ts phase-5 advanceNative (§18: a near-term dedup
 *  is tracked — extracting the engine closure would re-touch the hot path, so slice 1 keeps this parallel and
 *  the §39/§5 pass judges the tradeoff). Rail is suppressed on an idempotent no-op (already_at_requested_stage). */
async function advanceLedger(
  db: ApproveExecutorDb, base: { eventId: string; actId: string; automationId: string; actPosition: number; tenantId: string; capabilityKey: string | null; correlationRef: string | null; idempotencyKey: string; automationName: string; subjectId: string; approverUserId: string },
  result: DispatchResult,
): Promise<ApproveExecResult> {
  const settled = result.outcome === "executed" || result.outcome === "failed"; // ambiguous stays advanceable
  const nowIso = new Date().toISOString();
  // The row already exists (the approve RPC moved it to accepted_for_execution); this is the monotonic
  // accepted→executed|failed|ambiguous advance. The full identity (automation_id, idempotency_key) is passed
  // so the INSERT..ON CONFLICT tuple is valid and folds onto the SAME row (§C1 monotonic RPC).
  const { data, error } = await db.rpc("paige_record_act_execution", {
    _event_id: base.eventId, _automation_id: base.automationId, _act_id: base.actId, _act_position: base.actPosition,
    _tenant_id: base.tenantId, _adapter_kind: "native", _capability_key: base.capabilityKey,
    _effective_lane: "confirm", _outcome: result.outcome, _refusal_code: null,
    _idempotency_key: base.idempotencyKey, _correlation_ref: base.correlationRef,
    _provider_ref: result.providerRef ?? null, _detail: { approve: result.detail ?? {}, approved_by: base.approverUserId }, _error: result.error ?? null,
    _dispatched_at: nowIso, _settled_at: settled ? nowIso : null,
  });
  if (error || data == null) return { ok: false, outcome: result.outcome, executed: false, reason: "ledger_write_failed", detail: { error: (error as { message?: string })?.message ?? null } };
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

/**
 * Drive a HELD (approval_pending) native act to execution on a human's approval. Idempotent and honest: a
 * row not at approval_pending, or a redemption that no-ops, returns the persisted state and dispatches nothing.
 */
export async function executeApprovedLayerCAct(input: ApproveExecInput): Promise<ApproveExecResult> {
  const { db, eventId, actId, approverUserId } = input;

  // 1 — load the held ledger row. It MUST be approval_pending; anything else is an honest no-op (idempotent).
  const led = await readOne<LedgerRow>(db, "paige_act_executions", { event_id: eventId, act_id: actId },
    "outcome, capability_key, correlation_ref, idempotency_key, tenant_id, automation_id, act_position");
  if (led.ok === false) return { ok: false, outcome: "unknown", executed: false, reason: "ledger_read_error", detail: { error: led.error } };
  if (!led.row) return { ok: false, outcome: "absent", executed: false, reason: "act_execution_not_found" };
  const row = led.row;
  if (row.outcome !== "approval_pending") {
    // Already approved/executed/failed/cancelled — report the persisted truth, dispatch nothing (§13).
    return { ok: row.outcome === "executed", outcome: row.outcome, executed: row.outcome === "executed", reason: "not_pending_approval" };
  }

  // §9/§59 TENANT-AUTHORIZATION GUARD (fail-closed). The caller was authorised at the door against the
  // APPROVAL row's tenant; this held act's LEDGER tenant must be the SAME. They are decoupled — the approval
  // row is insertable under a tenant-agnostic RLS policy, so a caller authorised for tenant A could otherwise
  // point a crafted approval at tenant B's held act and drive it via the service-role client (a §9/§45/§59
  // cross-tenant IDOR gated only by UUID secrecy, which is no defense). Refuse unless the authorised tenant is
  // present AND equals the ledger tenant — nothing redeemed, nothing dispatched.
  if (!input.expectedTenantId || row.tenant_id !== input.expectedTenantId) {
    return { ok: false, outcome: "approval_pending", executed: false, reason: "tenant_authorization_mismatch" };
  }

  // 2 — NATIVE only this slice. A non-native held act is reported and NEVER fired (§13).
  const adapterKind = resolveAdapterKind(row.capability_key);
  const adapter = adapterForAction(row.capability_key);
  const capability = adapter?.resolveCapability(row.capability_key ?? "");
  if (adapterKind !== "native" || !adapter || !capability || typeof adapter.dispatch !== "function") {
    return { ok: false, outcome: "approval_pending", executed: false, reason: "not_supported_in_slice", detail: { adapter_kind: adapterKind } };
  }

  // 3 — load the act + event to reconstruct the governed call + the DispatchInput subject.
  const actRes = await readOne<ActRow>(db, "paige_automation_acts", { id: actId }, "action_kind, config");
  if (actRes.ok === false) return { ok: false, outcome: "approval_pending", executed: false, reason: "act_read_error", detail: { error: actRes.error } };
  if (!actRes.row || !actRes.row.action_kind) return { ok: false, outcome: "approval_pending", executed: false, reason: "act_missing" };
  const evRes = await readOne<EventRow>(db, "paige_native_events", { id: eventId }, "subject_table, subject_id, tenant_id");
  if (evRes.ok === false) return { ok: false, outcome: "approval_pending", executed: false, reason: "event_read_error", detail: { error: evRes.error } };
  if (!evRes.row) return { ok: false, outcome: "approval_pending", executed: false, reason: "event_missing" };
  const actConfig = (actRes.row.config ?? {}) as Record<string, unknown>;
  const actionKind = actRes.row.action_kind; // DOTTED action-bus slug — drives the adapter executor lookup
  // The event's tenant must match the ledger row's tenant (both server-derived; a mismatch is a data-integrity
  // stop, never proceed — §9). The act's tenant IS the event's tenant (the ledger row carries it authoritatively).
  const tenantId = row.tenant_id;
  if (evRes.row.tenant_id !== tenantId) {
    return { ok: false, outcome: "approval_pending", executed: false, reason: "tenant_integrity_mismatch" };
  }

  // 4 — re-resolve availability THROUGH the Gateway (approver + tenant + action_kind), never cached. Production
  //     uses the canonical resolver; a test may inject a fake (never a Layer-C literal in production).
  const resolveAvail = input.resolveAvailability ?? resolveNativeCapabilityStatus;
  const gw = await resolveAvail(db, { actorUserId: approverUserId, tenantId, actionKind });
  if (!gw.ok) return { ok: false, outcome: "approval_pending", executed: false, reason: "availability_infra_error" };

  // 5 — re-run the ONE governed pathway with the human's yes as the approval claim → expect `execute`.
  const decision = decideGovernedExecution({
    caller: { authenticated: true, userId: approverUserId, principal: "person", tenantId, tenantSource: "server", door: "automation", access: { allowed: true } },
    capability: { id: capability.id, effect: capability.effect, outcomeChannel: capability.outcomeChannel ?? "paige_act_executions", availability: gw.status.availability },
    approval: { autonomyLane: "confirm", claimedArgs: actConfig, claimedFor: capability.id },
    requestArgs: actConfig,
  });
  if (decision.kind !== "execute") {
    // The governed seam refused the approval (availability/authority/effect/claim) — surface it honestly; the
    // row stays approval_pending (nothing redeemed, nothing dispatched).
    const code = decision.kind === "refuse" ? decision.code : "not_executable";
    return { ok: false, outcome: "approval_pending", executed: false, reason: `governed_${code}` };
  }

  // 6 — REDEEM the approval atomically: approval_pending → accepted_for_execution (the sole sanctioned
  //     transition). A no-op means someone already redeemed it — STOP, report the persisted state (§13).
  const { data: appr, error: apprErr } = await db.rpc("paige_approve_act_execution", {
    _event_id: eventId, _act_id: actId, _approver_user_id: approverUserId,
  });
  if (apprErr || appr == null) return { ok: false, outcome: "approval_pending", executed: false, reason: "approve_transition_failed", detail: { error: (apprErr as { message?: string })?.message ?? null } };
  const apprOutcome = (appr as { outcome?: string }).outcome ?? "";
  if (apprOutcome !== "accepted_for_execution") {
    return { ok: apprOutcome === "executed", outcome: apprOutcome, executed: apprOutcome === "executed", reason: "already_redeemed" };
  }

  // 7 — DISPATCH through the native adapter, then advance the ledger + file receipt/Rail on a confirmed executed.
  const dispatchInput: DispatchInput = {
    tenantId, actionKind, args: decision.args, correlationRef: row.correlation_ref ?? "",
    db, subjectTable: evRes.row.subject_table, subjectId: evRes.row.subject_id,
  };
  let dr: DispatchResult;
  try { dr = await adapter.dispatch(dispatchInput); }
  catch (e) { dr = { outcome: "ambiguous", providerRef: null, detail: { reason: "adapter_threw" }, error: e instanceof Error ? e.message : String(e) }; }

  // The process name for the owner Rail label (best-effort; a read failure just yields a blank the emitter humanizes).
  const autoRes = await readOne<{ name: string | null }>(db, "paige_automations", { id: row.automation_id }, "name");
  const automationName = (autoRes.ok && autoRes.row?.name) ? autoRes.row.name : "";

  return advanceLedger(db, {
    eventId, actId, automationId: row.automation_id, actPosition: row.act_position, tenantId,
    capabilityKey: row.capability_key, correlationRef: row.correlation_ref, idempotencyKey: row.idempotency_key,
    automationName, subjectId: evRes.row.subject_id, approverUserId,
  }, dr);
}

/** Exposed for unit tests. */
export const __test = { advanceLedger, readOne };

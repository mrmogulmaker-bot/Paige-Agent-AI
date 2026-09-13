// Paige Runtime Harness — Layer C: the connector-neutral governed event→act ENGINE.
//
// Called by the native-event drainer (paige-native-event-dispatch) after it claims an event. For each
// LIVE subscriber (a §67 paige_automations process record whose trigger_key matches the event), it runs
// the one governed pathway for each ordered act:
//
//   conditions match?  → resolve effective autonomy lane (grant ∧ ceiling ∧ §68 decay)
//   → per act: resolve the connector-neutral adapter + governed capability
//   → decideGovernedExecution (the ONE pathway; auto acts are attributed to the authorizing PERSON, since
//     a service principal may not be the approver of a mutation — governedExecution.ts:188-193)
//   → record the EXACT per-act outcome + a durable correlation/idempotency record (paige_act_executions).
//
// SLICE 1 stops at `accepted_for_execution`: the act is authorized and the durable pre-dispatch record is
// written; the external adapter DISPATCH + signed readback + CRM update is slice 2. Every non-execute
// branch records its exact outcome now (condition_not_matched / held_by_lane / approval_pending /
// refused_* / failed-unsupported_adapter) — never a blanket "automation ran".
//
// The GOVERNANCE decisions live in pure, unit-provable functions (buildGovernedInputs, outcomeFromDecision);
// this file's only I/O is loading acts, resolving the lane + authorizing person, and writing the ledger.
// Nothing here is n8n-/Telegram-specific — adapters are resolved by kind (adapters.ts).

import {
  decideGovernedExecution,
  type GovernedDecision,
} from "../paige-spine/governedExecution.ts";
import { adapterForAction, resolveAdapterKind, type AdapterCapability } from "./adapters.ts";
import {
  evaluateConditions,
  laneNonExecuteOutcome,
  refusalToOutcome,
  type ActOutcome,
  type EventFacts,
} from "./decide.ts";
import { stableRunId } from "../capability-record.ts";

// ── Inputs the drainer hands the engine ──────────────────────────────────────────────────────────────
export type ClaimedEvent = {
  event_id: string;
  tenant_id: string;         // authoritative — from the claimed row, never a request body (§9)
  event_key: string;
  subject_table: string;
  subject_id: string;
  payload: Record<string, unknown>;
};
export type AutomationRow = {
  id: string;
  name: string;
  granted_lane: string;
  conditions: unknown;       // jsonb array
  created_by: string | null; // the authorizing person for an `auto` grant
  state: string;
};
export type ActRow = {
  id: string;
  position: number;
  action_kind: string | null;
  tool_key: string | null;
  config: Record<string, unknown> | null;
};

// A minimal supabase-js-like client surface (keeps the engine testable without importing the SDK type).
export type EngineDb = {
  from: (t: string) => any;
  rpc: (fn: string, args: Record<string, unknown>) => Promise<{ data: any; error: any }>;
};

// ── PURE: build the one-governed-pathway inputs for a single act (auto lane, person-attributed) ────────
export type GovernedInputs = Parameters<typeof decideGovernedExecution>[0];

export function buildGovernedInputs(params: {
  tenantId: string;
  personUserId: string;        // the resolved authorizing person (active tenant member)
  effectiveLane: string;       // the resolved effective lane ("auto" on this path)
  capability: AdapterCapability;
  actConfig: unknown;
}): GovernedInputs {
  const { tenantId, personUserId, effectiveLane, capability, actConfig } = params;
  return {
    caller: {
      authenticated: true,
      userId: personUserId,
      principal: "person",        // the standing `auto` grant IS this person's pre-authorization
      tenantId,
      tenantSource: "server",     // resolved from the claimed event row, never a request body
      door: "automation",
      access: { allowed: true },  // the authorizing person's active-membership was verified before this
    },
    capability: {
      id: capability.id,
      effect: capability.effect,
      ...(capability.effect === "mutate" ? { outcomeChannel: capability.outcomeChannel ?? "paige_act_executions" } : {}),
      availability: "unknown" as const, // declared non-adoption — a no-op at the availability gate (§ the seam)
    },
    approval: { autonomyLane: effectiveLane }, // no claimedArgs — the grant, not a single-use human claim
    requestArgs: actConfig ?? {},
  };
}

// ── PURE: map a governed decision to the exact slice-1 per-act outcome ─────────────────────────────────
export type ActDecisionOutcome = {
  outcome: ActOutcome;
  refusalCode?: string;
  error?: string;
  args?: unknown;
};

export function outcomeFromDecision(decision: GovernedDecision): ActDecisionOutcome {
  if (decision.kind === "execute") {
    // Slice 1: authorized + about to be durably recorded. The external dispatch is slice 2.
    return { outcome: "accepted_for_execution", args: decision.args };
  }
  if (decision.kind === "propose") {
    // The governed seam wants a human yes — the act is held pending approval (never executed here).
    return { outcome: "approval_pending" };
  }
  // refuse — map to the exact refused_* outcome; never a success.
  return { outcome: refusalToOutcome(decision.code), refusalCode: decision.code, error: decision.message };
}

// ── The ledger row the engine writes (paige_act_executions). ───────────────────────────────────────────
export type ActExecutionRecord = {
  event_id: string;
  automation_id: string;
  act_id: string;
  act_position: number;
  tenant_id: string;
  adapter_kind: string;
  capability_key: string | null;
  effective_lane: string | null;
  outcome: ActOutcome;
  refusal_code: string | null;
  idempotency_key: string;
  correlation_ref: string;
  provider_ref: string | null;   // the provider's own execution/correlation id, once known (slice 2)
  detail: Record<string, unknown>;
  error: string | null;
};

/** Verify the process's authorizing person is still an active member of the tenant. An `auto` mutation is
 *  attributed to this person; without a valid one we fail closed (refused_authority). */
async function resolveAuthorizingPerson(
  db: EngineDb, createdBy: string | null, tenantId: string,
): Promise<string | null> {
  if (!createdBy) return null;
  const { data, error } = await db
    .from("tenant_members")
    .select("user_id")
    .eq("tenant_id", tenantId)
    .eq("user_id", createdBy)
    .eq("status", "active")
    .limit(1);
  if (error || !Array.isArray(data) || data.length === 0) return null;
  return createdBy;
}

async function loadActs(db: EngineDb, automationId: string): Promise<ActRow[]> {
  const { data, error } = await db
    .from("paige_automation_acts")
    .select("id, position, action_kind, tool_key, config")
    .eq("automation_id", automationId)
    .order("position", { ascending: true });
  if (error || !Array.isArray(data)) return [];
  return data as ActRow[];
}

/** Build one ledger record for an act, running the governed pathway where the lane permits. Pure except
 *  for the async stableRunId (idempotency key derivation). */
async function decideActRecord(params: {
  event: ClaimedEvent;
  automation: AutomationRow;
  act: ActRow;
  laneOutcome: ActOutcome | null;   // non-null → a non-execute outcome already decided by the lane
  effectiveLane: string;
  personUserId: string | null;
}): Promise<ActExecutionRecord> {
  const { event, automation, act, laneOutcome, effectiveLane, personUserId } = params;
  const adapterKind = resolveAdapterKind(act.action_kind);
  const idempotency_key = await stableRunId(["paige-act", event.event_id, act.id]);
  const base = {
    event_id: event.event_id,
    automation_id: automation.id,
    act_id: act.id,
    act_position: act.position,
    tenant_id: event.tenant_id,
    adapter_kind: adapterKind,
    capability_key: act.action_kind ?? act.tool_key ?? null,
    effective_lane: effectiveLane,
    refusal_code: null as string | null,
    idempotency_key,
    correlation_ref: idempotency_key,
    provider_ref: null as string | null,
    detail: {} as Record<string, unknown>,
    error: null as string | null,
  };

  // Lane already decided a non-execute outcome (off → held, confirm → approval_pending).
  if (laneOutcome) {
    return { ...base, outcome: laneOutcome, detail: { effective_lane: effectiveLane } };
  }

  // auto lane — resolve the adapter + governed capability, then the one pathway.
  const adapter = adapterForAction(act.action_kind);
  const capability = adapter?.resolveCapability(act.action_kind ?? "");
  if (!adapter || !capability) {
    return { ...base, outcome: "failed", error: "unsupported_adapter", detail: { action_kind: act.action_kind } };
  }
  if (!personUserId) {
    return {
      ...base, outcome: "refused_authority", refusal_code: "no_authorizing_person",
      error: "the process has no active authorizing person for its auto grant",
    };
  }
  const decision = decideGovernedExecution(buildGovernedInputs({
    tenantId: event.tenant_id, personUserId, effectiveLane, capability, actConfig: act.config ?? {},
  }));
  const dec = outcomeFromDecision(decision);
  return {
    ...base,
    outcome: dec.outcome,
    refusal_code: dec.refusalCode ?? null,
    error: dec.error ?? null,
    detail: { capability: capability.id, decision: decision.kind, risk: decision.audit.risk },
  };
}

export type EngineResult = {
  records: ActExecutionRecord[];
  by_outcome: Record<string, number>;
  /** act_ids whose durable ledger write FAILED. A non-empty list fails the dispatch for retry (owner
   *  correction #3): the drainer must NOT complete an event whose per-act outcome was not durably recorded. */
  persist_failures: string[];
};

/** Orchestrate all acts for a claimed event across its live subscribers, writing the exact per-act
 *  outcome to paige_act_executions (fire-once). Returns a summary for the drainer's response. */
export async function runEventActs(
  db: EngineDb, event: ClaimedEvent, subscribers: AutomationRow[],
): Promise<EngineResult> {
  const facts: EventFacts = {
    event_key: event.event_key,
    subject_table: event.subject_table,
    subject_id: event.subject_id,
    payload: event.payload ?? {},
  };
  const records: ActExecutionRecord[] = [];

  for (const automation of subscribers) {
    const acts = await loadActs(db, automation.id);
    if (acts.length === 0) continue;

    // 1 — conditions (closes TODO F3): a non-match records condition_not_matched for every act.
    const verdict = evaluateConditions(automation.conditions, facts);
    if (!verdict.matched) {
      for (const act of acts) {
        records.push(await decideActRecord({
          event, automation, act, effectiveLane: automation.granted_lane,
          laneOutcome: "condition_not_matched", personUserId: null,
        }));
      }
      continue;
    }

    // 2 — effective autonomy lane = grant ∧ most-restrictive act floor ∧ Trust-Compass ceiling ∧ §68 decay.
    const { data: laneRow } = await db.rpc("resolve_automation_autonomy", { _automation_id: automation.id });
    const effectiveLane: string = (laneRow && typeof laneRow.effective === "string") ? laneRow.effective : "off";
    const laneOutcome = laneNonExecuteOutcome(effectiveLane); // null → auto proceeds
    if (laneOutcome) {
      for (const act of acts) {
        records.push(await decideActRecord({
          event, automation, act, effectiveLane, laneOutcome, personUserId: null,
        }));
      }
      continue;
    }

    // 3 — auto lane: resolve the authorizing person once, then run the pathway per act.
    const personUserId = await resolveAuthorizingPerson(db, automation.created_by, event.tenant_id);
    for (const act of acts) {
      records.push(await decideActRecord({
        event, automation, act, effectiveLane, laneOutcome: null, personUserId,
      }));
    }
  }

  // 4 — persist each record through the ATOMIC, MONOTONIC transition RPC (never a bare upsert). Every
  //     write is CHECKED (owner correction #3): a failed durable write puts the act_id in
  //     `persist_failures`, and the drainer fails the dispatch for retry rather than claiming completion.
  //     The RPC RETURNS the row that ACTUALLY persisted, so we report the persisted outcome (§13) — a
  //     re-drain that lands on an already-final row reports THAT final outcome, never our recomputed guess.
  const persist_failures: string[] = [];
  for (const rec of records) {
    const { data, error } = await db.rpc("paige_record_act_execution", {
      _event_id: rec.event_id, _automation_id: rec.automation_id, _act_id: rec.act_id,
      _act_position: rec.act_position, _tenant_id: rec.tenant_id,
      _adapter_kind: rec.adapter_kind, _capability_key: rec.capability_key,
      _effective_lane: rec.effective_lane, _outcome: rec.outcome, _refusal_code: rec.refusal_code,
      _idempotency_key: rec.idempotency_key, _correlation_ref: rec.correlation_ref,
      _provider_ref: rec.provider_ref, _detail: rec.detail, _error: rec.error,
      _dispatched_at: null, _settled_at: null,
    });
    if (error || data == null) {
      persist_failures.push(rec.act_id);
      continue;
    }
    const persisted = (data as { outcome?: unknown }).outcome;
    if (typeof persisted === "string") rec.outcome = persisted as ActOutcome;
  }

  const by_outcome: Record<string, number> = {};
  for (const rec of records) by_outcome[rec.outcome] = (by_outcome[rec.outcome] ?? 0) + 1;
  return { records, by_outcome, persist_failures };
}

// Paige Runtime Harness — Layer C · C2: the NATIVE synchronous executor(s).
//
// A "native" action is one whose effect is a governed IN-TENANT Paige write with a canonical RPC — no
// external provider, no per-tenant connection/consent to negotiate. C2 ships exactly ONE: advancing a
// contact's journey stage (`crm_advance_journey_stage` → the tenant-aware `set_journey_stage` RPC). The
// native ActionAdapter (registered in adapters.ts) routes an action_kind to its executor here, so adding
// the next native action is one registry entry — never a journey-specific engine (owner: connector-neutral).
//
// The contract this honours (adapters.ts): dispatch performs the effect and RETURNS THE TERMINAL OUTCOME
// for a synchronous action (executed | failed | ambiguous); readback is the standalone canonical re-read +
// correlation reconcile (exposed for the contract and unit-testing; dispatch calls the same helper inline).
//
// HONESTY & SAFETY invariants (§13/§32 + owner C2 corrections):
//   * executed is returned ONLY after the CANONICAL record is re-read and confirms the target — a write's
//     own "ok" is never proof by itself (§32). A no-op (already on target) IS the confirmed desired state.
//   * a definitive RPC RAISE (unknown stage/contact, cross-tenant, unauthorized) is a TERMINAL `failed`.
//   * a transport/throw (we cannot know whether the txn committed) is `ambiguous` — reconciled by the act's
//     own correlation ref against the transition log, NEVER blind-resent. The monotonic ledger RPC allows a
//     later ambiguous→executed reconcile; a blind retry that double-advanced a journey is the failure this
//     avoids.
//   * the subject is the EVENT's subject (a `clients` row); the contact id is never taken from the args.
//     The target stage slug comes from the governed args; a missing/blank slug fails closed.

import type { ActionAdapter, AdapterCapability, AdapterDb, DispatchInput, DispatchResult } from "./adapters.ts";

// ── The native action registry: exact action_kind → executor. §18 one home; extend, never fork. ─────────
type NativeExecutor = {
  capability: AdapterCapability;
  dispatch(input: DispatchInput): Promise<DispatchResult>;
  /** Standalone confirm (canonical re-read + correlation reconcile). Same logic dispatch runs inline. */
  readback(providerRef: string | null, input: DispatchInput): Promise<DispatchResult>;
};

/** Read the target stage slug from the governed args. Accepts `stage_slug` / `to_stage_slug` / `slug`.
 *  Returns null (→ fail closed) for anything that is not a non-empty string — never guesses a stage. */
function readStageSlug(args: unknown): string | null {
  if (args == null || typeof args !== "object") return null;
  const a = args as Record<string, unknown>;
  const v = a.stage_slug ?? a.to_stage_slug ?? a.slug;
  return typeof v === "string" && v.trim().length > 0 ? v.trim() : null;
}

/**
 * Confirm a journey advance against the CANONICAL record (§32), then — only if that is inconclusive —
 * reconcile by the act's own correlation ref. Never blind-retries: an unconfirmed advance is `ambiguous`.
 *   1. clients.journey_stage_slug (tenant-scoped) === target  → executed (confirmed persisted).
 *   2. otherwise, a transition row (contact_id, to_stage_slug=target, source_event=correlationRef) proves
 *      OUR act's write landed even if a later concurrent act has since moved the contact on → executed.
 *   3. neither confirms (or a read errors) → ambiguous (reconcilable; the monotonic RPC allows a later
 *      ambiguous→executed once a reconcile pass confirms it).
 */
async function confirmJourney(input: DispatchInput, targetSlug: string): Promise<DispatchResult> {
  const { db, tenantId, subjectId, correlationRef } = input;

  // 1 — canonical re-read, tenant-scoped (an independent read, not the write's self-report).
  let currentSlug: unknown;
  let readErr: unknown = null;
  try {
    const { data, error } = await db
      .from("clients")
      .select("journey_stage_slug")
      .eq("id", subjectId)
      .eq("tenant_id", tenantId)
      .limit(1);
    if (error) readErr = error;
    else {
      const rows = Array.isArray(data) ? data : [];
      currentSlug = rows.length > 0 ? (rows[0] as Record<string, unknown>).journey_stage_slug : undefined;
    }
  } catch (e) {
    readErr = e;
  }
  if (!readErr && currentSlug === targetSlug) {
    return { outcome: "executed", providerRef: null, detail: { confirmed_via: "clients.journey_stage_slug", stage_slug: targetSlug } };
  }

  // 2 — correlation reconcile: did OUR act's transition land (regardless of the current slug)?
  try {
    const { data, error } = await db
      .from("paige_journey_stage_transitions")
      .select("id")
      .eq("contact_id", subjectId)
      .eq("to_stage_slug", targetSlug)
      .eq("source_event", correlationRef)
      .limit(1);
    if (!error && Array.isArray(data) && data.length > 0) {
      return { outcome: "executed", providerRef: null, detail: { confirmed_via: "transition_correlation", stage_slug: targetSlug } };
    }
  } catch { /* fall through to ambiguous */ }

  // 3 — could not confirm either way. Fired-but-unconfirmed → ambiguous (reconcile, never blind retry).
  return {
    outcome: "ambiguous",
    providerRef: null,
    detail: { stage_slug: targetSlug, reason: readErr ? "canonical_read_error" : "not_confirmed_by_canonical_or_correlation" },
    error: readErr ? ((readErr as { message?: string }).message ?? String(readErr)) : null,
  };
}

/** The journey-stage executor. dispatch calls set_journey_stage, then confirms via confirmJourney. */
const journeyStageExecutor: NativeExecutor = {
  capability: {
    id: "crm_advance_journey_stage",
    effect: "mutate",
    outcomeChannel: "paige_act_executions",
    // HONEST availability (§13, owner correction #5): advancing a journey stage is a baseline in-tenant CRM
    // write present for EVERY tenant — no external connection, no per-tenant provider, no consent leg to
    // resolve — so "live" is the truthful, resolved availability, not a hardcoded `unknown` standing in for
    // tenant truth. Authority (active authorizing person) + the effective autonomy lane (resolved via
    // resolve_automation_autonomy in the engine) + slug validity (checked, fail-closed) are the only gates.
    // EXTERNAL-EFFECT adapters (n8n, C3+) MUST NOT declare "live" here — they owe a real per-tenant
    // capability/connection/consent resolution through the canonical Gateway (flagged for the round table).
    availability: "live",
  },
  async dispatch(input: DispatchInput): Promise<DispatchResult> {
    const { db, subjectTable, subjectId, args, correlationRef } = input;

    // The subject of the event must be a contact; the contact id is the subject, never an arg (§9).
    if (subjectTable !== "clients") {
      return { outcome: "failed", providerRef: null, error: "native_journey_subject_not_clients", detail: { subject_table: subjectTable } };
    }
    const targetSlug = readStageSlug(args);
    if (!targetSlug) {
      return { outcome: "failed", providerRef: null, error: "native_journey_missing_stage_slug", detail: {} };
    }

    let res: { data: unknown; error: unknown };
    try {
      res = await db.rpc("set_journey_stage", {
        _contact_id: subjectId,
        _stage_slug: targetSlug,
        _source_event: correlationRef, // the act's correlation ref stamps the transition row → reconcilable
      });
    } catch (e) {
      // Transport/throw BEFORE we know if the txn committed → ambiguous (reconcile, never blind retry).
      return { outcome: "ambiguous", providerRef: null, detail: { stage_slug: targetSlug, reason: "dispatch_threw" }, error: e instanceof Error ? e.message : String(e) };
    }
    if (res.error) {
      // A definitive Postgres RAISE (unknown stage/contact, cross-tenant, unauthorized) — the txn aborted,
      // nothing wrote. Terminal `failed` (a retry cannot fix a bad slug or a deleted contact).
      const msg = (res.error as { message?: string }).message ?? String(res.error);
      return { outcome: "failed", providerRef: null, error: msg, detail: { action: "set_journey_stage", stage_slug: targetSlug } };
    }
    const out = (res.data ?? {}) as Record<string, unknown>;
    // No-op: already on the target slug (set_journey_stage returns BEFORE any write). The contact is in the
    // confirmed desired state → executed, and NO duplicate transition row was written (idempotent).
    if (out.unchanged === true) {
      return { outcome: "executed", providerRef: null, detail: { unchanged: true, stage_slug: targetSlug } };
    }
    // Changed: confirm the write persisted via the independent canonical re-read (§32).
    return confirmJourney(input, targetSlug);
  },
  async readback(_providerRef: string | null, input: DispatchInput): Promise<DispatchResult> {
    const targetSlug = readStageSlug(input.args);
    if (!targetSlug) return { outcome: "failed", providerRef: null, error: "native_journey_missing_stage_slug", detail: {} };
    return confirmJourney(input, targetSlug);
  },
};

const NATIVE_EXECUTORS: Readonly<Record<string, NativeExecutor>> = {
  crm_advance_journey_stage: journeyStageExecutor,
};

/** True when an action_kind has a registered native executor (adapters.ts routes these to "native"). */
export function isNativeActionKind(actionKind: string | null | undefined): boolean {
  return !!actionKind && Object.prototype.hasOwnProperty.call(NATIVE_EXECUTORS, actionKind);
}

/** The native ActionAdapter: resolveCapability + dispatch/readback delegate to the per-action executor. */
export const nativeAdapter: ActionAdapter = {
  kind: "native",
  resolveCapability(actionKind: string): AdapterCapability | null {
    const ex = NATIVE_EXECUTORS[actionKind];
    return ex ? ex.capability : null;
  },
  async dispatch(input: DispatchInput): Promise<DispatchResult> {
    const ex = NATIVE_EXECUTORS[input.actionKind];
    if (!ex) return { outcome: "failed", providerRef: null, error: "native_action_unsupported", detail: { action_kind: input.actionKind } };
    return ex.dispatch(input);
  },
  async readback(providerRef: string, input: DispatchInput): Promise<DispatchResult> {
    const ex = NATIVE_EXECUTORS[input.actionKind];
    if (!ex) return { outcome: "failed", providerRef: null, error: "native_action_unsupported", detail: { action_kind: input.actionKind } };
    return ex.readback(providerRef, input);
  },
};

/** Exposed for unit tests: the confirm/reconcile helper and slug reader. */
export const __test = { confirmJourney, readStageSlug, NATIVE_EXECUTORS };

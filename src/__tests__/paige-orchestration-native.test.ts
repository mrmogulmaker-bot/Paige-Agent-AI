/**
 * Layer C · C2 — the NATIVE synchronous auto-execute vertical.
 *
 * Part A: the native adapter (`_shared/paige-orchestration/native-adapter.ts`) — dispatch calls
 *   set_journey_stage and RETURNS the terminal outcome after an independent canonical confirm (§32); a
 *   no-op is confirmed-executed; a RAISE is terminal failed; a throw is ambiguous; an unconfirmed change
 *   is ambiguous unless the act's OWN correlation transition proves it landed (reconcile, never blind retry).
 * Part B: the engine phase-5 path (`engine.ts`) — a governed-authorized native act dispatches AFTER its
 *   durable accepted_for_execution record persists, advances the ledger to the confirmed terminal outcome
 *   through the monotonic RPC, and files the receipt + owner Rail ONLY on a confirmed executed. The
 *   `accepted_for_execution` guard is the idempotency fence: a re-drain of an already-terminal act never
 *   re-dispatches.
 */
import { describe, it, expect } from "vitest";
import {
  nativeAdapter,
  isNativeActionKind,
  __test as nativeTest,
} from "../../supabase/functions/_shared/paige-orchestration/native-adapter.ts";
import {
  resolveAdapterKind,
  adapterForAction,
  type AdapterDb,
  type DispatchInput,
} from "../../supabase/functions/_shared/paige-orchestration/adapters.ts";
import {
  buildGovernedInputs,
  runEventActs,
  type ClaimedEvent,
  type AutomationRow,
  type EngineDb,
} from "../../supabase/functions/_shared/paige-orchestration/engine.ts";

// ── A fake supabase-js surface for the native adapter + engine (chainable, thenable). Driven by config. ──
type SetStageResult = { data?: unknown; error?: { message?: string } | null; throws?: boolean };
type DbConfig = {
  // native journey reads
  clients?: { slug?: string | null; error?: boolean; missing?: boolean };
  transitionExists?: boolean;
  transitionsError?: boolean;
  setStage?: SetStageResult;
  // engine C1 surfaces
  acts?: Record<string, Array<{ id: string; position: number; action_kind: string | null; tool_key: string | null; config: unknown }>>;
  activeMembers?: Set<string>;
  lanes?: Record<string, { effective: string }>;
  persistOutcomeOverride?: Record<string, string>;
  failAdvance?: boolean;              // fail a phase-5 ledger advance (a call carrying _dispatched_at)
  failPreDispatch?: boolean;         // fail the phase-4 pre-dispatch write (a call with _dispatched_at null)
  // capture
  rpcCalls: Array<{ fn: string; args: Record<string, unknown> }>;
  queryFilters: Array<{ table: string; filters: Record<string, unknown> }>;
};

function mockDb(cfg: DbConfig): AdapterDb & EngineDb {
  const makeQuery = (table: string) => {
    const filters: Record<string, unknown> = {};
    const q: any = {
      select() { return q; },
      order() { return q; },
      eq(k: string, v: unknown) { filters[k] = v; return q; },
      limit() { return q; },
      then(onF: any, onR: any) {
        cfg.queryFilters.push({ table, filters: { ...filters } });
        let data: unknown = [];
        let error: unknown = null;
        if (table === "clients") {
          if (cfg.clients?.error) error = { message: "clients_read_failed" };
          else if (cfg.clients?.missing) data = [];
          else data = [{ journey_stage_slug: cfg.clients?.slug ?? null }];
        } else if (table === "paige_journey_stage_transitions") {
          if (cfg.transitionsError) error = { message: "transitions_read_failed" };
          else data = cfg.transitionExists ? [{ id: "tr1" }] : [];
        } else if (table === "paige_automation_acts") {
          data = cfg.acts?.[filters.automation_id as string] ?? [];
        } else if (table === "tenant_members") {
          data = cfg.activeMembers?.has(`${filters.tenant_id}:${filters.user_id}`) ? [{ user_id: filters.user_id }] : [];
        }
        return Promise.resolve({ data, error }).then(onF, onR);
      },
    };
    return q;
  };
  return {
    from: (t: string) => makeQuery(t),
    rpc: async (fn: string, args: Record<string, unknown>) => {
      cfg.rpcCalls.push({ fn, args });
      if (fn === "set_journey_stage") {
        if (cfg.setStage?.throws) throw new Error("network_reset");
        return { data: cfg.setStage?.data ?? null, error: cfg.setStage?.error ?? null };
      }
      if (fn === "resolve_automation_autonomy") {
        return { data: cfg.lanes?.[args._automation_id as string] ?? { effective: "off" }, error: null };
      }
      if (fn === "paige_record_act_execution") {
        const actId = args._act_id as string;
        if (cfg.failPreDispatch && args._dispatched_at == null) return { data: null, error: { message: "pre_dispatch_write_failed" } };
        if (cfg.failAdvance && args._dispatched_at != null) return { data: null, error: { message: "advance_write_failed" } };
        const outcome = cfg.persistOutcomeOverride?.[actId] ?? (args._outcome as string);
        return { data: { id: `row-${actId}`, outcome, ...args }, error: null };
      }
      if (fn === "record_capability_run" || fn === "record_rail_event" || fn === "resolve_contact_id") {
        return { data: fn === "resolve_contact_id" ? null : {}, error: null };
      }
      return { data: null, error: null };
    },
  };
}

const baseInput = (cfg: DbConfig, over: Partial<DispatchInput> = {}): DispatchInput => ({
  tenantId: "t1",
  actionKind: "crm_advance_journey_stage",
  args: { stage_slug: "engaged" },
  correlationRef: "corr-1",
  db: mockDb(cfg),
  subjectTable: "clients",
  subjectId: "c1",
  ...over,
});

// ═══ Part A — the native adapter ════════════════════════════════════════════════════════════════════

describe("native adapter — routing & capability", () => {
  it("routes crm_advance_journey_stage to the native adapter (no native prefix, still native)", () => {
    expect(isNativeActionKind("crm_advance_journey_stage")).toBe(true);
    expect(isNativeActionKind("n8n_run_workflow")).toBe(false);
    expect(isNativeActionKind(null)).toBe(false);
    expect(resolveAdapterKind("crm_advance_journey_stage")).toBe("native");
    expect(adapterForAction("crm_advance_journey_stage")).toBe(nativeAdapter);
  });

  it("resolveCapability returns the live, mutating journey capability for the known kind, null otherwise", () => {
    const cap = nativeAdapter.resolveCapability("crm_advance_journey_stage");
    expect(cap).toEqual({ id: "crm_advance_journey_stage", effect: "mutate", outcomeChannel: "paige_act_executions", availability: "live" });
    expect(nativeAdapter.resolveCapability("frobnicate")).toBeNull();
  });

  it("buildGovernedInputs threads the adapter's resolved availability (live) — and defaults to unknown when absent", () => {
    const live = buildGovernedInputs({
      tenantId: "t1", personUserId: "u1", effectiveLane: "auto",
      capability: { id: "crm_advance_journey_stage", effect: "mutate", outcomeChannel: "paige_act_executions", availability: "live" },
      actConfig: {},
    });
    expect((live.capability as { availability?: string }).availability).toBe("live");
    const unknownAvail = buildGovernedInputs({
      tenantId: "t1", personUserId: "u1", effectiveLane: "auto",
      capability: { id: "n8n_run_workflow", effect: "mutate", outcomeChannel: "paige_act_executions" },
      actConfig: {},
    });
    expect((unknownAvail.capability as { availability?: string }).availability).toBe("unknown");
  });
});

describe("native adapter — dispatch outcomes (§32 confirm, §13 honest, no blind retry)", () => {
  it("changed + canonical slug == target → executed (confirmed via clients.journey_stage_slug)", async () => {
    const cfg: DbConfig = { setStage: { data: { ok: true, to_stage_slug: "engaged", from_stage_slug: "new" } }, clients: { slug: "engaged" }, rpcCalls: [], queryFilters: [] };
    const input = baseInput(cfg);
    const res = await nativeAdapter.dispatch!(input);
    expect(res.outcome).toBe("executed");
    expect((res.detail as { confirmed_via?: string })?.confirmed_via).toBe("clients.journey_stage_slug");
    // set_journey_stage was called with the act's correlation ref stamped as the source event.
    const call = cfg.rpcCalls.find((c) => c.fn === "set_journey_stage");
    expect(call?.args._source_event).toBe("corr-1");
    expect(call?.args._contact_id).toBe("c1");
    expect(call?.args._stage_slug).toBe("engaged");
  });

  it("no-op (already on target) → executed, and NO canonical read is needed (no duplicate transition)", async () => {
    const cfg: DbConfig = { setStage: { data: { ok: true, unchanged: true, stage_slug: "engaged" } }, rpcCalls: [], queryFilters: [] };
    const res = await nativeAdapter.dispatch!(baseInput(cfg));
    expect(res.outcome).toBe("executed");
    expect((res.detail as { unchanged?: boolean })?.unchanged).toBe(true);
    expect(cfg.queryFilters.some((q) => q.table === "clients")).toBe(false); // confirmed by the no-op itself
  });

  it("a definitive RPC RAISE (unknown stage / cross-tenant) → terminal failed, no readback", async () => {
    const cfg: DbConfig = { setStage: { error: { message: "Unknown journey stage: engaged" } }, rpcCalls: [], queryFilters: [] };
    const res = await nativeAdapter.dispatch!(baseInput(cfg));
    expect(res.outcome).toBe("failed");
    expect(res.error).toContain("Unknown journey stage");
    expect(cfg.queryFilters).toHaveLength(0);
  });

  it("a transport THROW (commit unknown) → ambiguous (reconcile, never a terminal failure)", async () => {
    const cfg: DbConfig = { setStage: { throws: true }, rpcCalls: [], queryFilters: [] };
    const res = await nativeAdapter.dispatch!(baseInput(cfg));
    expect(res.outcome).toBe("ambiguous");
    expect((res.detail as { reason?: string })?.reason).toBe("dispatch_threw");
  });

  it("changed but canonical slug != target AND no correlation transition → ambiguous (unconfirmed)", async () => {
    const cfg: DbConfig = { setStage: { data: { ok: true, to_stage_slug: "engaged" } }, clients: { slug: "new" }, transitionExists: false, rpcCalls: [], queryFilters: [] };
    const res = await nativeAdapter.dispatch!(baseInput(cfg));
    expect(res.outcome).toBe("ambiguous");
    expect(cfg.queryFilters.some((q) => q.table === "paige_journey_stage_transitions")).toBe(true);
  });

  it("changed, canonical slug != target BUT our correlation transition exists → executed (reconciled)", async () => {
    const cfg: DbConfig = { setStage: { data: { ok: true, to_stage_slug: "engaged" } }, clients: { slug: "closed_won" }, transitionExists: true, rpcCalls: [], queryFilters: [] };
    const res = await nativeAdapter.dispatch!(baseInput(cfg));
    expect(res.outcome).toBe("executed");
    expect((res.detail as { confirmed_via?: string })?.confirmed_via).toBe("transition_correlation");
    // the reconcile query keys on OUR act's correlation ref (never a blind slug match)
    const tq = cfg.queryFilters.find((q) => q.table === "paige_journey_stage_transitions");
    expect(tq?.filters.source_event).toBe("corr-1");
    expect(tq?.filters.to_stage_slug).toBe("engaged");
  });

  it("changed, canonical read ERRORS, correlation transition exists → executed; no transition → ambiguous", async () => {
    const ok: DbConfig = { setStage: { data: { ok: true, to_stage_slug: "engaged" } }, clients: { error: true }, transitionExists: true, rpcCalls: [], queryFilters: [] };
    expect((await nativeAdapter.dispatch!(baseInput(ok))).outcome).toBe("executed");
    const no: DbConfig = { setStage: { data: { ok: true, to_stage_slug: "engaged" } }, clients: { error: true }, transitionExists: false, rpcCalls: [], queryFilters: [] };
    expect((await nativeAdapter.dispatch!(baseInput(no))).outcome).toBe("ambiguous");
  });

  it("fails CLOSED on a missing stage slug, and on a non-clients subject — WITHOUT calling the RPC", async () => {
    const noSlug: DbConfig = { rpcCalls: [], queryFilters: [] };
    const r1 = await nativeAdapter.dispatch!(baseInput(noSlug, { args: {} }));
    expect(r1.outcome).toBe("failed");
    expect(r1.error).toBe("native_journey_missing_stage_slug");
    expect(noSlug.rpcCalls).toHaveLength(0);

    const badSubject: DbConfig = { rpcCalls: [], queryFilters: [] };
    const r2 = await nativeAdapter.dispatch!(baseInput(badSubject, { subjectTable: "invoices" }));
    expect(r2.outcome).toBe("failed");
    expect(r2.error).toBe("native_journey_subject_not_clients");
    expect(badSubject.rpcCalls).toHaveLength(0);
  });

  it("readStageSlug reads stage_slug / to_stage_slug / slug; rejects blank & non-strings", () => {
    expect(nativeTest.readStageSlug({ stage_slug: "a" })).toBe("a");
    expect(nativeTest.readStageSlug({ to_stage_slug: "b" })).toBe("b");
    expect(nativeTest.readStageSlug({ slug: "c" })).toBe("c");
    expect(nativeTest.readStageSlug({ stage_slug: "  " })).toBeNull();
    expect(nativeTest.readStageSlug({ stage_slug: 5 })).toBeNull();
    expect(nativeTest.readStageSlug(null)).toBeNull();
  });

  it("nativeAdapter.dispatch fails closed for an unknown native actionKind (no executor)", async () => {
    const cfg: DbConfig = { rpcCalls: [], queryFilters: [] };
    const res = await nativeAdapter.dispatch!(baseInput(cfg, { actionKind: "native_unknown" }));
    expect(res.outcome).toBe("failed");
    expect(res.error).toBe("native_action_unsupported");
  });
});

// ═══ Part B — engine phase-5 integration ═════════════════════════════════════════════════════════════

const event: ClaimedEvent = {
  event_id: "e1", tenant_id: "t1", event_key: "contact.created",
  subject_table: "clients", subject_id: "c1", payload: { source: "web_form" },
};
const journeyAuto = (over: Partial<AutomationRow> = {}): AutomationRow => ({
  id: "a1", name: "Welcome journey", granted_lane: "auto", conditions: [], created_by: "owner1", state: "live", ...over,
});
const journeyActs = { a1: [{ id: "act1", position: 1, action_kind: "crm_advance_journey_stage", tool_key: null, config: { stage_slug: "engaged" } }] };

describe("runEventActs — native auto-execute (phase 5): dispatch → confirm → executed + receipt/Rail", () => {
  it("auto + person + native journey act → EXECUTED, with set_journey_stage stamped by correlation + receipt + Rail", async () => {
    const cfg: DbConfig = {
      acts: journeyActs, activeMembers: new Set(["t1:owner1"]), lanes: { a1: { effective: "auto" } },
      setStage: { data: { ok: true, to_stage_slug: "engaged", from_stage_slug: "new" } }, clients: { slug: "engaged" },
      rpcCalls: [], queryFilters: [],
    };
    const res = await runEventActs(mockDb(cfg), event, [journeyAuto()]);
    const rec = res.records[0];
    expect(rec.adapter_kind).toBe("native");
    expect(rec.outcome).toBe("executed");
    expect(res.by_outcome.executed).toBe(1);
    expect(res.persist_failures).toEqual([]);

    // the ledger was advanced (a second paige_record_act_execution carrying _dispatched_at + a terminal _settled_at)
    const advances = cfg.rpcCalls.filter((c) => c.fn === "paige_record_act_execution");
    expect(advances).toHaveLength(2);                 // phase-4 accepted, phase-5 executed
    expect(advances[0].args._outcome).toBe("accepted_for_execution");
    expect(advances[1].args._outcome).toBe("executed");
    expect(advances[1].args._settled_at).toBeTruthy();

    // set_journey_stage carried the act's correlation ref
    const sjs = cfg.rpcCalls.find((c) => c.fn === "set_journey_stage");
    expect(sjs?.args._source_event).toBe(rec.correlation_ref);

    // receipt + owner Rail filed on the confirmed executed
    expect(cfg.rpcCalls.some((c) => c.fn === "record_capability_run")).toBe(true);
    const receipt = cfg.rpcCalls.find((c) => c.fn === "record_capability_run");
    expect(receipt?.args._capability_key).toBe("crm_advance_journey_stage");
    expect(receipt?.args._outcome).toBe("capability_succeeded");
    expect(receipt?.args._actor_id).toBe("owner1");
    expect(cfg.rpcCalls.some((c) => c.fn === "record_rail_event")).toBe(true);
  });

  it("IDEMPOTENCY FENCE: a re-drain whose phase-4 row is already terminal (executed) does NOT re-dispatch", async () => {
    const cfg: DbConfig = {
      acts: journeyActs, activeMembers: new Set(["t1:owner1"]), lanes: { a1: { effective: "auto" } },
      setStage: { data: { ok: true, to_stage_slug: "engaged" } }, clients: { slug: "engaged" },
      persistOutcomeOverride: { act1: "executed" },   // the monotonic RPC hands back the already-final row
      rpcCalls: [], queryFilters: [],
    };
    const res = await runEventActs(mockDb(cfg), event, [journeyAuto()]);
    expect(res.records[0].outcome).toBe("executed");                              // reports the persisted truth
    expect(cfg.rpcCalls.some((c) => c.fn === "set_journey_stage")).toBe(false);   // NEVER a second write
    expect(cfg.rpcCalls.some((c) => c.fn === "record_capability_run")).toBe(false); // no duplicate receipt
  });

  it("an UNCONFIRMED change → ambiguous: advanced NOT settled, and NO receipt/Rail (never a hoped-for success)", async () => {
    const cfg: DbConfig = {
      acts: journeyActs, activeMembers: new Set(["t1:owner1"]), lanes: { a1: { effective: "auto" } },
      setStage: { data: { ok: true, to_stage_slug: "engaged" } }, clients: { slug: "new" }, transitionExists: false,
      rpcCalls: [], queryFilters: [],
    };
    const res = await runEventActs(mockDb(cfg), event, [journeyAuto()]);
    expect(res.records[0].outcome).toBe("ambiguous");
    const advance = cfg.rpcCalls.filter((c) => c.fn === "paige_record_act_execution")[1];
    expect(advance.args._outcome).toBe("ambiguous");
    expect(advance.args._settled_at).toBeNull();       // ambiguous stays advanceable (reconcilable)
    expect(cfg.rpcCalls.some((c) => c.fn === "record_capability_run")).toBe(false);
  });

  it("a definitive dispatch FAILURE → failed (settled), no receipt/Rail", async () => {
    const cfg: DbConfig = {
      acts: journeyActs, activeMembers: new Set(["t1:owner1"]), lanes: { a1: { effective: "auto" } },
      setStage: { error: { message: "Unknown journey stage: engaged" } },
      rpcCalls: [], queryFilters: [],
    };
    const res = await runEventActs(mockDb(cfg), event, [journeyAuto()]);
    expect(res.records[0].outcome).toBe("failed");
    const advance = cfg.rpcCalls.filter((c) => c.fn === "paige_record_act_execution")[1];
    expect(advance.args._outcome).toBe("failed");
    expect(advance.args._settled_at).toBeTruthy();
    expect(cfg.rpcCalls.some((c) => c.fn === "record_capability_run")).toBe(false);
  });

  it("a phase-5 ADVANCE write failure → persist_failures (fail closed), no receipt (the retry re-confirms idempotently)", async () => {
    const cfg: DbConfig = {
      acts: journeyActs, activeMembers: new Set(["t1:owner1"]), lanes: { a1: { effective: "auto" } },
      setStage: { data: { ok: true, to_stage_slug: "engaged" } }, clients: { slug: "engaged" },
      failAdvance: true,   // the phase-5 advance (carrying _dispatched_at) fails to persist
      rpcCalls: [], queryFilters: [],
    };
    const res = await runEventActs(mockDb(cfg), event, [journeyAuto()]);
    expect(res.persist_failures).toEqual(["act1"]);
    expect(cfg.rpcCalls.some((c) => c.fn === "record_capability_run")).toBe(false); // never a receipt on an unrecorded terminal
  });

  it("a FAILED phase-4 pre-dispatch write → NEVER dispatched in phase 5 (no native effect without a durable record, correction #3)", async () => {
    const cfg: DbConfig = {
      acts: journeyActs, activeMembers: new Set(["t1:owner1"]), lanes: { a1: { effective: "auto" } },
      setStage: { data: { ok: true, to_stage_slug: "engaged" } }, clients: { slug: "engaged" },
      failPreDispatch: true,   // the accepted_for_execution record never persisted
      rpcCalls: [], queryFilters: [],
    };
    const res = await runEventActs(mockDb(cfg), event, [journeyAuto()]);
    expect(res.persist_failures).toEqual(["act1"]);
    expect(cfg.rpcCalls.some((c) => c.fn === "set_journey_stage")).toBe(false); // no dispatch without a durable pre-dispatch record
    expect(cfg.rpcCalls.some((c) => c.fn === "record_capability_run")).toBe(false);
  });

  it("a native journey act on a CONFIRM lane holds for approval — never dispatches (lane gates before phase 5)", async () => {
    const cfg: DbConfig = {
      acts: journeyActs, activeMembers: new Set(["t1:owner1"]), lanes: { a1: { effective: "confirm" } },
      rpcCalls: [], queryFilters: [],
    };
    const res = await runEventActs(mockDb(cfg), event, [journeyAuto()]);
    expect(res.records[0].outcome).toBe("approval_pending");
    expect(cfg.rpcCalls.some((c) => c.fn === "set_journey_stage")).toBe(false);
  });
});

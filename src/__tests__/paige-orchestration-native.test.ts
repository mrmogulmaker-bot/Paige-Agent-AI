/**
 * Layer C · C2 — the NATIVE synchronous auto-execute vertical, availability resolved THROUGH the Gateway.
 *
 * Part A: the native adapter (`native-adapter.ts`) — dispatch calls set_journey_stage and RETURNS the
 *   terminal outcome after an independent canonical confirm (§32); a no-op is reported honestly as
 *   `already_at_requested_stage` (never a newly advanced journey); a RAISE is terminal failed; a throw is
 *   ambiguous; an unconfirmed change is ambiguous unless the act's OWN correlation transition proves it.
 *   The adapter declares NO availability — the Gateway owns it.
 * Part B: the engine (`engine.ts`) — a native act's availability is resolved THROUGH the canonical Gateway
 *   seam (resolveNativeCapabilityStatus) before the governed decision; a tier-ineligible actor is refused
 *   and NEVER dispatched. Phase 5 is READ-CURRENT-FIRST: a re-drain of a terminal row adopts it (no second
 *   dispatch); an `ambiguous` row is RECONCILED by readback (never blind re-dispatch); an absent row writes
 *   the durable accepted_for_execution record before the domain write. Receipt fires on executed; the owner
 *   Rail is suppressed on an idempotent no-op.
 * Part C: the Gateway resolver (`gatherer.ts`) — resolves live / needs_approval / not_for_tier from the
 *   real (tier, owner-ops role, tool lane) with an explicit actor + tenant; an infra error returns {ok:false}.
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
import { resolveNativeCapabilityStatus } from "../../supabase/functions/_shared/paige-capability-status/gatherer.ts";

// ── A fake supabase-js surface for the native adapter + engine + Gateway (chainable, thenable). ─────────
type SetStageResult = { data?: unknown; error?: { message?: string } | null; throws?: boolean };
type DbConfig = {
  // native journey reads (adapter dispatch/readback)
  clients?: { slug?: string | null; error?: boolean; missing?: boolean };
  transitionExists?: boolean;
  transitionsError?: boolean;
  setStage?: SetStageResult;
  // Gateway resolution (engine phase 3.5 / Part C)
  actorTier?: string;                 // get_actor_access.tier (default "tenant")
  actorRoles?: string[];              // user_roles (default ["admin"] → owner-ops eligible)
  toolLane?: "auto" | "confirm" | "off"; // resolve_tool_autonomy (default "auto" → availability live)
  gatewayError?: "tier" | "role" | "lane"; // simulate an infra error in a Gateway ingredient
  // ledger current state (phase 5 readActOutcome)
  currentActOutcome?: string | null;  // paige_act_executions.outcome for the act (default null = absent)
  currentActReadError?: boolean;
  // engine C1 surfaces
  acts?: Record<string, Array<{ id: string; position: number; action_kind: string | null; tool_key: string | null; config: unknown }>>;
  activeMembers?: Set<string>;
  lanes?: Record<string, { effective: string }>; // resolve_automation_autonomy
  persistOutcomeOverride?: Record<string, string>;
  failAdvance?: boolean;              // fail a phase-5 ledger advance (a call carrying _dispatched_at)
  failAcceptedWrite?: boolean;        // fail the phase-5 accepted pre-dispatch write (_dispatched_at null)
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
        } else if (table === "paige_act_executions") {
          if (cfg.currentActReadError) error = { message: "act_read_failed" };
          else data = cfg.currentActOutcome == null ? [] : [{ outcome: cfg.currentActOutcome }];
        } else if (table === "user_roles") {
          if (cfg.gatewayError === "role") error = { message: "user_roles_read_failed" };
          else data = (cfg.actorRoles ?? ["admin"]).map((role) => ({ role }));
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
      if (fn === "get_actor_access") {
        if (cfg.gatewayError === "tier") return { data: null, error: { message: "get_actor_access_failed" } };
        return { data: { tier: cfg.actorTier ?? "tenant" }, error: null };
      }
      if (fn === "resolve_tool_autonomy") {
        if (cfg.gatewayError === "lane") return { data: null, error: { message: "resolve_tool_autonomy_failed" } };
        return { data: cfg.toolLane ?? "auto", error: null };
      }
      if (fn === "resolve_automation_autonomy") {
        return { data: cfg.lanes?.[args._automation_id as string] ?? { effective: "off" }, error: null };
      }
      if (fn === "paige_record_act_execution") {
        const actId = args._act_id as string;
        const isAdvance = args._dispatched_at != null;
        if (cfg.failAcceptedWrite && !isAdvance && args._outcome === "accepted_for_execution") return { data: null, error: { message: "accepted_write_failed" } };
        if (cfg.failAdvance && isAdvance) return { data: null, error: { message: "advance_write_failed" } };
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

describe("native adapter — routing & capability (availability is NOT declared here — the Gateway owns it)", () => {
  it("routes crm_advance_journey_stage to the native adapter (no native prefix, still native)", () => {
    expect(isNativeActionKind("crm_advance_journey_stage")).toBe(true);
    expect(isNativeActionKind("n8n_run_workflow")).toBe(false);
    expect(isNativeActionKind(null)).toBe(false);
    expect(resolveAdapterKind("crm_advance_journey_stage")).toBe("native");
    expect(adapterForAction("crm_advance_journey_stage")).toBe(nativeAdapter);
  });

  it("resolveCapability returns the mutating journey capability with NO availability literal (Gateway resolves it)", () => {
    const cap = nativeAdapter.resolveCapability("crm_advance_journey_stage");
    expect(cap).toEqual({ id: "crm_advance_journey_stage", effect: "mutate", outcomeChannel: "paige_act_executions" });
    expect((cap as Record<string, unknown>).availability).toBeUndefined();
    expect(nativeAdapter.resolveCapability("frobnicate")).toBeNull();
  });

  it("buildGovernedInputs threads the EXPLICIT (Gateway-resolved) availability; absent → unknown", () => {
    const live = buildGovernedInputs({
      tenantId: "t1", personUserId: "u1", effectiveLane: "auto",
      capability: { id: "crm_advance_journey_stage", effect: "mutate", outcomeChannel: "paige_act_executions" },
      actConfig: {}, availability: "live",
    });
    expect((live.capability as { availability?: string }).availability).toBe("live");
    const dflt = buildGovernedInputs({
      tenantId: "t1", personUserId: "u1", effectiveLane: "auto",
      capability: { id: "n8n_run_workflow", effect: "mutate", outcomeChannel: "paige_act_executions" },
      actConfig: {},
    });
    expect((dflt.capability as { availability?: string }).availability).toBe("unknown");
  });
});

describe("native adapter — dispatch outcomes (§32 confirm, §13 honest, no blind retry)", () => {
  it("changed + canonical slug == target → executed (confirmed via clients.journey_stage_slug)", async () => {
    const cfg: DbConfig = { setStage: { data: { ok: true, to_stage_slug: "engaged", from_stage_slug: "new" } }, clients: { slug: "engaged" }, rpcCalls: [], queryFilters: [] };
    const res = await nativeAdapter.dispatch!(baseInput(cfg));
    expect(res.outcome).toBe("executed");
    expect((res.detail as { confirmed_via?: string })?.confirmed_via).toBe("clients.journey_stage_slug");
    const call = cfg.rpcCalls.find((c) => c.fn === "set_journey_stage");
    expect(call?.args._source_event).toBe("corr-1");
    expect(call?.args._contact_id).toBe("c1");
    expect(call?.args._stage_slug).toBe("engaged");
  });

  it("no-op (already on target) → executed, reported as already_at_requested_stage (never a new advance), no canonical read", async () => {
    const cfg: DbConfig = { setStage: { data: { ok: true, unchanged: true, stage_slug: "engaged" } }, rpcCalls: [], queryFilters: [] };
    const res = await nativeAdapter.dispatch!(baseInput(cfg));
    expect(res.outcome).toBe("executed");
    expect((res.detail as { already_at_requested_stage?: boolean })?.already_at_requested_stage).toBe(true);
    expect((res.detail as { unchanged?: boolean })?.unchanged).toBeUndefined();
    expect(cfg.queryFilters.some((query) => query.table === "clients")).toBe(false);
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
    expect(cfg.queryFilters.some((query) => query.table === "paige_journey_stage_transitions")).toBe(true);
  });

  it("changed, canonical slug != target BUT our correlation transition exists → executed (reconciled)", async () => {
    const cfg: DbConfig = { setStage: { data: { ok: true, to_stage_slug: "engaged" } }, clients: { slug: "closed_won" }, transitionExists: true, rpcCalls: [], queryFilters: [] };
    const res = await nativeAdapter.dispatch!(baseInput(cfg));
    expect(res.outcome).toBe("executed");
    expect((res.detail as { confirmed_via?: string })?.confirmed_via).toBe("transition_correlation");
    const tq = cfg.queryFilters.find((query) => query.table === "paige_journey_stage_transitions");
    expect(tq?.filters.source_event).toBe("corr-1");
    expect(tq?.filters.to_stage_slug).toBe("engaged");
  });

  it("changed, canonical read ERRORS, correlation transition exists → executed; no transition → ambiguous", async () => {
    const ok: DbConfig = { setStage: { data: { ok: true, to_stage_slug: "engaged" } }, clients: { error: true }, transitionExists: true, rpcCalls: [], queryFilters: [] };
    expect((await nativeAdapter.dispatch!(baseInput(ok))).outcome).toBe("executed");
    const no: DbConfig = { setStage: { data: { ok: true, to_stage_slug: "engaged" } }, clients: { error: true }, transitionExists: false, rpcCalls: [], queryFilters: [] };
    expect((await nativeAdapter.dispatch!(baseInput(no))).outcome).toBe("ambiguous");
  });

  it("readback (the reconcile path) confirms WITHOUT calling set_journey_stage", async () => {
    const cfg: DbConfig = { clients: { slug: "engaged" }, rpcCalls: [], queryFilters: [] };
    const res = await nativeAdapter.readback!(null, baseInput(cfg));
    expect(res.outcome).toBe("executed");
    expect(cfg.rpcCalls.some((c) => c.fn === "set_journey_stage")).toBe(false); // NEVER re-dispatches
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
});

// ═══ Part B — engine phase-3.5 (Gateway) + phase-5 (read-first) integration ══════════════════════════

const event: ClaimedEvent = {
  event_id: "e1", tenant_id: "t1", event_key: "contact.created",
  subject_table: "clients", subject_id: "c1", payload: { source: "web_form" },
};
const journeyAuto = (over: Partial<AutomationRow> = {}): AutomationRow => ({
  id: "a1", name: "Welcome journey", granted_lane: "auto", conditions: [], created_by: "owner1", state: "live", ...over,
});
const journeyActs = { a1: [{ id: "act1", position: 1, action_kind: "crm_advance_journey_stage", tool_key: null, config: { stage_slug: "engaged" } }] };
// The full happy-path config: an eligible actor (tenant tier + admin role), an auto tool lane (→ Gateway
// availability "live"), an auto automation lane, and the journey advancing cleanly.
const happy = (over: Partial<DbConfig> = {}): DbConfig => ({
  acts: journeyActs, activeMembers: new Set(["t1:owner1"]), lanes: { a1: { effective: "auto" } },
  actorTier: "tenant", actorRoles: ["admin"], toolLane: "auto",
  setStage: { data: { ok: true, to_stage_slug: "engaged", from_stage_slug: "new" } }, clients: { slug: "engaged" },
  currentActOutcome: null, rpcCalls: [], queryFilters: [], ...over,
});

describe("runEventActs — native auto-execute: Gateway availability gate + phase-5 read-first", () => {
  it("eligible actor + live availability + auto lane → EXECUTED, dispatch stamped by correlation + receipt + Rail", async () => {
    const cfg = happy();
    const res = await runEventActs(mockDb(cfg), event, [journeyAuto()]);
    const rec = res.records[0];
    expect(rec.adapter_kind).toBe("native");
    expect(rec.outcome).toBe("executed");
    expect(res.by_outcome.executed).toBe(1);
    expect(res.persist_failures).toEqual([]);

    // the Gateway was consulted (get_actor_access + resolve_tool_autonomy) BEFORE dispatch
    expect(cfg.rpcCalls.some((c) => c.fn === "get_actor_access")).toBe(true);
    expect(cfg.rpcCalls.some((c) => c.fn === "resolve_tool_autonomy" && c.args._tool_key === "crm_advance_journey_stage")).toBe(true);

    // phase 5 wrote a durable accepted_for_execution record BEFORE dispatch, then advanced to executed
    const ledgerWrites = cfg.rpcCalls.filter((c) => c.fn === "paige_record_act_execution");
    expect(ledgerWrites.some((c) => c.args._outcome === "accepted_for_execution" && c.args._dispatched_at == null)).toBe(true);
    const advance = ledgerWrites.find((c) => c.args._dispatched_at != null);
    expect(advance?.args._outcome).toBe("executed");
    expect(advance?.args._settled_at).toBeTruthy();

    // set_journey_stage carried the act's correlation ref; receipt + Rail filed on the confirmed executed
    expect(cfg.rpcCalls.find((c) => c.fn === "set_journey_stage")?.args._source_event).toBe(rec.correlation_ref);
    const receipt = cfg.rpcCalls.find((c) => c.fn === "record_capability_run");
    expect(receipt?.args._capability_key).toBe("crm_advance_journey_stage");
    expect(receipt?.args._actor_id).toBe("owner1");
    expect(cfg.rpcCalls.some((c) => c.fn === "record_rail_event")).toBe(true);
  });

  it("a TIER-INELIGIBLE actor (client) → refused at the Gateway availability gate, NEVER dispatched", async () => {
    const cfg = happy({ actorTier: "client" });
    const res = await runEventActs(mockDb(cfg), event, [journeyAuto()]);
    expect(res.records[0].outcome).toBe("refused_authority");
    expect(cfg.rpcCalls.some((c) => c.fn === "set_journey_stage")).toBe(false); // no dispatch on a refused act
    // no execute plan → not written by phase 5 as accepted; the refusal was recorded by phase 4
    expect(cfg.rpcCalls.some((c) => c.fn === "paige_record_act_execution" && c.args._outcome === "refused_authority")).toBe(true);
  });

  it("a Gateway role/lane INFRA error → subscriber_retry, records NOTHING (never a false verdict)", async () => {
    for (const gatewayError of ["lane", "role"] as const) {
      const cfg = happy({ gatewayError });
      const res = await runEventActs(mockDb(cfg), event, [journeyAuto()]);
      expect(res.subscriber_retry, gatewayError).toEqual(["a1"]);
      expect(res.records, gatewayError).toHaveLength(0);
      expect(cfg.rpcCalls.some((c) => c.fn === "set_journey_stage"), gatewayError).toBe(false);
    }
  });

  it("a tier-read error FAILS CLOSED to client → not_for_tier → refused_authority (safe refuse, never dispatched)", async () => {
    // getActorTier absorbs a get_actor_access error and returns "client" (never widens access), so the
    // Gateway resolves not_for_tier and the act is refused — a safe fail-closed, not a silent execute.
    const cfg = happy({ gatewayError: "tier" });
    const res = await runEventActs(mockDb(cfg), event, [journeyAuto()]);
    expect(res.records[0].outcome).toBe("refused_authority");
    expect(res.subscriber_retry).toEqual([]);
    expect(cfg.rpcCalls.some((c) => c.fn === "set_journey_stage")).toBe(false);
  });

  it("IDEMPOTENCY: a re-drain whose ledger row is already terminal (executed) adopts it, does NOT re-dispatch", async () => {
    const cfg = happy({ currentActOutcome: "executed" });   // phase-5 read sees a final row
    const res = await runEventActs(mockDb(cfg), event, [journeyAuto()]);
    expect(res.records[0].outcome).toBe("executed");
    expect(cfg.rpcCalls.some((c) => c.fn === "set_journey_stage")).toBe(false); // NEVER a second write
    expect(cfg.rpcCalls.some((c) => c.fn === "record_capability_run")).toBe(false);
  });

  it("RECONCILE: a re-drain whose ledger row is `ambiguous` confirms by readback — NEVER a blind re-dispatch", async () => {
    // The row is ambiguous; the canonical slug now matches → readback confirms executed, WITHOUT set_journey_stage.
    const cfg = happy({ currentActOutcome: "ambiguous", clients: { slug: "engaged" } });
    const res = await runEventActs(mockDb(cfg), event, [journeyAuto()]);
    expect(res.records[0].outcome).toBe("executed");
    expect(cfg.rpcCalls.some((c) => c.fn === "set_journey_stage")).toBe(false); // reconcile does NOT re-dispatch
    const advance = cfg.rpcCalls.filter((c) => c.fn === "paige_record_act_execution").find((c) => c.args._dispatched_at != null);
    expect(advance?.args._outcome).toBe("executed");
  });

  it("RECONCILE inconclusive: `ambiguous` row still unconfirmed → stays ambiguous, no dispatch, no receipt", async () => {
    const cfg = happy({ currentActOutcome: "ambiguous", clients: { slug: "new" }, transitionExists: false });
    const res = await runEventActs(mockDb(cfg), event, [journeyAuto()]);
    expect(res.records[0].outcome).toBe("ambiguous");
    expect(cfg.rpcCalls.some((c) => c.fn === "set_journey_stage")).toBe(false);
    expect(cfg.rpcCalls.some((c) => c.fn === "record_capability_run")).toBe(false);
  });

  it("an UNCONFIRMED first-drain change → ambiguous: advanced NOT settled, and NO receipt/Rail", async () => {
    const cfg = happy({ clients: { slug: "new" }, transitionExists: false });
    const res = await runEventActs(mockDb(cfg), event, [journeyAuto()]);
    expect(res.records[0].outcome).toBe("ambiguous");
    const advance = cfg.rpcCalls.filter((c) => c.fn === "paige_record_act_execution").find((c) => c.args._dispatched_at != null);
    expect(advance?.args._outcome).toBe("ambiguous");
    expect(advance?.args._settled_at).toBeNull(); // ambiguous stays advanceable
    expect(cfg.rpcCalls.some((c) => c.fn === "record_capability_run")).toBe(false);
  });

  it("a definitive dispatch FAILURE → failed (settled), no receipt/Rail", async () => {
    const cfg = happy({ setStage: { error: { message: "Unknown journey stage: engaged" } } });
    const res = await runEventActs(mockDb(cfg), event, [journeyAuto()]);
    expect(res.records[0].outcome).toBe("failed");
    const advance = cfg.rpcCalls.filter((c) => c.fn === "paige_record_act_execution").find((c) => c.args._dispatched_at != null);
    expect(advance?.args._outcome).toBe("failed");
    expect(advance?.args._settled_at).toBeTruthy();
    expect(cfg.rpcCalls.some((c) => c.fn === "record_capability_run")).toBe(false);
  });

  it("a NO-OP (already at requested stage) → executed + receipt, but the owner Rail is SUPPRESSED (never a new advance)", async () => {
    const cfg = happy({ setStage: { data: { ok: true, unchanged: true, stage_slug: "engaged" } } });
    const res = await runEventActs(mockDb(cfg), event, [journeyAuto()]);
    expect(res.records[0].outcome).toBe("executed");
    const receipt = cfg.rpcCalls.find((c) => c.fn === "record_capability_run");
    expect(receipt).toBeTruthy();                                     // receipt IS filed (honest)
    expect((receipt?.args._detail as Record<string, unknown>)?.already_at_requested_stage).toBe(true);
    expect(cfg.rpcCalls.some((c) => c.fn === "record_rail_event")).toBe(false); // Rail SUPPRESSED on a no-op
  });

  it("a phase-5 ACCEPTED pre-dispatch write failure → persist_failures, NEVER dispatched (no effect without a durable record)", async () => {
    const cfg = happy({ failAcceptedWrite: true });
    const res = await runEventActs(mockDb(cfg), event, [journeyAuto()]);
    expect(res.persist_failures).toEqual(["act1"]);
    expect(cfg.rpcCalls.some((c) => c.fn === "set_journey_stage")).toBe(false); // no dispatch before a durable record
  });

  it("a phase-5 ADVANCE write failure → persist_failures (fail closed), no receipt", async () => {
    const cfg = happy({ failAdvance: true });
    const res = await runEventActs(mockDb(cfg), event, [journeyAuto()]);
    expect(res.persist_failures).toEqual(["act1"]);
    expect(cfg.rpcCalls.some((c) => c.fn === "record_capability_run")).toBe(false);
  });

  it("a native journey act on a CONFIRM automation lane holds for approval — never dispatches (lane gates before phase 5)", async () => {
    const cfg = happy({ lanes: { a1: { effective: "confirm" } } });
    const res = await runEventActs(mockDb(cfg), event, [journeyAuto()]);
    expect(res.records[0].outcome).toBe("approval_pending");
    expect(cfg.rpcCalls.some((c) => c.fn === "set_journey_stage")).toBe(false);
    expect(cfg.rpcCalls.some((c) => c.fn === "get_actor_access")).toBe(false); // no Gateway resolve on a held lane
  });
});

// ═══ Part C — the Gateway resolver (gatherer.ts) ═════════════════════════════════════════════════════

describe("resolveNativeCapabilityStatus — availability resolved THROUGH the canonical Gateway", () => {
  const call = (cfg: DbConfig) => resolveNativeCapabilityStatus(mockDb(cfg), { actorUserId: "u1", tenantId: "t1", actionKind: "crm_advance_journey_stage" });

  it("eligible actor + auto tool lane → live", async () => {
    const r = await call({ actorTier: "tenant", actorRoles: ["admin"], toolLane: "auto", rpcCalls: [], queryFilters: [] });
    expect(r.ok && r.status.availability).toBe("live");
  });

  it("eligible actor + confirm tool lane → needs_approval", async () => {
    const r = await call({ actorTier: "tenant", actorRoles: ["coach"], toolLane: "confirm", rpcCalls: [], queryFilters: [] });
    expect(r.ok && r.status.availability).toBe("needs_approval");
  });

  it("client tier → not_for_tier; non-owner-ops role → not_for_tier", async () => {
    const client = await call({ actorTier: "client", actorRoles: ["admin"], toolLane: "auto", rpcCalls: [], queryFilters: [] });
    expect(client.ok && client.status.availability).toBe("not_for_tier");
    const noRole = await call({ actorTier: "tenant", actorRoles: [], toolLane: "auto", rpcCalls: [], queryFilters: [] });
    expect(noRole.ok && noRole.status.availability).toBe("not_for_tier");
  });

  it("a role/lane infra error returns {ok:false} (retryable) — never a fabricated verdict", async () => {
    for (const gatewayError of ["lane", "role"] as const) {
      const r = await call({ gatewayError, rpcCalls: [], queryFilters: [] });
      expect(r.ok, gatewayError).toBe(false);
    }
  });

  it("a tier-read error fails closed through getActorTier → client → not_for_tier (a safe refuse, not a false live)", async () => {
    const r = await call({ gatewayError: "tier", actorRoles: ["admin"], toolLane: "auto", rpcCalls: [], queryFilters: [] });
    expect(r.ok && r.status.availability).toBe("not_for_tier");
  });

  it("an unbound action_kind returns {ok:false} (never silently available)", async () => {
    const r = await resolveNativeCapabilityStatus(mockDb({ rpcCalls: [], queryFilters: [] }), { actorUserId: "u1", tenantId: "t1", actionKind: "frobnicate" });
    expect(r.ok).toBe(false);
  });
});

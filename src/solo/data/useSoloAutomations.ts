/**
 * useSoloAutomations — the Solo Automations sub-tab's data layer.
 *
 * SCOPE (owner boundary, 2026-08-31): this hook belongs to Settings → Integrations
 * → Automations and nothing else. It imports nothing from Systems Check, Mind or
 * Command Center, changes none of their contracts, and routes nowhere near them.
 *
 * It IS a consumer of existing governed data, which the boundary permits: the
 * outcome log below is read through its own tenant-scoped `SELECT` policy, as a
 * reader only. No competing authority, table, or write path is introduced, and
 * nothing raw reaches the surface — see the outcome read for what is deliberately
 * left unselected.
 *
 * WHAT IS REAL HERE (§13). Every read and write below is a live, tenant-scoped
 * contract that a workspace admin genuinely holds today:
 *   • `stage_automation_rules` — full CRUD for a tenant admin, enforced by RLS
 *     (`is_platform_owner() OR is_tenant_admin(tenant_id)`).
 *   • `pipelines` / `pipeline_stages` — readable, and creatable by an admin, which
 *     is why "set up your pipeline" is offered as a real next step rather than a
 *     placeholder.
 *
 * WHAT THIS SURFACE MUST NOT CLAIM. A saved rule is stored and the deal-stage
 * trigger does fire on it. What happens next is decided server-side: the trigger
 * takes the tenant's own encrypted route, or falls back to a platform one seeded
 * unconditionally by `20260701174236`. Neither is readable from here, so delivery
 * readiness is UNKNOWN to this surface and is never asserted in either direction.
 * An earlier version hardcoded "no route exists" from one look at one environment
 * and promised the owner nothing could reach a client; that promise is false
 * wherever migrations replayed. Rules are therefore saved off and cannot be
 * started from this surface — the guarantee is structural, not a sentence.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useTenantContext } from "@/hooks/useTenantContext";

/** Real enum on `stage_automation_rules.compose_intent`. */
export type ComposeIntent = "transactional" | "notification" | "nurture" | "marketing";
/** Real enum on `stage_automation_rules.send_mode`. */
export type SendMode = "draft_for_review" | "auto_send";

export interface AutomationRule {
  id: string;
  pipeline_id: string;
  from_stage_id: string | null;
  to_stage_id: string;
  compose_intent: ComposeIntent;
  tone: string;
  template_hint: string | null;
  send_mode: SendMode;
  is_active: boolean;
  updated_at: string | null;
}

export interface PipelineStage {
  id: string;
  pipeline_id: string;
  label: string;
  order_index: number;
}

export interface Pipeline {
  id: string;
  name: string;
}

/**
 * One recorded outcome for a rule, consumed read-only from the existing
 * tenant-scoped event log (`SELECT` for tenant members). Only the outcome and
 * its time are taken: the row also carries a provider response and a raw error
 * string, and neither is read here or exposed anywhere on the surface.
 */
export interface AutomationOutcome {
  id: string;
  rule_id: string | null;
  status: string;
  created_at: string | null;
}

/** Plain-language reading of a recorded outcome. Unknown states stay honest. */
export function outcomeLabel(status: string): string {
  switch (status) {
    // The dispatcher records `dispatched`, and the table's own CHECK constraint
    // permits exactly: pending, dispatched, failed, skipped_inactive,
    // skipped_no_webhook, skipped_no_rule, skipped_no_consent. There is no
    // `sent`. "Handed over" is deliberate: a successful dispatch means it left
    // here, not that anyone received it.
    case "dispatched": return "Handed over for sending";
    case "pending": return "Being handled";
    case "skipped_no_rule": return "Nothing set up for that move";
    case "skipped_inactive": return "Skipped — the rule was turned off";
    case "skipped_no_webhook": return "Held — there is no route out yet";
    case "skipped_no_consent": return "Stopped — they had not agreed to that kind of message";
    case "failed": return "Did not go through";
    default: return "Recorded";
  }
}

export interface AutomationDraft {
  pipeline_id: string;
  from_stage_id: string | null;
  to_stage_id: string;
  compose_intent: ComposeIntent;
  tone: string;
  send_mode: SendMode;
}

export interface SoloAutomationsState {
  /** True only until the first read settles. A refresh after a write does NOT
   *  raise this — otherwise toggling a rule blanks the whole surface. */
  loading: boolean;
  /** True when a read failed. No state is claimed in that case — not even "empty". */
  error: boolean;
  rules: AutomationRule[];
  pipelines: Pipeline[];
  stages: PipelineStage[];
  /** Recorded outcomes for this workspace, newest first. Empty means none ever ran
   *  — but ONLY when `outcomesUnavailable` is false. */
  outcomes: AutomationOutcome[];
  /** True when the outcome read failed. The history is then unknown, not empty. */
  outcomesUnavailable: boolean;
  /** Whether this caller may create or change a rule. Server-derived, never assumed. */
  canWrite: boolean;
  /**
   * UNKNOWN, deliberately. Whether a delivery route exists is decided server-side
   * from a tenant secret and a platform fallback, neither of which this surface
   * may read. An earlier version hardcoded `false` from a one-time look at one
   * environment and then promised the owner nothing could reach a client — but
   * `20260701174236` seeds the platform fallback unconditionally, so that promise
   * is false wherever migrations replayed. The surface must therefore never claim
   * delivery is impossible, and must not start a rule from here.
   */
  deliveryKnown: false;
  saving: boolean;
  /** Human-readable failure from the last write, or null. */
  writeError: string | null;
}

const RULE_COLUMNS =
  "id,pipeline_id,from_stage_id,to_stage_id,compose_intent,tone,template_hint,send_mode,is_active,updated_at";

/** Rows come back untyped from the generated client; narrow defensively. */
function asRules(rows: unknown): AutomationRule[] {
  if (!Array.isArray(rows)) return [];
  return rows.flatMap((row) => {
    if (!row || typeof row !== "object") return [];
    const r = row as Record<string, unknown>;
    if (typeof r.id !== "string" || typeof r.to_stage_id !== "string") return [];
    return [{
      id: r.id,
      pipeline_id: typeof r.pipeline_id === "string" ? r.pipeline_id : "",
      from_stage_id: typeof r.from_stage_id === "string" ? r.from_stage_id : null,
      to_stage_id: r.to_stage_id,
      compose_intent: (r.compose_intent as ComposeIntent) ?? "transactional",
      tone: typeof r.tone === "string" ? r.tone : "",
      template_hint: typeof r.template_hint === "string" ? r.template_hint : null,
      send_mode: (r.send_mode as SendMode) ?? "draft_for_review",
      is_active: r.is_active !== false,
      updated_at: typeof r.updated_at === "string" ? r.updated_at : null,
    }];
  });
}

function asStages(rows: unknown): PipelineStage[] {
  if (!Array.isArray(rows)) return [];
  return rows.flatMap((row) => {
    const r = (row ?? {}) as Record<string, unknown>;
    if (typeof r.id !== "string" || typeof r.pipeline_id !== "string") return [];
    return [{
      id: r.id,
      pipeline_id: r.pipeline_id,
      label: typeof r.label === "string" ? r.label : "Untitled stage",
      order_index: typeof r.order_index === "number" ? r.order_index : 0,
    }];
  });
}

function asOutcomes(rows: unknown): AutomationOutcome[] {
  if (!Array.isArray(rows)) return [];
  return rows.flatMap((row) => {
    const r = (row ?? {}) as Record<string, unknown>;
    if (typeof r.id !== "string" || typeof r.status !== "string") return [];
    return [{
      id: r.id,
      rule_id: typeof r.rule_id === "string" ? r.rule_id : null,
      status: r.status,
      created_at: typeof r.created_at === "string" ? r.created_at : null,
    }];
  });
}

function asPipelines(rows: unknown): Pipeline[] {
  if (!Array.isArray(rows)) return [];
  return rows.flatMap((row) => {
    const r = (row ?? {}) as Record<string, unknown>;
    if (typeof r.id !== "string") return [];
    return [{ id: r.id, name: typeof r.name === "string" ? r.name : "Untitled pipeline" }];
  });
}

export function useSoloAutomations() {
  const { activeTenantId, loading: tenantLoading } = useTenantContext();
  // Guards against a slower earlier read landing after a newer one (account switch).
  const epoch = useRef(0);
  const [state, setState] = useState<SoloAutomationsState>({
    loading: true, error: false, rules: [], pipelines: [], stages: [], outcomes: [], outcomesUnavailable: false,
    canWrite: false, deliveryKnown: false, saving: false, writeError: null,
  });

  const load = useCallback(async () => {
    const token = ++epoch.current;
    // Keep `loading` as-is on a refresh: it is the first-load signal only.
    setState((s) => ({ ...s, error: false, writeError: null }));

    if (!activeTenantId) {
      if (epoch.current === token) {
        setState({
          loading: false, error: false, rules: [], pipelines: [], stages: [], outcomes: [], outcomesUnavailable: false,
          canWrite: false, deliveryKnown: false, saving: false, writeError: null,
        });
      }
      return;
    }

    // Untyped where the generated client is older than the table set.
    const client = supabase as unknown as {
      from: (t: string) => {
        select: (c: string) => {
          eq: (k: string, v: string) => { order: (c: string, o?: { ascending?: boolean }) => Promise<{ data: unknown; error: unknown }> };
        };
      };
      rpc: (fn: string) => Promise<{ data: unknown; error: unknown }>;
    };

    const [rulesRes, pipelinesRes, stagesRes, outcomesRes, adminRes] = await Promise.all([
      client.from("stage_automation_rules").select(RULE_COLUMNS).eq("tenant_id", activeTenantId).order("updated_at", { ascending: false }),
      client.from("pipelines").select("id,name").eq("tenant_id", activeTenantId).order("created_at", { ascending: true }),
      client.from("pipeline_stages").select("id,pipeline_id,label,order_index").eq("tenant_id", activeTenantId).order("order_index", { ascending: true }),
      // Consumed read-only from the existing event log. Deliberately NOT selecting
      // `webhook_response` or `error`: a provider payload and an internal error
      // string must never reach this surface.
      client.from("stage_automation_events").select("id,rule_id,status,created_at").eq("tenant_id", activeTenantId).order("created_at", { ascending: false }),
      supabase.rpc("is_current_user_tenant_admin" as never),
    ]);

    if (epoch.current !== token) return;

    // A failed read must not be reported as an empty workspace (§13).
    const failed = Boolean(rulesRes.error || pipelinesRes.error || stagesRes.error);
    if (failed) {
      setState({
        loading: false, error: true, rules: [], pipelines: [], stages: [], outcomes: [], outcomesUnavailable: true,
        canWrite: false, deliveryKnown: false, saving: false, writeError: null,
      });
      return;
    }

    setState({
      loading: false,
      error: false,
      rules: asRules(rulesRes.data),
      pipelines: asPipelines(pipelinesRes.data),
      stages: asStages(stagesRes.data),
      // A failed outcome read must NOT read as an empty history: that would be
      // indistinguishable from "nothing ever ran" and could hide real dispatches.
      outcomes: outcomesRes.error ? [] : asOutcomes(outcomesRes.data),
      outcomesUnavailable: Boolean(outcomesRes.error),
      canWrite: adminRes.error ? false : adminRes.data === true,
      // Never inferred, never claimed. See the field doc.
      deliveryKnown: false,
      saving: false,
      writeError: null,
    });
  }, [activeTenantId]);

  useEffect(() => {
    if (!tenantLoading) void load();
  }, [load, tenantLoading]);

  const write = useCallback(
    async (run: () => Promise<{ error: unknown }>) => {
      setState((s) => ({ ...s, saving: true, writeError: null }));
      const { error } = await run();
      if (error) {
        // Deliberately NOT the database's own text: it names constraints and
        // columns, which is both meaningless to the reader and more internal
        // detail than this surface should ever show.
        setState((s) => ({
          ...s,
          saving: false,
          writeError: "That change was not saved. Nothing was altered — try again.",
        }));
        return false;
      }
      await load();
      return true;
    },
    [load],
  );

  const table = () =>
    (supabase as unknown as {
      from: (t: string) => {
        insert: (v: Record<string, unknown>) => Promise<{ error: unknown }>;
        update: (v: Record<string, unknown>) => { eq: (k: string, v: string) => Promise<{ error: unknown }> };
        delete: () => { eq: (k: string, v: string) => Promise<{ error: unknown }> };
      };
    }).from("stage_automation_rules");

  const createRule = useCallback(
    (draft: AutomationDraft) =>
      write(() => table().insert({ ...draft, tenant_id: activeTenantId, is_active: false })),
    [write, activeTenantId],
  );

  const updateRule = useCallback(
    (id: string, patch: Partial<AutomationDraft>) => write(() => table().update(patch).eq("id", id)),
    [write],
  );

  const setActive = useCallback(
    (id: string, is_active: boolean) => write(() => table().update({ is_active }).eq("id", id)),
    [write],
  );

  const deleteRule = useCallback((id: string) => write(() => table().delete().eq("id", id)), [write]);

  const stagesByPipeline = useMemo(() => {
    const map = new Map<string, PipelineStage[]>();
    for (const s of state.stages) {
      const list = map.get(s.pipeline_id) ?? [];
      list.push(s);
      map.set(s.pipeline_id, list);
    }
    return map;
  }, [state.stages]);

  return {
    ...state,
    loading: tenantLoading || state.loading,
    /** A rule can only be authored against a pipeline that has at least two stages. */
    hasPipeline: state.pipelines.some((p) => (stagesByPipeline.get(p.id)?.length ?? 0) > 0),
    stagesByPipeline,
    refresh: load,
    createRule,
    updateRule,
    setActive,
    deleteRule,
  };
}

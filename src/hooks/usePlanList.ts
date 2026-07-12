import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { friendlyPlanError } from "@/lib/planning";

/**
 * Reads the Planning hub's data from the plan_list RPC — the same tenant- and
 * caller-scoped view Paige's tools write to (§10, the UI is one caller). Returns
 * plans (with nested items) and loose_items (standalone reminders/tasks Paige
 * set with no parent plan). Manual state + refresh, matching the repo's
 * data-hook idiom (useMyActions).
 */

export type PlanItemType = "milestone" | "task" | "reminder";
export type PlanItemStatus = "open" | "in_progress" | "done" | "cancelled" | "blocked";
export type PlanPriority = "low" | "normal" | "high" | "urgent";

export interface PlanItem {
  id: string;
  tenant_id: string;
  plan_id: string | null;
  item_type: PlanItemType;
  assigned_to_user_id: string | null;
  contact_id: string | null;
  title: string;
  summary: string | null;
  status: PlanItemStatus;
  priority: PlanPriority;
  due_at: string | null;
  remind_at: string | null;
  remind_target: string | null;
  reminded_at: string | null;
  created_by: string | null;
  linked_action_id: string | null;
}

export interface Plan {
  id: string;
  tenant_id: string;
  title: string;
  summary: string | null;
  horizon: string;
  scope: string;
  status: string;
  starts_on: string | null;
  ends_on: string | null;
  owner_user_id: string | null;
  created_by: string | null;
  items: PlanItem[];
}

export type PlanScope = "mine" | "by_me" | "team";

export interface UsePlanListOpts {
  /** 'mine' → assigned to me; 'by_me' → I created, assigned to someone else;
   * 'team' → everything visible (staff). */
  scope?: PlanScope;
  from?: string; // ISO date
  to?: string;   // ISO date
  status?: string;
  enabled?: boolean;
}

export interface UsePlanListResult {
  plans: Plan[];
  looseItems: PlanItem[];
  /** Every item across plans + loose, flattened — the working set for buckets. */
  allItems: PlanItem[];
  loading: boolean;
  error: string | null;
  /** True when the caller has no access to planning (e.g. a client, whom the
   * RPC refuses) — the UI shows a graceful state instead of a raw error. */
  forbidden: boolean;
  userId: string | null;
  /** Refetch. Pass { silent: true } after a single-row mutation so the whole
   * hub doesn't flash to skeletons. */
  refresh: (opts?: { silent?: boolean }) => Promise<void>;
}

export function usePlanList(opts: UsePlanListOpts = {}): UsePlanListResult {
  const { scope = "mine", from, to, status, enabled = true } = opts;
  const [plans, setPlans] = useState<Plan[]>([]);
  const [looseItems, setLooseItems] = useState<PlanItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [forbidden, setForbidden] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);

  const refresh = useCallback(async (opts?: { silent?: boolean }) => {
    if (!enabled) { setLoading(false); return; }
    if (!opts?.silent) setLoading(true);
    setError(null);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const uid = user?.id ?? null;
      setUserId(uid);

      const params: Record<string, unknown> = {
        p_from: from ?? null,
        p_to: to ?? null,
        p_status: status ?? null,
        p_limit: 200,
      };
      // 'mine' pins to the caller; 'team'/'by_me' fetch the full visible set and
      // filter client-side (plan_list has no created_by filter yet).
      if (scope === "mine" && uid) params.p_assigned_to_user_id = uid;

      const { data, error: rpcErr } = await supabase.rpc("plan_list", params);
      if (rpcErr) throw rpcErr;

      const payload = (data ?? {}) as { plans?: Plan[]; loose_items?: PlanItem[] };
      let nextPlans = Array.isArray(payload.plans) ? payload.plans : [];
      let nextLoose = Array.isArray(payload.loose_items) ? payload.loose_items : [];

      if (scope === "by_me" && uid) {
        const mineByMe = (i: PlanItem) => i.created_by === uid && i.assigned_to_user_id !== uid;
        nextLoose = nextLoose.filter(mineByMe);
        nextPlans = nextPlans
          .map((p) => ({ ...p, items: (p.items ?? []).filter(mineByMe) }))
          .filter((p) => p.items.length > 0 || p.owner_user_id === uid || p.created_by === uid);
      }

      setPlans(nextPlans.map((p) => ({ ...p, items: p.items ?? [] })));
      setLooseItems(nextLoose);
      setForbidden(false);
    } catch (e: any) {
      const raw = String(e?.message || "");
      // A client (non-member) is refused by the RPC — that's a graceful "not
      // available here" state, not an error banner with an internal code.
      setForbidden(raw.includes("PLAN_FORBIDDEN") || raw.includes("PLAN_NO_TENANT"));
      setError(friendlyPlanError(raw));
      setPlans([]);
      setLooseItems([]);
    } finally {
      setLoading(false);
    }
  }, [enabled, scope, from, to, status]);

  useEffect(() => { void refresh(); }, [refresh]);

  const allItems = [
    ...looseItems,
    ...plans.flatMap((p) => p.items),
  ];

  return { plans, looseItems, allItems, loading, error, forbidden, userId, refresh };
}

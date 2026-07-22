/**
 * Paige Contribution (§F) data hook — IA slice 1c-x.
 *
 * §9 TENANT ISOLATION: every read here is RLS-tenant-scoped. NO client-supplied
 * tenant_id is ever passed — paige_actions / paige_llm_trace / deals all enforce
 * the tenant seam server-side via current_user_tenant_id().
 *
 * CREATED_BY DISCRIMINATOR (build-brief a, §13 RED LINE — do not regress):
 *   file_action() sets `created_by = auth.uid()` (NULL for a headless/service-role
 *   Paige call) and `created_by_agent = COALESCE(p_created_by_agent,'paige')`
 *   (ALWAYS 'paige', even for a human JWT caller). Therefore:
 *     • Paige-orchestrated (headless)  → created_by IS NULL
 *     • Human-initiated (coach in app) → created_by IS NOT NULL
 *   NEVER attribute human-vs-Paige using created_by_agent — it would mis-credit
 *   human work to Paige and kill the whole differentiator. The breakout is
 *   honestly labeled "of Paige-orchestrated work": a coach who closes a deal
 *   directly OUTSIDE the action bus is not captured here at all.
 */
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

interface ActionRow {
  id: string;
  created_by: string | null;
  from_department: string | null;
  to_department: string | null;
  autonomy_lane: "auto" | "confirm" | "off";
  status: string;
  approval_id: string | null;
  contact_id: string | null;
  filed_at: string;
}

export interface DeptBreakoutRow {
  slug: string;
  name: string;
  count: number;
}

export interface AutonomyDayRow {
  date: string;
  auto: number;
  confirm: number;
  off: number;
}

export interface CostRow {
  key: string;
  provider: string;
  tier: string;
  jobKind: string;
  count: number;
  costUsd: number;
}

export interface PaigeContribution {
  loading: boolean;
  /** total actions filed for this tenant in the window */
  totalActions: number;
  /** distinct departments that appear as from_department OR to_department */
  departmentCount: number;
  paigeCount: number;
  humanCount: number;
  deptBreakout: DeptBreakoutRow[];
  /** true if the platform seeds > 2 departments today (else the "8 more activate" note shows) */
  seededDeptCount: number;
  autonomyByDay: AutonomyDayRow[];
  /** approval rate on Paige's drafts, computed from paige_actions (NOT the role-scoped approvals table) */
  approvalRate: number | null;
  approvalDecided: number;
  /** estimated AI cost-to-serve (list price, excl caching) — ESTIMATE, never a bill */
  estimatedCostUsd: number;
  costBreakdown: CostRow[];
  /** open pipeline value (cents) on clients Paige is actively working — CORRELATION, not attribution */
  influencedPipelineCents: number;
  /** daily Paige action volume series (for the anomaly note) */
  actionsByDay: { date: string; value: number }[];
}

const EMPTY: PaigeContribution = {
  loading: true,
  totalActions: 0,
  departmentCount: 0,
  paigeCount: 0,
  humanCount: 0,
  deptBreakout: [],
  seededDeptCount: 0,
  autonomyByDay: [],
  approvalRate: null,
  approvalDecided: 0,
  estimatedCostUsd: 0,
  costBreakdown: [],
  influencedPipelineCents: 0,
  actionsByDay: [],
};

function dayKey(iso: string): string {
  return new Date(iso).toISOString().slice(0, 10);
}

export function usePaigeContribution(start: string, end: string): PaigeContribution {
  const [state, setState] = useState<PaigeContribution>(EMPTY);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setState((s) => ({ ...s, loading: true }));
      const startIso = new Date(start).toISOString();
      const endIso = new Date(end + "T23:59:59").toISOString();

      // All four reads are RLS-tenant-scoped — NO tenant param (§9). Table names are
      // cast (repo precedent) to break supabase-js's excessively-deep type
      // instantiation across this 4-way Promise.all — several are recent-migration
      // tables not yet in the generated types. The .data results are re-typed below.
      /* eslint-disable @typescript-eslint/no-explicit-any */
      const [actionsRes, deptRes, traceRes, dealsRes] = await Promise.all([
        supabase
          .from("paige_actions" as any)
          .select(
            "id, created_by, from_department, to_department, autonomy_lane, status, approval_id, contact_id, filed_at",
          )
          .gte("filed_at", startIso)
          .lte("filed_at", endIso)
          .limit(10000),
        supabase.from("paige_departments" as any).select("slug, name").eq("enabled", true),
        supabase
          .from("paige_llm_trace" as any)
          .select("provider, tier, job_kind, cost_estimate_usd, status")
          .gte("created_at", startIso)
          .lte("created_at", endIso)
          .limit(10000),
        supabase
          .from("deals" as any)
          .select("contact_client_id, value_cents, status")
          .eq("status", "open")
          .limit(5000),
      ]);
      /* eslint-enable @typescript-eslint/no-explicit-any */

      if (cancelled) return;

      const actions = (actionsRes.data as unknown as ActionRow[] | null) || [];
      const deptNames = new Map<string, string>(
        ((deptRes.data as unknown as { slug: string; name: string }[] | null) || []).map((d) => [d.slug, d.name]),
      );
      const seededDeptCount = deptNames.size;

      const totalActions = actions.length;
      const paigeCount = actions.filter((a) => a.created_by === null).length;
      const humanCount = totalActions - paigeCount;

      // Distinct departments touched (from ∪ to).
      const deptSet = new Set<string>();
      for (const a of actions) {
        if (a.from_department) deptSet.add(a.from_department);
        if (a.to_department) deptSet.add(a.to_department);
      }
      const departmentCount = deptSet.size;

      // Dept breakout by from_department (the desk that originated the work).
      const deptCounts = new Map<string, number>();
      for (const a of actions) {
        if (!a.from_department) continue;
        deptCounts.set(a.from_department, (deptCounts.get(a.from_department) || 0) + 1);
      }
      const deptBreakout: DeptBreakoutRow[] = Array.from(deptCounts.entries())
        .map(([slug, count]) => ({ slug, name: deptNames.get(slug) || slug, count }))
        .sort((a, b) => b.count - a.count);

      // Autonomy-tier distribution over time (by filed_at day).
      const byDay = new Map<string, AutonomyDayRow>();
      const volByDay = new Map<string, number>();
      for (const a of actions) {
        const k = dayKey(a.filed_at);
        if (!byDay.has(k)) byDay.set(k, { date: k, auto: 0, confirm: 0, off: 0 });
        const row = byDay.get(k)!;
        if (a.autonomy_lane === "auto") row.auto++;
        else if (a.autonomy_lane === "off") row.off++;
        else row.confirm++;
        volByDay.set(k, (volByDay.get(k) || 0) + 1);
      }
      const autonomyByDay = Array.from(byDay.values()).sort((a, b) => a.date.localeCompare(b.date));
      const actionsByDay = Array.from(volByDay.entries())
        .map(([date, value]) => ({ date, value }))
        .sort((a, b) => a.date.localeCompare(b.date));

      // Approval rate — computed from paige_actions (tenant-RLS'd), NOT the
      // role-scoped paige_pending_approvals table (§9: reading that directly
      // risks cross-tenant bleed). Of actions with an approval, done vs dismissed.
      const withApproval = actions.filter((a) => a.approval_id !== null);
      const done = withApproval.filter((a) => a.status === "done").length;
      const dismissed = withApproval.filter((a) => a.status === "dismissed").length;
      const approvalDecided = done + dismissed;
      const approvalRate = approvalDecided > 0 ? done / approvalDecided : null;

      // Cost-to-serve — per provider/tier/job_kind (NOT per action; no action_id
      // link exists). Every dollar is an ESTIMATE. NULL cost rows contribute 0.
      const costMap = new Map<string, CostRow>();
      let estimatedCostUsd = 0;
      for (const t of (traceRes.data as unknown as
        | { provider: string; tier: string | null; job_kind: string | null; cost_estimate_usd: number | null }[]
        | null) || []) {
        const provider = t.provider || "unknown";
        const tier = t.tier || "—";
        const jobKind = t.job_kind || "—";
        const key = `${provider}|${tier}|${jobKind}`;
        if (!costMap.has(key)) {
          costMap.set(key, { key, provider, tier, jobKind, count: 0, costUsd: 0 });
        }
        const row = costMap.get(key)!;
        row.count++;
        const c = Number(t.cost_estimate_usd);
        if (Number.isFinite(c)) {
          row.costUsd += c;
          estimatedCostUsd += c;
        }
      }
      const costBreakdown = Array.from(costMap.values()).sort((a, b) => b.costUsd - a.costUsd);

      // Influenced pipeline — CORRELATION not attribution (no paige_action→deal FK).
      // Sum open-deal value on clients that Paige has an action for this window.
      const paigeContacts = new Set(actions.map((a) => a.contact_id).filter(Boolean) as string[]);
      let influencedPipelineCents = 0;
      for (const d of (dealsRes.data as unknown as
        | { contact_client_id: string | null; value_cents: number | null; status: string }[]
        | null) || []) {
        if (d.contact_client_id && paigeContacts.has(d.contact_client_id)) {
          influencedPipelineCents += Number(d.value_cents) || 0;
        }
      }

      setState({
        loading: false,
        totalActions,
        departmentCount,
        paigeCount,
        humanCount,
        deptBreakout,
        seededDeptCount,
        autonomyByDay,
        approvalRate,
        approvalDecided,
        estimatedCostUsd,
        costBreakdown,
        influencedPipelineCents,
        actionsByDay,
      });
    })();
    return () => {
      cancelled = true;
    };
  }, [start, end]);

  return state;
}

/**
 * Operator platform metrics (§A/§E) data hook — IA slice 1c-x, OPERATOR LENS.
 *
 * SINGLE SOURCE OF TRUTH for MRR/ARR = platform_subscriptions (billing Layer 1),
 * read via the operator_dashboard_metrics(p_window_days) RPC (build-brief b). The
 * rival user_subscriptions × subscription_plans.price MRR computation is DELETED
 * from AnalyticsDashboard as part of this slice, so exactly one MRR figure exists
 * on the page and it lives here, in the operator lens.
 *
 * §9 / DEFENSE IN DEPTH: the RPC itself gates on is_platform_admin() server-side
 * (owner ⊂ admin), and the section body double-gates on isPlatformOwner. This hook
 * only runs when `enabled` (owner). It never trusts a client-supplied tenant.
 *
 * platform_metered_events (gross-margin wholesale cost) is read fleet-wide here
 * for §E — the owner's RLS lets is_platform_owner read all rows.
 */
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface OperatorMetrics {
  mrrCents: number;
  arrCents: number;
  arpaCents: number | null;
  newTenants: number;
  atRiskCount: number;
  wauTenants: number;
  trialConversionPct: number | null;
  fleetPaigeActions: number;
  totalPlatformUsers: number;
  activeTenants: {
    total: number;
    individual: number;
    standalone: number;
    agency: number;
    enterprise: number;
  };
  dunning: { count: number; mrrCents: number };
}

export interface OperatorPlatformState {
  loading: boolean;
  error: string | null;
  metrics: OperatorMetrics | null;
  /** fleet-wide wholesale (COGS) cost in the window — §E gross margin input */
  wholesaleCostUsd: number;
  wholesaleAvailable: boolean;
}

export function useOperatorPlatformMetrics(
  windowDays: number,
  startIso: string,
  endIso: string,
  enabled: boolean,
): OperatorPlatformState {
  const [state, setState] = useState<OperatorPlatformState>({
    loading: enabled,
    error: null,
    metrics: null,
    wholesaleCostUsd: 0,
    wholesaleAvailable: false,
  });

  useEffect(() => {
    if (!enabled) {
      setState({ loading: false, error: null, metrics: null, wholesaleCostUsd: 0, wholesaleAvailable: false });
      return;
    }
    let cancelled = false;
    (async () => {
      setState((s) => ({ ...s, loading: true, error: null }));

      const [rpcRes, meteredRes] = await Promise.all([
        supabase.rpc("operator_dashboard_metrics", { p_window_days: windowDays }),
        supabase
          .from("platform_metered_events")
          .select("wholesale_cost_usd")
          .gte("occurred_at", startIso)
          .lte("occurred_at", endIso)
          .limit(50000),
      ]);

      if (cancelled) return;

      if (rpcRes.error) {
        setState({
          loading: false,
          error: rpcRes.error.message,
          metrics: null,
          wholesaleCostUsd: 0,
          wholesaleAvailable: false,
        });
        return;
      }

      const j = (rpcRes.data as Record<string, unknown>) || {};
      const tenants = (j.active_tenants as Record<string, number>) || {};
      const dunning = (j.dunning as { count?: number; mrr_cents?: number }) || {};

      const metrics: OperatorMetrics = {
        mrrCents: Number(j.mrr_cents) || 0,
        arrCents: Number(j.arr_cents) || 0,
        arpaCents: j.arpa_cents == null ? null : Number(j.arpa_cents),
        newTenants: Number(j.new_tenants) || 0,
        atRiskCount: Number(j.at_risk_count) || 0,
        wauTenants: Number(j.wau_tenants) || 0,
        trialConversionPct: j.trial_conversion_pct == null ? null : Number(j.trial_conversion_pct),
        fleetPaigeActions: Number(j.fleet_paige_actions) || 0,
        totalPlatformUsers: Number(j.total_platform_users) || 0,
        activeTenants: {
          total: Number(tenants.total) || 0,
          individual: Number(tenants.individual) || 0,
          standalone: Number(tenants.standalone) || 0,
          agency: Number(tenants.agency) || 0,
          enterprise: Number(tenants.enterprise) || 0,
        },
        dunning: { count: Number(dunning.count) || 0, mrrCents: Number(dunning.mrr_cents) || 0 },
      };

      const meteredRows = (meteredRes.data as { wholesale_cost_usd: number | null }[] | null) || [];
      const wholesaleCostUsd = meteredRows.reduce((s, r) => s + (Number(r.wholesale_cost_usd) || 0), 0);

      setState({
        loading: false,
        error: null,
        metrics,
        wholesaleCostUsd,
        wholesaleAvailable: meteredRows.length > 0,
      });
    })();
    return () => {
      cancelled = true;
    };
  }, [windowDays, startIso, endIso, enabled]);

  // When disabled the effect resets state to metrics:null — no owner data leaks.
  return state;
}

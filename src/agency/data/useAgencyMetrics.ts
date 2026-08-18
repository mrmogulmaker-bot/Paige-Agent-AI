/**
 * useAgencyMetrics — the Agency operator-identity + KPI adapter (Slice A, adapter 2).
 *
 * Mirrors the Solo `src/solo/data` pattern: a THIN typed composition over the
 * EXISTING seams, reshaped into the identity + KPI shapes the agency chrome renders.
 *
 * §51 SCOPE SPINE (session-derived ONLY — never a client-supplied tenant_id):
 *   • AGENCY AGGREGATE  (isAgency && !acting):
 *       - agency_portfolio_metrics()  → subCount (active_subaccounts) + portfolio_mrr_cents  [REAL]
 *       - agency_my_membership()      → agency_role                                          [REAL]
 *       - useTenantContext().activeTenant → name / plan_offer                                [REAL]
 *   • OWN-BOOK / ACTING  (!isAgency || acting != null):
 *       - usePracticeDashboard()  → own won-value / active-clients / pipeline / retainers    [REAL]
 *       - usePaigeDeptStatus()    → departments configured (drives an honest KPI count)      [REAL]
 *     Own-book mode NEVER calls the parentage RPCs (they RAISE 42501 anyway).
 *
 * §13 HONESTY: NRR, billed-MTD, hours-Paige-saved, autopilot %, and utilization have
 * NO backend today — each is emitted as an explicit PREVIEW marker, never a fabricated
 * value. The screen renders a "Preview" pill from the marker rather than a fake number.
 */
import { useCallback, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useTenantContext } from "@/hooks/useTenantContext";
import { usePracticeDashboard } from "@/hooks/usePracticeDashboard";
import { usePaigeDeptStatus } from "@/hooks/usePaigeDeptStatus";
import type { AgencyPortfolioMetrics } from "@/hooks/useAgencyPortfolio";
import { isAgencyAggregate, type AgencyShellCtx } from "./useAgencyRoster";

/**
 * One KPI tile. A `real` tile carries a sourced, formatted value; a `preview` tile
 * carries ONLY its label — the caller renders a Preview pill, never a number (§13).
 */
export type AgencyKpi =
  | { kind: "real"; label: string; value: string }
  | { kind: "preview"; label: string };

export interface AgencyOperatorIdentity {
  /** Operator/agency display name — activeTenant.name → null. REAL */
  name: string | null;
  /** Plan label — activeTenant.plan_offer. REAL | null */
  plan: string | null;
  /** The caller's agency role (agency_owner/admin/…) — membership. REAL in agency mode | null */
  agencyRole: string | null;
}

export interface AgencyMetricsData {
  mode: "agency" | "own";
  identity: AgencyOperatorIdentity;
  /** Active sub-account count — REAL (agency mode) | null (own mode has no roster). */
  subCount: number | null;
  /** Portfolio MRR across children (cents) — REAL (agency mode) | null (own mode). */
  portfolioMrrCents: number | null;
  /** Own-book revenue-this-period (cents) — REAL (own mode) | null (agency mode). */
  ownRevenueCents: number | null;
  /** Mixed REAL + PREVIEW KPI tiles, in display order. */
  kpis: AgencyKpi[];
  loading: boolean;
  isError: boolean;
  refresh: () => void;
}

const POLL = { refetchInterval: 45_000, refetchOnWindowFocus: true } as const;

const usd = (cents: number): string =>
  new Intl.NumberFormat(undefined, {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(Math.round(cents / 100));

/** Shape of agency_my_membership() (Json). Every field optional / present-guarded. */
interface AgencyMembership {
  agency_role?: string | null;
}

export function useAgencyMetrics(ctx: AgencyShellCtx): AgencyMetricsData {
  const aggregate = isAgencyAggregate(ctx);
  const { activeTenant } = useTenantContext();

  // ── AGENCY-AGGREGATE reads (gated OFF in own-book / acting mode) ──
  const portfolio = useQuery({
    queryKey: ["agency-portfolio-metrics"],
    enabled: aggregate,
    queryFn: async (): Promise<AgencyPortfolioMetrics> => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await supabase.rpc("agency_portfolio_metrics" as any);
      if (error) throw error;
      return (data ?? {}) as AgencyPortfolioMetrics;
    },
    ...POLL,
  });

  const membership = useQuery({
    queryKey: ["agency-my-membership"],
    enabled: aggregate,
    queryFn: async (): Promise<AgencyMembership> => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await supabase.rpc("agency_my_membership" as any);
      if (error) throw error;
      return (data ?? {}) as AgencyMembership;
    },
    staleTime: 60_000,
  });

  // ── OWN-BOOK reads (self-scope by activeTenantId; always mounted — hooks can't be
  // conditional — but they read the caller's OWN tenant under RLS, never a child) ──
  const { metrics: pm, loading: dashLoading, isError: dashError, refetch: refetchDash } =
    usePracticeDashboard();
  const { configured: deptConfigured } = usePaigeDeptStatus();

  const identity = useMemo<AgencyOperatorIdentity>(() => {
    const mem = membership.data;
    return {
      name: activeTenant?.name ?? null,
      plan: activeTenant?.plan_offer ?? null,
      agencyRole: mem?.agency_role ?? null,
    };
  }, [activeTenant?.name, activeTenant?.plan_offer, membership.data]);

  // §13 TRUTH WAVE (owner ruling 2026-08-18): "Remove all data that is not live and
  // real… If it was not entered by an owner or submitted by a real customer then it
  // should get removed and placed with live data only."
  //
  // This adapter previously emitted a `kind:"preview"` tile for every metric with no
  // backend (NRR, hours-Paige-saved, team utilization, approval rate) so the strip
  // always rendered four cards. Under the ruling those are REMOVED, not labelled — an
  // em-dash under a "HOURS PAIGE SAVED" heading still asserts the metric exists and
  // that we are tracking it. Only values a real query sourced are emitted now, so the
  // strip renders exactly as many tiles as there are true numbers (possibly zero).
  //
  // These are DELETIONS, not regressions to fix later: re-adding a tile requires a
  // real backend, not a placeholder. `kind:"preview"` stays in the type because other
  // adapters still use it; nothing here emits it.
  const kpis = useMemo<AgencyKpi[]>(() => {
    const out: AgencyKpi[] = [];
    if (aggregate) {
      const mrr = portfolio.data?.portfolio_mrr_cents;
      // The ONE cross-book aggregate with a real source (agency_portfolio_metrics).
      // Dropped entirely when the RPC did not return it, rather than shown empty.
      if (typeof mrr === "number")
        out.push({ kind: "real", label: "MRR from sub-accounts", value: usd(mrr) });
      return out;
    }
    // Own-book — only what usePracticeDashboard actually sourced.
    if (typeof pm?.won_value_cents === "number")
      out.push({ kind: "real", label: "Revenue this period", value: usd(pm.won_value_cents) });
    if (typeof pm?.active_clients === "number")
      out.push({ kind: "real", label: "Active clients", value: String(pm.active_clients) });
    return out;
  }, [aggregate, portfolio.data?.portfolio_mrr_cents, pm?.won_value_cents, pm?.active_clients]);

  const refresh = useCallback(() => {
    if (aggregate) {
      void portfolio.refetch();
      void membership.refetch();
    } else {
      refetchDash();
    }
  }, [aggregate, portfolio, membership, refetchDash]);

  // deptConfigured is read to keep the own-mode dependency honest (a future KPI
  // tile keys on it); referenced here so it participates in the render pass.
  void deptConfigured;

  return {
    mode: aggregate ? "agency" : "own",
    identity,
    subCount:
      aggregate && typeof portfolio.data?.active_subaccounts === "number"
        ? portfolio.data.active_subaccounts
        : null,
    portfolioMrrCents:
      aggregate && typeof portfolio.data?.portfolio_mrr_cents === "number"
        ? portfolio.data.portfolio_mrr_cents
        : null,
    ownRevenueCents:
      !aggregate && typeof pm?.won_value_cents === "number" ? pm.won_value_cents : null,
    kpis,
    loading: aggregate ? portfolio.isLoading : dashLoading,
    isError: aggregate ? portfolio.isError || membership.isError : dashError,
    refresh,
  };
}

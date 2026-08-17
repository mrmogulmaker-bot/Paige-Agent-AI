/**
 * useAgencyRoster — the Agency sub-account ROSTER adapter (Slice A, adapter 1).
 *
 * Mirrors the Solo `src/solo/data` pattern: a THIN typed composition over the
 * EXISTING production seams, reshaped into the prop shape the agency roster
 * chrome already renders. Only the DATA source changes; no re-query family.
 *
 * §51 SCOPE SPINE (session-derived ONLY — never a client-supplied tenant_id):
 *   • AGENCY AGGREGATE  (isAgency && !acting) → own book ∪ children:
 *       - agency_list_my_subaccounts()        → the authoritative child roster
 *       - agency_portfolio_metrics().leaderboard[]  → health / mrr / clients,
 *         OVERLAID by tenant_id (the §18 merge AgencyBoard.tsx already ships).
 *   • OWN-BOOK / ACTING  (!isAgency  ||  acting != null) → EMPTY roster: a
 *     sub-account has no roster; the roster surfaces are agency-only chrome. In
 *     this mode the adapter NEVER calls the parentage RPCs (belt-and-suspenders
 *     over their server-side RAISE 42501 — the #86-leak firewall).
 *
 * §13 HONESTY: `health` / `clientCount` / `mrrCents` are REAL (leaderboard). No
 * backend exists for a child's `drafts` / `note` / `tenure` — those stay Preview
 * (null), never fabricated.
 */
import { useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type {
  AgencyPortfolioMetrics,
  LeaderboardRow,
  PortfolioHealthKey,
} from "@/hooks/useAgencyPortfolio";

/* ── Shared shell-context types (the §18 one home; the sibling adapters import these) ── */

/**
 * The sub-account the shell is presenting when the agency "acts as" a child.
 * Fixture-derived in the current shell (a SUBS entry); `id` is present only when
 * a real act-as (agency_enter_subaccount) resolved a tenant id. The adapters read
 * only `id`/`name` — every other field is optional and present-guarded.
 */
export interface ActingSub {
  id?: string | null;
  name: string;
  color?: string;
  mrr?: string;
  health?: number;
}

/** The scope context the AgencyApp shell threads into every data adapter. */
export interface AgencyShellCtx {
  isAgency: boolean;
  acting: ActingSub | null;
}

/**
 * TRUE only for the AGENCY AGGREGATE read (own book ∪ children). This is the ONE
 * predicate that gates the parentage RPCs. Own-book / acting mode is its inverse.
 */
export function isAgencyAggregate(ctx: AgencyShellCtx): boolean {
  return ctx.isAgency && !ctx.acting;
}

/* ── Roster row (child + REAL leaderboard overlay; Preview where no backend) ── */

export interface AgencyRosterRow {
  /** child tenant id (agency_list_my_subaccounts.id) — REAL */
  id: string;
  /** child tenant name — REAL */
  name: string;
  /** child tenant slug — REAL */
  slug: string;
  /** §65 Option B2 — the child's own URL address, for the actor-namespaced
   * act-as path (/agency/{n}/sub/{accountNumber}/…). REAL, always present
   * (assigned at provisioning, §9 address-not-grant). */
  accountNumber: number;
  /** child lifecycle status — REAL */
  status: string;
  /** child account_type (always a non-manager tier under §51) — REAL */
  accountType: string;
  /** child created_at ISO — REAL */
  createdAt: string;
  /** health bucket from agency_portfolio_metrics().leaderboard — REAL | null */
  health: PortfolioHealthKey | null;
  /** clients under management from the leaderboard — REAL | null */
  clientCount: number | null;
  /** child MRR (cents) from the leaderboard — REAL | null */
  mrrCents: number | null;
  /** PREVIEW — no per-child drafts aggregate exists (never fabricated) */
  drafts: null;
  /** PREVIEW — no per-child operator note exists */
  note: null;
  /** PREVIEW — no tenure/onboarded-since field exists */
  tenure: null;
}

export interface AgencyRosterData {
  rows: AgencyRosterRow[];
  loading: boolean;
  isError: boolean;
  /**
   * TRUE only in AGENCY AGGREGATE mode, where a roster is a real thing. FALSE in
   * own-book / acting mode (a sub has no roster) — the caller renders no roster
   * chrome rather than an empty-looking list.
   */
  available: boolean;
  refresh: () => void;
}

/** Roster rows returned by the typed agency_list_my_subaccounts RPC. */
interface SubAccountRow {
  id: string;
  name: string;
  slug: string;
  status: string;
  account_type: string;
  created_at: string;
  /** §65 Option B2 (migration 20260917000000) — the child's own URL address. */
  account_number: number;
}

const POLL = { refetchInterval: 45_000, refetchOnWindowFocus: true } as const;

export function useAgencyRoster(ctx: AgencyShellCtx): AgencyRosterData {
  const aggregate = isAgencyAggregate(ctx);

  // The authoritative child roster. Gated: fires ONLY in agency-aggregate mode.
  const roster = useQuery({
    queryKey: ["agency-roster"],
    enabled: aggregate,
    queryFn: async (): Promise<SubAccountRow[]> => {
      const { data, error } = await supabase.rpc("agency_list_my_subaccounts");
      if (error) throw error;
      return (Array.isArray(data) ? data : []) as SubAccountRow[];
    },
    ...POLL,
  });

  // Portfolio rollup — the leaderboard[] carries the REAL per-child health / mrr /
  // client_count we overlay onto the roster by tenant_id (the AgencyBoard §18 merge).
  const portfolio = useQuery({
    queryKey: ["agency-portfolio-metrics"],
    enabled: aggregate,
    queryFn: async (): Promise<AgencyPortfolioMetrics> => {
      // Not gen-typed (Json/Args:never); cast the name only, same convention as
      // useAgencyPortfolio + AgencyBoard's agency_enter_subaccount caller.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await supabase.rpc("agency_portfolio_metrics" as any);
      if (error) throw error;
      return (data ?? {}) as AgencyPortfolioMetrics;
    },
    ...POLL,
  });

  const refresh = useCallback(() => {
    void roster.refetch();
    void portfolio.refetch();
  }, [roster, portfolio]);

  // Own-book / acting mode: a sub has no roster. Return empty + available:false,
  // never touching the parentage RPCs.
  if (!aggregate) {
    return { rows: [], loading: false, isError: false, available: false, refresh };
  }

  const board = new Map<string, LeaderboardRow>();
  for (const row of portfolio.data?.leaderboard ?? []) {
    if (row?.tenant_id) board.set(row.tenant_id, row);
  }

  const rows: AgencyRosterRow[] = (roster.data ?? []).map((s) => {
    const lb = board.get(s.id);
    return {
      id: s.id,
      name: s.name,
      slug: s.slug,
      accountNumber: s.account_number,
      status: s.status,
      accountType: s.account_type,
      createdAt: s.created_at,
      health: lb?.health ?? null,
      clientCount: typeof lb?.client_count === "number" ? lb.client_count : null,
      mrrCents: typeof lb?.mrr_cents === "number" ? lb.mrr_cents : null,
      drafts: null,
      note: null,
      tenure: null,
    };
  });

  return {
    rows,
    // Roster drives the surface; the leaderboard overlay is enrichment, so the
    // roster query alone gates the loading state (a slow overlay never blanks it).
    loading: roster.isLoading,
    isError: roster.isError || portfolio.isError,
    available: true,
    refresh,
  };
}

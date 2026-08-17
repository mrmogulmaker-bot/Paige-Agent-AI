/**
 * useAgencyCompass — the Agency Trust Compass (autonomy console) adapter (Slice D,
 * adapter 8). MOSTLY PREVIEW BY DESIGN.
 *
 * Mirrors the Solo `src/solo/data` + sibling `src/agency/data` pattern: a THIN typed
 * composition over the EXISTING §9-clean seam (`usePaigeDeptStatus`), reshaped for the
 * compass. It re-exports the shell types via `./useAgencyRoster` (§18 one home) and takes
 * the same `AgencyShellCtx` ({ isAgency, acting }) every sibling adapter takes.
 *
 * §51 SCOPE SPINE (session-derived ONLY — never a client-supplied tenant_id):
 *   • The ONLY live read is `usePaigeDeptStatus()`, which passes NO tenant_id: it is
 *     RLS-scoped by `current_user_tenant_id()`. In EITHER mode it returns the CALLER'S
 *     OWN department roster + open-work counts — the agency's own book in agency mode,
 *     the single book in own/acting mode. It NEVER reaches a parent aggregate or a
 *     child's book, so this adapter is §51-safe by construction: it touches no parentage
 *     RPC and no cross-book table, so there is nothing to gate off.
 *
 * REAL (read-only):
 *   • `departments[]` — the live `paige_departments` roster with per-department OPEN /
 *     working / awaiting action counts + last-activity, straight from `usePaigeDeptStatus`
 *     (the §16 department seam over `paige_actions.autonomy_lane` / `paige_action_kinds`).
 *   • `configured` — false when the §16 departments seed is absent → the surface renders a
 *     crafted EmptyState, never a fabricated tile grid (§13).
 *
 * PREVIEW (NO backend route — the design's `tcFlag`; §13 honest-empty, never fabricated):
 *   • `preview.autonomyTiers` — per-department autonomy TIER persistence. `paige_resolve_
 *     autonomy()` is a stub that returns the kind default; there is NO per-tenant
 *     per-department override store to read or write, so the dragged tier positions are
 *     stand-ins. `departments[].tier` is therefore always `null` (honest), never invented.
 *   • `preview.subAccountAutonomy` — the cross-tenant read of a SUB-ACCOUNT's own autonomy
 *     settings. There is NO parentage-gated RPC for this; reading it off the RLS own-book
 *     tables would be the #86 leak. Kept honest-EMPTY — this adapter surfaces NOTHING
 *     cross-book. (The design's Book matrix / Per-sub picker read `seedMatrix()` fixtures.)
 *   • `preview.proposeFlow` — the propose-to-owner flow (`PROPOSALS` / `SENT` in the
 *     design). No proposal backend exists yet; the flow is a Preview stand-in.
 *
 * A NEW parentage-gated RPC (a child's real autonomy) + a per-tenant tier store are the
 * backend this adapter is waiting on; both are out of scope for this port (§13 — do not
 * propose schema changes, do not fabricate).
 */
import { useCallback } from "react";
import { usePaigeDeptStatus } from "@/hooks/usePaigeDeptStatus";
import { isAgencyAggregate, type AgencyShellCtx } from "./useAgencyRoster";

/** One department reshaped for the compass. Counts are REAL; tier is PREVIEW (always null). */
export interface CompassDepartment {
  /** department slug (paige_departments.slug) — REAL */
  slug: string;
  /** department display name — REAL */
  name: string;
  /** display order — REAL */
  displayOrder: number;
  /** total open (non-terminal) actions routed to this desk — REAL */
  openCount: number;
  /** subset actively in-flight (drafting/executing) — REAL */
  workingCount: number;
  /** subset waiting on the human's approval — REAL */
  awaitingCount: number;
  /** most recent filed_at across this desk's open actions (ISO) — REAL | null */
  lastActivityAt: string | null;
  /**
   * PREVIEW — the persisted autonomy tier for this department. NO per-tenant
   * per-department override store exists (paige_resolve_autonomy stubs to the kind
   * default), so this is always null; the surface reads the design stand-in, never a
   * fabricated tier.
   */
  tier: null;
}

/**
 * Explicit PREVIEW markers for the compass surfaces that have NO backend route (§13).
 * Each is `true` to read as a set flag the caller renders a Preview pill / disclaimer
 * from — never a fabricated value.
 */
export interface AgencyCompassPreview {
  /** Per-department autonomy TIER persistence — no per-tenant override store. */
  autonomyTiers: true;
  /** Cross-tenant read of a sub-account's autonomy — no parentage RPC; #86 leak surface. */
  subAccountAutonomy: true;
  /** The propose-to-owner flow (PROPOSALS / SENT) — no proposal backend. */
  proposeFlow: true;
}

export interface AgencyCompassData {
  /** "agency" = the agency's OWN ten departments (own-book, live — NOT a cross-book
   *  aggregate); "own" = a single sub-account's book. Scope is own-book in both. */
  mode: "agency" | "own";
  /** REAL — the caller's live department roster with open-work counts (RLS own-scope). */
  departments: CompassDepartment[];
  /**
   * false = no §16 departments seed found → the surface renders a crafted EmptyState,
   * never a fabricated tile grid (§13).
   */
  configured: boolean;
  /** The explicit PREVIEW markers — tiers, cross-tenant sub read, propose flow. */
  preview: AgencyCompassPreview;
  loading: boolean;
  /**
   * The dept snapshot self-polls every 15s + on window focus (§36, usePaigeDeptStatus),
   * so an explicit refresh is unnecessary; this is a documented no-op kept for API
   * symmetry with the sibling adapters (§13 — it does NOT silently claim to refetch).
   */
  refresh: () => void;
}

/** The Preview marker set is constant — every compass surface here is backend-less by design. */
const PREVIEW: AgencyCompassPreview = {
  autonomyTiers: true,
  subAccountAutonomy: true,
  proposeFlow: true,
};

export function useAgencyCompass(ctx: AgencyShellCtx): AgencyCompassData {
  const aggregate = isAgencyAggregate(ctx);

  // The ONLY live read — RLS own-scope, no tenant_id, no parentage RPC (§51-safe).
  const { loading, configured, departments } = usePaigeDeptStatus();

  const rows: CompassDepartment[] = departments.map((d) => ({
    slug: d.slug,
    name: d.name,
    displayOrder: d.displayOrder,
    openCount: d.openCount,
    workingCount: d.workingCount,
    awaitingCount: d.awaitingCount,
    lastActivityAt: d.lastActivityAt,
    tier: null, // PREVIEW — no persisted tier store (see header).
  }));

  // Self-polling snapshot (§36); no refetch to call — documented no-op for API symmetry.
  const refresh = useCallback(() => {}, []);

  return {
    mode: aggregate ? "agency" : "own",
    departments: rows,
    configured,
    preview: PREVIEW,
    loading,
    refresh,
  };
}

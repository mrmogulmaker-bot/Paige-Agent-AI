/**
 * usePaigeDeptStatus — the live "what is each department doing right now" read for
 * the Command Center department-status tiles (Task #245, the "see them work" layer).
 *
 * §9 TENANT ISOLATION: both reads are RLS-tenant-scoped and pass NO client-supplied
 * tenant_id. `paige_actions` SELECT is gated server-side by the live slice2c policy
 * (tenant_id = current_user_tenant_id() AND admin|coach|super_admin — OR
 * is_platform_owner() → all rows for a platform operator); `paige_departments` is
 * `enabled`-gated to
 * authenticated. This EXTENDS the proven §9-clean pattern in usePaigeContribution —
 * it is NOT a new RPC/view (a SECURITY DEFINER aggregate would *bypass* the RLS that
 * already scopes this table correctly — the exact §45 IDOR class we avoid).
 *
 * §51 PER-TIER OUTCOME:
 *   • God/Super-Admin (no tenant)  → is_platform_owner() → FLEET-WIDE dept status.
 *   • Agency / Standalone / Sub-account → own book only (current_user_tenant_id());
 *     a sub-account never sees its parent's aggregate (RLS isolates by tenant_id).
 *   • Client → fails the admin|coach|super_admin predicate → 0 rows (never mounts CC).
 *   • Anonymous → no session → 0 rows (route is admin-gated anyway).
 *
 * §13 HONESTY: if the departments seed is absent (an env without the §16 migration),
 * `configured` is false and the surface renders a crafted EmptyState — never a
 * fabricated count. Terminal actions (done/dismissed/failed/expired) are excluded so
 * a tile reads only LIVE, open work.
 */
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

/** Open (non-terminal) action statuses — the work that is still in motion at a desk. */
const OPEN_STATUSES = [
  "filed",
  "assigned",
  "drafting",
  "drafted",
  "pending_approval",
  "approved",
  "executing",
  "blocked",
] as const;

/** In-flight statuses — a desk actively producing right now (drives the "in motion"
 *  pulse). Matches the scout spec: drafting + executing. */
const WORKING_STATUSES = new Set(["drafting", "executing"]);
/** Waiting-on-the-human status — drives the "awaiting you" warning pill. */
const AWAITING_STATUSES = new Set(["pending_approval"]);

export interface DeptStatusRow {
  slug: string;
  name: string;
  displayOrder: number;
  /** total open (non-terminal) actions routed TO this desk */
  openCount: number;
  /** subset of open that is actively in-flight (drafting/executing) */
  workingCount: number;
  /** subset of open that is waiting on the human's approval */
  awaitingCount: number;
  /** most recent filed_at across this desk's open actions (ISO), or null when idle */
  lastActivityAt: string | null;
}

export interface PaigeDeptStatus {
  loading: boolean;
  /** false = no departments seed found → render EmptyState, never a fake tile grid */
  configured: boolean;
  departments: DeptStatusRow[];
}

/** Minimal shapes for the two reads (both re-typed from `any` — recent-migration
 *  tables not in the generated types, mirroring usePaigeContribution). */
export interface DeptRow {
  slug: string;
  name: string;
  display_order: number | null;
}
export interface OpenActionRow {
  to_department: string | null;
  status: string;
  filed_at: string | null;
}

/**
 * PURE grouping — extracted so the crash-prone reduce logic is smoke-testable
 * headless (§32: a green tsc is not a working render). Given the enabled department
 * rows and the open action rows, produce one status row PER department (idle desks
 * included, count 0) sorted by display order. Null-safe against empty/garbage input.
 */
export function buildDeptStatus(
  depts: DeptRow[] | null | undefined,
  actions: OpenActionRow[] | null | undefined,
): DeptStatusRow[] {
  const deptList = Array.isArray(depts) ? depts : [];
  const actionList = Array.isArray(actions) ? actions : [];

  // Seed a status row per enabled department (so idle desks still render).
  const byDept = new Map<string, DeptStatusRow>();
  for (const d of deptList) {
    if (!d || !d.slug) continue;
    byDept.set(d.slug, {
      slug: d.slug,
      name: d.name || d.slug,
      displayOrder: typeof d.display_order === "number" ? d.display_order : 999,
      openCount: 0,
      workingCount: 0,
      awaitingCount: 0,
      lastActivityAt: null,
    });
  }

  for (const a of actionList) {
    if (!a || !a.to_department) continue;
    const row = byDept.get(a.to_department);
    if (!row) continue; // action routed to a disabled/unknown desk — not surfaced
    row.openCount++;
    if (WORKING_STATUSES.has(a.status)) row.workingCount++;
    if (AWAITING_STATUSES.has(a.status)) row.awaitingCount++;
    if (a.filed_at && (!row.lastActivityAt || a.filed_at > row.lastActivityAt)) {
      row.lastActivityAt = a.filed_at;
    }
  }

  return Array.from(byDept.values()).sort(
    (x, y) => x.displayOrder - y.displayOrder || x.name.localeCompare(y.name),
  );
}

const EMPTY: PaigeDeptStatus = { loading: true, configured: false, departments: [] };

export function usePaigeDeptStatus(): PaigeDeptStatus {
  const [state, setState] = useState<PaigeDeptStatus>(EMPTY);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setState((s) => ({ ...s, loading: true }));

      // Both reads RLS-tenant-scoped — NO tenant param (§9). `as any` casts mirror
      // usePaigeContribution: these are recent-migration tables absent from the
      // generated types, re-typed on the way out.
      /* eslint-disable @typescript-eslint/no-explicit-any */
      const [deptRes, actionsRes] = await Promise.all([
        supabase
          .from("paige_departments" as any)
          .select("slug, name, display_order")
          .eq("enabled", true),
        supabase
          .from("paige_actions" as any)
          .select("to_department, status, filed_at")
          .in("status", OPEN_STATUSES as unknown as string[])
          .limit(10000),
      ]);
      /* eslint-enable @typescript-eslint/no-explicit-any */

      if (cancelled) return;

      const depts = (deptRes.data as unknown as DeptRow[] | null) ?? [];
      const actions = (actionsRes.data as unknown as OpenActionRow[] | null) ?? [];

      // §13 — no departments seed (or read error) → not configured, EmptyState.
      const configured = !deptRes.error && depts.length > 0;

      setState({
        loading: false,
        configured,
        departments: configured ? buildDeptStatus(depts, actions) : [],
      });
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return state;
}

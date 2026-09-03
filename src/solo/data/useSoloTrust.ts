/**
 * useSoloTrust — the REAL governed autonomy posture per department, for the Solo shell.
 *
 * WHY THIS EXISTS. `src/solo/compass.tsx` seeds its `TRUST` store from `TC_DEPTS`, a fixture
 * array of ten invented department ids (`exec`, `mkt`, `cs`, `ppl`, …) each carrying a hardcoded
 * trust float. Those floats are not confined to the compass dial: `vault.tsx` renders a document's
 * pill as "Autopilot" / "Draft ready" / "Escalated" from `tr[VLT_TCD[o.dept]]`, and `systems.tsx`
 * decides `fixState` from `deptTier(SC_DEPT[c.d])`. So a hardcoded `.22` currently decides what a
 * Solo owner is told about how their legal work is governed.
 *
 * The same file already deleted `TC_LIVE` on exactly this reasoning — "a placeholder that asserts
 * liveness and names customers is a claim". An invented AUTONOMY level is the same class of claim
 * and arguably a heavier one, because it describes what Paige is permitted to do unattended.
 * `compass.fabrications.test.ts` recorded the broader finding and deferred it: "that is a real,
 * larger finding — it drives the compass dial itself … the broader one is owed with that work."
 * This hook is the read side of that owed work.
 *
 * WHAT IS REAL, MEASURED ON PROD 2026-09-03 (not inferred):
 *   • 11 departments are seeded — NOT the ten the fixture invents. Only `sales` overlaps.
 *   • 34 rows in `paige_action_kinds`, of which **32 are enabled**; every one carries
 *     `default_to_department`, spanning all 11 departments, across the three `autonomy_lane`
 *     values (auto / confirm / off).
 *   • ENABLED distribution, which is what this hook counts: owner_ops 11 (8 auto / 3 confirm) ·
 *     client_experience 7 (all confirm) · technology_automation 4 (1/3) · sales 3 (1/2) ·
 *     legal_compliance 1 (off) · people_talent 1 (off) · executive_office 1 (auto) ·
 *     operations_pmo 1 (auto) · finance, marketing, product_curriculum 1 each (confirm).
 *   • The 13-vs-11 gap on owner_ops is real and is the reason this note distinguishes rows from
 *     enabled rows: two kinds ("Set up the business", "Setup step") are `enabled = false`. An
 *     earlier revision of this header quoted the 34 TOTAL and owner_ops at 10 auto, which is not
 *     what the code below counts — it drops disabled kinds. Quoting a number the code does not
 *     produce is the same defect as inventing one, so it is corrected rather than left.
 *
 * WHAT IS NOT REAL, AND IS THEREFORE NOT RETURNED HERE (§13):
 *   • A per-TENANT department posture. All 34 rows have `tenant_id IS NULL` — they are PLATFORM
 *     DEFAULTS, identical for every tenant. `defaultLane` below is named for that: it is the
 *     platform's default for the desk, never "what this workspace chose". A caller that labels it
 *     as the tenant's own setting reintroduces the fabrication in a new place. That every row is
 *     platform-scoped TODAY is a measurement, not a guarantee — the `kind_read` policy also admits
 *     a workspace's own authored kinds — so the read below FILTERS to `tenant_id IS NULL` rather
 *     than relying on the measurement holding.
 *   • A confidence percentage. `TC_DEPTS.conf` renders "% avg confidence" and a 30-day sparkline.
 *     NO column, RPC or seam anywhere supplies a confidence signal. It is not returned and must
 *     not be derived — a number invented from other numbers is still invented.
 *   • A week-over-week trend. `TC_DEPTS.trend` renders "% vs last week". Same: no producer.
 *   • The platform's own trust ceiling. `get_platform_trust_compass()` is `is_platform_operator()`
 *     gated and deliberately unreadable by a tenant (§9) — "a tenant caller never learns the
 *     platform's posture; they only ever see its effect". This hook never attempts that read.
 *
 * §9 TENANT ISOLATION. Both reads are RLS-scoped and pass NO client-supplied tenant_id, following
 * `usePaigeDeptStatus` exactly. `paige_action_kinds` is SELECT-granted to `authenticated` under the
 * `kind_read` policy. Departments and live counts are NOT re-queried here — this composes the
 * proven `usePaigeDeptStatus` rather than standing up a rival read of the same table (§18).
 *
 * §18 ONE HOME. The department name vocabulary already has a home: `DEPARTMENT_NAMES` in
 * `useSoloActivityFeed`, verified live 2026-09-01. This hook does not restate it.
 */
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { usePaigeDeptStatus } from "@/hooks/usePaigeDeptStatus";

/** The three governed lanes (§16). Kept as a literal union so an unknown value cannot pass. */
export type AutonomyLane = "auto" | "confirm" | "off";

const LANES: readonly AutonomyLane[] = ["auto", "confirm", "off"] as const;

/**
 * The weight each lane contributes to the derived 0–1 level.
 *
 * Stated here rather than buried in the reducer because it IS the derivation: `auto` means Paige
 * acts and logs it, `confirm` means she drafts and the human decides, `off` means she never acts.
 * A department whose kinds are all `auto` derives 1; all `off` derives 0; all `confirm` derives
 * 0.5. This is a documented mapping from real rows, not a fixture — which is the whole difference
 * between this and the constant it replaces.
 */
const LANE_WEIGHT: Readonly<Record<AutonomyLane, number>> = { auto: 1, confirm: 0.5, off: 0 };

export interface SoloTrustDept {
  /** Real `paige_departments.slug` — one of the eleven, never an invented id. */
  slug: string;
  /** Real `paige_departments.name`. */
  name: string;
  displayOrder: number;
  /** Count of action kinds routed to this desk, by platform-default lane. */
  lanes: Readonly<Record<AutonomyLane, number>>;
  /** Total action kinds routed to this desk. Zero is a real answer, not a missing one. */
  kinds: number;
  /**
   * 0–1, derived from `lanes` by `LANE_WEIGHT`. `null` when the desk has NO action kinds at all —
   * an absent posture is reported as absent rather than as 0, because 0 reads as "never acts",
   * which is a different and stronger claim than "nothing is routed here".
   */
  defaultLevel: number | null;
  /**
   * The REAL enabled action kinds routed to this desk — the platform's own label and the lane it
   * actually runs in, from `paige_action_kinds`. e.g. "Compile daily brief" / auto,
   * "Flag for review" / off. The fixture this replaces carried invented act names under invented
   * departments, each with a slider position derived by arithmetic on an invented float. Sorted by
   * label for a stable order.
   */
  acts: Array<{ label: string; lane: AutonomyLane }>;
  /** Live open work at this desk, from `usePaigeDeptStatus` (already tenant-scoped). */
  openCount: number;
  workingCount: number;
  awaitingCount: number;
}

export interface SoloTrust {
  loading: boolean;
  /**
   * False when the departments seed or the action-kind catalogue could not be read. Callers render
   * an honest empty state; they must NEVER fall back to a fixture (§13).
   */
  configured: boolean;
  departments: SoloTrustDept[];
  /** Lookup by real slug. Empty until `configured`. */
  bySlug: Readonly<Record<string, SoloTrustDept>>;
  error: string | null;
}

const EMPTY: SoloTrust = {
  loading: true,
  configured: false,
  departments: [],
  bySlug: {},
  error: null,
};

interface KindRow {
  default_to_department: string | null;
  default_autonomy_lane: string | null;
  label: string | null;
  enabled: boolean | null;
  tenant_id: string | null;
}

/** A lane value we do not recognise is DROPPED, never bucketed into a plausible one (§13). */
function asLane(v: string | null): AutonomyLane | null {
  return LANES.includes(v as AutonomyLane) ? (v as AutonomyLane) : null;
}

/** A tenant-authored kind is NOT the platform default and is dropped wherever it is seen. */
function isPlatformDefault(k: KindRow): boolean {
  return k.tenant_id === null || k.tenant_id === undefined;
}

export function buildLaneCounts(kinds: KindRow[]): Record<string, Record<AutonomyLane, number>> {
  const out: Record<string, Record<AutonomyLane, number>> = {};
  for (const k of kinds) {
    if (!isPlatformDefault(k)) continue;
    if (k.enabled === false) continue;
    const dept = k.default_to_department;
    const lane = asLane(k.default_autonomy_lane);
    if (!dept || !lane) continue;
    out[dept] ??= { auto: 0, confirm: 0, off: 0 };
    out[dept][lane] += 1;
  }
  return out;
}

/** The real labels + lanes per department, same enabled/lane filter as the counts so the two agree. */
export function buildActLabels(kinds: KindRow[]): Record<string, Array<{ label: string; lane: AutonomyLane }>> {
  const out: Record<string, Array<{ label: string; lane: AutonomyLane }>> = {};
  const seen: Record<string, Set<string>> = {};
  for (const k of kinds) {
    if (!isPlatformDefault(k)) continue;
    if (k.enabled === false) continue;
    const dept = k.default_to_department;
    const lane = asLane(k.default_autonomy_lane);
    if (!dept || !lane) continue;
    const label = (k.label ?? "").trim();
    if (!label) continue;   // an unlabelled kind is counted but never given an invented name
    seen[dept] ??= new Set();
    if (seen[dept].has(label)) continue;
    seen[dept].add(label);
    (out[dept] ??= []).push({ label, lane });
  }
  for (const dept of Object.keys(out)) out[dept].sort((a, b) => a.label.localeCompare(b.label));
  return out;
}

export function deriveLevel(lanes: Record<AutonomyLane, number>): number | null {
  const total = lanes.auto + lanes.confirm + lanes.off;
  if (total === 0) return null;
  return (lanes.auto * LANE_WEIGHT.auto + lanes.confirm * LANE_WEIGHT.confirm + lanes.off * LANE_WEIGHT.off) / total;
}

export function useSoloTrust(accountEpoch?: string | null): SoloTrust {
  const status = usePaigeDeptStatus(accountEpoch);
  const [kinds, setKinds] = useState<{ rows: KindRow[] | null; error: string | null }>({
    rows: null,
    error: null,
  });

  useEffect(() => {
    let active = true;
    setKinds({ rows: null, error: null });

    // The epoch contract from `usePaigeDeptStatus`: a caller may deliberately pass null while the
    // server-resolved account is unavailable. Do not read.
    if (accountEpoch === null) return () => { active = false; };

    void (async () => {
      /* eslint-disable @typescript-eslint/no-explicit-any */
      // `tenant_id IS NULL` is the PLATFORM DEFAULT, and that is the only thing every caller of
      // this hook labels the result as. The `kind_read` policy is
      //   USING (enabled AND (tenant_id IS NULL OR tenant_id = public.current_user_tenant_id()))
      // so RLS deliberately also returns a workspace's OWN authored kinds. Without this filter a
      // tenant-authored kind would be aggregated into a number captioned "the platform's default
      // policy, not a setting this workspace chose" — the same fabrication class as inventing the
      // number, arriving instead by reading real rows and mislabelling them.
      const res = await supabase
        .from("paige_action_kinds" as any)
        .select("default_to_department, default_autonomy_lane, label, enabled, tenant_id")
        .is("tenant_id", null)
        .limit(5000);
      /* eslint-enable @typescript-eslint/no-explicit-any */
      if (!active) return;
      setKinds({
        rows: (res.data as unknown as KindRow[] | null) ?? null,
        error: res.error ? res.error.message : null,
      });
    })();

    return () => { active = false; };
  }, [accountEpoch]);

  return useMemo<SoloTrust>(() => {
    if (status.loading || (kinds.rows === null && kinds.error === null)) return EMPTY;

    // A read error or an unseeded catalogue is NOT configured. The compass then owes an honest
    // empty state; the one thing it must not do is fall back to the fixture this replaces.
    const configured = status.configured && kinds.error === null && (kinds.rows?.length ?? 0) > 0;
    if (!configured) {
      return { loading: false, configured: false, departments: [], bySlug: {}, error: kinds.error };
    }

    const counts = buildLaneCounts(kinds.rows ?? []);
    const acts = buildActLabels(kinds.rows ?? []);
    const departments: SoloTrustDept[] = status.departments.map((d) => {
      const lanes = counts[d.slug] ?? { auto: 0, confirm: 0, off: 0 };
      return {
        slug: d.slug,
        name: d.name,
        displayOrder: d.displayOrder,
        lanes,
        acts: acts[d.slug] ?? [],
        kinds: lanes.auto + lanes.confirm + lanes.off,
        defaultLevel: deriveLevel(lanes),
        openCount: d.openCount,
        workingCount: d.workingCount,
        awaitingCount: d.awaitingCount,
      };
    });

    const bySlug: Record<string, SoloTrustDept> = {};
    for (const d of departments) bySlug[d.slug] = d;

    return { loading: false, configured: true, departments, bySlug, error: null };
  }, [status, kinds]);
}

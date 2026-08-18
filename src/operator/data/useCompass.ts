import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { AutonomyLane, CompassDepartment } from "@/operator/surfaces/TrustCompass";

/**
 * The platform Trust Compass read — REAL lanes, derived from the record that actually holds
 * them, never a literal.
 *
 * WHERE A LANE LIVES. There is no per-department lane column; §16 puts the governance gate on
 * the ACTION KIND (`paige_action_kinds.default_autonomy_lane`, the `auto|confirm|off` enum),
 * and each kind names the department that performs it (`default_to_department`). So a
 * department's lane is the lane its own actions actually run under — read, not invented.
 *
 * WHY THE MOST RESTRICTIVE ONE. A department whose kinds sit on different lanes has no single
 * lane, and rounding that up would tell the operator a gate is more open than it is. We take
 * the tightest lane in the department and mark the department mixed in its focus line, so the
 * dial can only ever understate autonomy, never overstate it (§13).
 *
 * PLATFORM SCOPE (§9). Only `tenant_id IS NULL` rows — the platform defaults every tenant's
 * compass is clamped by. A tenant's own overrides are that tenant's, and never surface here.
 */
const LANE_OF: Record<string, AutonomyLane> = { off: 0, confirm: 1, auto: 2 };

export type CompassData = {
  departments: CompassDepartment[];
  loading: boolean;
  error: string | null;
};

export function useCompass(enabled: boolean): CompassData {
  const [departments, setDepartments] = useState<CompassDepartment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!enabled) return;
    let alive = true;

    (async () => {
      setLoading(true);
      setError(null);
      try {
        const [{ data: depts, error: dErr }, { data: kinds, error: kErr }] = await Promise.all([
          supabase
            .from("paige_departments")
            .select("slug, name, mandate, enabled, display_order")
            .eq("enabled", true)
            .order("display_order", { ascending: true }),
          supabase
            .from("paige_action_kinds")
            .select("default_to_department, default_autonomy_lane, enabled, tenant_id")
            .eq("enabled", true)
            .is("tenant_id", null),
        ]);

        if (!alive) return;
        const failure = dErr ?? kErr;
        if (failure) {
          setError(failure.message);
          setDepartments([]);
          setLoading(false);
          return;
        }

        // Tightest lane per department, plus whether that department is mixed at all.
        const tightest = new Map<string, AutonomyLane>();
        const mixed = new Set<string>();
        (kinds ?? []).forEach((k) => {
          const lane = LANE_OF[k.default_autonomy_lane];
          if (lane === undefined) return;
          const seen = tightest.get(k.default_to_department);
          if (seen === undefined) tightest.set(k.default_to_department, lane);
          else if (seen !== lane) {
            mixed.add(k.default_to_department);
            if (lane < seen) tightest.set(k.default_to_department, lane);
          }
        });

        setDepartments(
          (depts ?? [])
            // A department with no action kinds has no lane to show. Printing a dial for it
            // would assert a gate that does not exist, so it is left out entirely (§13).
            .filter((d) => tightest.has(d.slug))
            .map((d) => ({
              id: d.slug,
              name: d.name,
              lane: tightest.get(d.slug)!,
              focus: mixed.has(d.slug)
                ? "Mixed lanes across its actions — showing the tightest"
                : (d.mandate ?? null),
            })),
        );
      } catch (e) {
        if (alive) setError(e instanceof Error ? e.message : "Could not read the compass.");
      } finally {
        if (alive) setLoading(false);
      }
    })();

    return () => {
      alive = false;
    };
  }, [enabled]);

  return { departments, loading, error };
}

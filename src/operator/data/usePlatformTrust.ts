import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { SpineTrustLevel } from "@/operator/shell/spine/spineContract";

/**
 * The platform Trust Compass read — the rung the chat strip IS, and the tally it reports.
 *
 * Owner, 2026-08-23: *"This is where the actual control of Trust Compass and everything lives
 * inside of the chat. We have compressed a lot of things because we don't need those things to
 * have their own dedicated areas any longer."* So this hook exists to make the strip above the
 * transcript a real control rather than a drawing of one.
 *
 * ─── THE TWO READS, AND WHY NEITHER IS INVENTED (§13) ────────────────────────────────────────
 *
 * THE RUNG comes from `get_platform_trust_compass()` — one `admin_app_settings` row, operator
 * -scope gated in the function body (§59). A ceiling is a governance gate: every capability's
 * effective grant is `min(its own grant, the ceiling)`. A plausible-looking rung would tell the
 * operator a gate is set where it is not, so a NULL read renders NO meter at all rather than a
 * default. `trust` comes back null and `SpineConversation` omits the strip on its own.
 *
 * THE TALLY comes from `list_tool_autonomy()` — the shipped per-tool autonomy catalogue
 * (`auto | confirm | off`), which is the same record the runtime clamp reads before Paige acts.
 * The pack's own IA notes name that table as the substrate (`paige-ia.js` L2478–L2480), so this
 * is the catalogue CD drew against, not a substitute for it.
 *
 * ─── THE ARITHMETIC IS THE PACK'S, NOT AN INTERPRETATION ─────────────────────────────────────
 *
 * `v3.dc.html` L4457 `CAP_ON_TRUST = [4, 2, 1]` and L4471–L4479 `effAutonomy()`:
 *
 *   own  = the capability's own grant   0 Autonomous · 1 Ask first · 2 Draft only
 *   eff  = min(CAP_ON_TRUST[own], ceiling)
 *   eff <= 0                → Held        (index 3)
 *   idx  = eff >= 4 ? 0 : eff >= 2 ? 1 : 2
 *
 * The two scales run opposite ways on purpose — the capability scale counts DOWN from
 * autonomous, the trust scale counts UP to it — and `CAP_ON_TRUST` is the one place they meet.
 * Re-deriving it would be re-deciding it.
 */

/** The five rungs, low to high (`trustVals` L4578–L4584). Names are the pack's. */
export const TRUST_CEILING_MAX = 4;

/** `CAP_ON_TRUST` (L4457): a capability grant expressed on the trust scale. */
const CAP_ON_TRUST = [4, 2, 1] as const;

/** `auto | confirm | off` → the pack's capability-grant index. */
const GRANT_OF_MODE: Record<string, 0 | 1 | 2> = { auto: 0, confirm: 1, off: 2 };

export type PlatformTrust = {
  /** The stored rung, or null when the platform holds none — the strip then renders nothing. */
  level: SpineTrustLevel | null;
  /** Autonomous · ask first · draft only · held. Null until the catalogue read succeeds. */
  tally: readonly [number, number, number, number] | null;
  /** `hold | reversible | ceiling` — the absence rule the full panel edits. */
  away: string | null;
  /** Per-domain rungs, each at or below the ceiling. */
  domains: Readonly<Record<string, number>>;
  loading: boolean;
  error: string | null;
  /** Moves the ceiling. Rejected server-side for anyone below super_admin (§53). */
  setLevel: (next: SpineTrustLevel) => Promise<void>;
};

/** `effAutonomy` L4471–L4479, verbatim in arithmetic. */
export function effectiveGrantIndex(own: 0 | 1 | 2, ceiling: number): 0 | 1 | 2 | 3 {
  const eff = Math.min(CAP_ON_TRUST[own], ceiling);
  if (eff <= 0) return 3;
  return eff >= 4 ? 0 : eff >= 2 ? 1 : 2;
}

/** The four-way count the compass line reports (L10651–L10653). */
export function tallyGrants(
  grants: readonly (0 | 1 | 2)[],
  ceiling: number,
): [number, number, number, number] {
  const out: [number, number, number, number] = [0, 0, 0, 0];
  grants.forEach((g) => {
    out[effectiveGrantIndex(g, ceiling)] += 1;
  });
  return out;
}

export function usePlatformTrust(enabled: boolean): PlatformTrust {
  const [level, setLevelState] = useState<SpineTrustLevel | null>(null);
  const [away, setAway] = useState<string | null>(null);
  const [domains, setDomains] = useState<Record<string, number>>({});
  const [grants, setGrants] = useState<readonly (0 | 1 | 2)[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!enabled) return;
    let alive = true;

    (async () => {
      setLoading(true);
      setError(null);
      const [compass, catalogue] = await Promise.all([
        supabase.rpc("get_platform_trust_compass"),
        // No tenant argument, so `list_tool_autonomy` resolves the caller's OWN scope: the
        // platform default set for a tenant-less operator, and — while acting as a tenant
        // (§51) — that tenant's overrides. That is the correct pairing, not a scope mix: the
        // ceiling is the PLATFORM's and clamps every tenant, so `min(own grant, ceiling)` over
        // the scope you are standing in is exactly what binds Paige right now. The ScopeBand
        // above already says which scope that is.
        supabase.rpc("list_tool_autonomy"),
      ]);
      if (!alive) return;

      // The two reads fail independently and are reported independently: a missing catalogue
      // must not blank a rung that IS stored, and vice versa.
      if (compass.error) {
        setError(compass.error.message);
        setLevelState(null);
      } else {
        const v = compass.data as { ceiling?: number; away?: string; domains?: Record<string, number> } | null;
        const raw = v?.ceiling;
        setLevelState(
          typeof raw === "number" && raw >= 0 && raw <= TRUST_CEILING_MAX
            ? (raw as SpineTrustLevel)
            : null,
        );
        setAway(v?.away ?? null);
        setDomains(v?.domains ?? {});
      }

      if (catalogue.error) {
        setGrants(null);
      } else {
        const rows = (catalogue.data ?? []) as { mode?: string | null }[];
        const mapped = rows
          .map((r) => GRANT_OF_MODE[String(r.mode ?? "")])
          // A row whose mode is outside the enum is dropped rather than guessed at — it would
          // otherwise be counted into a lane it may not be on.
          .filter((g): g is 0 | 1 | 2 => g !== undefined);
        setGrants(mapped.length > 0 ? mapped : null);
      }

      setLoading(false);
    })();

    return () => {
      alive = false;
    };
  }, [enabled]);

  const setLevel = useCallback(async (next: SpineTrustLevel) => {
    const { data, error: rpcError } = await supabase.rpc("set_platform_trust_compass", {
      _ceiling: next,
    });
    if (rpcError) {
      // The strip does not move on a refusal. A control that appears to have taken a setting
      // the server rejected is the exact lie a governance gate cannot afford (§13).
      setError(rpcError.message);
      return;
    }
    const v = data as { ceiling?: number; away?: string; domains?: Record<string, number> } | null;
    if (typeof v?.ceiling === "number") setLevelState(v.ceiling as SpineTrustLevel);
    if (v?.away) setAway(v.away);
    if (v?.domains) setDomains(v.domains);
    setError(null);
  }, []);

  return {
    level,
    tally: level === null || grants === null ? null : tallyGrants(grants, level),
    away,
    domains,
    loading,
    error,
    setLevel,
  };
}

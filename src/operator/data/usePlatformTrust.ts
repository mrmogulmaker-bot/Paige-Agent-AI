import { createContext, createElement, useCallback, useContext, useEffect, useState } from "react";
import type { ReactNode } from "react";
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

/**
 * `posture` — the DAILY MODE (owner ruling 2026-08-24, pointing at Claude Code's own mode sheet:
 * *"It acts as a daily in the Chat the same way these features are set here for you."*). A rung
 * set for a few hours that ALWAYS expires. `active` is resolved server-side against `now()`, so a
 * lapsed posture reports itself lapsed rather than disappearing — the chat can say it ran out
 * instead of quietly showing the ceiling again.
 *
 * IT MAY RAISE AS WELL AS LOWER (owner ruling, same day: *"Yes we should have the ability to go
 * full auto."*). The direction decides the authority, not the rung: lowering is any platform
 * operator, raising is super_admin only. A raise is also shorter — 4h by default, 24h maximum —
 * because an unattended full-auto window is the most expensive state the platform has. Both
 * still expire, which is what makes a temporary raise safer than moving the ceiling to 4 and
 * forgetting.
 */
export type TrustPosture = {
  readonly level: SpineTrustLevel;
  /** ISO timestamp. A posture with no expiry cannot be created (`set_trust_posture` refuses). */
  readonly until: string;
  readonly reason: string | null;
  readonly active: boolean;
  /** True while she is running ABOVE the standing ceiling — worth saying out loud, not deriving. */
  readonly aboveCeiling: boolean;
};

/**
 * §68 — why the rung in force is not the rung that was set.
 *
 * A clamp nobody can see is indistinguishable from a bug, so the server publishes the reason
 * alongside the number: how old the human attestation is, when it lapses, which safety loops this
 * rung requires, and what those loops last reported. `capped_by` names which of the two conditions
 * did the capping when they differ.
 */
export type TrustAuthority = {
  /** When a human last re-affirmed the ceiling. Null means never — which caps at Draft. */
  readonly attestedAt: string | null;
  /** How long this rung stands on one attestation; null at rungs 0-1, which never expire. */
  readonly window: string | null;
  readonly expiresAt: string | null;
  /** The checks this rung requires PASSING. Empty at rungs 0-1. */
  readonly requiredProof: readonly string[];
  /** Latest status per required check. `pass` is the only affirmative value. */
  readonly proof: Record<string, { status: string; at: string | null; fresh: boolean; reason: string | null }>;
};

export type PlatformTrust = {
  /**
   * The CEILING — the stored maximum, and what the strip's picker edits. Null when the platform
   * holds none, and then the strip renders nothing rather than a rung nobody set.
   */
  level: SpineTrustLevel | null;
  /**
   * What actually binds Paige RIGHT NOW: the posture while one is live, otherwise the ceiling.
   * **Every clamp reads this, never `level`.** Reading the ceiling would ignore a brake the
   * operator pulled for the day AND ignore a full-auto window they opened — the read must not err
   * in either direction, and since the posture may now sit either side of the ceiling, the server
   * returns the answer rather than the client deriving it from two numbers.
   */
  effective: SpineTrustLevel | null;
  /**
   * §68 — the rung that was ASKED for, before attestation age and the safety loops clamped it.
   * Equal to `effective` when nothing capped it. Published so a surface can show the gap rather
   * than leaving an operator to wonder why the rung they set is not the rung in force.
   */
  requested: SpineTrustLevel | null;
  /** `attestation` | `proof` | null — which condition capped the rung, when one did. */
  cappedBy: "attestation" | "proof" | null;
  authority: TrustAuthority | null;
  posture: TrustPosture | null;
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
  /**
   * Sets the daily posture. The SERVER decides who may, by direction: lowering is any platform
   * operator (a brake needs no God tier), raising above the ceiling is super_admin only and is
   * audited as its own action. `hours` may be omitted — the server defaults it by direction, 24h
   * for a lowering and 4h for a raise. Resolves the server's own message when refused, and null
   * on success; the control does not move on a refusal.
   */
  setPosture: (level: SpineTrustLevel, hours?: number, reason?: string) => Promise<string | null>;
  clearPosture: () => Promise<void>;
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

/**
 * `set_trust_posture` / `clear_trust_posture` are not in the generated types yet — those are
 * produced FROM the live schema, and this migration applies on merge (`deploy-migrations.yml`).
 * So the call goes through the same untyped escape hatch `studio.ts` already uses, with its
 * hard-won warning intact: **bind, never detach.** A bare `const call = supabase.rpc` loses its
 * `this` and throws before a request is ever sent, which once surfaced as every read and write
 * failing with a generic message.
 *
 * DELETE THIS the moment `npm run types:supabase` is re-run after the migration lands — it is a
 * gap in the type surface, not a pattern to spread.
 */
type UntypedRpc = (
  fn: string,
  params?: Record<string, unknown>,
) => Promise<{ data: unknown; error: { message: string } | null }>;

const untypedRpc = () => supabase.rpc.bind(supabase) as unknown as UntypedRpc;

/** What `get_platform_trust_compass()` returns. `effective` is resolved server-side. */
type CompassRead = {
  ceiling?: number;
  effective?: number;
  away?: string;
  domains?: Record<string, number>;
  above_ceiling?: boolean;
  requested?: number;
  capped_by?: string | null;
  authority?: {
    attested_at?: string | null;
    window?: string | null;
    expires_at?: string | null;
    required_proof?: string[] | null;
    proof?: Record<string, { status?: string; at?: string | null; fresh?: boolean; reason?: string | null }> | null;
  } | null;
  posture?: {
    level?: number; until?: string; reason?: string | null;
    active?: boolean; above_ceiling?: boolean;
  } | null;
};

/** A rung, or null. Anything outside 0..4 is not coerced — it is refused (§13). */
function rung(v: unknown): SpineTrustLevel | null {
  return typeof v === "number" && v >= 0 && v <= TRUST_CEILING_MAX ? (v as SpineTrustLevel) : null;
}

function readPosture(p: CompassRead["posture"]): TrustPosture | null {
  const level = rung(p?.level);
  if (!p || level === null || !p.until) return null;
  return {
    level,
    until: p.until,
    reason: p.reason ?? null,
    active: p.active === true,
    aboveCeiling: p.above_ceiling === true,
  };
}

/**
 * A missing `authority` block means the deployed function predates §68 — report null rather than
 * synthesising an attestation that was never made (§13). A surface reading null shows nothing
 * about expiry, which is honest; showing "attested just now" would not be.
 */
function readAuthority(a: CompassRead["authority"]): TrustAuthority | null {
  if (!a) return null;
  return {
    attestedAt: a.attested_at ?? null,
    window: a.window ?? null,
    expiresAt: a.expires_at ?? null,
    requiredProof: a.required_proof ?? [],
    proof: Object.fromEntries(
      Object.entries(a.proof ?? {}).map(([k, v]) => [
        k,
        {
          status: String(v?.status ?? "never_run"),
          at: v?.at ?? null,
          fresh: v?.fresh === true,
          reason: v?.reason ?? null,
        },
      ]),
    ),
  };
}

function useTrustRead(enabled: boolean): PlatformTrust {
  const [level, setLevelState] = useState<SpineTrustLevel | null>(null);
  const [effective, setEffective] = useState<SpineTrustLevel | null>(null);
  const [requested, setRequested] = useState<SpineTrustLevel | null>(null);
  const [cappedBy, setCappedBy] = useState<"attestation" | "proof" | null>(null);
  const [authority, setAuthority] = useState<TrustAuthority | null>(null);
  const [posture, setPostureState] = useState<TrustPosture | null>(null);
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
        setRequested(null);
        setCappedBy(null);
        setAuthority(null);
      } else {
        const v = compass.data as CompassRead | null;
        const ceiling = rung(v?.ceiling);
        setLevelState(ceiling);
        // `effective` is resolved SERVER-side (posture vs ceiling vs expiry), so the client never
        // re-decides which one binds. It falls back to the ceiling only when the server did not
        // send one — an older function version — rather than inventing an answer (§13).
        setEffective(rung(v?.effective) ?? ceiling);
        // §68. On a pre-§68 function `requested` is absent, and the honest reading is that
        // nothing was clamped — effective IS what was asked for — so it mirrors, and `cappedBy`
        // stays null rather than implying a cap the server never applied.
        setRequested(rung(v?.requested) ?? rung(v?.effective) ?? ceiling);
        setCappedBy(v?.capped_by === "attestation" || v?.capped_by === "proof" ? v.capped_by : null);
        setAuthority(readAuthority(v?.authority));
        setPostureState(readPosture(v?.posture));
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

  /**
   * ONE APPLIER FOR EVERY WRITE. `setLevel`, `setPosture` and `clearPosture` all return the SAME
   * compass shape, and each one used to unpack it its own way — three copies of one mapping, which
   * is the duplication this file's own docblock says is how the two-ceilings defect happened. It
   * is written once.
   */
  const applyCompass = useCallback((v: CompassRead | null) => {
    if (!v) return;
    const ceiling = rung(v.ceiling);
    if (ceiling !== null) setLevelState(ceiling);
    setEffective(rung(v.effective) ?? ceiling);
    setPostureState(readPosture(v.posture));
    if (v.away) setAway(v.away);
    if (v.domains) setDomains(v.domains);
  }, []);

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
    applyCompass(data as CompassRead | null);
    setError(null);
  }, [applyCompass]);

  const setPosture = useCallback(
    async (next: SpineTrustLevel, hours?: number, reason?: string) => {
      const { data, error: rpcError } = await untypedRpc()("set_trust_posture", {
        _level: next,
        // Omitted rather than defaulted here, so the SERVER picks by direction — a client default
        // of 24 would silently ask for a 24h full-auto window the server then refuses.
        ...(hours === undefined ? {} : { _hours: hours }),
        _reason: reason ?? null,
      });
      if (rpcError) {
        // The control does not move on a refusal, and the server's own message is returned rather
        // than a generic one — asking above the ceiling is refused BY DESIGN, and its message
        // names the deliberate path instead. Swallowing that would make a correct refusal read
        // as a broken control.
        setError(rpcError.message);
        return rpcError.message;
      }
      applyCompass(data as CompassRead | null);
      setError(null);
      return null;
    },
    [applyCompass],
  );

  const clearPosture = useCallback(async () => {
    const { data, error: rpcError } = await untypedRpc()("clear_trust_posture");
    if (rpcError) {
      setError(rpcError.message);
      return;
    }
    applyCompass(data as CompassRead | null);
    setError(null);
  }, [applyCompass]);

  return {
    level,
    effective,
    requested,
    cappedBy,
    authority,
    posture,
    // The tally reports what is IN FORCE, so it counts against `effective` — a tally computed
    // against the ceiling would tell the operator more is autonomous than actually is.
    tally: effective === null || grants === null ? null : tallyGrants(grants, effective),
    away,
    domains,
    loading,
    error,
    setLevel,
    setPosture,
    clearPosture,
  };
}

/**
 * ─── ONE HOME FOR THE CEILING (§18) ──────────────────────────────────────────────────────────
 *
 * The defect this exists to make impossible, caught on the live console 2026-08-24: the spine
 * header read **Act and report** while Systems Check, on the same screen, read **Ask first**.
 * Two ceilings, one platform.
 *
 * Both were DERIVED — neither was a typed literal — which is what made it look impossible from
 * the source. The mechanism is duplication of a different kind: each consumer called the hook
 * and got its OWN `useState` copy of the value, fetched once at ITS mount. The operator moved
 * the rung from the spine strip (the stored row went to 3 at 00:30), the spine updated its own
 * copy, and every other consumer went on rendering the value it had read earlier. The screen
 * then asserted two different governance ceilings at once, and the stale one was the more
 * dangerous — it under-reports what she may do.
 *
 * That is the same principle rule 3 applies to prose, applied to STATE: a value that can be
 * derived is never held twice. So the read happens ONCE, in a provider at the shell root, and
 * every consumer reads that one copy. A `setLevel` from anywhere updates all of them because
 * there is only one.
 *
 * `useTrustRead` above is the fetching implementation and is no longer exported — calling it
 * directly would recreate the exact duplication this replaces.
 */
const PlatformTrustContext = createContext<PlatformTrust | null>(null);

export function PlatformTrustProvider({ children }: { children: ReactNode }) {
  const value = useTrustRead(true);
  return createElement(PlatformTrustContext.Provider, { value }, children);
}

/**
 * The ceiling, read from the one shared source.
 *
 * Outside the provider it returns the honest unwired shape rather than throwing: a component
 * rendered in isolation (a test, a detached window) then draws no meter, which is the same
 * thing it draws when the platform holds no rung. A thrown error would turn a missing provider
 * into a blank surface, and this console has shipped enough of those.
 */
export function usePlatformTrust(_enabled: boolean = true): PlatformTrust {
  const ctx = useContext(PlatformTrustContext);
  return (
    ctx ?? {
      // No provider — a detached window, a test, a surface mounted on its own. Everything reads
      // as UNKNOWN rather than as a rung, so a consumer renders no meter instead of a ceiling
      // nobody set; and the writers are no-ops that resolve rather than throw, so a control
      // outside the provider is inert rather than crashing the surface around it.
      level: null,
      effective: null,
      requested: null,
      cappedBy: null,
      authority: null,
      posture: null,
      tally: null,
      away: null,
      domains: {},
      loading: false,
      error: null,
      setLevel: async () => {},
      setPosture: async () => "No trust provider is mounted, so nothing was changed.",
      clearPosture: async () => {},
    }
  );
}

/**
 * useSoloToolGovernance — the REAL, tenant-writable per-tool autonomy, grouped into the capability
 * domains the Trust Compass shows.
 *
 * WHAT IS REAL HERE (measured against the deployed contracts, not inferred):
 *   • READ stored: `list_tool_autonomy()` returns the tenant's own per-tool mode (or the platform
 *     default `confirm`) plus `is_default`. RLS/DEFINER-scoped to the caller's tenant (§9).
 *   • WRITE: `set_tool_autonomy(tool_key, mode)` upserts `tenant_tool_autonomy` for the caller's own
 *     tenant, admitted only for a tenant admin or platform owner. This is the ONE genuinely
 *     tenant-writable governance seam, and `resolve_tool_autonomy` — the function the chat runtime
 *     consults before acting — reads it. So a change here changes what Paige may actually do.
 *   • CEILING: `resolve_tool_autonomy(tenant, tool)` returns the tenant's stored mode narrowed by the
 *     platform Trust-Compass ceiling. The tenant may see the EFFECT (a narrower mode) but never the
 *     ceiling itself (§4.2 — `trust_effective_rung` is revoked from every role). The clamp is a pure
 *     function of (stored mode, rung), identical for every tool, so this hook probes it with at most
 *     one call per distinct stored mode rather than once per tool.
 *   • RISK: a tool's action-risk class caps what it can genuinely be set to (`high` can never run
 *     `auto`; `owner_only` is never assistant-driven). The one home is `action-risk.ts`; the guarded
 *     copy is `capabilityTools.ts`. The knob is capped so it never offers a mode the runtime would
 *     neutralise (§70.1 — no false affordance), and writes the CLAMPED mode so the stored value can
 *     never be a misleading `auto` behind a `high` tool.
 *
 * WHAT IS NOT CLAIMED (§13): a tool absent from the catalogue read is not shown; a failed read is an
 * honest error, never an empty grid; the platform ceiling number/posture is never surfaced; and a
 * write that the server refuses (not an admin, tenant mismatch) surfaces the refusal and the
 * displayed value stays the last real read — nothing is faked as saved.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  CAPABILITY_DOMAINS,
  TOOL_MAP,
  clampModeToRisk,
  maxModeForRisk,
  postureOf,
  rankOfMode,
  type CapabilityKey,
  type Posture,
  type ToolMode,
  type ToolRisk,
} from "./capabilityTools";

interface CatalogueRow {
  tool_key: string;
  label: string | null;
  category: string | null;
  mode: string | null;
  is_default: boolean | null;
}

/** A single governed tool, with its real stored + effective state and why they differ. */
export interface GovernedTool {
  toolKey: string;
  label: string;
  category: string;
  capability: CapabilityKey;
  risk: ToolRisk;
  /** What the tenant has stored (COALESCE default 'confirm'). */
  stored: ToolMode;
  /** True when no tenant row exists — this is the platform default, not a choice this workspace made. */
  isDefault: boolean;
  /** What the tool will ACTUALLY run at = min(stored, ceiling, risk cap). */
  effective: ToolMode;
  /** The highest mode this tool can genuinely be set to (risk cap). */
  maxSettable: ToolMode;
  /**
   * Whether this workspace can change the tool here at all. False for an owner_only tool (never
   * assistant-driven) AND for a non-admin viewer — `set_tool_autonomy` requires a tenant admin, so a
   * non-admin gets a read-only control, never an active slider that only fails on write (§70.1).
   */
  settable: boolean;
  /** Present when effective < stored: why the tool is held below the stored setting. */
  heldBack: { by: "risk" | "policy"; reason: string } | null;
}

export interface GovernedDomain {
  key: CapabilityKey;
  title: string;
  icon: string;
  blurb: string;
  tools: GovernedTool[];
  /** The domain knob position: the common desired level, read from the settable tools. */
  level: ToolMode;
  /** True when the settable tools are not all at one level (e.g. changed individually). */
  mixed: boolean;
  /** Aggregate effective posture for the card. */
  posture: Posture;
  /** How many tools sit at each effective posture, for the reasoning line. */
  counts: Record<Posture, number>;
  /** The highest mode any tool in the domain can be set to (so the knob caps correctly). */
  domainMax: ToolMode;
  /** A one-line honest note when the domain is held below its setting, else null. */
  heldBackNote: string | null;
}

export interface SoloToolGovernance {
  loading: boolean;
  /** False on a read error or an empty catalogue — render an honest state, never a fixture. */
  configured: boolean;
  error: string | null;
  domains: GovernedDomain[];
  byTool: Readonly<Record<string, GovernedTool>>;
  /** True when the platform ceiling is currently narrowing at least one tool below its setting. */
  ceilingLimiting: boolean;
  /**
   * True when at least one ceiling probe could not be read, so the displayed modes may be shown MORE
   * permissive than the platform ceiling would actually allow. The surface says so honestly rather
   * than implying it confirmed no narrowing (§13) — a failed probe must never read as "unrestricted".
   */
  ceilingUnconfirmed: boolean;
  /**
   * Whether the current viewer may change settings here — mirrors the EXACT server predicate
   * `set_tool_autonomy` enforces (`is_current_user_tenant_admin` OR `is_platform_owner`). Fail-closed:
   * false on a failed or pending authority read, so a non-admin never sees an editable control that
   * would only fail on write (§70.1).
   */
  canWrite: boolean;
  /**
   * True when the authority read itself could not be completed (a transient error), so `canWrite`
   * being false is UNPROVEN rather than a confirmed non-admin. The surface says "couldn't confirm your
   * access" with a retry instead of asserting read-only as fact (§13) — writes stay fail-closed.
   */
  authorityUnconfirmed: boolean;
  setDomainMode: (key: CapabilityKey, mode: ToolMode) => Promise<{ ok: boolean; error?: string }>;
  setToolMode: (toolKey: string, mode: ToolMode) => Promise<{ ok: boolean; error?: string }>;
  refresh: () => void;
}

const LANES: readonly ToolMode[] = ["auto", "confirm", "off"];
function asMode(v: string | null | undefined): ToolMode {
  return LANES.includes(v as ToolMode) ? (v as ToolMode) : "confirm";
}

// The governance RPCs (list_/resolve_/set_tool_autonomy) are not in the generated client types, so
// they are called through this thin typed shim rather than scattering `as never` casts that erase
// the result type. One home, one cast (§18).
type RpcResult = { data: unknown; error: { message: string } | null };
const rpc = (fn: string, args?: Record<string, unknown>): Promise<RpcResult> =>
  (supabase.rpc as unknown as (n: string, a?: unknown) => Promise<RpcResult>)(fn, args);

const EMPTY: SoloToolGovernance = {
  loading: true,
  configured: false,
  error: null,
  domains: [],
  byTool: {},
  ceilingLimiting: false,
  ceilingUnconfirmed: false,
  canWrite: false,
  authorityUnconfirmed: false,
  setDomainMode: async () => ({ ok: false, error: "not ready" }),
  setToolMode: async () => ({ ok: false, error: "not ready" }),
  refresh: () => {},
};

/** The domain knob's read-back level: the most permissive setting among its settable tools. */
function domainLevelOf(tools: GovernedTool[]): { level: ToolMode; mixed: boolean } {
  const settable = tools.filter((t) => t.settable);
  if (!settable.length) return { level: "off", mixed: false };
  const ranks = settable.map((t) => rankOfMode(t.stored));
  const max = Math.max(...ranks);
  const min = Math.min(...ranks);
  return { level: (["off", "confirm", "auto"] as ToolMode[])[max], mixed: max !== min };
}

/**
 * The whole derivation, pure and exported so it can be tested against real row shapes without a
 * client mock (mirrors `useSoloTrust`'s `buildLaneCounts`/`deriveLevel`). Given the catalogue rows
 * (already filtered to mapped tools) and the ceiling probe, it produces the per-tool effective state
 * and the per-domain aggregate. `effective = min(stored, ceiling, risk cap)`; a tool held below its
 * stored setting carries the binding reason (ceiling before risk).
 */
export function deriveGovernance(
  rows: CatalogueRow[],
  ceilingByStored: Partial<Record<ToolMode, ToolMode>>,
  canWrite = true,
): { domains: GovernedDomain[]; byTool: Record<string, GovernedTool>; ceilingLimiting: boolean } {
  const byTool: Record<string, GovernedTool> = {};
  let ceilingLimiting = false;

  for (const row of rows) {
    const meta = TOOL_MAP[row.tool_key];
    if (!meta) continue;
    const stored = asMode(row.mode);
    const ceilingEff = ceilingByStored[stored] ?? stored; // min(stored, ceiling)
    const riskCap = maxModeForRisk(meta.risk);
    const effective = clampModeToRisk(ceilingEff, meta.risk); // min(stored, ceiling, risk)

    let heldBack: GovernedTool["heldBack"] = null;
    if (meta.risk !== "owner_only" && rankOfMode(effective) < rankOfMode(stored)) {
      // Which constraint is binding, and which is the HONEST reason to show? Risk is a PERMANENT cap;
      // the ceiling is a possibly-temporary platform narrowing. `riskClamped` is what the risk cap
      // ALONE would allow. Attribute the hold to risk whenever the risk cap already fully explains it
      // (it is the binding or co-binding constraint), so a consequential tool is never mislabeled as
      // "limited by policy right now" — a phrase that implies the limit could lift when the risk cap
      // never will. Only when the ceiling is STRICTLY more restrictive than the risk cap is the
      // ceiling the binding reason, and only then is the platform actually narrowing the outcome.
      const riskClamped = clampModeToRisk(stored, meta.risk);
      if (rankOfMode(riskClamped) <= rankOfMode(ceilingEff) && rankOfMode(riskClamped) < rankOfMode(stored)) {
        heldBack = {
          by: "risk",
          reason:
            meta.risk === "high"
              ? "This action is consequential, so it still asks first."
              : "Held below your setting.",
        };
      } else {
        heldBack = { by: "policy", reason: "Further limited by platform policy right now." };
        ceilingLimiting = true;
      }
    }

    byTool[row.tool_key] = {
      toolKey: row.tool_key,
      label: (row.label ?? row.tool_key).trim(),
      category: (row.category ?? "").trim(),
      capability: meta.capability,
      risk: meta.risk,
      stored,
      isDefault: row.is_default !== false,
      effective,
      maxSettable: riskCap,
      // Settable only when this is not an owner_only tool AND the viewer can actually write —
      // otherwise the knob would be an active control that only fails on the server (§70.1).
      settable: canWrite && meta.risk !== "owner_only",
      heldBack,
    };
  }

  const domains: GovernedDomain[] = CAPABILITY_DOMAINS.map((d) => {
    const tools = Object.values(byTool)
      .filter((t) => t.capability === d.key)
      .sort((a, b) => a.label.localeCompare(b.label));
    const counts: Record<Posture, number> = { guardrails: 0, asks: 0, held: 0, your_call: 0, not_ready: 0 };
    for (const t of tools) counts[postureOf(t.effective, t.risk)] += 1;
    const domainMax = tools.reduce<ToolMode>(
      (m, t) => (rankOfMode(t.maxSettable) > rankOfMode(m) ? t.maxSettable : m),
      "off",
    );
    // The knob's read-back level is the common desired level, but it can never exceed the domain's
    // own cap — otherwise the domain knob would render aria-valuenow above aria-valuemax (§70.1).
    const raw = domainLevelOf(tools);
    const level: ToolMode = rankOfMode(raw.level) > rankOfMode(domainMax) ? domainMax : raw.level;
    const mixed = raw.mixed;
    // Aggregate posture: the most restrictive effective among the tools that Paige can act through.
    const actable = tools.filter((t) => t.risk !== "owner_only");
    const posture: Posture = !actable.length
      ? "your_call"
      : actable.every((t) => t.effective === "auto")
        ? "guardrails"
        : actable.some((t) => t.effective === "off")
          ? "held"
          : "asks";
    const heldTools = tools.filter((t) => t.heldBack);
    const heldBackNote = heldTools.length
      ? heldTools.some((t) => t.heldBack?.by === "policy")
        ? "Some actions here are further limited by platform policy right now."
        : "Some consequential actions here still ask first."
      : null;
    return { key: d.key, title: d.title, icon: d.icon, blurb: d.blurb, tools, level, mixed, posture, counts, domainMax, heldBackNote };
  });

  return { domains, byTool, ceilingLimiting };
}

export function useSoloToolGovernance(accountEpoch?: string | null): SoloToolGovernance {
  const [state, setState] = useState<{
    rows: CatalogueRow[] | null;
    ceilingByStored: Partial<Record<ToolMode, ToolMode>>;
    ceilingUnconfirmed: boolean;
    canWrite: boolean;
    authorityUnconfirmed: boolean;
    error: string | null;
  }>({ rows: null, ceilingByStored: {}, ceilingUnconfirmed: false, canWrite: false, authorityUnconfirmed: false, error: null });
  const [reloadKey, setReloadKey] = useState(0);

  const refresh = useCallback(() => setReloadKey((k) => k + 1), []);

  // The tenant this surface is bound to. Passed as `_tenant_id` to every write and read.
  //  • WRITES + the CATALOGUE read (set_tool_autonomy / list_tool_autonomy): their tenant-mismatch guard
  //    REJECTS a request that lands after the admin switched workspaces (§9/§51), so a stale cross-workspace
  //    write or catalogue read is server-refused.
  //  • The CEILING probe (resolve_tool_autonomy): passing the tenant is REQUIRED for a platform-owner act-as
  //    (that function does NOT pin an owner to current_user_tenant_id, so a null tenant would return the
  //    'confirm' fallback and misreport the ceiling). For a NON-owner it is advisory only: resolve_tool_autonomy
  //    pins to current_user_tenant_id() and does NOT carry a mismatch guard — and it deliberately cannot, because
  //    it is the SHARED resolver `resolve_automation_autonomy` calls to resolve an automation in ANY tenant the
  //    caller is a member of (not just the active one); a mismatch guard there would abort that legitimate
  //    cross-membership call (Codex round-6 F-B). So the stale-read protection for the ceiling is the
  //    tenant-bound CATALOGUE read above (which rejects) plus the `accountEpoch` re-key that cancels this whole
  //    effect the instant the active workspace changes — not a guard on the shared resolver.
  const expectedTenant: string | null =
    typeof accountEpoch === "string" && accountEpoch ? accountEpoch : null;

  useEffect(() => {
    let active = true;
    setState({ rows: null, ceilingByStored: {}, ceilingUnconfirmed: false, canWrite: false, authorityUnconfirmed: false, error: null });
    // The epoch contract (mirrors useSoloTrust): a null epoch means the account is not resolved yet.
    if (accountEpoch === null) return () => { active = false; };

    void (async () => {
      // Whether this viewer may write is EXACTLY the predicate set_tool_autonomy enforces:
      // is_current_user_tenant_admin OR is_platform_owner (a super-admin acting-as a tenant has no
      // tenant_members row but the write contract still authorises them, §53). Fail-closed so a
      // non-admin renders read-only, never an active control that only fails on the server (§70.1) —
      // but keep an authority-read ERROR distinct from a confirmed non-admin: presenting an unproven
      // "read-only" as fact is the same §13 dishonesty as a fabricated value.
      const [res, adminRes, ownerRes] = await Promise.all([
        // Bind the catalogue read to the initiating workspace, exactly as the ceiling probe and every
        // write do. list_tool_autonomy carries the same AUTONOMY_FORBIDDEN tenant-mismatch guard, so a
        // stale read for workspace A that lands after a switch to B is REJECTED for a non-owner (rather
        // than silently returning B's stored modes onto A's still-mounted surface, §9), and a
        // platform-owner act-as read stays pinned to the tenant being viewed (§53).
        rpc("list_tool_autonomy", { _tenant_id: expectedTenant }),
        rpc("is_current_user_tenant_admin"),
        rpc("is_platform_owner"),
      ]);
      if (!active) return;
      const isAdmin = !adminRes.error && adminRes.data === true;
      const isOwner = !ownerRes.error && ownerRes.data === true;
      const canWrite = isAdmin || isOwner;
      // Authority is CONFIRMED when we can write, or when BOTH reads succeeded and both said no.
      // If a read errored and neither granted, we cannot claim "read-only" as fact.
      const authorityUnconfirmed = !canWrite && (Boolean(adminRes.error) || Boolean(ownerRes.error));
      if (res.error) {
        setState({ rows: null, ceilingByStored: {}, ceilingUnconfirmed: false, canWrite, authorityUnconfirmed, error: res.error.message });
        return;
      }
      const rows = ((res.data as CatalogueRow[] | null) ?? []).filter((r) => r.tool_key in TOOL_MAP);

      // The ceiling clamp is a pure function of (stored mode, rung), identical for every tool, so we
      // resolve ONE representative tool per distinct stored mode rather than all of them.
      const distinct = new Map<ToolMode, string>();
      for (const r of rows) {
        const m = asMode(r.mode);
        if (!distinct.has(m)) distinct.set(m, r.tool_key);
      }
      const ceilingByStored: Partial<Record<ToolMode, ToolMode>> = {};
      let ceilingProbeOk = true;
      await Promise.all(
        [...distinct.entries()].map(async ([mode, toolKey]) => {
          const rr = await rpc("resolve_tool_autonomy", { _tenant_id: expectedTenant, _tool_key: toolKey });
          // A missing probe leaves that mode's bucket unset, and deriveGovernance then falls back to
          // the UNNARROWED stored mode — i.e. it fails toward MORE permissive. Silently degrading a
          // real ceiling into "unrestricted" is exactly the §13 dishonesty we must not ship, so we
          // record that the ceiling could not be confirmed and the surface says so, rather than
          // presenting an unverified permissive read as fact.
          if (!rr.error && typeof rr.data === "string") ceilingByStored[mode] = asMode(rr.data);
          else ceilingProbeOk = false;
        }),
      );
      if (!active) return;
      setState({ rows, ceilingByStored, ceilingUnconfirmed: !ceilingProbeOk, canWrite, authorityUnconfirmed, error: null });
    })();

    return () => { active = false; };
  }, [accountEpoch, reloadKey, expectedTenant]);

  // PER-TOOL WRITE SERIALIZATION (§70.1). BOTH setters route each tool's write through ONE queue
  // keyed by tool_key, so a bulk DOMAIN write and an expanded CHILD-knob write to the SAME tool can
  // never overlap and land out of order — the last value requested for a tool always wins. Only one
  // write per tool is in flight; a newer request updates the queued target and the drain writes it
  // next. (The knob's own queue serializes rapid input WITHIN one knob; this coordinates ACROSS the
  // two knob instances that can target the same tool.)
  const toolWrites = useRef(
    new Map<string, { latest: ToolMode; running: boolean; waiters: Array<(r: { ok: boolean; error?: string }) => void> }>(),
  );
  const writeOneTool = useCallback(
    (toolKey: string, mode: ToolMode): Promise<{ ok: boolean; error?: string }> => {
      const q = toolWrites.current;
      const entry = q.get(toolKey) ?? { latest: mode, running: false, waiters: [] };
      entry.latest = mode;
      q.set(toolKey, entry);
      // EVERY caller — the one that starts the drain and any that coalesce into it — gets a promise
      // that resolves with the drain's REAL settlement, never an optimistic `ok` before its write has
      // run (§13). A premature success would let `setDomainMode` miss a failed per-tool write, and would
      // report a discarded restrictive choice (e.g. `off`) as saved (§70.1).
      const settled = new Promise<{ ok: boolean; error?: string }>((resolve) => { entry.waiters.push(resolve); });
      if (!entry.running) {
        entry.running = true;
        void (async () => {
          let result: { ok: boolean; error?: string } = { ok: true };
          for (;;) {
            const target = entry.latest;
            const res = await rpc("set_tool_autonomy", { _tool_key: toolKey, _mode: target, _tenant_id: expectedTenant });
            if (res.error) {
              // A newer choice queued mid-write is the user's CURRENT intent — pursue it rather than
              // abandoning it because an older, now-superseded write failed. Only a failure of the
              // LATEST requested value (nothing newer queued) is final.
              if (entry.latest !== target) continue;
              result = { ok: false, error: res.error.message };
              break;
            }
            // Success. Done only when the value just written is still the latest requested; otherwise a
            // newer value arrived while writing — keep going so the last choice actually lands.
            if (entry.latest === target) { result = { ok: true }; break; }
          }
          entry.running = false;
          const waiters = entry.waiters;
          entry.waiters = [];
          for (const w of waiters) w(result);
        })();
      }
      return settled;
    },
    [expectedTenant],
  );

  const setToolMode = useCallback(
    async (toolKey: string, mode: ToolMode): Promise<{ ok: boolean; error?: string }> => {
      const meta = TOOL_MAP[toolKey];
      if (!meta) return { ok: false, error: "unknown tool" };
      if (meta.risk === "owner_only") return { ok: false, error: "owner_only" };
      // Write the CLAMPED mode so the stored value is never a misleading auto behind a high tool.
      const res = await writeOneTool(toolKey, clampModeToRisk(mode, meta.risk));
      refresh();
      return res;
    },
    [refresh, writeOneTool],
  );

  const setDomainMode = useCallback(
    async (key: CapabilityKey, mode: ToolMode): Promise<{ ok: boolean; error?: string }> => {
      const tools = Object.keys(TOOL_MAP).filter(
        (t) => TOOL_MAP[t].capability === key && TOOL_MAP[t].risk !== "owner_only",
      );
      if (!tools.length) return { ok: false, error: "no settable tools" };
      const results = await Promise.all(
        tools.map((t) => writeOneTool(t, clampModeToRisk(mode, TOOL_MAP[t].risk))),
      );
      const failed = results.find((r) => !r.ok);
      // A domain write is many per-tool writes and is NOT atomic: on a transient per-call error some
      // may have persisted. Re-read the real state on EVERY outcome so the display can never show a
      // stale level while the DB holds a partial change (§13). The caller words its toast to not
      // claim atomicity the operation does not have.
      refresh();
      if (failed) return { ok: false, error: failed.error };
      return { ok: true };
    },
    [refresh, writeOneTool],
  );

  return useMemo<SoloToolGovernance>(() => {
    if (state.rows === null && state.error === null) return { ...EMPTY, setDomainMode, setToolMode, refresh };
    if (state.error !== null || (state.rows?.length ?? 0) === 0) {
      return {
        loading: false,
        configured: false,
        error: state.error,
        domains: [],
        byTool: {},
        ceilingLimiting: false,
        ceilingUnconfirmed: false,
        canWrite: state.canWrite,
        authorityUnconfirmed: state.authorityUnconfirmed,
        setDomainMode,
        setToolMode,
        refresh,
      };
    }

    const { domains, byTool, ceilingLimiting } = deriveGovernance(state.rows ?? [], state.ceilingByStored, state.canWrite);
    return {
      loading: false,
      configured: true,
      error: null,
      domains,
      byTool,
      ceilingLimiting,
      ceilingUnconfirmed: state.ceilingUnconfirmed,
      canWrite: state.canWrite,
      authorityUnconfirmed: state.authorityUnconfirmed,
      setDomainMode,
      setToolMode,
      refresh,
    };
  }, [state, setDomainMode, setToolMode, refresh]);
}

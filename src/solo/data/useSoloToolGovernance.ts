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
import { useCallback, useEffect, useMemo, useState } from "react";
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
  /** Whether the owner can change it here at all (owner_only tools cannot). */
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
      // Which constraint is binding? Ceiling first (it applies before the risk cap folds in).
      if (rankOfMode(ceilingEff) < rankOfMode(stored)) {
        heldBack = { by: "policy", reason: "Further limited by platform policy right now." };
        ceilingLimiting = true;
      } else {
        heldBack = {
          by: "risk",
          reason:
            meta.risk === "high"
              ? "This action is consequential, so it still asks first."
              : "Held below your setting.",
        };
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
      settable: meta.risk !== "owner_only",
      heldBack,
    };
  }

  const domains: GovernedDomain[] = CAPABILITY_DOMAINS.map((d) => {
    const tools = Object.values(byTool)
      .filter((t) => t.capability === d.key)
      .sort((a, b) => a.label.localeCompare(b.label));
    const counts: Record<Posture, number> = { guardrails: 0, asks: 0, held: 0, your_call: 0, not_ready: 0 };
    for (const t of tools) counts[postureOf(t.effective, t.risk)] += 1;
    const { level, mixed } = domainLevelOf(tools);
    const domainMax = tools.reduce<ToolMode>(
      (m, t) => (rankOfMode(t.maxSettable) > rankOfMode(m) ? t.maxSettable : m),
      "off",
    );
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
    error: string | null;
  }>({ rows: null, ceilingByStored: {}, error: null });
  const [reloadKey, setReloadKey] = useState(0);

  const refresh = useCallback(() => setReloadKey((k) => k + 1), []);

  useEffect(() => {
    let active = true;
    setState({ rows: null, ceilingByStored: {}, error: null });
    // The epoch contract (mirrors useSoloTrust): a null epoch means the account is not resolved yet.
    if (accountEpoch === null) return () => { active = false; };

    void (async () => {
      const res = await rpc("list_tool_autonomy");
      if (!active) return;
      if (res.error) {
        setState({ rows: null, ceilingByStored: {}, error: res.error.message });
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
      await Promise.all(
        [...distinct.entries()].map(async ([mode, toolKey]) => {
          const rr = await rpc("resolve_tool_autonomy", { _tenant_id: null, _tool_key: toolKey });
          // resolve_tool_autonomy raises for a tenant only on a real permission problem; if it does,
          // degrade to "no ceiling narrowing observed" rather than blocking the whole surface.
          if (!rr.error && typeof rr.data === "string") ceilingByStored[mode] = asMode(rr.data);
        }),
      );
      if (!active) return;
      setState({ rows, ceilingByStored, error: null });
    })();

    return () => { active = false; };
  }, [accountEpoch, reloadKey]);

  const setToolMode = useCallback(
    async (toolKey: string, mode: ToolMode): Promise<{ ok: boolean; error?: string }> => {
      const meta = TOOL_MAP[toolKey];
      if (!meta) return { ok: false, error: "unknown tool" };
      if (meta.risk === "owner_only") return { ok: false, error: "owner_only" };
      // Write the CLAMPED mode so the stored value is never a misleading auto behind a high tool.
      const write = clampModeToRisk(mode, meta.risk);
      const res = await rpc("set_tool_autonomy", { _tool_key: toolKey, _mode: write });
      if (res.error) return { ok: false, error: res.error.message };
      refresh();
      return { ok: true };
    },
    [refresh],
  );

  const setDomainMode = useCallback(
    async (key: CapabilityKey, mode: ToolMode): Promise<{ ok: boolean; error?: string }> => {
      const tools = Object.keys(TOOL_MAP).filter(
        (t) => TOOL_MAP[t].capability === key && TOOL_MAP[t].risk !== "owner_only",
      );
      if (!tools.length) return { ok: false, error: "no settable tools" };
      const results = await Promise.all(
        tools.map((t) => rpc("set_tool_autonomy", { _tool_key: t, _mode: clampModeToRisk(mode, TOOL_MAP[t].risk) })),
      );
      const failed = results.find((r) => r.error);
      if (failed?.error) return { ok: false, error: failed.error.message };
      refresh();
      return { ok: true };
    },
    [refresh],
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
        setDomainMode,
        setToolMode,
        refresh,
      };
    }

    const { domains, byTool, ceilingLimiting } = deriveGovernance(state.rows ?? [], state.ceilingByStored);
    return {
      loading: false,
      configured: true,
      error: null,
      domains,
      byTool,
      ceilingLimiting,
      setDomainMode,
      setToolMode,
      refresh,
    };
  }, [state, setDomainMode, setToolMode, refresh]);
}

import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

/**
 * The per-tool autonomy catalogue — the read AND the write behind `settings · Capabilities`.
 *
 * THIS SURFACE IS NOT STRUCTURE-ONLY, AND THAT IS THE POINT. Every other Layer 3d surface ports
 * a shape and waits for Layer 6 to hand it data. Capabilities does not have to wait: the backend
 * already ships. `list_tool_autonomy()` returns the governed catalogue with each tool's mode
 * (`auto | confirm | off`) and whether that mode is the inherited default; `set_tool_autonomy()`
 * writes one. Both are `SECURITY DEFINER` with the caller-scope guard in the body (§59), and
 * neither takes a tenant from us — passing no argument resolves the CALLER's own scope, which is
 * the platform default set for a tenant-less operator and the acting tenant's overrides while
 * acting (§51). The ScopeBand above already says which of those you are standing in.
 *
 * CD DREW AGAINST THIS EXACT SUBSTRATE. `capsVals`'s own foot names it: *"Modes are stored per
 * tenant per tool in tenant_tool_autonomy and resolved by resolve_tool_autonomy — a tool with no
 * row resolves to ask first, so nothing is ever on autopilot by accident."* So this is the
 * catalogue the pack describes, not a stand-in for it.
 *
 * ─── THE CEILING IS A CLAMP, NOT A SETTING ───────────────────────────────────────────────────
 *
 * The Trust Compass sits ABOVE the three modes. `capsVals`'s `capOf` is the whole rule: at a
 * ceiling of 0 every tool reads `off`; at 1 an `auto` tool reads `confirm`; above that the tool's
 * own mode stands. That is applied at render, never written back — lowering the ceiling must not
 * silently rewrite what each tool is SET to, or raising it again would not restore them.
 *
 * ─── HONESTY ON FAILURE (§13) ────────────────────────────────────────────────────────────────
 *
 * A failed read returns an empty catalogue and an error string; it never falls back to a
 * plausible list. A failed WRITE does not move the control — a governance switch that appears to
 * have taken a setting the server rejected is the exact lie a gate cannot afford, which is the
 * same rule `usePlatformTrust.setLevel` already follows.
 */

export type ToolMode = "auto" | "confirm" | "off";

export type ToolAutonomyRow = {
  readonly key: string;
  readonly label: string;
  readonly category: string;
  readonly mode: ToolMode;
  /** True when no row exists for this scope and the mode is the inherited default. */
  readonly inherited: boolean;
};

export type ToolAutonomy = {
  readonly rows: readonly ToolAutonomyRow[];
  readonly loading: boolean;
  readonly error: string | null;
  /** Writes one tool's mode. Resolves false when the server refused; the control does not move. */
  readonly setMode: (key: string, mode: ToolMode) => Promise<boolean>;
};

const MODES: readonly ToolMode[] = ["auto", "confirm", "off"];
const isMode = (v: unknown): v is ToolMode => MODES.includes(v as ToolMode);

export function useToolAutonomy(enabled = true): ToolAutonomy {
  const [rows, setRows] = useState<readonly ToolAutonomyRow[]>([]);
  const [loading, setLoading] = useState(enabled);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!enabled) {
      setLoading(false);
      return;
    }
    let alive = true;
    void (async () => {
      const { data, error: rpcError } = await supabase.rpc("list_tool_autonomy");
      if (!alive) return;
      if (rpcError) {
        setError(rpcError.message);
        setRows([]);
        setLoading(false);
        return;
      }
      const raw = (data ?? []) as {
        tool_key?: string | null;
        label?: string | null;
        category?: string | null;
        mode?: string | null;
        is_default?: boolean | null;
      }[];
      setRows(
        raw
          // A row whose mode is outside the enum is DROPPED rather than defaulted into a lane it
          // may not be on — the same rule the trust tally follows. Showing a tool as "ask first"
          // when the server said something else would misreport a governance gate.
          .filter((r) => r.tool_key && isMode(r.mode))
          .map((r) => ({
            key: String(r.tool_key),
            label: String(r.label ?? r.tool_key),
            category: String(r.category ?? "Other"),
            mode: r.mode as ToolMode,
            inherited: r.is_default !== false,
          })),
      );
      setError(null);
      setLoading(false);
    })();
    return () => {
      alive = false;
    };
  }, [enabled]);

  const setMode = useCallback(async (key: string, mode: ToolMode) => {
    const { error: rpcError } = await supabase.rpc("set_tool_autonomy", {
      _tool_key: key,
      _mode: mode,
    });
    if (rpcError) {
      setError(rpcError.message);
      return false;
    }
    // Optimistic only AFTER the server took it, and the row stops being inherited because a row
    // now exists for this scope — which is what `is_default` reports on the next read.
    setRows((prev) =>
      prev.map((r) => (r.key === key ? { ...r, mode, inherited: false } : r)),
    );
    setError(null);
    return true;
  }, []);

  return { rows, loading, error, setMode };
}

/**
 * `capOf` — `capsVals` L9954. The Trust Compass clamps the three modes; it does not replace them.
 * A null ceiling means the platform holds no rung, and then nothing is clamped (§13 — clamping
 * against a ceiling that is not set would report a gate that does not exist).
 */
export function clampMode(mode: ToolMode, ceiling: number | null): ToolMode {
  if (ceiling === null) return mode;
  if (ceiling <= 0) return "off";
  if (ceiling <= 1 && mode === "auto") return "confirm";
  return mode;
}

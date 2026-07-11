import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { SectionCard, StatePill } from "@/components/ui/page";
import { cn } from "@/lib/utils";
import { ShieldCheck, Zap, Hand, Ban, Loader2 } from "lucide-react";
import { toast } from "sonner";

/**
 * Paige Autonomy — the operator decides, per action, how much Paige does on her
 * own. Three modes, mirroring how the owner runs their own assistant:
 *   • Ask first (confirm)  — she proposes, you approve, then she acts (default)
 *   • Autopilot (auto)     — she acts on her own, no pause
 *   • Off                  — she can't run this action at all
 *
 * Backed by list_tool_autonomy / set_tool_autonomy. The safe default is "Ask
 * first" for every action — nothing is on autopilot until you turn it on here.
 */

type Mode = "confirm" | "auto" | "off";

type ToolRow = {
  tool_key: string;
  label: string;
  category: string;
  mode: Mode;
  is_default: boolean;
  updated_at: string | null;
};

const MODES: { value: Mode; label: string; hint: string; icon: typeof Zap }[] = [
  { value: "confirm", label: "Ask first", hint: "Paige proposes it and waits for your yes", icon: Hand },
  { value: "auto", label: "Autopilot", hint: "Paige acts on her own, no confirmation", icon: Zap },
  { value: "off", label: "Off", hint: "Paige can't run this action", icon: Ban },
];

function ModeToggle({
  value,
  label,
  disabled,
  onChange,
}: {
  value: Mode;
  label: string;
  disabled?: boolean;
  onChange: (m: Mode) => void;
}) {
  const btnRefs = useRef<(HTMLButtonElement | null)[]>([]);

  // ARIA radiogroup keyboard pattern: Left/Up → previous, Right/Down → next,
  // wrapping, moving both selection and focus (roving tabindex below).
  const onKeyDown = (e: React.KeyboardEvent) => {
    if (disabled) return;
    const idx = MODES.findIndex((m) => m.value === value);
    let next = idx;
    if (e.key === "ArrowRight" || e.key === "ArrowDown") next = (idx + 1) % MODES.length;
    else if (e.key === "ArrowLeft" || e.key === "ArrowUp") next = (idx - 1 + MODES.length) % MODES.length;
    else return;
    e.preventDefault();
    onChange(MODES[next].value);
    btnRefs.current[next]?.focus();
  };

  return (
    <div
      role="radiogroup"
      aria-label={`Autonomy for ${label}`}
      onKeyDown={onKeyDown}
      className="inline-flex items-center rounded-lg border border-border bg-muted/40 p-0.5"
    >
      {MODES.map((m, i) => {
        const active = value === m.value;
        // Gold discipline (§6/§11): gold is the act/on moment — only Autopilot,
        // when selected, earns the gold fill. Ask-first and Off use a neutral
        // raised surface when active, muted when not.
        const activeClass =
          m.value === "auto"
            ? "bg-[hsl(var(--gold))] text-[hsl(var(--accent-foreground))] shadow-sm"
            : "bg-background text-foreground shadow-sm";
        return (
          <button
            key={m.value}
            ref={(el) => { btnRefs.current[i] = el; }}
            type="button"
            role="radio"
            aria-checked={active}
            // Roving tabindex: only the selected radio is in the tab order.
            tabIndex={active ? 0 : -1}
            disabled={disabled}
            title={m.hint}
            onClick={() => !active && onChange(m.value)}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              active ? activeClass : "text-muted-foreground hover:text-foreground",
              disabled && "cursor-not-allowed opacity-60",
            )}
          >
            {disabled && active ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <m.icon className="h-3.5 w-3.5" />}
            {m.label}
          </button>
        );
      })}
    </div>
  );
}

export function PaigeAutonomyPanel() {
  const [rows, setRows] = useState<ToolRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    // list_tool_autonomy with no arg → resolves the caller's own tenant.
    const { data, error } = await (supabase as any).rpc("list_tool_autonomy");
    if (error) {
      toast.error("Couldn't load autonomy settings.");
      setLoading(false);
      return;
    }
    setRows((data || []) as ToolRow[]);
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, []);

  const setMode = async (tool: ToolRow, mode: Mode) => {
    const prev = tool.mode;
    setSaving(tool.tool_key);
    // Optimistic.
    setRows((rs) => rs.map((r) => (r.tool_key === tool.tool_key ? { ...r, mode, is_default: false } : r)));
    const { error } = await (supabase as any).rpc("set_tool_autonomy", {
      _tool_key: tool.tool_key,
      _mode: mode,
    });
    setSaving(null);
    if (error) {
      setRows((rs) => rs.map((r) => (r.tool_key === tool.tool_key ? { ...r, mode: prev } : r)));
      toast.error("Couldn't save that. You need admin access to change autonomy.");
      return;
    }
    const modeLabel = MODES.find((m) => m.value === mode)?.label ?? mode;
    toast.success(`${tool.label} → ${modeLabel}`);
  };

  const grouped = useMemo(() => {
    const by: Record<string, ToolRow[]> = {};
    for (const r of rows) (by[r.category] ??= []).push(r);
    return Object.entries(by).sort(([a], [b]) => a.localeCompare(b));
  }, [rows]);

  const autopilotCount = rows.filter((r) => r.mode === "auto").length;
  const offCount = rows.filter((r) => r.mode === "off").length;

  return (
    <div className="space-y-4">
      <SectionCard
        icon={ShieldCheck}
        title="Paige autonomy"
        description="Decide how much Paige does on her own — per action. By default she proposes every change and waits for your yes; flip an action to Autopilot when you trust her to just handle it, or Off to take it off the table."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            {autopilotCount > 0 && <StatePill state="on">{autopilotCount} on autopilot</StatePill>}
            {offCount > 0 && <StatePill state="off">{offCount} off</StatePill>}
          </div>
        }
      >
        <div className="flex flex-col gap-2 text-sm text-muted-foreground sm:flex-row sm:flex-wrap sm:gap-x-6">
          {MODES.map((m) => (
            <span key={m.value} className="inline-flex items-center gap-1.5">
              <m.icon className="h-3.5 w-3.5 shrink-0" />
              <span className="font-medium text-foreground">{m.label}</span> — {m.hint}
            </span>
          ))}
        </div>
      </SectionCard>

      {loading ? (
        <div className="space-y-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-24 animate-pulse rounded-xl border border-border bg-muted/30" />
          ))}
        </div>
      ) : (
        grouped.map(([category, tools]) => (
          <SectionCard key={category} title={category}>
            <ul className="divide-y divide-border">
              {tools.map((tool) => (
                <li
                  key={tool.tool_key}
                  className="flex flex-col gap-3 py-3 first:pt-0 last:pb-0 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-foreground">{tool.label}</span>
                      {tool.is_default && (
                        <span className="text-[10px] uppercase tracking-wide text-muted-foreground">Default · Ask first</span>
                      )}
                    </div>
                  </div>
                  <ModeToggle
                    value={tool.mode}
                    label={tool.label}
                    disabled={saving === tool.tool_key}
                    onChange={(m) => setMode(tool, m)}
                  />
                </li>
              ))}
            </ul>
          </SectionCard>
        ))
      )}
    </div>
  );
}

/**
 * The scope band — the strip ABOVE the shell, spanning its full width.
 *
 * Geometry is the pack's (`PAIGE Super Admin Shell v3.dc.html` L73-L84, `bandStyle` L10730):
 * `flex:none`, `min-height:36px` (a FLOOR, not a fixed height — the band grows if its content
 * wraps rather than clipping it), `padding:0 16px`, `gap:12px`, `align-items:center`, and a tone
 * that repaints the whole strip when scope changes.
 *
 * WHY IT SITS ABOVE THE SHELL, not inside a header: scope is the value of one column
 * (`tenant_id`), not a place you travel to, so it frames every column at once — rail, canvas and
 * spine alike. The pack's own `exitScope` announcement is the tell: "active_tenant_id returned
 * to NULL" (§9, and the guard in `scopeIsNotNavigation.test.ts`).
 *
 * ROUND 1 IS GEOMETRY. The band renders the pack's REST scope — its own `P.SCOPES[0]` strings,
 * verbatim (`paige-ia.js` L2622) — and carries no scope machine yet: there is no read/act state,
 * no cross-window broadcast, and no cycle control, because each of those is a session behaviour
 * rather than a shape. The three tones are modelled here so the later wiring changes a value,
 * not this file's structure.
 */
import { cn } from "@/lib/utils";
import type { ScopeState, ScopeTone } from "@/operator/shell/scopeStates";

const GROUND: Record<ScopeTone, string> = {
  none: "bg-card border-border",
  read: "bg-muted border-border-strong",
  act: "bg-muted border-cd-gold",
};

const KICKER: Record<ScopeTone, string> = {
  none: "text-muted-foreground",
  read: "text-foreground",
  act: "text-cd-gold",
};

export type ScopeBandProps = Omit<ScopeState, "tone"> & { readonly tone?: ScopeTone };

export default function ScopeBand({ tone = "none", kicker, scope, audit }: ScopeBandProps) {
  return (
    <div
      data-scope-band={tone}
      className={cn(
        // min-h, never h: the pack's band is a floor so a wrapping scope line grows the strip
        // instead of clipping it. flex-none keeps it out of the shell's height budget.
        "flex min-h-[36px] min-w-0 flex-none flex-wrap items-center gap-3 border-b px-4",
        "transition-colors duration-200",
        GROUND[tone],
      )}
    >
      <span className={cn("min-w-0 flex-none truncate text-[11px] font-medium", KICKER[tone])}>
        {kicker}
      </span>
      <b className="min-w-0 truncate text-[11px] font-medium tracking-[0.02em] text-foreground">
        {scope}
      </b>
      <span className="min-w-0 flex-none truncate font-mono text-[10px] text-muted-foreground">
        {audit}
      </span>
    </div>
  );
}

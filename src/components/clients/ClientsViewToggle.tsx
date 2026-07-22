// Clients My Queue / Team View / All view toggle (IA slice 1c-viii-c). A thin clone
// of CommandCenterViewToggle (1c-vii) with a Clients LABEL map — the shared toggle's
// LABEL is hardcoded, so a dedicated file is the clean §18 move (reuse the view type
// + persistence logic, relabel the chrome), not a fork of shared logic. Small
// segmented control, nav-style, indigo active state, NEVER gold (gold stays on the
// New-contact act, §11). Renders only when the persona can switch >1 view.
import type { CommandCenterView } from "@/lib/roleViews/commandCenterRegistry";
import { cn } from "@/lib/utils";

const LABEL: Record<CommandCenterView, string> = {
  mine: "My Queue",
  team: "Team View",
  business: "All",
};

export function ClientsViewToggle({
  views,
  value,
  onChange,
}: {
  views: CommandCenterView[];
  value: CommandCenterView;
  onChange: (v: CommandCenterView) => void;
}) {
  if (views.length <= 1) return null;
  return (
    <div role="tablist" aria-label="Clients view" className="inline-flex items-center gap-0.5 rounded-md border border-border bg-muted/40 p-0.5">
      {views.map((v) => {
        const active = v === value;
        return (
          <button
            key={v}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(v)}
            className={cn(
              "rounded-[5px] px-2.5 py-1 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              active ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
            )}
          >
            {LABEL[v]}
          </button>
        );
      })}
    </div>
  );
}

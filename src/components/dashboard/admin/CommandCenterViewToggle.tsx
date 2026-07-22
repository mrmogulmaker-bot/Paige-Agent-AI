// Command Center My/Team/Business view toggle (IA slice 1c-vii). A small segmented
// control in the header — nav-style, indigo active state, NEVER gold (gold stays on
// the approvals act, §11). Renders only when the persona can switch >1 view.
import type { CommandCenterView } from "@/lib/roleViews/commandCenterRegistry";
import { cn } from "@/lib/utils";

const LABEL: Record<CommandCenterView, string> = {
  mine: "My work",
  team: "My team",
  business: "Whole business",
};

export function CommandCenterViewToggle({
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
    <div role="tablist" aria-label="Command Center view" className="inline-flex items-center gap-0.5 rounded-md border border-border bg-muted/40 p-0.5">
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

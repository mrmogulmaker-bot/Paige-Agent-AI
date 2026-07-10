// The persistent left rail of the "Customize Paige" console — 7 areas in 3
// clusters (spec §1.5). Desktop = vertical rail; mobile = a segmented Select.
// Active item mirrors the AdminLayout hub active treatment: gold left-bar +
// text-accent + bg-accent/5. Knowledge is set apart as the payoff tier.
import { cn } from "@/lib/utils";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  UserRound, Zap, MessageCircleQuestion, Route, ClipboardList, LayoutGrid, Brain,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

export type ConsoleSection =
  | "persona" | "quickActions" | "probing" | "journey" | "intake" | "portal" | "knowledge";

export interface RailCounts {
  personaNamed: boolean;
  quickActions: number;
  probing: number;
  journey: number;
  intake: number;
  portal: number;
  knowledgeDocs: number;
}

interface RailItem {
  id: ConsoleSection;
  label: string;
  icon: LucideIcon;
  cluster: string;
  payoff?: boolean;
}

const CLUSTERS: { title: string; items: RailItem[] }[] = [
  {
    title: "WHO SHE IS",
    items: [
      { id: "persona", label: "Persona", icon: UserRound, cluster: "WHO SHE IS" },
      { id: "quickActions", label: "Quick actions", icon: Zap, cluster: "WHO SHE IS" },
    ],
  },
  {
    title: "HOW SHE WORKS",
    items: [
      { id: "probing", label: "Probing questions", icon: MessageCircleQuestion, cluster: "HOW SHE WORKS" },
      { id: "journey", label: "Client journey", icon: Route, cluster: "HOW SHE WORKS" },
      { id: "intake", label: "Intake", icon: ClipboardList, cluster: "HOW SHE WORKS" },
      { id: "portal", label: "Client portal", icon: LayoutGrid, cluster: "HOW SHE WORKS" },
    ],
  },
  {
    title: "WHAT SHE KNOWS",
    items: [
      { id: "knowledge", label: "Knowledge", icon: Brain, cluster: "WHAT SHE KNOWS", payoff: true },
    ],
  },
];

const ALL_ITEMS = CLUSTERS.flatMap((c) => c.items);

function hint(id: ConsoleSection, counts: RailCounts): string | null {
  switch (id) {
    case "persona": return counts.personaNamed ? null : null; // dot handled separately
    case "quickActions": return counts.quickActions ? `· ${counts.quickActions}` : null;
    case "probing": return counts.probing ? `· ${counts.probing}` : null;
    case "journey": return counts.journey ? `· ${counts.journey}` : null;
    case "intake": return counts.intake ? `· ${counts.intake}` : null;
    case "portal": return counts.portal ? `· ${counts.portal}` : null;
    case "knowledge": return counts.knowledgeDocs ? `· ${counts.knowledgeDocs}` : null;
    default: return null;
  }
}

interface RailProps {
  active: ConsoleSection;
  onSelect: (s: ConsoleSection) => void;
  counts: RailCounts;
  knowledgePulse?: boolean;
}

export function PaigeConsoleRail({ active, onSelect, counts, knowledgePulse }: RailProps) {
  return (
    <div className="space-y-4">
      {CLUSTERS.map((cluster) => (
        <div key={cluster.title} className="space-y-0.5">
          <div className="px-3 pb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70">
            {cluster.title}
          </div>
          {cluster.items.map((item) => {
            const isActive = active === item.id;
            const h = hint(item.id, counts);
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => onSelect(item.id)}
                aria-current={isActive ? "true" : undefined}
                className={cn(
                  "relative flex w-full items-center gap-2.5 px-3 py-2 text-sm text-left transition-colors",
                  isActive
                    ? "text-accent bg-accent/5 font-medium"
                    : "text-foreground/80 hover:text-foreground hover:bg-muted/50",
                  item.payoff && "border-l-2 border-l-accent/60",
                  item.payoff && knowledgePulse && "ring-1 ring-accent/60",
                )}
              >
                {isActive && !item.payoff && (
                  <span className="absolute left-0 top-1 bottom-1 w-0.5 rounded-r-full bg-accent" />
                )}
                <item.icon className="w-4 h-4 shrink-0" />
                <span className="truncate">{item.label}</span>
                {item.id === "persona" && counts.personaNamed && (
                  <span className="ml-auto h-2 w-2 rounded-full bg-gradient-gold" aria-label="Named" />
                )}
                {h && <span className="ml-auto text-xs text-muted-foreground tabular-nums">{h}</span>}
              </button>
            );
          })}
        </div>
      ))}
    </div>
  );
}

interface MobileProps extends RailProps {
  className?: string;
}

export function PaigeConsoleRailMobile({ active, onSelect, counts, className }: MobileProps) {
  return (
    <div className={className}>
      <Select value={active} onValueChange={(v) => onSelect(v as ConsoleSection)}>
        <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
        <SelectContent>
          {ALL_ITEMS.map((item) => {
            const h = hint(item.id, counts);
            return (
              <SelectItem key={item.id} value={item.id}>
                <span className="flex items-center gap-2">
                  <item.icon className="w-4 h-4" />
                  {item.label}
                  {h && <span className="text-xs text-muted-foreground">{h}</span>}
                </span>
              </SelectItem>
            );
          })}
        </SelectContent>
      </Select>
    </div>
  );
}

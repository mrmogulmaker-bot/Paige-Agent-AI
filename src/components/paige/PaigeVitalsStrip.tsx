// Always-visible header strip above the hero chat (spec §1.2 / §1.3). Shows the
// PaigeMark, the persona + preset + knowledge chips, and the primary gold
// "Customize Paige" control. Collapses to one row on mobile.
import { Button } from "@/components/ui/button";
import { PaigeMark } from "@/components/brand/PaigeMark";
import { SlidersHorizontal, BookOpen } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Playbook } from "@/lib/playbook/types";
import type { ConsoleSection } from "./PaigeConsoleRail";
import type { KnowledgeCounts } from "./PaigeWorkspaceContext";

interface Props {
  pb: Playbook;
  tenantName: string;
  counts: KnowledgeCounts;
  knowledgePulse: boolean;
  onOpen: (section: ConsoleSection) => void;
}

export function PaigeVitalsStrip({ pb, tenantName, counts, knowledgePulse, onOpen }: Props) {
  const named = !!pb.persona.name.trim();
  return (
    <div className="sticky top-0 z-20 border-b bg-primary/[0.04] backdrop-blur supports-[backdrop-filter]:bg-primary/[0.04]">
      {/* Desktop */}
      <div className="hidden md:flex items-center justify-between gap-4 px-4 lg:px-6 py-3">
        <div className="flex items-start gap-3 min-w-0">
          <PaigeMark className="h-9 w-9 shrink-0 mt-0.5" />
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h1 className="text-base font-semibold truncate">Your Paige</h1>
              <span className="text-sm text-muted-foreground truncate">· for {tenantName}</span>
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-1.5">
              <span className="inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs">
                <span className={cn("h-2 w-2 rounded-full", named ? "bg-gradient-gold" : "bg-muted-foreground/40")} />
                {named
                  ? <>{pb.persona.name}<span className="text-muted-foreground"> · {pb.persona.role}</span></>
                  : <span className="text-muted-foreground">Not named yet — set her up</span>}
              </span>
              <span className="inline-flex items-center rounded-full border px-2 py-0.5 text-xs text-muted-foreground">
                {pb.name}
              </span>
              <button
                type="button"
                onClick={() => onOpen("knowledge")}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs transition-colors hover:border-accent hover:text-accent",
                  knowledgePulse && "ring-1 ring-accent bg-accent/5",
                )}
              >
                <BookOpen className="h-3 w-3" />
                {counts.docs} {counts.docs === 1 ? "doc" : "docs"} · {counts.chunks} recall
              </button>
            </div>
          </div>
        </div>
        <Button
          onClick={() => onOpen("persona")}
          className="bg-gradient-gold hover:opacity-90 text-accent-foreground shrink-0"
        >
          <SlidersHorizontal className="w-4 h-4 mr-2" /> Customize Paige
        </Button>
      </div>

      {/* Mobile */}
      <div className="flex md:hidden items-center justify-between gap-2 px-3 py-2.5">
        <div className="flex items-center gap-2 min-w-0">
          <PaigeMark className="h-7 w-7 shrink-0" />
          <span className="font-semibold text-sm truncate">
            {named ? pb.persona.name : "Your Paige"}
          </span>
          <button
            type="button"
            onClick={() => onOpen("knowledge")}
            className={cn(
              "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs text-muted-foreground shrink-0",
              knowledgePulse && "ring-1 ring-accent",
            )}
          >
            {counts.docs} {counts.docs === 1 ? "doc" : "docs"}
          </button>
        </div>
        <Button
          onClick={() => onOpen("persona")}
          size="icon"
          className="bg-gradient-gold hover:opacity-90 text-accent-foreground shrink-0"
          aria-label="Customize Paige"
        >
          <SlidersHorizontal className="w-4 h-4" />
        </Button>
      </div>
    </div>
  );
}

// The command-center HUD strip (cc-spec §1.2). Evolves the old vitals strip:
// keeps the PaigeMark, "Your Paige · for {tenant}", persona chip and knowledge
// chip, and the mobile row — but the gold "Customize Paige" button is evicted to
// the rail floor. In its place sits the MomentumReadout: an always-tenant-wide
// "waiting on you" count (never rescoped by focus — B3) that soft-pulses once
// when it rises. Full width, sticky, above both columns.
import { useEffect, useRef, useState } from "react";
import { PaigeMark } from "@/components/brand/PaigeMark";
import { BookOpen } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Playbook } from "@/lib/playbook/types";
import type { ConsoleSection } from "./PaigeConsoleRail";
import type { KnowledgeCounts } from "./PaigeWorkspaceContext";

interface Props {
  pb: Playbook;
  tenantName: string;
  counts: KnowledgeCounts;
  knowledgePulse: boolean;
  /** Tenant-wide approvals count — the global desk pulse (B3, never rescoped). */
  pending: number;
  onOpen: (section: ConsoleSection) => void;
}

/** "{n} waiting on you" / "All clear" — static-but-live truth, pulses on a rise. */
function MomentumReadout({ pending, className }: { pending: number; className?: string }) {
  const [pulse, setPulse] = useState(false);
  const prev = useRef(pending);

  useEffect(() => {
    if (pending > prev.current) {
      setPulse(true);
      const t = setTimeout(() => setPulse(false), 750);
      prev.current = pending;
      return () => clearTimeout(t);
    }
    prev.current = pending;
  }, [pending]);

  const active = pending > 0;
  return (
    <div
      aria-live="polite"
      aria-label={`${pending} ${pending === 1 ? "approval" : "approvals"} waiting`}
      className={cn(
        "inline-flex items-center gap-2 rounded-full border px-3 py-1 text-sm",
        active ? "border-accent/40" : "border-border",
        pulse && "cc-count-pulse",
        className,
      )}
    >
      <span className={cn("h-2 w-2 rounded-full", active ? "bg-gradient-gold" : "bg-muted-foreground/40")} />
      {active ? (
        <span className="font-medium tabular-nums">{pending} waiting on you</span>
      ) : (
        <span className="text-muted-foreground">All clear</span>
      )}
    </div>
  );
}

export function PaigeCommandBar({ pb, tenantName, counts, knowledgePulse, pending, onOpen }: Props) {
  const named = !!pb.persona.name.trim();
  return (
    <div className="sticky top-0 z-20 border-b bg-primary/[0.04] backdrop-blur supports-[backdrop-filter]:bg-primary/[0.04]">
      {/* Desktop */}
      <div className="hidden md:flex items-center justify-between gap-4 px-4 lg:px-6 py-2.5">
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
                {counts.docs} {counts.docs === 1 ? "doc" : "docs"} · {counts.chunks} passages
              </button>
            </div>
          </div>
        </div>
        <MomentumReadout pending={pending} className="shrink-0" />
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
        <MomentumReadout pending={pending} className="shrink-0" />
      </div>
    </div>
  );
}

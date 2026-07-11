// "Watch Paige work" (#95) — the reasoning trace. Renders the steps Paige took this
// turn (streamed as paige_step frames) as an inline strip by default and, on desktop,
// a right-side rail. One <StepTimeline> feeds both surfaces and the mobile Sheet.
//
// Gold discipline (§6/§11): this is a WATCH surface — it spends ZERO gold. Running =
// indigo (--primary/--ring), done = --success, error = --destructive. The only gold in
// the chat region stays the existing Approve button (the act/approve moment). Token-only,
// theme-aware, motion guarded via Tailwind motion-safe/motion-reduce. Jargon-free copy
// comes pre-resolved from the server (§11) — this component renders labels verbatim.
import { useState } from "react";
import { Loader2, Check, AlertCircle, Circle, ListChecks } from "lucide-react";
import { cn } from "@/lib/utils";
import { SectionCard, EmptyState } from "@/components/ui/page";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";

export type PaigeStep = {
  id: string;
  seq: number;
  round: number;
  label: string;
  group: "owner" | "client" | "shared";
  status: "running" | "done" | "error";
  detail?: string;
  ts?: number;
};

// Upsert by id, keep sorted by seq. Same reducer serves the v1 burst and a future
// live (running→done) stream with zero change.
export function upsertStep(prev: PaigeStep[], step: PaigeStep): PaigeStep[] {
  const next = prev.slice();
  const i = next.findIndex((s) => s.id === step.id);
  if (i >= 0) next[i] = { ...next[i], ...step };
  else next.push(step);
  next.sort((a, b) => a.seq - b.seq);
  return next;
}

const DEPT_LABEL: Record<PaigeStep["group"], string> = {
  owner: "Owner Ops",
  client: "Client Experience",
  shared: "",
};

function StatusGlyph({ status }: { status: PaigeStep["status"] }) {
  if (status === "running") {
    return (
      <>
        <Loader2 className="hidden h-3.5 w-3.5 animate-spin text-[hsl(var(--primary))] motion-safe:block" aria-hidden />
        <Circle className="h-3.5 w-3.5 text-[hsl(var(--primary))] motion-safe:hidden" aria-hidden />
      </>
    );
  }
  if (status === "error") return <AlertCircle className="h-3.5 w-3.5 text-[hsl(var(--destructive))]" aria-hidden />;
  return <Check className="h-3.5 w-3.5 text-[hsl(var(--success))]" aria-hidden />;
}

/** The shared vertical list — used by the rail and the mobile Sheet. */
export function StepTimeline({ steps, loading }: { steps: PaigeStep[]; loading?: boolean }) {
  if (steps.length === 0 && loading) {
    return (
      <div className="space-y-2" aria-live="polite">
        {[0, 1, 2].map((i) => (
          <div key={i} className="flex items-center gap-2.5">
            <span className="h-6 w-6 shrink-0 animate-pulse rounded-lg bg-muted" />
            <span className="h-3 flex-1 animate-pulse rounded bg-muted" />
          </div>
        ))}
      </div>
    );
  }
  if (steps.length === 0) {
    return <EmptyState icon={ListChecks} title="Nothing to show yet" description="When Paige works through a task, the steps appear here." />;
  }
  const lastRunningIdx = steps.map((s) => s.status).lastIndexOf("running");
  return (
    <ol className="space-y-2" aria-live="polite">
      {steps.map((s, i) => {
        const active = i === lastRunningIdx || (lastRunningIdx === -1 && i === steps.length - 1);
        const dept = DEPT_LABEL[s.group];
        return (
          <li key={s.id} className="flex items-start gap-2.5">
            <span
              className={cn(
                "mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-lg ring-1 ring-inset",
                s.group === "shared"
                  ? "bg-muted ring-border"
                  : "bg-[hsl(var(--primary)/0.1)] ring-[hsl(var(--primary)/0.25)]",
              )}
            >
              <StatusGlyph status={s.status} />
            </span>
            <div className="min-w-0 flex-1 pt-0.5">
              <p className={cn("text-sm leading-snug", active ? "font-medium text-foreground" : "text-muted-foreground")}>
                {s.label}
              </p>
              {(s.detail || dept) && (
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {dept && <span>{dept}</span>}
                  {dept && s.detail && <span className="mx-1">·</span>}
                  {s.detail && <span>{s.detail}</span>}
                </p>
              )}
            </div>
          </li>
        );
      })}
    </ol>
  );
}

/** Inline strip — the default, and the only trace surface below lg. */
export function PaigeReasoningStrip({
  steps,
  loading,
  personaName,
}: {
  steps: PaigeStep[];
  loading?: boolean;
  personaName?: string;
}) {
  const [sheetOpen, setSheetOpen] = useState(false);
  if (!loading && steps.length === 0) return null;

  const running = steps.some((s) => s.status === "running") || (loading && steps.length === 0);
  const current =
    [...steps].reverse().find((s) => s.status === "running")?.label ??
    steps[steps.length - 1]?.label ??
    `${personaName || "Paige"} is thinking…`;
  const name = personaName || "Paige";

  return (
    <div className="flex items-center gap-2.5 rounded-lg border border-border bg-muted/20 px-3 py-2">
      <span
        className={cn(
          "grid h-7 w-7 shrink-0 place-items-center rounded-lg ring-1 ring-inset",
          running ? "bg-[hsl(var(--primary)/0.1)] ring-[hsl(var(--primary)/0.25)]" : "bg-[hsl(var(--success)/0.12)] ring-[hsl(var(--success)/0.3)]",
        )}
      >
        {running ? (
          <>
            <Loader2 className="hidden h-4 w-4 animate-spin text-[hsl(var(--primary))] motion-safe:block" aria-hidden />
            <Circle className="h-4 w-4 text-[hsl(var(--primary))] motion-safe:hidden" aria-hidden />
          </>
        ) : (
          <Check className="h-4 w-4 text-[hsl(var(--success))]" aria-hidden />
        )}
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm text-foreground motion-safe:transition-opacity" title={current}>
          {current}
        </p>
        <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
          {running ? `${name} at work` : "Done"}
        </p>
      </div>
      {steps.length > 0 && (
        <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
          <SheetTrigger className="shrink-0 rounded-full border border-border px-2.5 py-1 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))] lg:hidden">
            {steps.length} step{steps.length === 1 ? "" : "s"}
          </SheetTrigger>
          <SheetContent side="bottom" className="max-h-[70vh] overflow-y-auto">
            <SheetHeader className="mb-3">
              <SheetTitle>{name} at work</SheetTitle>
            </SheetHeader>
            <StepTimeline steps={steps} loading={loading} />
          </SheetContent>
        </Sheet>
      )}
      {steps.length > 0 && (
        <span className="hidden shrink-0 rounded-full border border-border px-2.5 py-1 text-xs font-medium text-muted-foreground lg:inline">
          {steps.length} step{steps.length === 1 ? "" : "s"}
        </span>
      )}
    </div>
  );
}

/** Desktop-only right rail — the full timeline for real multi-step work. */
export function PaigeWorkRail({
  steps,
  loading,
  personaName,
}: {
  steps: PaigeStep[];
  loading?: boolean;
  personaName?: string;
}) {
  if (!loading && steps.length === 0) return null;
  const name = personaName || "Paige";
  return (
    <SectionCard title={`${name} at work`} className="h-full">
      <StepTimeline steps={steps} loading={loading} />
    </SectionCard>
  );
}

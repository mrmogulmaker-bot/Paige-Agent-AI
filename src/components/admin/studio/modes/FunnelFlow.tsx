// FunnelFlow — the read-only step-flow view an AI-built funnel renders as, inside the SAME
// Studio canvas the page surface uses (§18/§19: no separate tab, one area). Pure presentation:
// it's handed a BuiltFunnel (real page/form/funnel rows already persisted) and draws the
// entry-page → form → thank-you sequence as connected cards with honest per-step status —
// the same visual language the manual FunnelMode uses, so an AI funnel and a hand-built one
// read as one object. The act (Publish funnel) lives in the top bar, not here.
import type { ReactNode } from "react";
import { ExternalLink, FileText, LayoutGrid, PartyPopper } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { SectionCard, StatePill } from "@/components/ui/page";
import type { BuiltFunnel, BuiltFunnelStep } from "../studio";

const STEP_ICON: Record<BuiltFunnelStep["kind"], LucideIcon> = {
  page: LayoutGrid,
  form: FileText,
  thankyou: PartyPopper,
};

const STEP_KIND_LABEL: Record<BuiltFunnelStep["kind"], string> = {
  page: "Entry page",
  form: "Form step",
  thankyou: "Thank you",
};

function stepPill(step: BuiltFunnelStep): ReactNode {
  switch (step.status) {
    case "published":
      return <StatePill state="on">Live</StatePill>;
    case "active":
      return <StatePill state="success">Active</StatePill>;
    case "included":
      return <StatePill state="pending">Included</StatePill>;
    case "draft":
    default:
      return <StatePill state="off">Draft</StatePill>;
  }
}

function stepNote(step: BuiltFunnelStep): string | undefined {
  if (step.kind === "page" && step.status !== "published") {
    return "Publishing the funnel takes this page live for you.";
  }
  return undefined;
}

export function FunnelFlow({ funnel, url }: { funnel: BuiltFunnel; url: string | null }) {
  return (
    <div className="mx-auto w-full max-w-xl">
      <SectionCard className="mb-4">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0">
            <h3 className="font-display text-sm font-semibold text-foreground">{funnel.name}</h3>
            {funnel.goal && <p className="mt-0.5 text-xs text-muted-foreground">{funnel.goal}</p>}
          </div>
          {url ? (
            <a
              href={url}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 text-xs font-medium text-primary hover:underline"
            >
              <ExternalLink className="h-3.5 w-3.5" aria-hidden />
              View live funnel
            </a>
          ) : (
            <StatePill state="off">Draft</StatePill>
          )}
        </div>
      </SectionCard>

      {funnel.steps.map((step, i) => {
        const Icon = STEP_ICON[step.kind];
        const last = i === funnel.steps.length - 1;
        const note = stepNote(step);
        return (
          <div key={`${step.kind}-${i}`} className={`relative pl-6 ${last ? "" : "pb-5"}`}>
            <span className="absolute left-0 top-5 h-2.5 w-2.5 rounded-full bg-primary" aria-hidden />
            {!last && <span className="absolute bottom-0 left-[4.5px] top-8 w-px bg-border" aria-hidden />}
            <SectionCard
              title={
                <span className="flex items-center gap-2">
                  <Icon className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
                  <span className="truncate">{step.title}</span>
                </span>
              }
              description={STEP_KIND_LABEL[step.kind]}
              actions={stepPill(step)}
            >
              {note && <p className="text-xs text-muted-foreground">{note}</p>}
            </SectionCard>
          </div>
        );
      })}
    </div>
  );
}

export default FunnelFlow;

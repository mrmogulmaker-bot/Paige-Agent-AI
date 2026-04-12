import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CheckCircle2, Circle, ArrowRight } from "lucide-react";
import { useNavigate } from "react-router-dom";

interface Step {
  step: number;
  title: string;
  milestone: string;
  products: string;
  timeline: string;
  link: string;
  isCurrentStep: boolean;
}

export function FundingSequence({ steps }: { steps: Step[] }) {
  const navigate = useNavigate();
  const currentIdx = steps.findIndex(s => s.isCurrentStep);

  return (
    <Card className="p-6 bg-card border-border">
      <h2 className="text-lg font-bold text-foreground mb-1">Recommended Funding Sequence</h2>
      <p className="text-sm text-muted-foreground mb-5">Your step-by-step pathway to funding based on your current profile.</p>

      <div className="space-y-3">
        {steps.map((s, idx) => {
          const isPast = idx < currentIdx;
          const isCurrent = s.isCurrentStep;
          const isFuture = idx > currentIdx;

          return (
            <div
              key={s.step}
              className={`relative flex items-start gap-4 p-4 rounded-xl border cursor-pointer transition-all ${
                isCurrent ? "border-accent bg-accent/5 shadow-sm" : isPast ? "border-fundability-excellent/30 bg-fundability-excellent/5" : "border-border bg-card hover:border-muted-foreground/30"
              }`}
              onClick={() => navigate(s.link)}
            >
              <div className="shrink-0 mt-0.5">
                {isPast ? (
                  <CheckCircle2 className="w-6 h-6 text-fundability-excellent" />
                ) : isCurrent ? (
                  <div className="w-6 h-6 rounded-full border-2 border-accent bg-accent/20 flex items-center justify-center">
                    <div className="w-2.5 h-2.5 rounded-full bg-accent" />
                  </div>
                ) : (
                  <Circle className="w-6 h-6 text-muted-foreground/40" />
                )}
              </div>

              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-semibold text-foreground">Step {s.step}: {s.title}</span>
                  {isCurrent && <Badge className="bg-accent text-accent-foreground text-xs border-0">You are here</Badge>}
                </div>
                <p className="text-sm text-muted-foreground mt-0.5">{s.milestone}</p>
                <p className="text-xs text-muted-foreground mt-1">{s.products}</p>
                <div className="flex items-center gap-2 mt-2">
                  <span className="text-xs text-muted-foreground">⏱ {s.timeline}</span>
                  <ArrowRight className="w-3 h-3 text-muted-foreground" />
                  <span className="text-xs text-accent font-medium">Go to section →</span>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </Card>
  );
}

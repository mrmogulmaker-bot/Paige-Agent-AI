import { useState, useEffect } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  ChevronLeft,
  ChevronRight,
  X,
  Sparkles,
  Lightbulb,
} from "lucide-react";

export type WalkthroughStep = {
  num: number;
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  what: string;
  why: string;
  hack?: string;
};

interface PageWalkthroughProps {
  storageKey: string;
  title: string;
  steps: WalkthroughStep[];
}

export function PageWalkthrough({ storageKey, title, steps }: PageWalkthroughProps) {
  const [dismissed, setDismissed] = useState(true);
  const [index, setIndex] = useState(0);

  useEffect(() => {
    const saved = localStorage.getItem(storageKey);
    setDismissed(saved === "true");
  }, [storageKey]);

  const handleDismiss = () => {
    localStorage.setItem(storageKey, "true");
    setDismissed(true);
  };

  const handleShow = () => {
    localStorage.removeItem(storageKey);
    setDismissed(false);
    setIndex(0);
  };

  const goNext = () => setIndex((i) => Math.min(i + 1, steps.length - 1));
  const goPrev = () => setIndex((i) => Math.max(i - 1, 0));
  const isLast = index === steps.length - 1;
  const isFirst = index === 0;

  if (dismissed) {
    return (
      <div className="flex justify-end">
        <Button
          variant="ghost"
          size="sm"
          onClick={handleShow}
          className="text-xs text-muted-foreground hover:text-foreground gap-1.5"
        >
          <Lightbulb className="w-3.5 h-3.5" />
          Show page walkthrough
        </Button>
      </div>
    );
  }

  const step = steps[index];
  const Icon = step.icon;

  return (
    <Card className="bg-gradient-to-br from-accent/5 via-card to-card border-accent/30 overflow-hidden">
      <div className="p-4 sm:p-5">
        {/* Header */}
        <div className="flex items-center justify-between gap-3 mb-3">
          <div className="flex items-center gap-2 min-w-0">
            <div className="w-8 h-8 rounded-full bg-accent/15 flex items-center justify-center shrink-0">
              <Sparkles className="w-4 h-4 text-accent" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-sm font-bold text-foreground">{title}</h2>
                <Badge variant="outline" className="text-[10px] border-accent/40 text-accent shrink-0">
                  {index + 1} / {steps.length}
                </Badge>
              </div>
            </div>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={handleDismiss}
            className="h-7 w-7 p-0 shrink-0"
            aria-label="Dismiss walkthrough"
          >
            <X className="w-4 h-4" />
          </Button>
        </div>

        {/* Slide */}
        <div className="rounded-lg bg-background/50 border border-border/50 p-4 min-h-[180px]">
          <div className="flex items-start gap-3">
            <div className="flex flex-col items-center shrink-0">
              <div className="w-9 h-9 rounded-full bg-accent/10 border border-accent/30 flex items-center justify-center">
                <span className="text-xs font-bold text-accent">{step.num}</span>
              </div>
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1.5">
                <Icon className="w-4 h-4 text-accent shrink-0" />
                <h3 className="font-semibold text-base text-foreground">{step.title}</h3>
              </div>
              <p className="text-xs text-muted-foreground leading-relaxed">{step.what}</p>
              <p className="text-xs text-foreground/80 leading-relaxed mt-2">
                <span className="font-medium text-accent">Why it matters:</span> {step.why}
              </p>
              {step.hack && (
                <div className="mt-2 p-2 rounded-md bg-accent/10 border border-accent/20">
                  <p className="text-xs text-foreground/90 leading-relaxed">
                    <span className="font-bold text-accent">💡 HACK:</span> {step.hack}
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Footer / Nav */}
        <div className="flex items-center justify-between gap-3 mt-3">
          <Button
            variant="outline"
            size="sm"
            onClick={goPrev}
            disabled={isFirst}
            className="gap-1 h-8"
          >
            <ChevronLeft className="w-3.5 h-3.5" />
            Back
          </Button>

          {/* Dots */}
          <div className="flex items-center gap-1 flex-wrap justify-center">
            {steps.map((_, i) => (
              <button
                key={i}
                onClick={() => setIndex(i)}
                aria-label={`Go to step ${i + 1}`}
                className={`h-1.5 rounded-full transition-all ${
                  i === index
                    ? "w-5 bg-accent"
                    : "w-1.5 bg-border hover:bg-accent/50"
                }`}
              />
            ))}
          </div>

          {isLast ? (
            <Button
              size="sm"
              onClick={handleDismiss}
              className="gap-1 h-8 bg-accent hover:bg-accent/90 text-accent-foreground"
            >
              Got it
            </Button>
          ) : (
            <Button
              size="sm"
              onClick={goNext}
              className="gap-1 h-8 bg-accent hover:bg-accent/90 text-accent-foreground"
            >
              Next
              <ChevronRight className="w-3.5 h-3.5" />
            </Button>
          )}
        </div>
      </div>
    </Card>
  );
}

import { useState, useEffect } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Upload,
  Gauge,
  PieChart,
  FileSearch,
  Layers,
  History,
  CalendarClock,
  ListChecks,
  BellRing,
  ChevronDown,
  ChevronUp,
  X,
  Sparkles,
  Lightbulb,
} from "lucide-react";

const STORAGE_KEY = "credit_intel_walkthrough_dismissed_v1";

type Step = {
  num: number;
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  what: string;
  why: string;
  hack?: string;
};

const STEPS: Step[] = [
  {
    num: 1,
    icon: Upload,
    title: "Upload your reports",
    what: "Start by uploading your Experian, TransUnion, and Equifax reports (PDF). Paige extracts every account, balance, score, and negative item automatically.",
    why: "Lenders pull different bureaus. Without all 3, you're funding blind — you can't fix what you can't see.",
  },
  {
    num: 2,
    icon: Gauge,
    title: "Review your bureau scores",
    what: "Compare your FICO across all 3 bureaus side by side. Notice which bureau is your strongest — and which is dragging you down.",
    why: "A 30-point gap between bureaus is common. Knowing your best score tells you which lenders to target first (banks pull Equifax, fintechs lean TransUnion, mortgage uses all 3).",
  },
  {
    num: 3,
    icon: PieChart,
    title: "Check your credit factors",
    what: "See the 5 FICO factors broken out: payment history (35%), utilization (30%), credit age (15%), credit mix (10%), inquiries (10%).",
    why: "FICO is a math equation. Once you see which factor is costing you points, you know exactly where to put your effort for the biggest score lift.",
  },
  {
    num: 4,
    icon: FileSearch,
    title: "Open your Credit File Health Assessment",
    what: "Drill into each bureau report — every negative account, every positive tradeline, and your overall file structure (account types you have vs. what you're missing).",
    why: "Lenders want to see 10+ accounts with the right mix: revolving (credit cards), installment (auto/personal loans), and mortgage. This is where you spot the holes.",
    hack: "Target: 10+ accounts with at least 3 revolving, 1+ installment, and ideally 1 mortgage. Most denials trace back to a thin or unbalanced file.",
  },
  {
    num: 5,
    icon: Layers,
    title: "Understand Comparable Credit (per bureau)",
    what: "This shows accounts on your file that lenders consider 'comparable' — same industry, same size, same risk profile as the loan you want.",
    why: "If you're applying for a $25K auto loan, lenders want to see you've handled comparable credit before. No comparable credit = automatic decline, regardless of score.",
  },
  {
    num: 6,
    icon: History,
    title: "Historical Comparable Credit",
    what: "Closed-but-positive accounts from your past — paid-off auto loans, mortgages, old credit cards in good standing.",
    why: "These work in your favor when you sign as a Personal Guarantor (PG) for business funding. Lenders treat closed positives as proof you can handle and pay off real debt.",
  },
  {
    num: 7,
    icon: CalendarClock,
    title: "Credit Age",
    what: "Your average account age across all tradelines. Goal: 5+ years average age.",
    why: "Credit age is 15% of your FICO. A young file caps your score — you can have perfect payments and still be stuck under 700 if your average age is under 2 years.",
    hack: "Adding no more than 2 old Authorized User (AU) accounts on someone's seasoned credit cards (perfect payment, low utilization) can age your file overnight. Choose AU accounts older than 5 years for max impact.",
  },
  {
    num: 8,
    icon: ListChecks,
    title: "Credit File Action Plan",
    what: "Paige's prioritized list of moves to strengthen your consumer report — disputes to file, accounts to add, balances to pay down, AU tradelines to consider.",
    why: "This is your roadmap. Every step is sequenced for maximum score impact in the shortest time — no guessing, no wasted moves.",
  },
  {
    num: 9,
    icon: BellRing,
    title: "Credit Alerts",
    what: "Real-time alerts when something changes on your report — new inquiry, balance spike, negative item, score drop.",
    why: "Catch fraud early, react to bureau changes before they cost you, and stay ahead of identity issues. This is your early-warning system.",
  },
];

export function CreditIntelWalkthrough() {
  const [dismissed, setDismissed] = useState(true);
  const [expanded, setExpanded] = useState(true);

  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    setDismissed(saved === "true");
  }, []);

  const handleDismiss = () => {
    localStorage.setItem(STORAGE_KEY, "true");
    setDismissed(true);
  };

  const handleShow = () => {
    localStorage.removeItem(STORAGE_KEY);
    setDismissed(false);
    setExpanded(true);
  };

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

  return (
    <Card className="bg-gradient-to-br from-accent/5 via-card to-card border-accent/30 overflow-hidden">
      <div className="p-5 sm:p-6">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-full bg-accent/15 flex items-center justify-center shrink-0">
              <Sparkles className="w-5 h-5 text-accent" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-lg font-bold text-foreground">How to use this page</h2>
                <Badge variant="outline" className="text-[10px] border-accent/40 text-accent">
                  9 steps
                </Badge>
              </div>
              <p className="text-sm text-muted-foreground mt-1">
                Work through these in order — each section builds on the last. By the end you'll know exactly what's on your file, what's hurting you, and what to fix first.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setExpanded(!expanded)}
              className="h-8 px-2"
              aria-label={expanded ? "Collapse walkthrough" : "Expand walkthrough"}
            >
              {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleDismiss}
              className="h-8 px-2"
              aria-label="Dismiss walkthrough"
            >
              <X className="w-4 h-4" />
            </Button>
          </div>
        </div>

        {expanded && (
          <ol className="mt-5 space-y-3">
            {STEPS.map((step) => {
              const Icon = step.icon;
              return (
                <li
                  key={step.num}
                  className="relative flex gap-3 p-3 rounded-lg bg-background/40 border border-border/50 hover:border-accent/30 transition-colors"
                >
                  <div className="flex flex-col items-center shrink-0">
                    <div className="w-8 h-8 rounded-full bg-accent/10 border border-accent/30 flex items-center justify-center">
                      <span className="text-xs font-bold text-accent">{step.num}</span>
                    </div>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <Icon className="w-4 h-4 text-accent shrink-0" />
                      <h3 className="font-semibold text-sm text-foreground">{step.title}</h3>
                    </div>
                    <p className="text-xs text-muted-foreground leading-relaxed">{step.what}</p>
                    <p className="text-xs text-foreground/80 leading-relaxed mt-1.5">
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
                </li>
              );
            })}
          </ol>
        )}

        {expanded && (
          <div className="mt-5 pt-4 border-t border-border/50 flex items-center justify-between gap-3 flex-wrap">
            <p className="text-xs text-muted-foreground">
              Got it? You can always reopen this guide from the top of the page.
            </p>
            <Button
              variant="outline"
              size="sm"
              onClick={handleDismiss}
              className="gap-1.5"
            >
              Got it — hide this
            </Button>
          </div>
        )}
      </div>
    </Card>
  );
}

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  ArrowRight,
  ListChecks,
  TrendingUp,
  Sparkles,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { AccountImpactBreakdown } from "./AccountImpactBreakdown";
import { BuildPersonalRoadmap } from "./BuildPersonalRoadmap";

/**
 * PostUploadNextSteps
 *
 * Shown on the Credit Intelligence page once a client has at least one
 * analyzed credit report. Gives them a clear, prioritized path so they
 * never wonder "what now?" after uploading.
 *
 * Steps are dynamic — completed actions get a green checkmark, the next
 * uncompleted action becomes the primary CTA.
 */
export function PostUploadNextSteps() {
  const navigate = useNavigate();
  const [reviewExpanded, setReviewExpanded] = useState(true);
  const [buildExpanded, setBuildExpanded] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["post-upload-next-steps"],
    queryFn: async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user?.id) return null;
      const uid = session.user.id;

      const [
        { count: negCount },
        { count: acctCount },
        { count: disputeCount },
        { count: bizCount },
      ] = await Promise.all([
        supabase.from("credit_negative_items").select("id", { count: "exact", head: true }).eq("user_id", uid).eq("status", "active"),
        supabase.from("credit_accounts").select("id", { count: "exact", head: true }).eq("user_id", uid),
        supabase.from("disputes").select("id", { count: "exact", head: true }).eq("user_id", uid),
        supabase.from("businesses").select("id", { count: "exact", head: true }).eq("owner_user_id", uid),
      ]);

      return {
        negatives: negCount ?? 0,
        accounts: acctCount ?? 0,
        disputesStarted: (disputeCount ?? 0) > 0,
        hasBusiness: (bizCount ?? 0) > 0,
      };
    },
  });

  if (isLoading || !data) return null;
  // Hide entirely if the report didn't actually populate any data —
  // the empty-state on the rest of the page already guides the user.
  if (data.accounts === 0 && data.negatives === 0) return null;

  const steps = [
    {
      key: "review",
      icon: ListChecks,
      title: "Review what's hurting your score",
      description: `We extracted ${data.accounts} account${data.accounts === 1 ? "" : "s"}${data.negatives > 0 ? ` and flagged ${data.negatives} negative item${data.negatives === 1 ? "" : "s"}` : ""}. Here's exactly what each one is doing to your credit — account by account.`,
      done: false,
      cta: reviewExpanded ? "Hide details" : "Show details",
      ctaIcon: reviewExpanded ? ChevronUp : ChevronDown,
      onClick: () => setReviewExpanded((v) => !v),
      expandable: true,
    },
    {
      key: "build",
      icon: TrendingUp,
      title: "Start BUILD Personal",
      description:
        "BUILD Personal is the 12-month roadmap that turns this credit file into a fundable profile. Walk through each phase (Base → Utilize → Integrate → Leverage → Dominate) and see what tradelines you have, what's missing, and why each one matters.",
      done: false,
      cta: buildExpanded ? "Hide roadmap" : "Show roadmap",
      ctaIcon: buildExpanded ? ChevronUp : ChevronDown,
      onClick: () => setBuildExpanded((v) => !v),
      expandable: true,
    },
    {
      key: "paige",
      icon: Sparkles,
      title: "Ask Paige what to do next",
      description: "Paige now has full context of your report. Ask her anything — disputes, utilization, funding strategy.",
      done: false,
      cta: "Talk to Paige",
      ctaIcon: ArrowRight,
      onClick: () => {
        // Open the floating chatbot
        window.dispatchEvent(new CustomEvent("paige-open-chat"));
      },
    },
  ];

  // First uncompleted step becomes the highlighted "next action"
  const nextIndex = steps.findIndex((s) => !s.done);

  return (
    <Card className="p-6 bg-gradient-to-br from-card to-accent/5 border-accent/30">
      <div className="flex items-start justify-between gap-4 mb-5">
        <div>
          <div className="flex items-center gap-2">
            <Badge className="bg-accent/20 text-accent border-accent/30">Next steps</Badge>
            <h2 className="text-xl font-bold text-foreground">Your report is in — here's what to do</h2>
          </div>
          <p className="text-sm text-muted-foreground mt-1">
            We've turned your report into an action plan. Work through these in order.
          </p>
        </div>
      </div>

      <div className="space-y-3">
        {steps.map((step, idx) => {
          const Icon = step.icon;
          const CtaIcon = step.ctaIcon || ArrowRight;
          const isNext = idx === nextIndex;
          const showBreakdown = step.key === "review" && reviewExpanded;
          return (
            <div
              key={step.key}
              className={`rounded-lg border transition-colors ${
                isNext
                  ? "bg-accent/10 border-accent/40"
                  : step.done
                    ? "bg-muted/30 border-border"
                    : "bg-card border-border"
              }`}
            >
              <div className="flex items-start gap-4 p-4">
                <div
                  className={`shrink-0 w-9 h-9 rounded-full flex items-center justify-center ${
                    step.done
                      ? "bg-fundability-excellent/20 text-fundability-excellent"
                      : isNext
                        ? "bg-accent/20 text-accent"
                        : "bg-muted text-muted-foreground"
                  }`}
                >
                  {step.done ? <CheckCircle2 className="w-5 h-5" /> : <Icon className="w-5 h-5" />}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className={`font-semibold ${step.done ? "text-muted-foreground line-through" : "text-foreground"}`}>
                      {step.title}
                    </h3>
                    {isNext && <Badge variant="outline" className="text-[10px] border-accent/40 text-accent">Do this next</Badge>}
                  </div>
                  <p className="text-sm text-muted-foreground mt-0.5">{step.description}</p>
                </div>
                {step.cta && !step.done && (
                  <Button
                    size="sm"
                    variant={isNext ? "default" : "outline"}
                    onClick={step.onClick}
                    className={isNext ? "bg-gradient-gold hover:opacity-90 shrink-0" : "shrink-0"}
                  >
                    {step.cta}
                    <CtaIcon className="w-3.5 h-3.5 ml-1" />
                  </Button>
                )}
              </div>
              {showBreakdown && (
                <div className="px-4 pb-4 pt-1 border-t border-border/50 mt-1">
                  <AccountImpactBreakdown />
                </div>
              )}
            </div>
          );
        })}
      </div>
    </Card>
  );
}

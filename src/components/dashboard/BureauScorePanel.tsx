import { Card } from "@/components/ui/card";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Info, Loader2 } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { format } from "date-fns";

interface BureauScorePanelProps {
  /** When set, fetches scores for this client instead of the auth user */
  clientUserId?: string;
}

type ScoreRange = {
  min: number;
  max: number;
  label: string;
  color: string;
  bg: string;
};

const SCORE_RANGES: ScoreRange[] = [
  { min: 800, max: 850, label: "Exceptional", color: "text-emerald-700 dark:text-emerald-400", bg: "bg-emerald-100 dark:bg-emerald-900/40" },
  { min: 740, max: 799, label: "Very Good", color: "text-green-600 dark:text-green-400", bg: "bg-green-100 dark:bg-green-900/40" },
  { min: 700, max: 739, label: "Good", color: "text-lime-600 dark:text-lime-400", bg: "bg-lime-100 dark:bg-lime-900/40" },
  { min: 660, max: 699, label: "Good", color: "text-yellow-600 dark:text-yellow-300", bg: "bg-yellow-100 dark:bg-yellow-900/40" },
  { min: 620, max: 659, label: "Fair", color: "text-orange-500 dark:text-orange-400", bg: "bg-orange-100 dark:bg-orange-900/40" },
  { min: 580, max: 619, label: "Fair", color: "text-orange-600 dark:text-orange-400", bg: "bg-orange-100 dark:bg-orange-900/40" },
  { min: 300, max: 579, label: "Poor", color: "text-red-600 dark:text-red-400", bg: "bg-red-100 dark:bg-red-900/40" },
];

function getScoreInfo(score: number | null): ScoreRange | null {
  if (score == null) return null;
  return SCORE_RANGES.find((r) => score >= r.min && score <= r.max) ?? null;
}

function getFundingContext(scores: number[]): string {
  if (scores.length === 0) return "";
  const avg = Math.round(scores.reduce((a, b) => a + b, 0) / scores.length);
  if (avg >= 700) return "Strong profile. You qualify for most business credit products.";
  if (avg >= 660) return "You are approaching lender thresholds. One or two dispute wins could move you significantly.";
  if (avg >= 620) return "You qualify for some secured products. Removing derogatory items will unlock more options.";
  return "Most traditional lenders require 680+. Focus on dispute resolution first.";
}

const SCORE_MODEL_TOOLTIPS: Record<string, string> = {
  FICO: "FICO scores are used by 90% of top lenders. They range from 300-850 and may differ from scores shown on free monitoring apps that use VantageScore.",
  VantageScore: "VantageScore is a competing model created by the three bureaus. It uses a similar 300-850 range but weighs factors differently than FICO, so scores often differ.",
  Unknown: "The scoring model could not be determined from your report. Scores may be FICO or VantageScore depending on the source.",
};

const BUREAUS = [
  { key: "tu" as const, label: "TransUnion", field: "estimated_fico_tu" as const },
  { key: "ex" as const, label: "Experian", field: "estimated_fico_ex" as const },
  { key: "eq" as const, label: "Equifax", field: "estimated_fico_eq" as const },
];

export function BureauScorePanel({ clientUserId }: BureauScorePanelProps) {
  const { data, isLoading } = useQuery({
    queryKey: ["bureau-score-panel", clientUserId],
    queryFn: async () => {
      let userId = clientUserId;
      if (!userId) {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return null;
        userId = user.id;
      }

      const { data: profile } = await supabase
        .from("profiles")
        .select("estimated_fico_eq, estimated_fico_ex, estimated_fico_tu, score_model, last_report_analyzed_at")
        .eq("user_id", userId)
        .maybeSingle();

      return profile;
    },
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="w-6 h-6 animate-spin text-accent" />
      </div>
    );
  }

  const tu = data?.estimated_fico_tu as number | null;
  const ex = data?.estimated_fico_ex as number | null;
  const eq = data?.estimated_fico_eq as number | null;
  const scoreModel = (data?.score_model as string) || "Unknown";
  const lastUpdated = data?.last_report_analyzed_at as string | null;
  const scores = [tu, ex, eq].filter((s): s is number => s != null);

  if (scores.length === 0) return null;

  const scoreModelLabel = scoreModel === "VantageScore" ? "VantageScore 3.0" : scoreModel === "FICO" ? "FICO® Score" : "Credit Score";

  return (
    <TooltipProvider>
      <div className="space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {BUREAUS.map(({ key, label, field }) => {
            const score = data?.[field] as number | null;
            const info = getScoreInfo(score);

            return (
              <Card key={key} className="p-5 bg-card border-border text-center">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1">{label}</p>
                {score != null ? (
                  <>
                    <p className={`text-5xl font-bold tracking-tight ${info?.color ?? "text-foreground"}`}>
                      {score}
                    </p>
                    {info && (
                      <span className={`inline-block mt-2 px-2.5 py-0.5 rounded-full text-xs font-semibold ${info.color} ${info.bg}`}>
                        {info.label}
                      </span>
                    )}
                    <div className="flex items-center justify-center gap-1 mt-2">
                      <span className="text-[11px] text-muted-foreground">{scoreModelLabel}</span>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Info className="w-3 h-3 text-muted-foreground cursor-help" />
                        </TooltipTrigger>
                        <TooltipContent side="top" className="max-w-[260px] text-xs">
                          {SCORE_MODEL_TOOLTIPS[scoreModel] || SCORE_MODEL_TOOLTIPS.Unknown}
                        </TooltipContent>
                      </Tooltip>
                    </div>
                  </>
                ) : (
                  <p className="text-3xl font-bold text-muted-foreground/40 mt-1">—</p>
                )}
              </Card>
            );
          })}
        </div>

        {/* Context line */}
        <p className="text-sm text-muted-foreground text-center">{getFundingContext(scores)}</p>

        {/* Score as of date */}
        {lastUpdated && (
          <p className="text-xs text-muted-foreground/70 text-center">
            Score as of {format(new Date(lastUpdated), "MMMM d, yyyy")}
          </p>
        )}
      </div>
    </TooltipProvider>
  );
}

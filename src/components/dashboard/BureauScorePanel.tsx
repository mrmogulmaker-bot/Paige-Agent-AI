import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Info, Loader2, TrendingUp, TrendingDown, Minus } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { format } from "date-fns";
import { getLenderCategoriesForBureau } from "@/lib/fundingMatchScoring";

interface BureauScorePanelProps {
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

function getBureauHealthIndicator(
  thisScore: number | null,
  allScores: (number | null)[]
): { icon: React.ReactNode; label: string; color: string } | null {
  if (thisScore == null) return null;
  const valid = allScores.filter((s): s is number => s != null);
  if (valid.length < 2) return null;

  const max = Math.max(...valid);
  const min = Math.min(...valid);

  if (thisScore === max && max - min >= 15) {
    return {
      icon: <TrendingUp className="w-4 h-4" />,
      label: "Best score",
      color: "text-fundability-excellent",
    };
  }
  if (thisScore === min && max - min >= 15) {
    return {
      icon: <TrendingDown className="w-4 h-4" />,
      label: "Weakest score",
      color: "text-destructive",
    };
  }
  return {
    icon: <Minus className="w-4 h-4" />,
    label: "Mid-range",
    color: "text-muted-foreground",
  };
}

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
  const allScores = [tu, ex, eq];

  if (scores.length === 0) return null;

  const scoreModelLabel = scoreModel === "VantageScore" ? "VantageScore 3.0" : scoreModel === "FICO" ? "FICO® Score" : "Credit Score";

  return (
    <TooltipProvider>
      <div className="space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {BUREAUS.map(({ key, label, field }) => {
            const score = data?.[field] as number | null;
            const info = getScoreInfo(score);
            const health = getBureauHealthIndicator(score, allScores);
            const lenders = getLenderCategoriesForBureau(key);

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

                    {/* Bureau health indicator */}
                    {health && (
                      <div className={`flex items-center justify-center gap-1.5 mt-2 ${health.color}`}>
                        {health.icon}
                        <span className="text-xs font-medium">{health.label}</span>
                      </div>
                    )}

                    {/* Lender categories */}
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <p className="text-[10px] text-muted-foreground mt-2 cursor-help hover:text-foreground transition-colors">
                          Used by: {lenders.split(",").slice(0, 2).join(",")}…
                        </p>
                      </TooltipTrigger>
                      <TooltipContent side="bottom" className="max-w-[260px] text-xs">
                        <p className="font-semibold mb-1">Lenders that pull {label}:</p>
                        <p>{lenders}</p>
                      </TooltipContent>
                    </Tooltip>

                    <div className="flex items-center justify-center gap-1 mt-1">
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

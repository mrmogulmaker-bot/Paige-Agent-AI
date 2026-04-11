import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { useFundingReadiness, FundingReadinessBreakdown } from "@/hooks/useFundingReadiness";
import { Gauge, TrendingUp, Lightbulb, RefreshCw, ChevronDown, ChevronUp } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { BankingSourceBadge } from "./bank-accounts/BankingSourceBadge";

function ScoreGauge({ score }: { score: number }) {
  const radius = 80;
  const stroke = 12;
  const normalizedRadius = radius - stroke / 2;
  const circumference = normalizedRadius * 2 * Math.PI;
  // Arc from 180° to 0° (bottom half excluded)
  const arcLength = circumference * 0.75;
  const progress = Math.min(score / 1000, 1);
  const offset = arcLength - progress * arcLength;

  const getColor = (s: number) => {
    if (s >= 700) return "hsl(142, 71%, 45%)";
    if (s >= 400) return "hsl(38, 92%, 50%)";
    return "hsl(0, 84%, 60%)";
  };

  const getLabel = (s: number) => {
    if (s >= 700) return "Funding Ready";
    if (s >= 400) return "Getting There";
    return "Needs Work";
  };

  return (
    <div className="flex flex-col items-center">
      <svg height={radius * 2} width={radius * 2} className="-rotate-[135deg]">
        <circle
          stroke="hsl(var(--muted))"
          fill="transparent"
          strokeWidth={stroke}
          r={normalizedRadius}
          cx={radius}
          cy={radius}
          strokeDasharray={`${arcLength} ${circumference}`}
          strokeLinecap="round"
        />
        <circle
          stroke={getColor(score)}
          fill="transparent"
          strokeWidth={stroke}
          r={normalizedRadius}
          cx={radius}
          cy={radius}
          strokeDasharray={`${arcLength} ${circumference}`}
          strokeDashoffset={offset}
          strokeLinecap="round"
          className="transition-all duration-1000 ease-out"
        />
      </svg>
      <div className="absolute flex flex-col items-center mt-10">
        <span className="text-4xl font-bold" style={{ color: getColor(score) }}>{score}</span>
        <span className="text-xs text-muted-foreground">/ 1000</span>
      </div>
      <Badge
        className="mt-2 text-xs"
        style={{ backgroundColor: getColor(score), color: "white", borderColor: getColor(score) }}
      >
        {getLabel(score)}
      </Badge>
    </div>
  );
}

function CategoryRow({ item }: { item: FundingReadinessBreakdown }) {
  const pct = Math.round(item.rawScore);
  const getBarColor = (s: number) => {
    if (s >= 70) return "bg-green-500";
    if (s >= 40) return "bg-amber-500";
    return "bg-red-500";
  };

  return (
    <div className="space-y-1.5">
      <div className="flex justify-between items-center text-sm">
        <span className="font-medium">{item.label}</span>
        <div className="flex items-center gap-2">
          <span className="text-muted-foreground text-xs">{Math.round(item.weight * 100)}% weight</span>
          <span className="font-semibold w-10 text-right">{pct}</span>
        </div>
      </div>
      <div className="relative h-2 w-full overflow-hidden rounded-full bg-secondary">
        <div
          className={`h-full rounded-full transition-all duration-700 ${getBarColor(pct)}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <p className="text-xs text-muted-foreground">{item.explanation}</p>
    </div>
  );
}

export function PMEFundingReadiness() {
  const { result, saveScore } = useFundingReadiness();
  const [showBreakdown, setShowBreakdown] = useState(true);
  const [aiAdvice, setAiAdvice] = useState<string | null>(null);
  const [loadingAdvice, setLoadingAdvice] = useState(false);

  // Auto-save when result changes
  useEffect(() => {
    if (result && result.overallScore > 0) {
      saveScore.mutate(result);
    }
  }, [result?.overallScore]);

  const handleGetAdvice = async () => {
    if (!result) return;
    setLoadingAdvice(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("Not authenticated");

      const prompt = `Based on this PME Funding Readiness Score breakdown, provide a prioritized action list of exactly 5 specific steps to improve the score. Be concise and actionable.\n\nOverall Score: ${result.overallScore}/1000\n\n${result.breakdown.map(b => `${b.label} (${b.weight * 100}% weight): ${b.rawScore}/100 — ${b.explanation}`).join("\n")}`;

      const response = await supabase.functions.invoke("paige-ai-chat", {
        headers: { Authorization: `Bearer ${session.access_token}` },
        body: {
          message: prompt,
          sessionId: `pme-advice-${Date.now()}`,
          context: "funding_readiness_advice",
        },
      });

      if (response.error) throw response.error;
      setAiAdvice(response.data?.reply || response.data?.message || "Unable to generate advice at this time.");
    } catch (err) {
      toast.error("Failed to get AI advice");
    } finally {
      setLoadingAdvice(false);
    }
  };

  if (!result) {
    return (
      <Card>
        <CardContent className="py-8 text-center">
          <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">Calculating your funding readiness score...</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-2">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-lg">
            <Gauge className="w-5 h-5 text-primary" />
            PME Funding Readiness Score
          </CardTitle>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setShowBreakdown(!showBreakdown)}
          >
            {showBreakdown ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Gauge */}
        <div className="flex justify-center relative">
          <ScoreGauge score={result.overallScore} />
        </div>

        {/* Top Blockers */}
        {result.topBlockers.length > 0 && (
          <div className="bg-muted/50 rounded-lg p-3 space-y-1">
            <p className="text-xs font-semibold text-muted-foreground flex items-center gap-1">
              <TrendingUp className="w-3 h-3" /> Top areas to improve
            </p>
            {result.topBlockers.map((blocker, i) => (
              <p key={i} className="text-xs text-muted-foreground">• {blocker}</p>
            ))}
          </div>
        )}

        {/* Category Breakdown */}
        {showBreakdown && (
          <div className="space-y-4">
            {result.breakdown.map((item) => (
              <div key={item.label}>
                <CategoryRow item={item} />
                {item.label === "Banking History" && result.bankingDataSource && (
                  <div className="mt-1 ml-0.5">
                    <BankingSourceBadge source={result.bankingDataSource} />
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {/* AI Advice */}
        <Button
          variant="outline"
          className="w-full"
          onClick={handleGetAdvice}
          disabled={loadingAdvice}
        >
          <Lightbulb className="w-4 h-4 mr-2" />
          {loadingAdvice ? "Asking Paige..." : "What Would Move My Score?"}
        </Button>

        {aiAdvice && (
          <div className="bg-muted/50 rounded-lg p-4 text-sm whitespace-pre-wrap">
            {aiAdvice}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

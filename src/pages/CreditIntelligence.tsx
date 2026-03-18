import { useCreditFactors } from "@/hooks/useCreditFactors";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Loader2, RefreshCw, TrendingUp, AlertTriangle, CheckCircle, XCircle } from "lucide-react";
import { useNavigate } from "react-router-dom";

export default function CreditIntelligence() {
  const { factors, isLoading, recalculate } = useCreditFactors();
  const navigate = useNavigate();

  const factorCards = factors
    ? [
        {
          label: "Payment History",
          weight: "35%",
          score: factors.payment_history_score,
          details: [
            `${factors.active_negatives} active negatives`,
            `${factors.removed_negatives} removed`,
            `${factors.total_negatives} total tracked`,
          ],
          action: "Dispute negative items",
        },
        {
          label: "Utilization",
          weight: "30%",
          score: factors.utilization_score,
          details: [
            `${Math.round(factors.aggregate_utilization || 0)}% aggregate`,
            `${factors.cards_over_30_pct} cards over 30%`,
            `${factors.cards_over_70_pct} cards over 70%`,
            `$${Number(factors.total_balance || 0).toLocaleString()} / $${Number(factors.total_credit_limit || 0).toLocaleString()}`,
          ],
          action: "Optimize paydown strategy",
        },
        {
          label: "Credit Age",
          weight: "15%",
          score: factors.credit_age_score,
          details: [
            `${factors.average_account_age_months || 0} months average`,
            `${factors.oldest_account_age_months || 0} months oldest`,
            `${factors.newest_account_age_months || 0} months newest`,
          ],
          action: "Don't close old accounts",
        },
        {
          label: "Credit Mix",
          weight: "10%",
          score: factors.credit_mix_score,
          details: [
            `${factors.revolving_count} revolving`,
            `${factors.installment_count} installment`,
            `${factors.mortgage_count} mortgage`,
          ],
          action: "Diversify account types",
        },
        {
          label: "Inquiries",
          weight: "10%",
          score: factors.inquiry_score,
          details: [
            `TU: ${factors.total_inquiries_tu} | EX: ${factors.total_inquiries_ex} | EQ: ${factors.total_inquiries_eq}`,
            `${factors.inquiry_budget_remaining} safe inquiries remaining`,
          ],
          action: "Manage inquiry timing",
        },
      ]
    : [];

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Credit Intelligence</h1>
          <p className="text-muted-foreground mt-1">
            Your 5-factor FICO breakdown — stop guessing, see the data.
          </p>
        </div>
        <Button
          onClick={() => recalculate.mutate()}
          disabled={recalculate.isPending}
          className="bg-gradient-gold hover:opacity-90"
        >
          {recalculate.isPending ? (
            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
          ) : (
            <RefreshCw className="w-4 h-4 mr-2" />
          )}
          Recalculate
        </Button>
      </div>

      {/* Fundability Score Ring */}
      {factors && (
        <Card className="p-8 bg-card border-border text-center">
          <div className="inline-flex flex-col items-center">
            <div className="relative w-36 h-36">
              <svg className="w-36 h-36 transform -rotate-90" viewBox="0 0 120 120">
                <circle cx="60" cy="60" r="50" fill="none" stroke="hsl(var(--border))" strokeWidth="10" />
                <circle
                  cx="60" cy="60" r="50" fill="none"
                  stroke={getScoreHSL(factors.overall_fundability_score)}
                  strokeWidth="10"
                  strokeLinecap="round"
                  strokeDasharray={`${(factors.overall_fundability_score / 100) * 314} 314`}
                  className="transition-all duration-1000"
                />
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className={`text-3xl font-bold ${getScoreTextColor(factors.overall_fundability_score)}`}>
                  {factors.overall_fundability_score}
                </span>
                <span className="text-xs text-muted-foreground">/100</span>
              </div>
            </div>
            <h2 className="text-xl font-bold mt-4">Fundability Score</h2>
            <p className="text-sm text-muted-foreground">
              {factors.overall_fundability_score >= 80 ? "Excellent — you're fundable" :
               factors.overall_fundability_score >= 60 ? "Good — getting closer" :
               factors.overall_fundability_score >= 40 ? "Fair — work to do" :
               "Needs attention — here's the protocol"}
            </p>
          </div>
        </Card>
      )}

      {/* Factor Cards */}
      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-8 h-8 animate-spin text-accent" />
        </div>
      ) : factors ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
          {factorCards.map((fc) => (
            <Card key={fc.label} className="p-5 bg-card border-border hover:border-accent/50 transition-colors">
              <div className="flex items-center justify-between mb-3">
                <StatusIcon score={fc.score} />
                <span className="text-xs text-muted-foreground">{fc.weight}</span>
              </div>
              <div className={`text-2xl font-bold ${getScoreTextColor(fc.score)}`}>
                {fc.score}/100
              </div>
              <h3 className="font-semibold text-sm mt-1">{fc.label}</h3>
              <ul className="mt-3 space-y-1">
                {fc.details.map((d, i) => (
                  <li key={i} className="text-xs text-muted-foreground">{d}</li>
                ))}
              </ul>
              <p className="text-xs text-accent mt-3 font-medium">💡 {fc.action}</p>
            </Card>
          ))}
        </div>
      ) : (
        <Card className="p-8 text-center">
          <p className="text-muted-foreground">No credit data yet. Click "Recalculate" to analyze your profile.</p>
        </Card>
      )}
    </div>
  );
}

function StatusIcon({ score }: { score: number }) {
  if (score >= 80) return <CheckCircle className="w-5 h-5 text-fundability-excellent" />;
  if (score >= 60) return <TrendingUp className="w-5 h-5 text-fundability-good" />;
  if (score >= 40) return <AlertTriangle className="w-5 h-5 text-fundability-fair" />;
  return <XCircle className="w-5 h-5 text-fundability-poor" />;
}

function getScoreTextColor(score: number): string {
  if (score >= 80) return "text-fundability-excellent";
  if (score >= 60) return "text-fundability-good";
  if (score >= 40) return "text-fundability-fair";
  return "text-fundability-poor";
}

function getScoreHSL(score: number): string {
  if (score >= 80) return "hsl(142, 76%, 36%)";
  if (score >= 60) return "hsl(174, 62%, 47%)";
  if (score >= 40) return "hsl(38, 92%, 50%)";
  return "hsl(0, 72%, 51%)";
}

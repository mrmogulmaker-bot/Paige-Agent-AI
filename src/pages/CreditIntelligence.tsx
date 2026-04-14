import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCreditFactors } from "@/hooks/useCreditFactors";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Loader2, RefreshCw, TrendingUp, AlertTriangle, CheckCircle, XCircle, Upload, Settings2 } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { format } from "date-fns";
import { BureauScorePanel } from "@/components/dashboard/BureauScorePanel";
import { CreditFileHealthAssessment } from "@/components/credit/CreditFileHealthAssessment";
import { AccountManager } from "@/components/credit/AccountManager";

export default function CreditIntelligence() {
  const { factors, isLoading, recalculate } = useCreditFactors();
  const navigate = useNavigate();
  const [accountManagerOpen, setAccountManagerOpen] = useState(false);

  const hasData = factors && (
    factors.payment_history_score != null ||
    factors.utilization_score != null ||
    factors.credit_age_score != null ||
    factors.credit_mix_score != null ||
    factors.inquiry_score != null
  );

  const factorCards = hasData
    ? [
        {
          label: "Payment History",
          weight: "35%",
          score: factors.payment_history_score ?? 0,
          details: [
            `${factors.active_negatives ?? 0} active negatives`,
            `${factors.removed_negatives ?? 0} removed`,
            `${factors.total_negatives ?? 0} total tracked`,
          ],
          action: "Dispute negative items",
        },
        {
          label: "Utilization",
          weight: "30%",
          score: factors.utilization_score ?? 0,
          details: [
            `${Math.round(factors.aggregate_utilization || 0)}% aggregate`,
            `${factors.cards_over_30_pct ?? 0} cards over 30%`,
            `${factors.cards_over_70_pct ?? 0} cards over 70%`,
            `$${Number(factors.total_balance || 0).toLocaleString()} / $${Number(factors.total_credit_limit || 0).toLocaleString()}`,
          ],
          action: "Optimize paydown strategy",
        },
        {
          label: "Credit Age",
          weight: "15%",
          score: factors.credit_age_score ?? 0,
          details: [
            `${factors.average_account_age_months ?? 0} months average`,
            `${factors.oldest_account_age_months ?? 0} months oldest`,
            `${factors.newest_account_age_months ?? 0} months newest`,
          ],
          action: "Don't close old accounts",
        },
        {
          label: "Credit Mix",
          weight: "10%",
          score: factors.credit_mix_score ?? 0,
          details: [
            `${factors.revolving_count ?? 0} revolving`,
            `${factors.installment_count ?? 0} installment`,
            `${factors.mortgage_count ?? 0} mortgage`,
          ],
          action: "Diversify account types",
        },
        {
          label: "Inquiries",
          weight: "10%",
          score: factors.inquiry_score ?? 0,
          details: [
            `TU: ${factors.total_inquiries_tu ?? 0} | EX: ${factors.total_inquiries_ex ?? 0} | EQ: ${factors.total_inquiries_eq ?? 0}`,
            `${factors.inquiry_budget_remaining ?? 0} safe inquiries remaining`,
          ],
          action: "Manage inquiry timing",
        },
      ]
    : [];

  const lastCalculated = factors?.calculated_at;

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Credit Intelligence</h1>
          <p className="text-muted-foreground mt-1">
            Your 5-factor FICO breakdown — stop guessing, see the data.
          </p>
          {hasData && lastCalculated && (
            <p className="text-xs text-muted-foreground mt-1">
              Last synced: {format(new Date(lastCalculated), "MMM d, yyyy 'at' h:mm a")}
            </p>
          )}
        </div>
        {hasData ? (
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setAccountManagerOpen(true)}
              className="gap-1.5"
            >
              <Settings2 className="w-4 h-4" />
              <span className="hidden sm:inline">Edit Accounts</span>
            </Button>
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
              Refresh Credit Analysis
            </Button>
          </div>
        ) : (
          <Button
            onClick={() => navigate("/app")}
            className="bg-gradient-gold hover:opacity-90"
          >
            <Upload className="w-4 h-4 mr-2" />
            Upload a Credit Report
          </Button>
        )}
      </div>

      {/* Bureau Score Panel */}
      <BureauScorePanel />

      {/* Fundability Score Ring */}
      {hasData && (
        <Card className="p-8 bg-card border-border text-center">
          <div className="inline-flex flex-col items-center">
            <div className="relative w-36 h-36">
              <svg className="w-36 h-36 transform -rotate-90" viewBox="0 0 120 120">
                <circle cx="60" cy="60" r="50" fill="none" stroke="hsl(var(--border))" strokeWidth="10" />
                <circle
                  cx="60" cy="60" r="50" fill="none"
                  stroke={getScoreHSL(factors.overall_fundability_score ?? 0)}
                  strokeWidth="10"
                  strokeLinecap="round"
                  strokeDasharray={`${((factors.overall_fundability_score ?? 0) / 100) * 314} 314`}
                  className="transition-all duration-1000"
                />
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className={`text-3xl font-bold ${getScoreTextColor(factors.overall_fundability_score ?? 0)}`}>
                  {factors.overall_fundability_score ?? 0}
                </span>
                <span className="text-xs text-muted-foreground">/100</span>
              </div>
            </div>
            <h2 className="text-xl font-bold mt-4">Fundability Score</h2>
            <p className="text-sm text-muted-foreground">
              {getFundabilityLabel(factors.overall_fundability_score ?? 0)}
            </p>
          </div>
        </Card>
      )}

      {/* Factor Cards */}
      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-8 h-8 animate-spin text-accent" />
        </div>
      ) : hasData ? (
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
          <Upload className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
          <h3 className="font-semibold text-lg">Upload a credit report to see your FICO breakdown</h3>
          <p className="text-muted-foreground text-sm mt-2">
            Open Paige chat and attach a PDF credit report. She'll analyze it and your factor scores will appear here automatically.
          </p>
        </Card>
      )}

      {/* Credit File Health Assessment */}
      <CreditFileHealthAssessment />

      {/* Account Manager */}
      <AccountManager isOpen={accountManagerOpen} onClose={() => setAccountManagerOpen(false)} />
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

function getFundabilityLabel(score: number): string {
  if (score >= 90) return "Ready for funding.";
  if (score >= 80) return "Nearly fundable.";
  if (score >= 66) return "Getting closer.";
  if (score >= 51) return "Making progress.";
  if (score >= 31) return "Building foundation.";
  return "Needs significant work.";
}

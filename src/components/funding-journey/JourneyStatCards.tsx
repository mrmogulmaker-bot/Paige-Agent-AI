import { Card } from "@/components/ui/card";
import { TrendingUp, FileCheck2, DollarSign, Sparkles } from "lucide-react";
import type { FundingJourneySummary } from "@/hooks/useFundingJourney";
import { formatCurrency } from "@/lib/fundingJourney";

interface Props {
  summary: FundingJourneySummary;
}

export function JourneyStatCards({ summary }: Props) {
  const cards = [
    {
      label: "Total Applications",
      value: summary.totalApplications.toString(),
      icon: FileCheck2,
      hint: summary.byStatus.submitted + summary.byStatus.under_review > 0
        ? `${summary.byStatus.submitted + summary.byStatus.under_review} pending`
        : "All decisions in",
    },
    {
      label: "Approval Rate",
      value: summary.totalApplications === 0 ? "—" : `${summary.approvalRate}%`,
      icon: TrendingUp,
      hint: summary.totalApplications === 0 ? "No data yet" : "Approved + funded / decided",
    },
    {
      label: "Capital Secured",
      value: formatCurrency(summary.totalCapitalSecured),
      icon: DollarSign,
      hint: summary.byStatus.funded > 0 ? `Across ${summary.byStatus.funded} funded` : "No funding yet",
    },
    {
      label: "Score Improvement",
      value: summary.scoreImprovement == null
        ? "—"
        : `${summary.scoreImprovement >= 0 ? "+" : ""}${summary.scoreImprovement}`,
      icon: Sparkles,
      hint: summary.scoreImprovement == null ? "Need 2+ apps with score" : "Since first application",
    },
  ];

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      {cards.map((c) => (
        <Card key={c.label} className="p-5 bg-card border-border">
          <div className="flex items-start justify-between mb-2">
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              {c.label}
            </span>
            <c.icon className="w-4 h-4 text-accent" />
          </div>
          <div className="text-3xl font-bold text-foreground">{c.value}</div>
          <div className="text-xs text-muted-foreground mt-1">{c.hint}</div>
        </Card>
      ))}
    </div>
  );
}

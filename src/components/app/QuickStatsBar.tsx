import { useNavigate } from "react-router-dom";

interface QuickStatsBarProps {
  factors: any;
}

export function QuickStatsBar({ factors }: QuickStatsBarProps) {
  const navigate = useNavigate();
  const hasStatsData = Boolean(
    factors &&
      [
        factors.overall_fundability_score,
        factors.aggregate_utilization,
        factors.active_negatives,
        factors.utilization_score,
        factors.inquiry_score,
        factors.credit_mix_score,
      ].some((value) => value != null)
  );

  const score = hasStatsData ? factors?.overall_fundability_score ?? null : null;
  const negatives = hasStatsData ? factors?.active_negatives ?? null : null;
  const utilization = hasStatsData ? factors?.aggregate_utilization ?? null : null;

  return (
    <div className="flex items-center justify-between px-4 py-2 bg-card border-t border-border text-xs">
      <button
        onClick={() => navigate("/app/credit")}
        className="flex items-center gap-2 hover:text-accent transition-colors"
      >
        <span className="text-muted-foreground">Fundability:</span>
        <span className={`font-bold ${getScoreColor(score)}`}>
          {score == null ? "—" : `${score}/100`}
        </span>
      </button>

      <button
        onClick={() => navigate("/app/credit")}
        className="flex items-center gap-2 hover:text-accent transition-colors"
      >
        <span className="text-muted-foreground">Utilization:</span>
        <span className={`font-bold ${utilization != null && utilization > 30 ? "text-fundability-fair" : "text-fundability-excellent"}`}>
          {utilization != null ? `${Math.round(utilization)}%` : "—"}
        </span>
      </button>

      <button
        onClick={() => navigate("/app/credit")}
        className="flex items-center gap-2 hover:text-accent transition-colors"
      >
        <span className="text-muted-foreground">Negatives:</span>
        <span className={`font-bold ${negatives != null && negatives > 0 ? "text-fundability-poor" : "text-fundability-excellent"}`}>
          {negatives ?? "—"}
        </span>
      </button>

      <button
        onClick={() => navigate("/app/credit")}
        className="flex items-center gap-2 hover:text-accent transition-colors"
      >
        <span className="text-muted-foreground">Next:</span>
        <span className="font-medium text-accent">
          {getNextAction(hasStatsData ? factors : null)}
        </span>
      </button>
    </div>
  );
}

function getNextAction(factors: any): string {
  if (!factors) return "Upload report";
  if (factors.utilization_score != null && factors.utilization_score < 50) return "Pay down balances";
  if (factors.active_negatives != null && factors.active_negatives > 0) return "Dispute negatives";
  if (factors.inquiry_score != null && factors.inquiry_score < 50) return "Freeze inquiries";
  if (factors.credit_mix_score != null && factors.credit_mix_score < 50) return "Diversify accounts";
  return "Maintain progress";
}

function getScoreColor(score: number | null): string {
  if (score == null) return "text-muted-foreground";
  if (score >= 80) return "text-fundability-excellent";
  if (score >= 60) return "text-fundability-good";
  if (score >= 40) return "text-fundability-fair";
  return "text-fundability-poor";
}

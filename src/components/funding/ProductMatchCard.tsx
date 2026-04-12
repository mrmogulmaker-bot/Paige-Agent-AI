import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider } from "@/components/ui/tooltip";
import { ExternalLink, AlertTriangle, XCircle, Info, CheckCircle2, MinusCircle } from "lucide-react";
import type { ProductMatch } from "@/lib/fundingMatchScoring";

const CATEGORY_STYLES: Record<string, { bg: string; text: string; label: string }> = {
  eligible: { bg: "bg-fundability-excellent/10", text: "text-fundability-excellent", label: "Eligible" },
  near_eligible: { bg: "bg-fundability-fair/10", text: "text-fundability-fair", label: "Near Eligible" },
  needs_improvement: { bg: "bg-warning/10", text: "text-warning", label: "Needs Improvement" },
  not_qualified: { bg: "bg-destructive/10", text: "text-destructive", label: "Not Yet Qualified" },
};

const SEVERITY_ICON = {
  critical: <XCircle className="w-3.5 h-3.5 text-destructive shrink-0" />,
  warning: <AlertTriangle className="w-3.5 h-3.5 text-fundability-fair shrink-0" />,
  info: <Info className="w-3.5 h-3.5 text-muted-foreground shrink-0" />,
};

const STATUS_ICON = {
  positive: <CheckCircle2 className="w-3.5 h-3.5 text-fundability-excellent shrink-0" />,
  negative: <MinusCircle className="w-3.5 h-3.5 text-destructive shrink-0" />,
  neutral: <Info className="w-3.5 h-3.5 text-muted-foreground shrink-0" />,
};

const BUREAU_COLORS: Record<string, string> = {
  experian: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300",
  transunion: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300",
  equifax: "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300",
  all_three: "bg-muted text-muted-foreground",
  middle_score: "bg-muted text-muted-foreground",
  flexible: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300",
};

export function ProductMatchCard({ match }: { match: ProductMatch }) {
  const { product, score, category, deductions, estimatedAmount, estimateExplanation, dataPoints, primaryBureau, bureauPullLabel } = match;
  const style = CATEGORY_STYLES[category];

  return (
    <Card className="p-4 bg-card border-border hover:shadow-md transition-all">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="font-semibold text-foreground">{product.lender_name}</h3>
            <span className="text-sm text-muted-foreground">{product.product_name}</span>
          </div>
          <div className="flex items-center gap-2 mt-1 flex-wrap">
            <Badge variant="outline" className="text-xs">{product.product_type?.replace(/_/g, " ")}</Badge>
            <Badge className={`text-xs ${style.bg} ${style.text} border-0`}>{style.label}</Badge>
            <Badge variant="outline" className={`text-xs border-0 ${BUREAU_COLORS[primaryBureau] || BUREAU_COLORS.middle_score}`}>
              {bureauPullLabel}
            </Badge>
          </div>
        </div>
        <div className="text-right shrink-0">
          <div className="text-2xl font-bold text-foreground">{score}<span className="text-sm text-muted-foreground">/100</span></div>
          {estimatedAmount ? (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <div className="text-sm font-semibold text-accent cursor-help">
                    Est. ${estimatedAmount.toLocaleString()}
                  </div>
                </TooltipTrigger>
                <TooltipContent className="max-w-xs"><p className="text-xs">{estimateExplanation}</p></TooltipContent>
              </Tooltip>
            </TooltipProvider>
          ) : (
            <div className="text-xs text-muted-foreground italic">{estimateExplanation || "—"}</div>
          )}
        </div>
      </div>

      {/* Data Points Summary */}
      <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 bg-muted/30 rounded-lg p-3">
        {dataPoints.map((dp, i) => (
          <div key={i} className="flex items-center gap-1.5 text-xs">
            {STATUS_ICON[dp.status]}
            <span className="text-muted-foreground">{dp.label}:</span>
            <span className="font-medium text-foreground">{dp.value}</span>
          </div>
        ))}
      </div>

      {/* Deductions */}
      {deductions.length > 0 && (
        <div className="mt-3 space-y-1">
          {deductions.map((d, i) => (
            <div key={i} className="flex items-start gap-2 text-xs">
              {SEVERITY_ICON[d.severity]}
              <span className="text-foreground">{d.label}</span>
              <span className="text-destructive font-semibold ml-auto shrink-0">-{d.points}</span>
            </div>
          ))}
        </div>
      )}

      {/* Apply button for eligible */}
      {category === "eligible" && product.application_url && (
        <div className="mt-3">
          <Button size="sm" variant="outline" className="text-xs" asChild>
            <a href={product.affiliate_url || product.application_url} target="_blank" rel="noopener noreferrer">
              Apply <ExternalLink className="w-3 h-3 ml-1" />
            </a>
          </Button>
        </div>
      )}
    </Card>
  );
}

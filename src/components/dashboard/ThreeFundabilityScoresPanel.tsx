import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Lock, HelpCircle, Loader2, ArrowRight, Building2, LayoutGrid } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useIsMobile } from "@/hooks/use-mobile";
import { useThreeFundabilityScores } from "@/hooks/useThreeFundabilityScores";
import { useBusinessContext, entityRoleLabel } from "@/contexts/BusinessContext";
import { BusinessPortfolio } from "./BusinessPortfolio";
import type { FundabilityScoreResult, FundabilityBand } from "@/lib/fundabilityScores";

const SHORT_TITLES: Record<string, string> = {
  personal: "Personal",
  small_business: "Small Biz (PG)",
  commercial: "Commercial",
};

function bandColor(band: FundabilityBand | null): string {
  switch (band) {
    case "excellent":
    case "elite":
      return "text-fundability-excellent";
    case "very_good":
    case "established":
      return "text-fundability-good";
    case "good":
    case "emerging":
      return "text-fundability-good";
    case "fair":
    case "building":
      return "text-fundability-fair";
    default:
      return "text-fundability-poor";
  }
}

function bandBg(band: FundabilityBand | null): string {
  switch (band) {
    case "excellent":
    case "elite":
      return "bg-fundability-excellent";
    case "very_good":
    case "established":
    case "good":
    case "emerging":
      return "bg-fundability-good";
    case "fair":
    case "building":
      return "bg-fundability-fair";
    default:
      return "bg-fundability-poor";
  }
}

function ScoreCard({ result, compact = false }: { result: FundabilityScoreResult; compact?: boolean }) {
  const navigate = useNavigate();
  const typeLabel =
    result.type === "personal"
      ? "Personal credit products"
      : result.type === "small_business"
      ? "PG-required products"
      : "EIN-only products";
  const displayTitle = compact ? SHORT_TITLES[result.type] ?? result.title : result.title;

  if (result.locked) {
    if (compact) {
      return (
        <Card className="p-4 bg-card border-border flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center shrink-0">
            <Lock className="w-5 h-5 text-muted-foreground" />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="text-sm font-semibold text-foreground truncate">{displayTitle}</h3>
            <p className="text-xs text-muted-foreground line-clamp-1">{result.lockedReason}</p>
          </div>
          {result.lockedCta && (
            <Button
              size="sm"
              className="bg-gold text-primary hover:bg-gold/90 shrink-0"
              onClick={() => navigate(result.lockedCta!.route)}
            >
              {result.lockedCta.label}
            </Button>
          )}
        </Card>
      );
    }
    return (
      <Card className="p-5 bg-card border-border flex flex-col h-full">
        <div className="flex items-start justify-between mb-3">
          <div>
            <h3 className="text-sm font-semibold text-foreground">{result.title}</h3>
            <p className="text-xs text-muted-foreground mt-0.5">{typeLabel}</p>
          </div>
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <button className="text-muted-foreground hover:text-foreground" aria-label="Inputs required">
                  <HelpCircle className="w-4 h-4" />
                </button>
              </TooltipTrigger>
              <TooltipContent className="max-w-xs">
                <p className="text-xs font-semibold mb-1">Inputs required</p>
                <ul className="text-xs space-y-0.5 list-disc pl-4">
                  {result.inputsRequired.map((i) => (
                    <li key={i}>{i}</li>
                  ))}
                </ul>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>

        <div className="flex flex-col items-center justify-center flex-1 py-6 text-center">
          <div className="w-14 h-14 rounded-full bg-muted flex items-center justify-center mb-3">
            <Lock className="w-6 h-6 text-muted-foreground" />
          </div>
          <p className="text-sm text-muted-foreground mb-4 px-2">{result.lockedReason}</p>
          {result.lockedCta && (
            <Button
              size="sm"
              className="bg-gold text-primary hover:bg-gold/90"
              onClick={() => navigate(result.lockedCta!.route)}
            >
              {result.lockedCta.label}
              <ArrowRight className="w-3.5 h-3.5 ml-1" />
            </Button>
          )}
        </div>
      </Card>
    );
  }

  const score = result.score ?? 0;
  const color = bandColor(result.band);
  const bg = bandBg(result.band);

  if (compact) {
    return (
      <Card className="p-4 bg-card border-border flex items-center gap-3">
        <div className="flex-1 min-w-0">
          <h3 className="text-sm font-semibold text-foreground truncate">{displayTitle}</h3>
          <div className="h-1.5 w-full bg-muted rounded-full overflow-hidden mt-2">
            <div className={`h-full ${bg} transition-all duration-700`} style={{ width: `${score}%` }} />
          </div>
        </div>
        <div className="flex flex-col items-end shrink-0">
          <span className={`text-2xl font-bold leading-none ${color}`}>{score}</span>
          {result.bandLabel && (
            <span className={`text-[10px] font-semibold uppercase tracking-wide mt-1 ${color}`}>
              {result.bandLabel}
            </span>
          )}
        </div>
      </Card>
    );
  }

  return (
    <Card className="p-5 bg-card border-border flex flex-col h-full">
      <div className="flex items-start justify-between mb-3">
        <div>
          <h3 className="text-sm font-semibold text-foreground">{result.title}</h3>
          <p className="text-xs text-muted-foreground mt-0.5">{typeLabel}</p>
        </div>
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <button className="text-muted-foreground hover:text-foreground" aria-label="Inputs required">
                <HelpCircle className="w-4 h-4" />
              </button>
            </TooltipTrigger>
            <TooltipContent className="max-w-xs">
              <p className="text-xs font-semibold mb-1">Inputs used</p>
              <ul className="text-xs space-y-0.5 list-disc pl-4">
                {result.inputsRequired.map((i) => (
                  <li key={i}>{i}</li>
                ))}
              </ul>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </div>

      <div className="flex items-baseline gap-2 mb-1">
        <span className={`text-4xl font-bold ${color}`}>{score}</span>
        <span className="text-sm text-muted-foreground">/ 100</span>
        {result.bandLabel && (
          <Badge variant="outline" className={`ml-auto ${color} border-current`}>
            {result.bandLabel}
          </Badge>
        )}
      </div>

      <div className="h-2 w-full bg-muted rounded-full overflow-hidden mb-3">
        <div className={`h-full ${bg} transition-all duration-700`} style={{ width: `${score}%` }} />
      </div>

      <p className="text-xs text-foreground mb-3">{result.meaning}</p>

      {result.unlocks.length > 0 && (
        <div className="mb-3">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground mb-1">Unlocks</p>
          <ul className="text-xs text-foreground space-y-0.5">
            {result.unlocks.map((u) => (
              <li key={u}>• {u}</li>
            ))}
          </ul>
        </div>
      )}

      {result.improvements.length > 0 && (
        <div className="mt-auto">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground mb-1">
            How to improve
          </p>
          <ul className="text-xs text-muted-foreground space-y-0.5">
            {result.improvements.map((i) => (
              <li key={i}>• {i}</li>
            ))}
          </ul>
        </div>
      )}
    </Card>
  );
}

export function ThreeFundabilityScoresPanel({
  compactOnMobile = false,
}: { compactOnMobile?: boolean } = {}) {
  const { activeBusiness, businesses } = useBusinessContext();
  const { personal, small_business, commercial, isLoading } = useThreeFundabilityScores(
    activeBusiness?.id ?? null
  );
  const isMobile = useIsMobile();
  const useCompact = compactOnMobile && isMobile;
  const [portfolioOpen, setPortfolioOpen] = useState(false);

  const hasMultipleBusinesses = businesses.length > 1;

  if (isLoading) {
    return (
      <Card className="p-8 flex items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </Card>
    );
  }

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-foreground">Fundability Scores</h2>
          <p className="text-xs text-muted-foreground">
            Three distinct scores — each one tells you what you can fund right now and what's blocking the next tier.
          </p>
        </div>
        {hasMultipleBusinesses && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => setPortfolioOpen(true)}
            className="gap-1.5"
          >
            <LayoutGrid className="h-3.5 w-3.5" />
            View All Businesses
          </Button>
        )}
      </div>

      {hasMultipleBusinesses && activeBusiness && (
        <div className="mb-3 flex flex-wrap items-center gap-2 rounded-md border border-border bg-card/50 px-3 py-2 text-sm">
          <Building2 className="h-3.5 w-3.5 text-muted-foreground" />
          <span className="text-muted-foreground">Showing scores for:</span>
          <span className="font-medium text-foreground">{activeBusiness.legal_name}</span>
          {activeBusiness.entity_role && (
            <Badge variant="outline" className="text-[10px]">
              {entityRoleLabel(activeBusiness.entity_role)}
            </Badge>
          )}
        </div>
      )}

      <div className={useCompact ? "flex flex-col gap-3" : "grid grid-cols-1 md:grid-cols-3 gap-4"}>
        <ScoreCard result={personal} compact={useCompact} />
        <ScoreCard result={small_business} compact={useCompact} />
        <ScoreCard result={commercial} compact={useCompact} />
      </div>

      <BusinessPortfolio open={portfolioOpen} onOpenChange={setPortfolioOpen} />
    </div>
  );
}

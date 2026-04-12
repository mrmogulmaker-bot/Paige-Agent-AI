import { ProductMatchCard } from "./ProductMatchCard";
import type { ProductMatch } from "@/lib/fundingMatchScoring";
import { PHASE_ORDER, PHASE_LABELS } from "@/lib/fundingMatchScoring";
import { Badge } from "@/components/ui/badge";
import { User, Building2 } from "lucide-react";

interface Props {
  title: string;
  icon: "personal" | "business";
  matches: ProductMatch[];
}

export function FundingTrack({ title, icon, matches }: Props) {
  if (matches.length === 0) return null;

  // Group by phase
  const byPhase = PHASE_ORDER.reduce<Record<string, ProductMatch[]>>((acc, phase) => {
    const phaseMatches = matches.filter(m => m.phase === phase);
    if (phaseMatches.length > 0) acc[phase] = phaseMatches;
    return acc;
  }, {});

  const eligible = matches.filter(m => m.category === "eligible").length;
  const nearEligible = matches.filter(m => m.category === "near_eligible").length;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        {icon === "personal" ? (
          <div className="w-8 h-8 rounded-lg bg-accent/10 flex items-center justify-center">
            <User className="w-4 h-4 text-accent" />
          </div>
        ) : (
          <div className="w-8 h-8 rounded-lg bg-gold/10 flex items-center justify-center">
            <Building2 className="w-4 h-4 text-gold" />
          </div>
        )}
        <div>
          <h2 className="text-xl font-bold text-foreground">{title}</h2>
          <div className="flex gap-2 mt-0.5">
            <Badge variant="outline" className="text-xs text-fundability-excellent border-fundability-excellent/30">{eligible} eligible</Badge>
            <Badge variant="outline" className="text-xs text-fundability-fair border-fundability-fair/30">{nearEligible} near eligible</Badge>
            <Badge variant="outline" className="text-xs">{matches.length} total</Badge>
          </div>
        </div>
      </div>

      {Object.entries(byPhase).map(([phase, phaseMatches]) => (
        <div key={phase}>
          <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-2 pl-1">
            {PHASE_LABELS[phase] || phase}
          </h3>
          <div className="space-y-3">
            {phaseMatches
              .sort((a, b) => b.score - a.score)
              .map(match => (
                <ProductMatchCard key={match.product.id} match={match} />
              ))}
          </div>
        </div>
      ))}
    </div>
  );
}

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { CheckCircle2, Lock, ArrowRight, Award } from "lucide-react";
import { useBuildScore } from "@/hooks/useBuildScore";

interface BuildProgramSectionProps {
  foundationPct: number;
  bureauPct: number;
  onCompletionChange: (pct: number) => void;
}

interface TierInfo {
  key: string;
  letter: string;
  label: string;
  desc: string;
  requirement: string;
  isComplete: boolean;
}

export function BuildProgramSection({ foundationPct, bureauPct, onCompletionChange }: BuildProgramSectionProps) {
  const { data: buildScore } = useBuildScore();

  const tiers: TierInfo[] = [
    {
      key: "B", letter: "B", label: "Base",
      desc: "Identity & Compliance",
      requirement: "Entity formation, EIN, business address, and business bank account all verified.",
      isComplete: foundationPct >= 100,
    },
    {
      key: "U", letter: "U", label: "Utility",
      desc: "Vendor Tradelines",
      requirement: "5+ vendor tradelines active and reporting to bureaus.",
      isComplete: (buildScore?.active_vendors || 0) >= 5,
    },
    {
      key: "I", letter: "I", label: "Intermediate",
      desc: "Store/Fleet Cards",
      requirement: "First store or fleet card documented in bureau snapshot.",
      isComplete: buildScore?.tier_i_unlocked || false,
    },
    {
      key: "L", letter: "L", label: "Leverage",
      desc: "Corporate / No-PG",
      requirement: "First no-PG product documented in the Funding Application Log.",
      isComplete: buildScore?.tier_l_unlocked || false,
    },
    {
      key: "D", letter: "D", label: "Develop",
      desc: "Maintenance Loop",
      requirement: "All bureau scores meet targets and maintenance loop documented.",
      isComplete: bureauPct >= 100 && (buildScore?.months_clean_reporting || 0) >= 6,
    },
  ];

  const completedTiers = tiers.filter(t => t.isComplete).length;
  const buildScoreCalc = Math.round((completedTiers / tiers.length) * 100);
  setTimeout(() => onCompletionChange(buildScoreCalc), 0);

  return (
    <div className="space-y-6">
      {/* BUILD Ladder */}
      <div className="grid grid-cols-5 gap-2 md:gap-3">
        {tiers.map((tier, index) => (
          <div key={tier.key} className="relative">
            <Card className={`text-center p-2 md:p-4 transition-all ${tier.isComplete ? "bg-primary/5 border-primary/30 shadow-glow" : "bg-muted/10 border-muted"}`}>
              {tier.isComplete ? (
                <CheckCircle2 className="w-6 h-6 md:w-8 md:h-8 text-primary mx-auto mb-1" />
              ) : (
                <Lock className="w-6 h-6 md:w-8 md:h-8 text-muted-foreground mx-auto mb-1" />
              )}
              <div className="text-xl md:text-2xl font-bold text-foreground">{tier.letter}</div>
              <div className="text-[10px] md:text-xs font-semibold">{tier.label}</div>
              <div className="text-[8px] md:text-[10px] text-muted-foreground hidden sm:block mt-0.5">{tier.desc}</div>
            </Card>
            {index < 4 && (
              <div className="absolute top-1/2 -right-1.5 md:-right-2 transform -translate-y-1/2 z-10">
                <ArrowRight className={`w-3 h-3 md:w-4 md:h-4 ${tier.isComplete ? "text-primary" : "text-muted-foreground"}`} />
              </div>
            )}
          </div>
        ))}
      </div>

      {/* BUILD Score */}
      <Card className="border-primary/20">
        <CardContent className="py-6">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Award className="w-5 h-5 text-primary" />
              <span className="text-lg font-semibold">BUILD Score</span>
            </div>
            <span className="text-4xl font-bold text-primary">
              {buildScoreCalc}<span className="text-lg text-muted-foreground">/100</span>
            </span>
          </div>
          <Progress value={buildScoreCalc} className="h-3 mb-3" />
          <p className="text-xs text-muted-foreground text-center">
            {buildScoreCalc >= 70 ? "✓ Funding Ready — BUILD fundamentals are strong" : "70+ unlocks Funding Plan"}
          </p>
        </CardContent>
      </Card>

      {/* Tier Details */}
      <div className="space-y-2">
        {tiers.map(tier => (
          <div key={tier.key} className={`flex items-start gap-3 p-3 rounded-lg border ${tier.isComplete ? "border-emerald-500/20 bg-emerald-500/5" : "border-border"}`}>
            {tier.isComplete ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-500 mt-0.5 flex-shrink-0" />
            ) : (
              <Lock className="w-4 h-4 text-muted-foreground mt-0.5 flex-shrink-0" />
            )}
            <div>
              <p className="text-sm font-medium">{tier.letter} — {tier.label}</p>
              <p className="text-xs text-muted-foreground">{tier.requirement}</p>
            </div>
            <Badge variant={tier.isComplete ? "default" : "secondary"} className={`ml-auto flex-shrink-0 text-xs ${tier.isComplete ? "bg-emerald-500/20 text-emerald-600 border-emerald-500/30" : ""}`}>
              {tier.isComplete ? "Complete" : "Incomplete"}
            </Badge>
          </div>
        ))}
      </div>
    </div>
  );
}

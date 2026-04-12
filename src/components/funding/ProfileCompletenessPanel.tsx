import { Card } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { AlertCircle, CheckCircle2, ChevronRight } from "lucide-react";
import type { FundingProfileData } from "@/hooks/useFundingProfile";

interface Props {
  profile: FundingProfileData;
}

const COMPLETENESS_CATEGORIES = [
  { label: "Personal Bureau Scores", weight: 15 },
  { label: "Negative Items Analysis", weight: 10 },
  { label: "Business Revenue", weight: 15 },
  { label: "Entity & Formation", weight: 10 },
  { label: "Time in Business", weight: 8 },
  { label: "Banking Relationship", weight: 8 },
  { label: "Business Credit Scores", weight: 10 },
  { label: "Monthly Cash Flow", weight: 7 },
  { label: "Public Presence", weight: 7 },
  { label: "Financial Documentation", weight: 10 },
];

export function ProfileCompletenessPanel({ profile }: Props) {
  const { completeness, missingItems } = profile;

  return (
    <Card className="p-6 bg-card border-border">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-lg font-bold text-foreground">Profile Completeness</h2>
          <p className="text-sm text-muted-foreground mt-1">
            Your profile is <span className="font-semibold text-foreground">{completeness}%</span> complete
            {missingItems.length > 0 && (
              <> — add <span className="text-accent font-medium">{missingItems[0].label.toLowerCase()}</span> to unlock additional product categories and improve estimate accuracy.</>
            )}
          </p>
        </div>
        <div className="text-3xl font-bold text-accent">{completeness}%</div>
      </div>

      <Progress value={completeness} className="h-3 mb-5" />

      <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
        {COMPLETENESS_CATEGORIES.map(item => {
          const isMissing = missingItems.find(m => m.label === item.label);
          return (
            <div key={item.label} className={`flex items-start gap-2 p-2 rounded-lg text-sm ${isMissing ? "bg-destructive/5" : "bg-fundability-excellent/5"}`}>
              {isMissing ? (
                <AlertCircle className="w-4 h-4 text-destructive mt-0.5 shrink-0" />
              ) : (
                <CheckCircle2 className="w-4 h-4 text-fundability-excellent mt-0.5 shrink-0" />
              )}
              <div className="flex-1 min-w-0">
                <span className="font-medium text-foreground">{item.label}</span>
                <span className="text-muted-foreground ml-1">({item.weight}%)</span>
                {isMissing && (
                  <p className="text-xs text-muted-foreground mt-0.5 flex items-center gap-1">
                    <ChevronRight className="w-3 h-3" />
                    {isMissing.cta} → unlocks {isMissing.unlocks}
                  </p>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </Card>
  );
}

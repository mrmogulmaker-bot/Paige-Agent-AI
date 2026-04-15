import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Target, ArrowRight, Zap } from "lucide-react";
import { AccountTypeBadge } from "./AccountTypeBadge";

interface DisputeStrategyPanelProps {
  negativeItems: any[];
  autoStagedDisputes: any[];
  onStartDisputes: () => void;
}

const LENDER_BUREAU_PULL: Record<string, string[]> = {
  "Most Mortgage Lenders": ["experian", "equifax", "transunion"],
  "Chase / Amex / Capital One": ["experian"],
  "Wells Fargo / Discover": ["transunion"],
  "Bank of America / Citi": ["equifax"],
  "SBA Loans (FICO SBSS)": ["experian", "equifax", "transunion"],
};

export function DisputeStrategyPanel({ negativeItems, autoStagedDisputes, onStartDisputes }: DisputeStrategyPanelProps) {
  // Count negatives by bureau
  const bureauCounts: Record<string, number> = {};
  (negativeItems || []).forEach((item: any) => {
    const b = (item.bureau || "").toLowerCase();
    if (b) bureauCounts[b] = (bureauCounts[b] || 0) + 1;
  });

  const totalNeg = Object.values(bureauCounts).reduce((a, b) => a + b, 0);
  if (totalNeg === 0 && autoStagedDisputes.length === 0) return null;

  // Build recommended sequence: prioritize bureau with most negatives first
  const sortedBureaus = Object.entries(bureauCounts)
    .sort(([, a], [, b]) => b - a)
    .map(([bureau]) => bureau);

  const sequence = sortedBureaus.map((bureau, idx) => {
    const label = bureau.charAt(0).toUpperCase() + bureau.slice(1);
    const matchingLenders = Object.entries(LENDER_BUREAU_PULL)
      .filter(([, bureaus]) => bureaus.includes(bureau))
      .map(([name]) => name);
    return { step: idx + 1, bureau: label, count: bureauCounts[bureau], lenders: matchingLenders };
  });

  return (
    <Card className="border-accent/30 bg-accent/5">
      <CardHeader className="pb-3">
        <CardTitle className="text-lg flex items-center gap-2">
          <Target className="w-5 h-5 text-accent" />
          Dispute Strategy
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Bureau breakdown */}
        <div>
          <p className="text-sm font-medium text-muted-foreground mb-2">Negative Items by Bureau</p>
          <div className="flex flex-wrap gap-3">
            {["experian", "transunion", "equifax"].map(b => (
              <div key={b} className="flex items-center gap-2 px-3 py-2 rounded-lg bg-background border">
                <span className="text-sm font-medium">{b.charAt(0).toUpperCase() + b.slice(1)}</span>
                <Badge variant={bureauCounts[b] ? "destructive" : "secondary"} className="text-xs">
                  {bureauCounts[b] || 0}
                </Badge>
              </div>
            ))}
          </div>
        </div>

        {/* Recommended sequence */}
        {sequence.length > 0 && (
          <div>
            <p className="text-sm font-medium text-muted-foreground mb-2">Recommended Dispute Sequence</p>
            <div className="space-y-2">
              {sequence.map(({ step, bureau, count, lenders }) => (
                <div key={bureau} className="flex items-start gap-3 p-3 rounded-lg bg-background border">
                  <div className="w-7 h-7 rounded-full bg-accent/20 flex items-center justify-center text-accent font-bold text-sm shrink-0">
                    {step}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-sm">{bureau}</span>
                      <Badge variant="outline" className="text-xs">{count} item{count !== 1 ? "s" : ""}</Badge>
                    </div>
                    {lenders.length > 0 && (
                      <p className="text-xs text-muted-foreground mt-0.5">
                        Pulled by: {lenders.slice(0, 3).join(", ")}
                      </p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Auto-staged disputes preview */}
        {autoStagedDisputes.length > 0 && (
          <div>
            <p className="text-sm font-medium text-muted-foreground mb-2">
              Auto-Staged Drafts ({autoStagedDisputes.length})
            </p>
            <div className="space-y-1.5 max-h-48 overflow-y-auto">
              {autoStagedDisputes.slice(0, 6).map((d: any) => (
                <div key={d.id} className="flex items-center gap-2 text-sm px-2 py-1.5 rounded bg-background border">
                  <AccountTypeBadge itemType={d.item_type || d.narrative || d.reason_code} />
                  <span className="truncate flex-1">{d.creditor_name}</span>
                  <Badge variant="outline" className="text-[10px] shrink-0">{d.bureau}</Badge>
                  {d.amount && <span className="text-xs text-muted-foreground shrink-0">${Number(d.amount).toLocaleString()}</span>}
                </div>
              ))}
              {autoStagedDisputes.length > 6 && (
                <p className="text-xs text-muted-foreground text-center py-1">
                  + {autoStagedDisputes.length - 6} more
                </p>
              )}
            </div>
          </div>
        )}

        {/* Start button */}
        {autoStagedDisputes.length > 0 && (
          <Button onClick={onStartDisputes} className="w-full bg-gradient-gold hover:opacity-90 h-11">
            <Zap className="w-4 h-4 mr-2" />
            Start Disputes
            <ArrowRight className="w-4 h-4 ml-2" />
          </Button>
        )}
      </CardContent>
    </Card>
  );
}

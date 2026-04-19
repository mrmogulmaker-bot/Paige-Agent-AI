import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  AlertTriangle,
  TrendingDown,
  CreditCard,
  ChevronDown,
  ChevronUp,
  Info,
  Flame,
} from "lucide-react";

/**
 * AccountImpactBreakdown
 *
 * Account-by-account view of what is hurting the client's credit file.
 * - Lists every active negative item with creditor, type, amount, bureau,
 *   and a plain-English explanation of the FICO impact.
 * - Flags revolving cards with utilization >= 30% (and severely >= 70%)
 *   so the client understands which balances are dragging the score.
 *
 * Lives inside PostUploadNextSteps as the expanded "Review" step.
 */

type NegativeItem = {
  id: string;
  creditor_name: string | null;
  item_type: string;
  amount: number | null;
  bureau: string;
  status: string | null;
  date_reported: string | null;
};

type CreditAccount = {
  id: string;
  creditor: string;
  type: string;
  current_balance: number | null;
  balance: number | null;
  credit_limit: number | null;
  limit_amount: number | null;
  utilization: number | null;
  is_open: boolean | null;
};

// Plain-English impact copy per negative item type
const NEGATIVE_IMPACT: Record<string, { label: string; impact: string; severity: "high" | "medium" | "low" }> = {
  collection: {
    label: "Collection",
    impact: "Collections typically drop FICO 50–110 points. Newer collections hurt the most. Stays on file 7 years from the original delinquency.",
    severity: "high",
  },
  charge_off: {
    label: "Charge-Off",
    impact: "Charge-offs signal the creditor wrote off the debt as a loss. Major negative — typically 50–150 point hit. Continues reporting 7 years.",
    severity: "high",
  },
  charge-off: {
    label: "Charge-Off",
    impact: "Charge-offs signal the creditor wrote off the debt as a loss. Major negative — typically 50–150 point hit. Continues reporting 7 years.",
    severity: "high",
  },
  late_payment: {
    label: "Late Payment",
    impact: "A single 30-day late can drop FICO 60–110 points if your file was clean. Recent lates hurt more than older ones.",
    severity: "medium",
  },
  late: {
    label: "Late Payment",
    impact: "A single 30-day late can drop FICO 60–110 points if your file was clean. Recent lates hurt more than older ones.",
    severity: "medium",
  },
  bankruptcy: {
    label: "Bankruptcy",
    impact: "Largest negative on a credit file. Drops scores 130–240 points. Chapter 7 reports 10 years; Chapter 13 reports 7 years.",
    severity: "high",
  },
  judgment: {
    label: "Judgment",
    impact: "Public record judgments severely impact lender confidence. Can cause 100+ point drops and block most funding.",
    severity: "high",
  },
  repossession: {
    label: "Repossession",
    impact: "Voluntary or involuntary repos act like a charge-off + collection combined. 100+ point impact, reports 7 years.",
    severity: "high",
  },
  foreclosure: {
    label: "Foreclosure",
    impact: "Severe negative — 100–160 point drop. Disqualifies you from most mortgage programs for 3–7 years.",
    severity: "high",
  },
  inquiry: {
    label: "Hard Inquiry",
    impact: "Each hard pull drops FICO 2–5 points and stays 2 years. Multiple inquiries in 6 months compound the damage.",
    severity: "low",
  },
  hard_inquiry: {
    label: "Hard Inquiry",
    impact: "Each hard pull drops FICO 2–5 points and stays 2 years. Multiple inquiries in 6 months compound the damage.",
    severity: "low",
  },
};

function getNegativeImpact(itemType: string) {
  const key = itemType.toLowerCase().replace(/\s+/g, "_");
  return (
    NEGATIVE_IMPACT[key] || {
      label: itemType,
      impact: "Negative item on your credit file. Review the details and decide if it should be disputed.",
      severity: "medium" as const,
    }
  );
}

function formatMoney(n: number | null | undefined) {
  if (n == null) return "—";
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n);
}

function getUtilization(acct: CreditAccount): number | null {
  if (typeof acct.utilization === "number" && acct.utilization > 0) return acct.utilization;
  const bal = acct.current_balance ?? acct.balance;
  const limit = acct.credit_limit ?? acct.limit_amount;
  if (bal != null && limit != null && limit > 0) {
    return Math.round((bal / limit) * 100);
  }
  return null;
}

function utilizationCopy(util: number) {
  if (util >= 90) return "Maxed out — this card alone can drop FICO 30–70 points. Pay it down first.";
  if (util >= 70) return "Severely high utilization. Each 10% reduction below 70% recovers ~10–25 points.";
  if (util >= 50) return "High utilization. Getting under 30% is the fastest single-action score boost available.";
  if (util >= 30) return "Above the 30% threshold FICO penalizes. Drop below 30% before your next statement closes.";
  return "Healthy utilization.";
}

export function AccountImpactBreakdown() {
  const [showAll, setShowAll] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["account-impact-breakdown"],
    queryFn: async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user?.id) return null;
      const uid = session.user.id;

      const [{ data: negatives }, { data: accounts }] = await Promise.all([
        supabase
          .from("credit_negative_items")
          .select("id, creditor_name, item_type, amount, bureau, status, date_reported")
          .eq("user_id", uid)
          .eq("status", "active")
          .order("date_reported", { ascending: false }),
        supabase
          .from("credit_accounts")
          .select("id, creditor, type, current_balance, balance, credit_limit, limit_amount, utilization, is_open")
          .eq("user_id", uid),
      ]);

      // Find revolving cards with meaningful utilization
      const revolvingCards = (accounts || []).filter(
        (a) => a.type === "revolving" && a.is_open !== false
      ) as CreditAccount[];

      const flaggedCards = revolvingCards
        .map((a) => ({ acct: a, util: getUtilization(a) }))
        .filter((x) => x.util != null && x.util >= 30)
        .sort((a, b) => (b.util ?? 0) - (a.util ?? 0));

      return {
        negatives: (negatives || []) as NegativeItem[],
        flaggedCards,
      };
    },
  });

  if (isLoading || !data) return null;

  const { negatives, flaggedCards } = data;
  const hasAnything = negatives.length > 0 || flaggedCards.length > 0;
  if (!hasAnything) {
    return (
      <Card className="p-4 bg-fundability-excellent/5 border-fundability-excellent/30">
        <p className="text-sm text-foreground">
          ✓ No active negatives or high-utilization cards detected. Your file is in great shape — focus on building credit depth next.
        </p>
      </Card>
    );
  }

  const negativesToShow = showAll ? negatives : negatives.slice(0, 5);
  const cardsToShow = showAll ? flaggedCards : flaggedCards.slice(0, 5);
  const canExpand = negatives.length > 5 || flaggedCards.length > 5;

  return (
    <div className="space-y-4">
      {/* Negative items */}
      {negatives.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <TrendingDown className="w-4 h-4 text-destructive" />
            <h4 className="font-semibold text-sm text-foreground">
              What's hurting your score ({negatives.length} negative{negatives.length === 1 ? "" : "s"})
            </h4>
          </div>
          <div className="space-y-2">
            {negativesToShow.map((neg) => {
              const impact = getNegativeImpact(neg.item_type);
              return (
                <div
                  key={neg.id}
                  className={`p-3 rounded-lg border text-sm ${
                    impact.severity === "high"
                      ? "bg-destructive/5 border-destructive/30"
                      : impact.severity === "medium"
                        ? "bg-warning/5 border-warning/30"
                        : "bg-muted/30 border-border"
                  }`}
                >
                  <div className="flex items-start justify-between gap-3 flex-wrap">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-semibold text-foreground truncate">
                          {neg.creditor_name || "Unknown Creditor"}
                        </span>
                        <Badge
                          variant="outline"
                          className={
                            impact.severity === "high"
                              ? "border-destructive/40 text-destructive text-[10px]"
                              : impact.severity === "medium"
                                ? "border-warning/40 text-warning text-[10px]"
                                : "border-border text-muted-foreground text-[10px]"
                          }
                        >
                          {impact.label}
                        </Badge>
                        <Badge variant="outline" className="text-[10px] uppercase">
                          {neg.bureau}
                        </Badge>
                      </div>
                      <p className="text-xs text-muted-foreground mt-1.5 leading-relaxed">
                        {impact.impact}
                      </p>
                    </div>
                    {neg.amount != null && neg.amount > 0 && (
                      <div className="text-right shrink-0">
                        <div className="text-xs text-muted-foreground">Balance</div>
                        <div className="font-semibold text-foreground">{formatMoney(neg.amount)}</div>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* High-utilization cards */}
      {flaggedCards.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <Flame className="w-4 h-4 text-warning" />
            <h4 className="font-semibold text-sm text-foreground">
              High-utilization cards ({flaggedCards.length})
            </h4>
          </div>
          <div className="space-y-2">
            {cardsToShow.map(({ acct, util }) => {
              const u = util as number;
              const bal = acct.current_balance ?? acct.balance;
              const limit = acct.credit_limit ?? acct.limit_amount;
              const isSevere = u >= 70;
              return (
                <div
                  key={acct.id}
                  className={`p-3 rounded-lg border text-sm ${
                    isSevere
                      ? "bg-destructive/5 border-destructive/30"
                      : "bg-warning/5 border-warning/30"
                  }`}
                >
                  <div className="flex items-start justify-between gap-3 flex-wrap">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <CreditCard className={`w-4 h-4 ${isSevere ? "text-destructive" : "text-warning"}`} />
                        <span className="font-semibold text-foreground truncate">{acct.creditor}</span>
                        <Badge
                          variant="outline"
                          className={
                            isSevere
                              ? "border-destructive/40 text-destructive text-[10px]"
                              : "border-warning/40 text-warning text-[10px]"
                          }
                        >
                          {u}% utilization
                        </Badge>
                      </div>
                      <p className="text-xs text-muted-foreground mt-1.5 leading-relaxed">
                        {utilizationCopy(u)}
                      </p>
                    </div>
                    <div className="text-right shrink-0 text-xs">
                      <div className="text-muted-foreground">{formatMoney(bal)} of {formatMoney(limit)}</div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {canExpand && (
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setShowAll((s) => !s)}
          className="text-xs"
        >
          {showAll ? (
            <>Show less <ChevronUp className="w-3 h-3 ml-1" /></>
          ) : (
            <>Show all {negatives.length + flaggedCards.length} items <ChevronDown className="w-3 h-3 ml-1" /></>
          )}
        </Button>
      )}

      <div className="flex items-start gap-2 p-3 rounded-lg bg-accent/5 border border-accent/20">
        <Info className="w-4 h-4 text-accent shrink-0 mt-0.5" />
        <p className="text-xs text-muted-foreground">
          Paige uses this breakdown to prioritize your dispute strategy and BUILD Personal action plan.
          Ask her: <span className="text-foreground font-medium">"Which of these should I tackle first?"</span>
        </p>
      </div>
    </div>
  );
}

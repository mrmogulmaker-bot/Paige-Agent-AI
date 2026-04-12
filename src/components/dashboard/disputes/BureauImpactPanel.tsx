import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Target, TrendingUp, AlertTriangle, Info } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { resolvePrimaryBureau, getBureauScore, getBureauPullLabel } from "@/lib/fundingMatchScoring";

interface BureauImpactPanelProps {
  clientId?: string;
}

interface BureauImpactRecommendation {
  productName: string;
  lenderName: string;
  bureau: string;
  bureauLabel: string;
  clientScore: number | null;
  minScore: number;
  gap: number;
  negativeItemsOnBureau: number;
}

export function BureauImpactPanel({ clientId }: BureauImpactPanelProps) {
  const { data, isLoading } = useQuery({
    queryKey: ["bureau-impact-analysis", clientId || "self"],
    queryFn: async () => {
      let userId: string | null = null;

      if (clientId) {
        const { data: client } = await supabase
          .from("clients")
          .select("linked_user_id")
          .eq("id", clientId)
          .maybeSingle();
        userId = client?.linked_user_id || null;
      } else {
        const { data: { user } } = await supabase.auth.getUser();
        userId = user?.id || null;
      }

      if (!userId) return null;

      // Fetch scores, funding goal, products, and negative items in parallel
      const [profileRes, productsRes, negativesRes] = await Promise.all([
        supabase.from("profiles")
          .select("estimated_fico_tu, estimated_fico_ex, estimated_fico_eq, funding_goals")
          .eq("user_id", userId)
          .maybeSingle(),
        supabase.from("funding_products")
          .select("lender_name, product_name, product_type, min_fico_score, primary_bureau")
          .eq("is_active", true)
          .limit(50),
        supabase.from("credit_negative_items")
          .select("bureau, creditor_name, item_type, status")
          .eq(clientId ? "client_id" : "user_id", clientId || userId)
          .neq("status", "removed"),
      ]);

      const profile = profileRes.data;
      const products = productsRes.data || [];
      const negItems = negativesRes.data || [];

      if (!profile) return null;

      const scores = {
        tu: profile.estimated_fico_tu as number | null,
        ex: profile.estimated_fico_ex as number | null,
        eq: profile.estimated_fico_eq as number | null,
      };

      const fundingGoals = profile.funding_goals as any;
      const objective = fundingGoals?.objective || null;

      // Count negatives per bureau
      const negByBureau: Record<string, number> = {};
      negItems.forEach((n: any) => {
        const b = (n.bureau || "").toLowerCase();
        const key = b.includes("trans") ? "transunion" : b.includes("exper") ? "experian" : b.includes("equi") ? "equifax" : b;
        negByBureau[key] = (negByBureau[key] || 0) + 1;
      });

      // Score and rank products, pick top 3 most relevant
      const scored = products.map((p: any) => {
        const bureau = resolvePrimaryBureau(p);
        const middleScores = [scores.tu, scores.ex, scores.eq].filter((s): s is number => s != null).sort((a, b) => a - b);
        const middle = middleScores.length >= 2 ? middleScores[Math.floor(middleScores.length / 2)] : middleScores[0] || null;
        const clientScore = getBureauScore(bureau, scores, middle);
        const minScore = p.min_fico_score || 0;
        const gap = clientScore != null ? Math.max(0, minScore - clientScore) : 0;
        const bureauName = bureau === "experian" ? "Experian" : bureau === "transunion" ? "TransUnion" : bureau === "equifax" ? "Equifax" : "All 3";

        return {
          productName: p.product_name,
          lenderName: p.lender_name,
          bureau: bureau,
          bureauLabel: bureauName,
          clientScore,
          minScore,
          gap,
          negativeItemsOnBureau: negByBureau[bureau] || 0,
        } as BureauImpactRecommendation;
      });

      // Sort by relevance: near-eligible products first (small gap), then eligible
      const relevant = scored
        .filter((s: BureauImpactRecommendation) => s.clientScore != null && s.minScore > 0)
        .sort((a: BureauImpactRecommendation, b: BureauImpactRecommendation) => {
          // Prioritize products with small gaps (near-eligible)
          if (a.gap <= 50 && b.gap > 50) return -1;
          if (b.gap <= 50 && a.gap > 50) return 1;
          return a.gap - b.gap;
        })
        .slice(0, 3);

      return { objective, relevant, scores, negByBureau };
    },
  });

  if (isLoading || !data || data.relevant.length === 0) return null;

  const { relevant, scores, negByBureau, objective } = data;

  // Determine which bureau to prioritize
  const bureauPriority = relevant.reduce((acc: Record<string, number>, r: BureauImpactRecommendation) => {
    acc[r.bureau] = (acc[r.bureau] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);
  const topBureau = Object.entries(bureauPriority).sort((a, b) => b[1] - a[1])[0]?.[0];

  return (
    <Card className="p-5 bg-card border-border">
      <div className="flex items-center gap-2 mb-3">
        <Target className="w-5 h-5 text-accent" />
        <h3 className="font-semibold text-foreground">Bureau Impact Analysis</h3>
        {objective && (
          <Badge variant="outline" className="text-xs ml-auto">{objective}</Badge>
        )}
      </div>
      <p className="text-sm text-muted-foreground mb-4">
        Based on your funding goals, these are the products closest to your reach and which bureaus to prioritize in your disputes.
      </p>

      <div className="space-y-3">
        {relevant.map((r: BureauImpactRecommendation, idx: number) => (
          <div key={idx} className="flex items-start gap-3 p-3 bg-muted/30 rounded-lg">
            <div className="shrink-0 mt-0.5">
              {r.gap === 0 ? (
                <TrendingUp className="w-4 h-4 text-fundability-excellent" />
              ) : r.gap <= 30 ? (
                <AlertTriangle className="w-4 h-4 text-fundability-fair" />
              ) : (
                <Info className="w-4 h-4 text-muted-foreground" />
              )}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-medium text-sm text-foreground">{r.lenderName}</span>
                <span className="text-xs text-muted-foreground">{r.productName}</span>
                <Badge variant="outline" className="text-[10px] border-0 bg-muted">
                  {r.bureauLabel}
                </Badge>
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                {r.gap === 0 ? (
                  <span className="text-fundability-excellent font-medium">
                    Your {r.bureauLabel} score of {r.clientScore} meets the {r.minScore} minimum
                  </span>
                ) : (
                  <>
                    Your {r.bureauLabel} score of <strong>{r.clientScore}</strong> is <strong>{r.gap} points</strong> below the {r.minScore} minimum.
                    {r.negativeItemsOnBureau > 0 && (
                      <> Resolving the <strong>{r.negativeItemsOnBureau} items</strong> on {r.bureauLabel} could help close this gap.</>
                    )}
                  </>
                )}
              </p>
            </div>
          </div>
        ))}
      </div>

      {/* Summary recommendation */}
      {topBureau && negByBureau[topBureau] > 0 && (
        <div className="mt-4 p-3 bg-accent/5 border border-accent/20 rounded-lg">
          <p className="text-sm font-medium text-foreground">
            📌 Priority: Focus disputes on{" "}
            <strong>
              {topBureau === "experian" ? "Experian" : topBureau === "transunion" ? "TransUnion" : "Equifax"}
            </strong>
            {" "}({negByBureau[topBureau]} items) — this bureau is pulled by{" "}
            {relevant.filter((r: BureauImpactRecommendation) => r.bureau === topBureau).length} of your top {relevant.length} target products.
          </p>
        </div>
      )}
    </Card>
  );
}

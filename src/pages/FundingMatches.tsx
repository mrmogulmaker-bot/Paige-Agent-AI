import { useFundingMatches, useFundingProjections } from "@/hooks/useFundingMatches";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, RefreshCw, ExternalLink, Lock, Sparkles } from "lucide-react";
import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export default function FundingMatches() {
  const { matches, eligible, nearEligible, totalEstimated, isLoading, runMatch } = useFundingMatches();
  const { projections, createProjection } = useFundingProjections();

  // Fetch real synced scores for the What-If baseline
  const { data: profileScores } = useQuery({
    queryKey: ["funding-matches-profile-scores"],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return null;
      const { data } = await supabase
        .from("profiles")
        .select("estimated_fico_eq, estimated_fico_ex, estimated_fico_tu, last_report_analyzed_at")
        .eq("user_id", user.id)
        .maybeSingle();
      return data;
    },
  });

  // Use MIDDLE score (how lenders actually qualify borrowers)
  const syncedScores = [
    profileScores?.estimated_fico_eq,
    profileScores?.estimated_fico_ex,
    profileScores?.estimated_fico_tu,
  ].filter(Boolean) as number[];
  
  const getMiddleScore = (scores: number[]) => {
    if (scores.length === 0) return null;
    if (scores.length === 1) return scores[0];
    if (scores.length === 2) return Math.min(...scores);
    const sorted = [...scores].sort((a, b) => a - b);
    return sorted[1];
  };
  const middleScore = getMiddleScore(syncedScores);

  // Auto-run match when synced scores exist but no matches yet
  const [autoRanMatch, setAutoRanMatch] = useState(false);
  useEffect(() => {
    if (
      !autoRanMatch &&
      profileScores?.last_report_analyzed_at &&
      !isLoading &&
      (!matches || matches.length === 0) &&
      !runMatch.isPending
    ) {
      setAutoRanMatch(true);
      runMatch.mutate();
    }
  }, [profileScores, isLoading, matches, autoRanMatch, runMatch]);

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Funding Matches</h1>
          <p className="text-muted-foreground mt-1">
            Products matched to your real profile — not guesswork.
          </p>
          {middleScore && (
            <p className="text-xs text-muted-foreground mt-1">
              Matching against middle bureau score: {middleScore})
            </p>
          )}
        </div>
        <Button
          onClick={() => runMatch.mutate()}
          disabled={runMatch.isPending}
          className="bg-gradient-gold hover:opacity-90"
        >
          {runMatch.isPending ? (
            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
          ) : (
            <RefreshCw className="w-4 h-4 mr-2" />
          )}
          Run Match
        </Button>
      </div>

      {/* Summary */}
      {matches && matches.length > 0 && (
        <div className="grid grid-cols-3 gap-4">
          <Card className="p-5 bg-card border-border text-center">
            <div className="text-3xl font-bold text-fundability-excellent">{eligible.length}</div>
            <div className="text-sm text-muted-foreground mt-1">Eligible Products</div>
          </Card>
          <Card className="p-5 bg-card border-border text-center">
            <div className="text-3xl font-bold text-fundability-fair">{nearEligible.length}</div>
            <div className="text-sm text-muted-foreground mt-1">Near Eligible</div>
          </Card>
          <Card className="p-5 bg-card border-border text-center">
            <div className="text-3xl font-bold text-accent">
              ${totalEstimated.toLocaleString()}
            </div>
            <div className="text-sm text-muted-foreground mt-1">Est. Total Funding</div>
          </Card>
        </div>
      )}

      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-8 h-8 animate-spin text-accent" />
        </div>
      ) : (
        <>
          {/* Eligible Products */}
          {eligible.length > 0 && (
            <div>
              <h2 className="text-lg font-bold mb-3 flex items-center gap-2">
                <span className="text-fundability-excellent">✅</span> Eligible
              </h2>
              <div className="space-y-3">
                {eligible.map((match: any) => (
                  <ProductCard key={match.id} match={match} status="eligible" />
                ))}
              </div>
            </div>
          )}

          {/* Near Eligible */}
          {nearEligible.length > 0 && (
            <div>
              <h2 className="text-lg font-bold mb-3 flex items-center gap-2">
                <Lock className="w-4 h-4 text-fundability-fair" /> Unlock With Improvements
              </h2>
              <div className="space-y-3">
                {nearEligible.map((match: any) => (
                  <ProductCard key={match.id} match={match} status="near_eligible" />
                ))}
              </div>
            </div>
          )}

          {/* What-If Button */}
          <Card className="p-6 bg-card border-border text-center">
            <Sparkles className="w-8 h-8 text-gold mx-auto mb-3" />
            <h3 className="font-bold text-lg">What If Projection</h3>
            <p className="text-sm text-muted-foreground mt-1 mb-2">
              See how score improvements would unlock new funding
            </p>
            {middleScore && (
              <p className="text-xs text-muted-foreground mb-4">
                Baseline: {middleScore} (middle bureau score — how lenders qualify you)
              </p>
            )}
            <Button
              onClick={() => {
                createProjection.mutate({
                  scenario_name: "Score +40, Remove Collections",
                  scenario_params: {
                    baseline_score: middleScore || 600,
                    score_change: 40,
                    remove_collections: 2,
                    reduce_utilization_to: 25,
                  },
                });
              }}
              disabled={createProjection.isPending}
              variant="outline"
              className="border-gold text-gold hover:bg-gold/10"
            >
              {createProjection.isPending ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <Sparkles className="w-4 h-4 mr-2" />
              )}
              Run "What If" Projection
            </Button>

            {projections && projections.length > 0 && (
              <div className="mt-4 text-left bg-muted/30 rounded-lg p-4">
                <div className="text-sm font-semibold mb-2">Latest Projection: {projections[0].scenario_name}</div>
                <div className="grid grid-cols-3 gap-3 text-center">
                  <div>
                    <div className="text-xl font-bold text-accent">{projections[0].projected_score}</div>
                    <div className="text-xs text-muted-foreground">Projected Score</div>
                  </div>
                  <div>
                    <div className="text-xl font-bold text-fundability-excellent">{projections[0].projected_matches}</div>
                    <div className="text-xs text-muted-foreground">Products</div>
                  </div>
                  <div>
                    <div className="text-xl font-bold text-gold">
                      ${Number(projections[0].projected_total_funding || 0).toLocaleString()}
                    </div>
                    <div className="text-xs text-muted-foreground">Est. Funding</div>
                  </div>
                </div>
                {(projections[0].new_products_unlocked as any[])?.length > 0 && (
                  <div className="mt-3">
                    <div className="text-xs font-semibold text-muted-foreground mb-1">New Products Unlocked:</div>
                    {(projections[0].new_products_unlocked as any[]).slice(0, 5).map((p: any, i: number) => (
                      <div key={i} className="text-xs text-foreground">
                        + {p.name} (est. ${Number(p.estimated_amount || 0).toLocaleString()})
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </Card>

          {(!matches || matches.length === 0) && !runMatch.isPending && (
            <Card className="p-8 text-center">
              <p className="text-muted-foreground">
                {middleScore
                  ? "No matches yet. Click \"Run Match\" to scan lender products against your synced profile."
                  : "Upload a credit report via Paige chat first, then run a match to see eligible products."}
              </p>
            </Card>
          )}
        </>
      )}
    </div>
  );
}

function ProductCard({ match, status }: { match: any; status: string }) {
  const product = match.lender_products;
  if (!product) return null;

  return (
    <Card className={`p-4 bg-card border-border ${status === "eligible" ? "hover:border-fundability-excellent/50" : "hover:border-fundability-fair/50"} transition-colors`}>
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="font-semibold">{product.lender_name}</h3>
            <span className="text-sm text-muted-foreground">{product.product_name}</span>
          </div>
          <Badge variant="outline" className="mt-1 text-xs">
            {product.product_type?.replace(/_/g, " ")}
          </Badge>
        </div>

        <div className="text-right">
          {match.estimated_approval_amount && (
            <div className="text-lg font-bold text-accent">
              Est. ${Number(match.estimated_approval_amount).toLocaleString()}
            </div>
          )}
          <div className="text-xs text-muted-foreground">
            Match: {match.match_score}%
          </div>
        </div>
      </div>

      {status === "near_eligible" && match.blocking_factors?.length > 0 && (
        <div className="mt-3 space-y-1">
          {(match.blocking_factors as string[]).map((bf: string, i: number) => (
            <div key={i} className="text-xs text-fundability-fair flex items-center gap-1">
              <span>⚠️</span> {bf}
            </div>
          ))}
        </div>
      )}

      {status === "eligible" && product.application_url && (
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

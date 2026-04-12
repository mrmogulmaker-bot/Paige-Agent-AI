import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Target, TrendingUp, AlertTriangle, Info } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

interface BureauImpactPanelProps {
  clientId?: string;
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

      const [profileRes, negativesRes] = await Promise.all([
        supabase.from("profiles")
          .select("estimated_fico_tu, estimated_fico_ex, estimated_fico_eq, funding_goals")
          .eq("user_id", userId)
          .maybeSingle(),
        clientId
          ? supabase.from("credit_negative_items").select("bureau, creditor_name, item_type, status").eq("client_id", clientId as any).neq("status", "removed")
          : supabase.from("credit_negative_items").select("bureau, creditor_name, item_type, status").eq("user_id", userId).neq("status", "removed"),
      ]);

      const profile = profileRes.data;
      const negItems = (negativesRes.data as any[]) || [];

      if (!profile) return null;

      const tu = profile.estimated_fico_tu as number | null;
      const ex = profile.estimated_fico_ex as number | null;
      const eq = profile.estimated_fico_eq as number | null;
      const fundingGoals = profile.funding_goals as any;
      const objective = fundingGoals?.objective || null;

      // Count negatives per bureau
      const negByBureau: Record<string, number> = { experian: 0, transunion: 0, equifax: 0 };
      negItems.forEach((n: any) => {
        const b = (n.bureau || "").toLowerCase();
        if (b.includes("trans")) negByBureau.transunion++;
        else if (b.includes("exper")) negByBureau.experian++;
        else if (b.includes("equi")) negByBureau.equifax++;
      });

      // Known lender targets with bureau pulls
      const targets = [
        { lender: "Chase Ink", bureau: "experian", bureauLabel: "Experian", minScore: 680, clientScore: ex },
        { lender: "Capital One Spark", bureau: "transunion", bureauLabel: "TransUnion", minScore: 660, clientScore: tu },
        { lender: "American Express Business", bureau: "experian", bureauLabel: "Experian", minScore: 680, clientScore: ex },
        { lender: "Discover", bureau: "transunion", bureauLabel: "TransUnion", minScore: 660, clientScore: tu },
        { lender: "Bank of America", bureau: "equifax", bureauLabel: "Equifax", minScore: 700, clientScore: eq },
        { lender: "SBA 7(a)", bureau: "middle_score", bureauLabel: "Middle Score", minScore: 680, clientScore: tu != null && ex != null && eq != null ? [tu, ex, eq].sort((a, b) => a - b)[1] : null },
        { lender: "OnDeck / BlueVine", bureau: "experian", bureauLabel: "Experian", minScore: 600, clientScore: ex },
        { lender: "Citi", bureau: "equifax", bureauLabel: "Equifax", minScore: 680, clientScore: eq },
      ];

      const scored = targets
        .filter(t => t.clientScore != null)
        .map(t => ({ ...t, gap: Math.max(0, t.minScore - (t.clientScore || 0)), negsOnBureau: negByBureau[t.bureau] || 0 }))
        .sort((a, b) => a.gap - b.gap)
        .slice(0, 3);

      return { objective, scored, negByBureau };
    },
  });

  if (isLoading || !data || data.scored.length === 0) return null;

  const { scored, negByBureau, objective } = data;

  // Determine priority bureau
  const bureauPriority = scored.reduce((acc: Record<string, number>, r) => {
    if (r.bureau !== "middle_score") acc[r.bureau] = (acc[r.bureau] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);
  const topBureau = Object.entries(bureauPriority).sort((a, b) => b[1] - a[1])[0]?.[0];
  const topBureauLabel = topBureau === "experian" ? "Experian" : topBureau === "transunion" ? "TransUnion" : "Equifax";

  return (
    <Card className="p-5 bg-card border-border">
      <div className="flex items-center gap-2 mb-3">
        <Target className="w-5 h-5 text-accent" />
        <h3 className="font-semibold text-foreground">Bureau Impact Analysis</h3>
        {objective && <Badge variant="outline" className="text-xs ml-auto">{objective}</Badge>}
      </div>
      <p className="text-sm text-muted-foreground mb-4">
        Based on your funding goals, these are the products closest to your reach and which bureaus to prioritize in your disputes.
      </p>

      <div className="space-y-3">
        {scored.map((r, idx) => (
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
                <span className="font-medium text-sm text-foreground">{r.lender}</span>
                <Badge variant="outline" className="text-[10px] border-0 bg-muted">{r.bureauLabel}</Badge>
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                {r.gap === 0 ? (
                  <span className="text-fundability-excellent font-medium">
                    Your {r.bureauLabel} score of {r.clientScore} meets the {r.minScore} minimum ✓
                  </span>
                ) : (
                  <>
                    Your {r.bureauLabel} score of <strong>{r.clientScore}</strong> is <strong>{r.gap} points</strong> below the {r.minScore} minimum.
                    {r.negsOnBureau > 0 && (
                      <> Resolving the <strong>{r.negsOnBureau} items</strong> on {r.bureauLabel} could help close this gap.</>
                    )}
                  </>
                )}
              </p>
            </div>
          </div>
        ))}
      </div>

      {topBureau && negByBureau[topBureau] > 0 && (
        <div className="mt-4 p-3 bg-accent/5 border border-accent/20 rounded-lg">
          <p className="text-sm font-medium text-foreground">
            📌 Priority: Focus disputes on <strong>{topBureauLabel}</strong> ({negByBureau[topBureau]} items) — this bureau is pulled by{" "}
            {scored.filter(r => r.bureau === topBureau).length} of your top {scored.length} target products.
          </p>
        </div>
      )}
    </Card>
  );
}

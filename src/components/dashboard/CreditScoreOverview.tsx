import { Card } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { TrendingUp, AlertCircle, CheckCircle, Loader2 } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { format } from "date-fns";

export const CreditScoreOverview = () => {
  const { data: profile, isLoading } = useQuery({
    queryKey: ["credit-score-overview-profile"],
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

  const { data: stats } = useQuery({
    queryKey: ["credit-score-overview-stats"],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return { disputes: 0, negatives: 0, fundability: 0 };
      const [disputesRes, negativesRes, factorsRes] = await Promise.all([
        supabase.from("disputes").select("id", { count: "exact", head: true }).eq("user_id", user.id).in("status", ["draft", "submitted", "under_review"]),
        supabase.from("credit_negative_items").select("id", { count: "exact", head: true }).eq("user_id", user.id).neq("status", "removed"),
        supabase.from("credit_factor_scores").select("overall_fundability_score").eq("user_id", user.id).order("calculated_at", { ascending: false }).limit(1),
      ]);
      return {
        disputes: disputesRes.count ?? 0,
        negatives: negativesRes.count ?? 0,
        fundability: (factorsRes.data as any)?.[0]?.overall_fundability_score ?? 0,
      };
    },
  });

  const eq = profile?.estimated_fico_eq as number | null;
  const ex = profile?.estimated_fico_ex as number | null;
  const tu = profile?.estimated_fico_tu as number | null;
  const scores = [eq, ex, tu].filter(Boolean) as number[];
  const currentScore = scores.length > 0 ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : 0;
  const targetScore = 750;
  const hasScores = scores.length > 0;
  const lastUpdated = profile?.last_report_analyzed_at as string | null;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-8 h-8 animate-spin text-accent" />
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
      <Card className="col-span-1 md:col-span-2 p-6 bg-gradient-subtle border-border shadow-card">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-semibold">Credit Score Overview</h2>
          <TrendingUp className="w-5 h-5 text-success" />
        </div>
        
        {hasScores ? (
          <div className="space-y-6">
            <div className="text-center">
              <div className="text-6xl font-bold text-foreground mb-2">
                {currentScore}
              </div>
              <p className="text-muted-foreground">Average Score</p>
              {lastUpdated && (
                <p className="text-xs text-muted-foreground mt-1">
                  Last updated: {format(new Date(lastUpdated), "MMM d, yyyy 'at' h:mm a")}
                </p>
              )}
            </div>
            
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Progress to Target ({targetScore})</span>
                <span className="font-medium">{Math.round((currentScore / targetScore) * 100)}%</span>
              </div>
              <Progress value={(currentScore / targetScore) * 100} className="h-3" />
            </div>

            <div className="grid grid-cols-3 gap-4 pt-4 border-t border-border">
              <div>
                <p className="text-xs text-muted-foreground mb-1">Experian</p>
                <p className="text-lg font-bold">{ex ?? "—"}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground mb-1">Equifax</p>
                <p className="text-lg font-bold">{eq ?? "—"}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground mb-1">TransUnion</p>
                <p className="text-lg font-bold">{tu ?? "—"}</p>
              </div>
            </div>
          </div>
        ) : (
          <div className="text-center py-8">
            <p className="text-muted-foreground">No credit scores synced yet.</p>
            <p className="text-sm text-muted-foreground mt-1">Upload a credit report via Paige chat to see your bureau scores here.</p>
          </div>
        )}
      </Card>

      <Card className="p-6 bg-card border-border shadow-card">
        <h3 className="text-lg font-semibold mb-4">Quick Stats</h3>
        <div className="space-y-4">
          <div className="flex items-start gap-3">
            <CheckCircle className="w-5 h-5 text-success mt-0.5" />
            <div>
              <p className="font-medium text-sm">Active Disputes</p>
              <p className="text-2xl font-bold">{stats?.disputes ?? 0}</p>
            </div>
          </div>
          
          <div className="flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-warning mt-0.5" />
            <div>
              <p className="font-medium text-sm">Derogatory Items</p>
              <p className="text-2xl font-bold">{stats?.negatives ?? 0}</p>
            </div>
          </div>
          
          <div className="flex items-start gap-3">
            <TrendingUp className="w-5 h-5 text-primary mt-0.5" />
            <div>
              <p className="font-medium text-sm">Fundability Score</p>
              <p className="text-2xl font-bold">{stats?.fundability ?? 0}%</p>
            </div>
          </div>
        </div>
      </Card>
    </div>
  );
};

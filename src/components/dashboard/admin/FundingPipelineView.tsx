import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Loader2, Briefcase } from "lucide-react";
import { useNavigate } from "react-router-dom";
import {
  STATUS_BADGE_CLASS, STATUS_LABELS, formatCurrency,
  type FundingJourneyApplication,
} from "@/lib/fundingJourney";

interface PipelineRow extends FundingJourneyApplication {
  client_name: string | null;
  client_email: string | null;
}

export function FundingPipelineView() {
  const navigate = useNavigate();

  const { data, isLoading } = useQuery({
    queryKey: ["admin-funding-pipeline"],
    queryFn: async () => {
      const { data: apps, error } = await supabase
        .from("funding_journey_applications")
        .select("*")
        .order("updated_at", { ascending: false })
        .limit(200);
      if (error) throw error;

      // Hydrate client names from profiles
      const userIds = [...new Set((apps || []).map((a) => a.user_id))];
      const { data: profiles } = await supabase
        .from("coach_client_profiles_safe")
        .select("user_id, full_name")
        .in("user_id", userIds);
      const nameMap = new Map((profiles || []).map((p: any) => [p.user_id, p.full_name]));

      const rows: PipelineRow[] = (apps || []).map((a) => ({
        ...a,
        client_name: nameMap.get(a.user_id) ?? null,
        client_email: null,
      }));
      return rows;
    },
    staleTime: 30 * 1000,
  });

  // Stats: this month status distribution
  const monthStart = new Date();
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);

  const thisMonth = (data || []).filter((a) => new Date(a.application_date) >= monthStart);
  const stats = {
    total: thisMonth.length,
    submitted: thisMonth.filter((a) => a.status === "submitted").length,
    underReview: thisMonth.filter((a) => a.status === "under_review").length,
    approved: thisMonth.filter((a) => a.status === "approved" || a.status === "funded").length,
    denied: thisMonth.filter((a) => a.status === "denied").length,
  };

  const active = (data || []).filter((a) =>
    ["draft", "submitted", "under_review"].includes(a.status)
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-foreground flex items-center gap-3">
          <Briefcase className="w-7 h-7 text-accent" /> Funding Pipeline
        </h1>
        <p className="text-muted-foreground mt-1">
          All client funding applications across your book — sorted by most recent activity.
        </p>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        <StatCard label="This Month" value={stats.total} />
        <StatCard label="Submitted" value={stats.submitted} />
        <StatCard label="Under Review" value={stats.underReview} accent />
        <StatCard label="Approved" value={stats.approved} accent />
        <StatCard label="Denied" value={stats.denied} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Active Applications ({active.length})</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex justify-center py-12">
              <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
            </div>
          ) : active.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">No active applications across your book.</p>
          ) : (
            <div className="space-y-2">
              {active.map((app) => (
                <button
                  key={app.id}
                  onClick={() => navigate(`/admin/clients/user/${app.user_id}`)}
                  className="w-full flex items-center justify-between gap-3 p-3 rounded-md border border-border hover:bg-muted/50 transition-colors text-left"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium text-sm text-foreground truncate">
                        {app.client_name || "Unknown Client"}
                      </span>
                      <Badge
                        variant="outline"
                        className={`text-[10px] border ${STATUS_BADGE_CLASS[app.status]}`}
                      >
                        {STATUS_LABELS[app.status]}
                      </Badge>
                    </div>
                    <div className="text-xs text-muted-foreground mt-0.5">
                      {app.lender_name}
                      {app.product_name ? ` — ${app.product_name}` : ""}
                      {" — "}
                      Applied {new Date(app.application_date).toLocaleDateString()}
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="text-sm font-semibold">{formatCurrency(app.amount_requested)}</div>
                    <div className="text-[10px] text-muted-foreground">
                      Updated {new Date(app.updated_at).toLocaleDateString()}
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function StatCard({ label, value, accent = false }: { label: string; value: number; accent?: boolean }) {
  return (
    <Card className="p-3">
      <div className="text-xs text-muted-foreground uppercase tracking-wider">{label}</div>
      <div className={`text-2xl font-bold ${accent ? "text-accent" : "text-foreground"}`}>{value}</div>
    </Card>
  );
}

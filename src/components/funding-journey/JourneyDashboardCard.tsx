import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ArrowRight, Briefcase } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useFundingJourney } from "@/hooks/useFundingJourney";
import { formatCurrency } from "@/lib/fundingJourney";

export function JourneyDashboardCard() {
  const navigate = useNavigate();
  const { data } = useFundingJourney();
  const summary = data?.summary;

  return (
    <Card className="shadow-card col-span-full">
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center gap-2">
          <Briefcase className="w-4 h-4 text-accent" /> Funding Journey
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-3 gap-3">
          <button
            onClick={() => navigate("/app/funding-journey")}
            className="rounded-lg border border-border p-3 text-center transition hover:bg-accent/5"
          >
            <p className="text-2xl font-bold">{summary?.totalApplications ?? 0}</p>
            <p className="text-[10px] text-muted-foreground">Applications</p>
          </button>
          <button
            onClick={() => navigate("/app/funding-journey")}
            className="rounded-lg border border-border p-3 text-center transition hover:bg-accent/5"
          >
            <p className="text-2xl font-bold">
              {summary && summary.totalApplications > 0 ? `${summary.approvalRate}%` : "—"}
            </p>
            <p className="text-[10px] text-muted-foreground">Approval Rate</p>
          </button>
          <button
            onClick={() => navigate("/app/funding-journey")}
            className="rounded-lg border border-border p-3 text-center transition hover:bg-accent/5"
          >
            <p className="text-2xl font-bold text-accent">
              {formatCurrency(summary?.totalCapitalSecured ?? 0)}
            </p>
            <p className="text-[10px] text-muted-foreground">Capital Secured</p>
          </button>
        </div>
        <Button
          variant="link"
          size="sm"
          className="mt-2 px-0 h-auto text-accent"
          onClick={() => navigate("/app/funding-journey")}
        >
          View Full Journey <ArrowRight className="w-3 h-3 ml-1" />
        </Button>
      </CardContent>
    </Card>
  );
}

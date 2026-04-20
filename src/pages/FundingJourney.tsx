import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Plus, Briefcase, Loader2 } from "lucide-react";
import { useFundingJourney } from "@/hooks/useFundingJourney";
import { JourneyStatCards } from "@/components/funding-journey/JourneyStatCards";
import { FundingJourneyTimeline } from "@/components/funding-journey/FundingJourneyTimeline";
import { LogApplicationDialog } from "@/components/funding-journey/LogApplicationDialog";

const FundingJourney = () => {
  const { data, isLoading } = useFundingJourney();
  const [logOpen, setLogOpen] = useState(false);

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-3xl font-bold text-foreground flex items-center gap-3">
            <Briefcase className="w-7 h-7 text-accent" />
            Funding Journey
          </h1>
          <p className="text-muted-foreground mt-1">
            Track every funding application — outcomes, denial reasons, and next steps in one place.
          </p>
        </div>
        <Button onClick={() => setLogOpen(true)} className="bg-gradient-to-r from-accent to-accent/80 text-accent-foreground gap-2 shrink-0">
          <Plus className="w-4 h-4" />
          Log New Application
        </Button>
      </div>

      {isLoading ? (
        <Card className="p-12 flex justify-center">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        </Card>
      ) : (
        <>
          <JourneyStatCards summary={data?.summary ?? defaultSummary()} />

          <div>
            <h2 className="text-lg font-semibold text-foreground mb-4">Application Timeline</h2>
            <FundingJourneyTimeline applications={data?.applications ?? []} />
          </div>
        </>
      )}

      <LogApplicationDialog open={logOpen} onOpenChange={setLogOpen} />
    </div>
  );
};

function defaultSummary() {
  return {
    totalApplications: 0,
    approvalRate: 0,
    totalCapitalSecured: 0,
    scoreImprovement: null,
    topDenialReason: null,
    mostRecent: null,
    byStatus: {
      draft: 0, submitted: 0, under_review: 0, approved: 0, denied: 0, withdrawn: 0, funded: 0,
    },
  };
}

export default FundingJourney;

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Loader2, Plus } from "lucide-react";
import { useFundingJourney } from "@/hooks/useFundingJourney";
import { JourneyStatCards } from "./JourneyStatCards";
import { FundingJourneyTimeline } from "./FundingJourneyTimeline";
import { LogApplicationDialog } from "./LogApplicationDialog";

interface Props {
  clientUserId: string;
}

/** Funding Journey tab inside ClientFileView (admin/coach context). */
export function ClientFundingJourneyTab({ clientUserId }: Props) {
  const { data, isLoading } = useFundingJourney(clientUserId);
  const [logOpen, setLogOpen] = useState(false);

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h3 className="text-lg font-semibold text-foreground">Funding Journey</h3>
          <p className="text-xs text-muted-foreground">
            Track every application this client has submitted, including outcomes and next steps.
          </p>
        </div>
        <Button size="sm" onClick={() => setLogOpen(true)} className="gap-1.5">
          <Plus className="w-4 h-4" /> Log Application
        </Button>
      </div>

      {isLoading ? (
        <Card className="p-12 flex justify-center">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        </Card>
      ) : (
        <>
          <JourneyStatCards summary={data?.summary ?? defaultSummary()} />
          <FundingJourneyTimeline
            applications={data?.applications ?? []}
            coachMode
          />
        </>
      )}

      <LogApplicationDialog
        open={logOpen}
        onOpenChange={setLogOpen}
        targetUserId={clientUserId}
      />
    </div>
  );
}

function defaultSummary() {
  return {
    totalApplications: 0, approvalRate: 0, totalCapitalSecured: 0,
    scoreImprovement: null, topDenialReason: null, mostRecent: null,
    byStatus: { draft: 0, submitted: 0, under_review: 0, approved: 0, denied: 0, withdrawn: 0, funded: 0 },
  };
}

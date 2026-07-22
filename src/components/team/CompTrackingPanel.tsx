// Compensation tracking (IA slice 1c-ix) — RESERVED. No data source exists, so there is
// NO stub UI and NO fake numbers (§13). A crafted EmptyState + a "Coming in v2" roadmap
// pill hold the space honestly until the comp data model ships.
import { Wallet } from "lucide-react";
import { SectionCard, EmptyState, StatePill } from "@/components/ui/page";

export function CompTrackingPanel() {
  return (
    <SectionCard
      title="Compensation"
      icon={Wallet}
      actions={<StatePill state="roadmap">Coming in v2</StatePill>}
    >
      <EmptyState
        icon={Wallet}
        title="Comp tracking is on the roadmap"
        description="Commission, splits, and payout tracking for your team will run from here in a future release."
      />
    </SectionCard>
  );
}

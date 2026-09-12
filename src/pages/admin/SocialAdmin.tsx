import { Archive, LockKeyhole, Share2 } from "lucide-react";
import { PageHeader, PageShell, SectionCard, StatePill } from "@/components/ui/page";

export default function SocialAdmin() {
  return (
    <PageShell width="wide">
      <PageHeader
        variant="plain"
        eyebrow="Governed operations"
        icon={Share2}
        title="Social"
        description="Social publishing is being rebuilt around tenant-safe accounts, explicit approval, provider readback, and owner-visible evidence."
        actions={<StatePill state="off">Unavailable</StatePill>}
      />

      <div className="grid gap-4 lg:grid-cols-2">
        <SectionCard
          icon={LockKeyhole}
          title="External actions are locked"
          description="No post, schedule, retry, or provider request can start from this Admin surface while the governed Social contract is incomplete."
        >
          <p className="text-sm leading-relaxed text-muted-foreground">
            Activation requires a tenant-owned provider account, an explicitly approved draft,
            an idempotent job, canonical provider confirmation, and a receipt on the owner Rail.
          </p>
        </SectionCard>

        <SectionCard
          icon={Archive}
          title="Legacy history is preserved"
          description="Operator-era Social records remain evidence, not proof of a tenant connection or a successful publication."
        >
          <p className="text-sm leading-relaxed text-muted-foreground">
            Records without provable tenant ownership are retained separately and are never shown
            as customer activity, analytics, or connected-account state.
          </p>
        </SectionCard>
      </div>
    </PageShell>
  );
}

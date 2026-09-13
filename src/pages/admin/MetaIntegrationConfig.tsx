import { KeyRound, Network, Share2 } from "lucide-react";
import { PageHeader, PageShell, SectionCard, StatePill } from "@/components/ui/page";

export default function MetaIntegrationConfig() {
  return (
    <PageShell width="wide">
      <PageHeader
        variant="plain"
        eyebrow="Social provider"
        icon={Share2}
        title="Meta Graph"
        description="Meta connection setup is unavailable until Paige can bind OAuth authorization to the correct tenant and selected Page or profile."
        actions={<StatePill state="off">Setup unavailable</StatePill>}
      />

      <div className="grid gap-4 lg:grid-cols-2">
        <SectionCard
          icon={KeyRound}
          title="No connection is recorded here"
          description="A Page ID, declared handle, webhook URL, or server secret does not establish an authorized Social account."
        >
          <p className="text-sm leading-relaxed text-muted-foreground">
            The supported flow will require OAuth authorization, profile discovery, explicit
            account selection, secure credential references, expiration, revocation, and reconnect.
          </p>
        </SectionCard>

        <SectionCard
          icon={Network}
          title="Provider actions remain off"
          description="Inbound comments, insights, publishing, and scheduling are not currently available through this integration."
        >
          <p className="text-sm leading-relaxed text-muted-foreground">
            Paige will only describe those capabilities as connected after authenticated provider
            proof and tenant-safe readback exist.
          </p>
        </SectionCard>
      </div>
    </PageShell>
  );
}

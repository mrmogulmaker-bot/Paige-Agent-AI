// Setup › Playbook & Paige (1c-xi) — the Product home. The REAL Playbook editor,
// mounted INLINE (§18/§31): a tenant tunes Paige's persona, probing questions,
// intake, client journey, portal, and knowledge for their own practice (§7
// tenant-authored) right here — no dead-end "Open Playbook" redirect card (§36).
// The same editor body the "Customize Paige" console renders, reused verbatim via
// PlaybookEditorInline. §11 lean plain header, no hero; §16 department eyebrow.
import { Bot, Loader2 } from "lucide-react";
import { PageShell, PageHeader, SectionCard } from "@/components/ui/page";
import { useTenantContext } from "@/hooks/useTenantContext";
import { PlaybookEditorInline } from "@/components/paige/PlaybookEditorInline";

export default function SetupPlaybook() {
  const { activeTenantId, activeTenant, loading } = useTenantContext();

  return (
    <PageShell width="wide">
      <PageHeader
        variant="plain"
        icon={Bot}
        eyebrow="Product"
        title="Playbook & Paige"
        description="How Paige works for your practice — her persona, her questions, and the journey she runs each client through."
      />

      <SectionCard>
        {loading ? (
          <div className="flex items-center justify-center gap-3 p-12 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" /> Loading your Paige…
          </div>
        ) : !activeTenantId ? (
          <div className="p-8 text-center text-sm text-muted-foreground">
            No workspace is active yet.
          </div>
        ) : (
          <PlaybookEditorInline
            activeTenantId={activeTenantId}
            tenantName={activeTenant?.name ?? "your practice"}
          />
        )}
      </SectionCard>
    </PageShell>
  );
}

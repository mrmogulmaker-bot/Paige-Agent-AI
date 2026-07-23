// Setup › Playbook & Paige (1c-xi) — the Product home. LINK-OUT to the Playbook
// editor, where a tenant tunes Paige's persona, probing questions, and client
// journey for their own practice (§7 tenant-authored). §11 lean plain header, no
// hero; §16 department eyebrow.
import { Link } from "react-router-dom";
import { Bot, ArrowRight } from "lucide-react";
import { PageShell, PageHeader, SectionCard, EmptyState } from "@/components/ui/page";
import { Button } from "@/components/ui/button";

export default function SetupPlaybook() {
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
        <EmptyState
          icon={Bot}
          tone="brand"
          title="Make Paige native to your practice"
          description="Tune Paige's persona, questions, and journey for your practice in the Playbook editor."
          action={
            <Button asChild>
              <Link to="/admin/playbook">
                Open Playbook
                <ArrowRight className="h-4 w-4 ml-1.5" />
              </Link>
            </Button>
          }
        />
      </SectionCard>
    </PageShell>
  );
}

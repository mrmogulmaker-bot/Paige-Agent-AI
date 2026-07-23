// Setup › Integrations (1c-xi) — the Technology home for connectors. PURE
// LINK-OUT: every connector (calendars, Zoom, and the rest) has one home at
// /admin/integrations, so this surface just points there — no panel is mounted.
// §9: MCP sessions are operator-scoped and live in the platform shell, never
// here. §11 lean plain header, no hero.
import { Link } from "react-router-dom";
import { Plug, ArrowRight } from "lucide-react";
import { PageShell, PageHeader, SectionCard, EmptyState } from "@/components/ui/page";
import { Button } from "@/components/ui/button";

export default function SetupIntegrations() {
  return (
    <PageShell width="wide">
      <PageHeader
        variant="plain"
        icon={Plug}
        eyebrow="Technology"
        title="Integrations"
        description="Connect the tools your practice already runs on — calendars, video, and more."
      />

      <SectionCard>
        <EmptyState
          icon={Plug}
          tone="brand"
          title="Every connector lives in one place"
          description="Link your Google Calendar, Zoom, and the rest of your connectors from the Integrations hub, then Paige can work across them."
          action={
            <Button asChild>
              <Link to="/admin/integrations">
                Go to Integrations
                <ArrowRight className="h-4 w-4 ml-1.5" />
              </Link>
            </Button>
          }
        />
      </SectionCard>
    </PageShell>
  );
}

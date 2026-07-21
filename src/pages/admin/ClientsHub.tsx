// Clients — placeholder container LANDING (Slice 1c-v). The full Clients workspace
// (People · Pipeline · Conversations · Client Portal · Delivery as sub-tabs) builds
// in Slice 1c-viii. Until then this is a proper §11 EmptyState whose CTAs link to
// every still-mounted surface it will absorb, so nothing is stranded (§11/§15). The
// funding surfaces are shown ONLY to funding-opted-in tenants (§2 — never a default).
import { Link } from "react-router-dom";
import { Users, Contact, KanbanSquare, CalendarDays, LayoutTemplate, TrendingUp, Briefcase, DollarSign } from "lucide-react";
import { PageShell, PageHeader, EmptyState } from "@/components/ui/page";
import { Button } from "@/components/ui/button";
import { useTenantFeature } from "@/hooks/useTenantFeature";

export default function ClientsHub() {
  const { enabled: fundingEnabled } = useTenantFeature("funding_readiness");
  return (
    <PageShell width="default">
      <PageHeader variant="plain" title="Clients" />
      <EmptyState
        icon={Users}
        tone="brand"
        title="Everything client-facing, one roof — soon."
        description="Your single home for the people you serve — contacts, deals, scheduling, and the portal each client sees — is on the way. Until it lands, jump straight to any piece."
        action={
          <div className="flex flex-wrap justify-center gap-2">
            <Button asChild variant="outline"><Link to="/admin/clients"><Users className="h-4 w-4" /> All Clients</Link></Button>
            <Button asChild variant="outline"><Link to="/admin/contacts"><Contact className="h-4 w-4" /> Contacts</Link></Button>
            <Button asChild variant="outline"><Link to="/admin/leads/enrichment"><Contact className="h-4 w-4" /> Lead Enrichment</Link></Button>
            <Button asChild variant="outline"><Link to="/admin/pipeline"><KanbanSquare className="h-4 w-4" /> Pipeline</Link></Button>
            <Button asChild variant="outline"><Link to="/admin/calendar"><CalendarDays className="h-4 w-4" /> Calendar</Link></Button>
            <Button asChild variant="outline"><Link to="/admin/portal"><LayoutTemplate className="h-4 w-4" /> Portal Studio</Link></Button>
            {fundingEnabled && (
              <>
                <Button asChild variant="outline"><Link to="/admin/funding-pipeline"><Briefcase className="h-4 w-4" /> Funding Journey</Link></Button>
                <Button asChild variant="outline"><Link to="/admin/funding"><DollarSign className="h-4 w-4" /> Funding Portfolio</Link></Button>
                <Button asChild variant="outline"><Link to="/admin/funding-lens"><TrendingUp className="h-4 w-4" /> Readiness Lens</Link></Button>
              </>
            )}
          </div>
        }
      />
    </PageShell>
  );
}

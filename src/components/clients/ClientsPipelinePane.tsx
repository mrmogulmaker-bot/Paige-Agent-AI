// Pipeline tab body for the Clients container (IA slice 1c-viii-c). REUSES
// PipelineAdmin (the Kanban) untouched, and surfaces the funding sub-surfaces as
// gated quick-links ABOVE it — Portfolio · Journey · Readiness Lens. The whole
// strip is wrapped in <FundingGate>, which renders null for a tenant without
// `funding_readiness` (§2: funding is never a default). The funding ROUTES
// themselves are unchanged (FundingRoute-guarded in Admin.tsx); these are just
// discoverable entry points for a funding-opted-in tenant.
import { Link } from "react-router-dom";
import { Briefcase, TrendingUp, DollarSign } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FundingGate } from "@/components/admin/FundingRoute";
import PipelineAdmin from "@/pages/admin/PipelineAdmin";

export default function ClientsPipelinePane() {
  return (
    <>
      <FundingGate>
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <span className="mr-1 text-xs font-medium text-muted-foreground">Funding:</span>
          <Button asChild variant="outline" size="sm">
            <Link to="/admin/funding"><DollarSign className="h-4 w-4" /> Portfolio</Link>
          </Button>
          <Button asChild variant="outline" size="sm">
            <Link to="/admin/funding-pipeline"><Briefcase className="h-4 w-4" /> Journey</Link>
          </Button>
          <Button asChild variant="outline" size="sm">
            <Link to="/admin/funding-lens"><TrendingUp className="h-4 w-4" /> Readiness Lens</Link>
          </Button>
        </div>
      </FundingGate>
      <PipelineAdmin />
    </>
  );
}

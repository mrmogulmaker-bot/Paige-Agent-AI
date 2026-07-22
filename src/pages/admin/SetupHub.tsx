// Setup — placeholder container LANDING (Slice 1c-v). The full config/ops
// consolidation (Workspace · Integrations · Playbooks · Billing · Legal · Security ·
// Team Management) builds in Slice 1c-xi. Until then this §11 EmptyState links to
// every still-mounted config/ops surface so nothing is stranded (§11/§15).
// CTA gating mirrors each surface's PRIOR reachability so no coach is newly
// restricted: Automation tools + Planning + Referrals + Client Agreement were
// staff-visible; Agreements/Support/Maintenance/Settings were admin-only; Brokers
// is funding-opt-in + admin (§2). Sub-Agents/Actions/Skills ultimately fold into
// the Paige surface (1c-vi) — surfaced here only for interim reachability.
import { Link } from "react-router-dom";
import { Settings, Workflow, Plug, CalendarClock, Share2, FileSignature, LifeBuoy, Wrench, Briefcase } from "lucide-react";
import { PageShell, PageHeader, EmptyState } from "@/components/ui/page";
import { Button } from "@/components/ui/button";
import { RoleGate } from "@/components/auth/RoleGate";
import { FundingGate } from "@/components/admin/FundingRoute";

export default function SetupHub() {
  return (
    <PageShell width="default">
      <PageHeader variant="plain" title="Setup" />
      <EmptyState
        icon={Settings}
        tone="brand"
        title="Set up the practice."
        description="Automations, integrations, agreements, and support will consolidate here. Everything is still one click away below."
        action={
          <div className="flex flex-wrap justify-center gap-2">
            <Button asChild variant="outline"><Link to="/admin/workflows"><Workflow className="h-4 w-4" /> Automation</Link></Button>
            {/* Sub-Agents / Actions / Skills now live as Paige sub-tabs (1c-vi) — one home (§18). */}
            <Button asChild variant="outline"><Link to="/admin/integrations"><Plug className="h-4 w-4" /> Integrations</Link></Button>
            <Button asChild variant="outline"><Link to="/admin/planning"><CalendarClock className="h-4 w-4" /> Planning</Link></Button>
            <Button asChild variant="outline"><Link to="/admin/affiliates"><Share2 className="h-4 w-4" /> Referrals</Link></Button>
            <Button asChild variant="outline"><Link to="/admin/agreement"><FileSignature className="h-4 w-4" /> Client Agreement</Link></Button>
            {/* Admin-only group. fallback={<></>} renders nothing for coaches (an empty
                fragment is truthy; fallback={null} would show the Restricted card). */}
            <RoleGate allow={["admin"]} fallback={<></>}>
              <>
                <Button asChild variant="outline"><Link to="/admin/agreements"><FileSignature className="h-4 w-4" /> Agreements</Link></Button>
                <Button asChild variant="outline"><Link to="/admin/support"><LifeBuoy className="h-4 w-4" /> Support</Link></Button>
                <Button asChild variant="outline"><Link to="/admin/maintenance"><Wrench className="h-4 w-4" /> Maintenance</Link></Button>
                <Button asChild variant="outline"><Link to="/admin/settings"><Settings className="h-4 w-4" /> Workspace Settings</Link></Button>
                <FundingGate>
                  <Button asChild variant="outline"><Link to="/admin/brokers"><Briefcase className="h-4 w-4" /> Brokers</Link></Button>
                </FundingGate>
              </>
            </RoleGate>
          </div>
        }
      />
    </PageShell>
  );
}

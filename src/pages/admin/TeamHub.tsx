// Team — placeholder container LANDING (Slice 1c-v). The full live-ops floor
// (Live Scoreboard · Availability · Handoff Queue · Members & Roles · Assignments)
// builds in Slice 1c-ix. Until then this §11 EmptyState links to the still-mounted
// team surfaces so nothing is stranded (§11/§15). Members & Roles is admin-only
// (matches its prior route gate); Coaches is staff-visible.
import { Link } from "react-router-dom";
import { UserCog, Users } from "lucide-react";
import { PageShell, PageHeader, EmptyState } from "@/components/ui/page";
import { Button } from "@/components/ui/button";
import { RoleGate } from "@/components/auth/RoleGate";

export default function TeamHub() {
  return (
    <PageShell width="default">
      <PageHeader variant="plain" title="Team" />
      <EmptyState
        icon={UserCog}
        tone="brand"
        title="Your team floor is on the way."
        description="Roles, coaches, and a live team-ops floor will run from right here. For now, manage who's on the team directly."
        action={
          <div className="flex flex-wrap justify-center gap-2">
            {/* fallback={<></>} — an empty fragment is truthy so RoleGate renders
                nothing (fallback={null} is falsy → it would show the Restricted card). */}
            <RoleGate allow={["admin"]} fallback={<></>}>
              <Button asChild variant="outline"><Link to="/admin/members"><UserCog className="h-4 w-4" /> Members &amp; Roles</Link></Button>
            </RoleGate>
            <Button asChild variant="outline"><Link to="/admin/coaches"><Users className="h-4 w-4" /> Coaches</Link></Button>
          </div>
        }
      />
    </PageShell>
  );
}

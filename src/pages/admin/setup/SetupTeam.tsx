// Setup › Team (1c-xi) — the People home. LINK-OUT to the canonical Team and
// Members surfaces (roles, invites, who Paige works for). Coach-visible; the
// destinations enforce their own gates. §11 lean plain header, no hero; §16
// department eyebrow.
import { Link } from "react-router-dom";
import { Users, ArrowRight } from "lucide-react";
import { PageShell, PageHeader, SectionCard, EmptyState } from "@/components/ui/page";
import { Button } from "@/components/ui/button";

export default function SetupTeam() {
  return (
    <PageShell width="wide">
      <PageHeader
        variant="plain"
        icon={Users}
        eyebrow="People"
        title="Team"
        description="Your people, their roles, and who Paige works for."
      />

      <SectionCard>
        <EmptyState
          icon={Users}
          tone="brand"
          title="Your people and their roles"
          description="Your people, their roles, and who Paige works for."
          action={
            <div className="flex flex-col items-center gap-2">
              <Button asChild>
                <Link to="/admin/team">
                  Open Team
                  <ArrowRight className="h-4 w-4 ml-1.5" />
                </Link>
              </Button>
              <Link
                to="/admin/members"
                className="text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))] rounded-sm"
              >
                Members &amp; roles
              </Link>
            </div>
          }
        />
      </SectionCard>
    </PageShell>
  );
}

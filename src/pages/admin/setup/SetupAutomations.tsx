// Setup › Automations (1c-xi) — the Technology home. The page header reads
// "Automations"; WorkflowsList is mounted with `embedded` so it suppresses its own
// "Workflows" h1 — only Setup's own "Automations" PageHeader shows (no double
// header). Autonomy + the pipeline/custom-field/stage-rule link-outs sit behind an
// admin gate. §11 lean plain header, no hero; §16 department eyebrow.
import { Link } from "react-router-dom";
import { Workflow, ExternalLink, type LucideIcon } from "lucide-react";
import { PageShell, PageHeader, SectionCard } from "@/components/ui/page";
import { Button } from "@/components/ui/button";
import WorkflowsList from "@/pages/admin/WorkflowsList";
import { PaigeAutonomyPanel } from "@/components/admin/settings/PaigeAutonomyPanel";
import { RoleGate } from "@/components/auth/RoleGate";
import { KanbanSquare, ListChecks, GitBranch } from "lucide-react";

function LinkRow({ to, icon: Icon, label }: { to: string; icon: LucideIcon; label: string }) {
  return (
    <Button asChild variant="outline" className="justify-start">
      <Link to={to}>
        <Icon className="h-4 w-4 mr-2" />
        {label}
        <ExternalLink className="h-3.5 w-3.5 ml-auto opacity-60" />
      </Link>
    </Button>
  );
}

export default function SetupAutomations() {
  return (
    <PageShell width="wide">
      <PageHeader
        variant="plain"
        icon={Workflow}
        eyebrow="Technology"
        title="Automations"
        description="The workflows Paige runs for your practice, plus how much she's allowed to do on her own."
      />

      <div className="space-y-8">
        <WorkflowsList embedded />

        <RoleGate allow={["admin"]} fallback={<></>}>
          <div className="space-y-8">
            <PaigeAutonomyPanel />

            <SectionCard
              icon={GitBranch}
              title="Pipelines & fields"
              description="Configure your sales pipelines, the custom fields your practice tracks, and the rules that fire as deals move stage."
            >
              <div className="grid gap-3 sm:grid-cols-3">
                <LinkRow to="/admin/settings/pipelines" icon={KanbanSquare} label="Pipelines" />
                <LinkRow to="/admin/settings/custom-fields" icon={ListChecks} label="Custom Fields" />
                <LinkRow to="/admin/automation/stage-rules" icon={GitBranch} label="Stage automation rules" />
              </div>
            </SectionCard>
          </div>
        </RoleGate>
      </div>
    </PageShell>
  );
}

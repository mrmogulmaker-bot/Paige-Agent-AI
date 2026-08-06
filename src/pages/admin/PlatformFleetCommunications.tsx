import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Building2, GitBranch, Loader2, MessageSquare, Settings2, Users } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { EmptyState, PageHeader, PageShell, SectionCard, StatePill } from "@/components/ui/page";
import { supabase } from "@/integrations/supabase/client";
import { useTenantContext } from "@/hooks/useTenantContext";
import { parseOperatorWorkspace, type OperatorWorkspace } from "@/lib/platform/fleetCommunications";

export default function PlatformFleetCommunications() {
  const navigate = useNavigate();
  const { switchTenant } = useTenantContext();
  const [workspace, setWorkspace] = useState<OperatorWorkspace | null>(null);
  const [loading, setLoading] = useState(true);
  const [launching, setLaunching] = useState(false);
  const [loadError, setLoadError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      // The RPC ships in this branch's migration; generated database types update after deployment.
      const { data, error } = await supabase.rpc("resolve_platform_operator_workspace" as never);
      if (cancelled) return;
      setLoadError(Boolean(error));
      setWorkspace(error ? null : parseOperatorWorkspace(data));
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, []);

  const enterWorkspace = async (path: string) => {
    if (!workspace) return;
    setLaunching(true);
    const switched = await switchTenant(workspace.id);
    if (!switched) {
      toast.error("Paige Operations could not be opened. Your platform view was not changed.");
      setLaunching(false);
      return;
    }
    navigate(path);
  };

  return (
    <PageShell>
      <PageHeader variant="plain" title="Fleet Communications"
        description="Run Paige Agent AI's own conversations and sales pipeline from the dedicated Paige Operations workspace." />
      <SectionCard>
        {loading ? (
          <div className="flex min-h-48 items-center justify-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Checking Paige Operations…
          </div>
        ) : workspace ? (
          <div className="space-y-5">
            <div className="flex items-start gap-3">
              <span className="grid h-11 w-11 shrink-0 place-items-center rounded-lg border border-border bg-muted">
                <Building2 className="h-5 w-5 text-primary" />
              </span>
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="text-base font-semibold text-foreground">{workspace.name}</h2>
                  <StatePill state={workspace.status === "active" ? "success" : "pending"}>{workspace.status}</StatePill>
                </div>
                <p className="mt-1 text-sm text-muted-foreground">Fixed operator workspace · not a customer account</p>
              </div>
            </div>
            <div className="rounded-lg border border-border bg-muted/30 p-4 text-sm text-muted-foreground">
              Opening a workspace tool moves you into Paige Operations so Conversations, Contacts,
              Pipelines, consent controls, and message history remain in one tenant-isolated system.
              Choose Platform in the account switcher to return to God Level.
            </div>
            <div className="flex flex-wrap gap-2">
              <Button variant="gold" onClick={() => void enterWorkspace("/admin/clients-hub/conversations")} disabled={launching}>
                {launching ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <MessageSquare className="mr-2 h-4 w-4" />}
                Open Conversations
              </Button>
              <Button variant="outline" onClick={() => void enterWorkspace("/admin/clients-hub")} disabled={launching}>
                <Users className="mr-2 h-4 w-4" /> Open Contacts
              </Button>
              <Button variant="outline" onClick={() => void enterWorkspace("/admin/clients-hub/pipeline")} disabled={launching}>
                <GitBranch className="mr-2 h-4 w-4" /> Open Pipelines
              </Button>
              <Button variant="outline" onClick={() => void enterWorkspace("/admin/clients-hub/conversations/settings")} disabled={launching}>
                <Settings2 className="mr-2 h-4 w-4" /> Communication settings
              </Button>
            </div>
          </div>
        ) : (
          <EmptyState icon={MessageSquare}
            title={loadError ? "Paige Operations could not be checked" : "Paige Operations is not designated"}
            description={loadError
              ? "The platform workspace resolver failed closed. No tenant was selected."
              : "Create and designate the dedicated Paige Operations workspace before opening Fleet Communications."} />
        )}
      </SectionCard>
    </PageShell>
  );
}

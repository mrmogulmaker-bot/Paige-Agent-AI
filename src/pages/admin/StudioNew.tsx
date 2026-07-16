// Vibe Studio — the addressable "new project" entry (/admin/studio/new).
//
// A thin create-and-redirect: mint a session via the seam, then <Navigate replace> into the
// builder at /admin/studio/:id. The composer submit and the "New project" button on the HOME
// reach createStudioSession directly, so this route is optional — but it keeps a clean,
// addressable "new" entry Paige (or a deep link) can target the same way (§10). Uses the SAME
// createStudioSession seam, so a project exists the instant this mounts, before any drafting.
import { useEffect, useRef, useState } from "react";
import { Navigate } from "react-router-dom";
import { Loader2, Wand2 } from "lucide-react";
import { useTenantContext } from "@/hooks/useTenantContext";
import { Button } from "@/components/ui/button";
import { EmptyState, PageShell, SectionCard } from "@/components/ui/page";
import { createStudioSession, isStudioError } from "@/components/admin/studio/studio";

export default function StudioNew() {
  const { activeTenantId, loading: tenantLoading } = useTenantContext();
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const startedRef = useRef(false);

  useEffect(() => {
    if (startedRef.current || sessionId) return;
    if (tenantLoading) return; // wait for the tenant resolve before deciding
    if (!activeTenantId) {
      setError("Pick a workspace up top, then start a new project.");
      return;
    }
    startedRef.current = true;
    let live = true;
    createStudioSession({ tenantId: activeTenantId })
      .then((session) => {
        if (live) setSessionId(session.id);
      })
      .catch((err) => {
        if (live) setError(isStudioError(err) ? err.message : "Couldn't start a project. Try again.");
      });
    return () => {
      live = false;
    };
  }, [activeTenantId, tenantLoading, sessionId]);

  if (sessionId) {
    return <Navigate to={`/admin/studio/${sessionId}`} replace />;
  }

  if (error) {
    return (
      <PageShell width="wide">
        <div className="grid min-h-[60vh] place-items-center">
          <SectionCard className="max-w-md">
            <EmptyState
              icon={Wand2}
              tone="brand"
              title="Couldn't start a project"
              description={error}
              action={
                <Button variant="outline" onClick={() => (window.location.href = "/admin/studio")}>
                  Back to the Studio
                </Button>
              }
            />
          </SectionCard>
        </div>
      </PageShell>
    );
  }

  return (
    <PageShell width="wide">
      <div className="grid min-h-[60vh] place-items-center">
        <div className="flex flex-col items-center gap-3 text-center">
          <Loader2 className="h-6 w-6 animate-spin text-primary motion-reduce:animate-none" aria-hidden />
          <p className="text-sm text-muted-foreground">Spinning up your project…</p>
        </div>
      </div>
    </PageShell>
  );
}

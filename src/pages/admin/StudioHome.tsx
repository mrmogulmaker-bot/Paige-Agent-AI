// Vibe Studio HOME — the landing gallery + the one conversational composer (Slice 2).
//
// The first thing a tenant sees at /admin/studio: a hero composer ("What do you want to build?")
// and their projects. §18 — there is NO upfront artifact-type picker; ONE composer seeds a
// session and the builder classifies what the brief actually asked for. The four FilterChips are
// VIEWS over ONE grid (Recently viewed / My projects / Starred / Templates), never four routes
// and never a gate the operator clears before Paige listens. §11 — built on the primitive layer,
// gold spent only on the single "New project" act, crafted EmptyState + skeletons, motion-safe.
//
// This lists SESSIONS (authoring projects), not the growth_* artifact rows GrowthHub lists (§18).
import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Loader2, Plus, Wand2 } from "lucide-react";
import { useTenantContext } from "@/hooks/useTenantContext";
import { Button } from "@/components/ui/button";
import {
  EmptyState,
  FilterChip,
  PageHeader,
  PageShell,
  SectionCard,
  Toolbar,
} from "@/components/ui/page";
import { PromptComposer } from "@/components/admin/studio/PromptComposer";
import { ProjectCard } from "@/components/admin/studio/ProjectCard";
import { useStudioSessions } from "@/components/admin/studio/useStudioSessions";
import {
  createStudioSession,
  ensureSessionForArtifact,
  isStudioError,
} from "@/components/admin/studio/studio";
import { STUDIO_HOME_CHIPS } from "@/components/admin/studio/studio-copy";
import type { StudioSessionView } from "@/components/admin/studio/studio-types";
import { useToast } from "@/hooks/use-toast";

const VIEWS: { id: StudioSessionView; label: string }[] = [
  { id: "recent", label: "Recently viewed" },
  { id: "mine", label: "My projects" },
  { id: "starred", label: "Starred" },
  { id: "templates", label: "Templates" },
];

export default function StudioHome() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { activeTenantId } = useTenantContext();
  const [params] = useSearchParams();

  const [view, setView] = useState<StudioSessionView>("recent");
  const [brief, setBrief] = useState("");
  const [starting, setStarting] = useState(false);
  const { sessions, loading, error, toggleStar } = useStudioSessions(activeTenantId, view);

  // ── the ?pageId deep-link shim (blocking #5) ────────────────────────────────────────
  // Legacy "Edit in Studio" links land on bare /admin/studio?mode=page&pageId=X. Resolve that
  // page into its session and redirect INTO the builder, so the button opens the editor instead
  // of falling through to the gallery. Runs at most once per mount.
  const shimPageId = params.get("pageId");
  const [shimming, setShimming] = useState(!!shimPageId);
  const shimRef = useRef(false);
  useEffect(() => {
    if (!shimPageId || shimRef.current) return;
    if (!activeTenantId) return; // wait for the tenant to resolve before wrapping
    shimRef.current = true;
    let live = true;
    ensureSessionForArtifact({ tenantId: activeTenantId, kind: "page", artifactId: shimPageId })
      .then((session) => {
        if (!live) return;
        navigate(`/admin/studio/${session.id}?mode=page&pageId=${shimPageId}`, { replace: true });
      })
      .catch((err) => {
        // Couldn't wrap it — don't strand the operator on a spinner; drop them on the gallery
        // with an honest note (§13) instead of a raw code (§11).
        if (!live) return;
        setShimming(false);
        toast({
          title: "Couldn't open that in the Studio",
          description: isStudioError(err) ? err.message : "Start a new project below instead.",
          variant: "destructive",
        });
      });
    return () => {
      live = false;
    };
  }, [shimPageId, activeTenantId, navigate, toast]);

  // The single entry (§18): a brief seeds a NEW session; the builder classifies the shape.
  const startSession = useCallback(
    async (seed?: string) => {
      if (!activeTenantId) {
        toast({
          title: "Pick a workspace first",
          description: "Choose a workspace up top, then start building.",
          variant: "destructive",
        });
        return;
      }
      setStarting(true);
      try {
        const session = await createStudioSession({ tenantId: activeTenantId, seedBrief: seed });
        navigate(`/admin/studio/${session.id}`, { state: { brief: seed } });
      } catch (err) {
        toast({
          title: "Couldn't start a project",
          description: isStudioError(err) ? err.message : "Try again in a moment.",
          variant: "destructive",
        });
        setStarting(false);
      }
    },
    [activeTenantId, navigate, toast],
  );

  // While the deep-link shim resolves, hold a crafted full-height loader — never flash the
  // gallery for a beat and then redirect away from it.
  if (shimming) {
    return (
      <PageShell width="wide">
        <div className="grid min-h-[60vh] place-items-center">
          <div className="flex flex-col items-center gap-3 text-center">
            <Loader2 className="h-6 w-6 animate-spin text-primary motion-reduce:animate-none" aria-hidden />
            <p className="text-sm text-muted-foreground">Opening your project…</p>
          </div>
        </div>
      </PageShell>
    );
  }

  const isTemplates = view === "templates";

  return (
    <PageShell width="wide">
      <PageHeader
        variant="hero"
        mark
        eyebrow="Vibe Studio"
        title="What do you want to build?"
        description="Describe it in a sentence — a page, a form, a funnel, copy, an image, or a whole campaign wired together. Paige works out the shape."
      />

      {/* The ONE conversational composer — no upfront artifact-type picker (§18). */}
      <SectionCard>
        <PromptComposer
          mode="page"
          value={brief}
          onChange={setBrief}
          onSubmit={(value) => void startSession(value)}
          heading="Describe what you want to build"
          placeholder="e.g. a webinar registration page for my Q3 masterclass, with an intake form and a thank-you."
          helperText="One sentence is enough to start — Paige asks for anything she needs, then builds it with her team."
          submitLabel="Start building"
          busy={starting}
          busyLabel="Spinning up your session…"
          chips={STUDIO_HOME_CHIPS}
        />
      </SectionCard>

      {/* Projects gallery — ONE grid, four filter VIEWS. */}
      <div className="space-y-4">
        <Toolbar>
          <div className="flex flex-wrap gap-1.5">
            {VIEWS.map((v) => (
              <FilterChip key={v.id} active={view === v.id} onClick={() => setView(v.id)}>
                {v.label}
              </FilterChip>
            ))}
          </div>
          {/* The home's single GOLD act — start a new project (§11 gold budget). */}
          <Button variant="gold" onClick={() => void startSession()} disabled={starting}>
            <Plus className="h-4 w-4" aria-hidden /> New project
          </Button>
        </Toolbar>

        {error ? (
          <SectionCard>
            <EmptyState
              icon={Wand2}
              title="Couldn't load your projects"
              description={error}
              action={
                <Button variant="outline" onClick={() => setView(view)}>
                  Try again
                </Button>
              }
            />
          </SectionCard>
        ) : loading ? (
          <ul
            className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4"
            aria-hidden
          >
            {Array.from({ length: 8 }).map((_, i) => (
              <li
                key={i}
                className="h-[248px] animate-pulse rounded-[var(--radius)] border border-border bg-card motion-reduce:animate-none"
              />
            ))}
          </ul>
        ) : sessions.length === 0 ? (
          <SectionCard>
            <EmptyState
              icon={Wand2}
              tone="brand"
              title={isTemplates ? "Starter templates are coming" : "Build your first project"}
              description={
                isTemplates
                  ? "Coaching-ready starting points land here soon — for now, describe what you want above and Paige builds it from scratch."
                  : "Nothing here yet. Tell Paige what you want to make above, or start from a blank canvas."
              }
              action={
                !isTemplates ? (
                  <Button variant="gold" onClick={() => void startSession()} disabled={starting}>
                    <Plus className="h-4 w-4" aria-hidden /> Start building
                  </Button>
                ) : undefined
              }
            />
          </SectionCard>
        ) : (
          <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {sessions.map((s) => (
              <ProjectCard
                key={s.id}
                session={s}
                isTemplate={isTemplates}
                onOpen={() =>
                  isTemplates ? void startSession(s.seedBrief ?? undefined) : navigate(`/admin/studio/${s.id}`)
                }
                onToggleStar={() => toggleStar(s.id)}
              />
            ))}
          </ul>
        )}
      </div>
    </PageShell>
  );
}

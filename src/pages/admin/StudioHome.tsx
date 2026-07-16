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
  SectionCard,
  Toolbar,
} from "@/components/ui/page";
import { PaigeMark } from "@/components/brand/PaigeMark";
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
  const [params, setParams] = useSearchParams();

  // The gallery filter lives in the URL (?view=) so the Studio left rail is the single source of
  // truth for the active view — the rail's links and the on-page chips stay in sync.
  const view: StudioSessionView = (() => {
    const v = params.get("view");
    return v === "mine" || v === "starred" || v === "templates" ? v : "recent";
  })();
  const setView = (v: StudioSessionView) => {
    const p = new URLSearchParams(params);
    p.set("view", v);
    setParams(p, { replace: true });
  };
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
      <div className="grid h-full min-h-0 place-items-center px-4">
        <div className="flex flex-col items-center gap-3 text-center">
          <Loader2 className="h-6 w-6 animate-spin text-primary motion-reduce:animate-none" aria-hidden />
          <p className="text-sm text-muted-foreground">Opening your project…</p>
        </div>
      </div>
    );
  }

  const isTemplates = view === "templates";

  // StudioLayout owns the immersive frame (its own left rail); the home returns a scrollable
  // dashboard body: a vibrant gradient hero with the centered composer, then the projects.
  return (
    // Plain BLOCK scroll container (not a flex column — a flex column shrinks its children to fit
    // and the hero's overflow-hidden then clips the composer, which read as "frozen, no scroll").
    // As a block, the hero + gallery keep their natural height and the page scrolls normally.
    <div className="h-full min-h-0 overflow-y-auto">
      {/* ── COSMIC hero: the centered composer floating in a deep night-sky field. The composer
          sits in a theme-aware glass card so PromptComposer's app-token text stays AA (§11). */}
      <section className="studio-hero relative overflow-hidden px-4 py-12 md:py-16">
        {/* Decorative cosmic layers, back → front. All aria-hidden + pointer-events-none,
            motion-safe (frozen under prefers-reduced-motion). */}
        <div aria-hidden className="studio-stars" />
        <div aria-hidden className="studio-nebula" />
        <div aria-hidden className="studio-orbit" />

        {/* Soft scrim behind the text cluster — deepens the field under the fixed-white copy. */}
        <div
          aria-hidden
          className="pointer-events-none absolute left-1/2 top-1/2 z-0 h-[360px] w-[min(48rem,92%)] -translate-x-1/2 -translate-y-1/2 rounded-[999px] blur-3xl"
          style={{ background: "radial-gradient(closest-side, hsl(var(--studio-scrim) / 0.6), transparent)" }}
        />

        <div className="relative z-[1] mx-auto w-full max-w-2xl">
          <div className="mb-7 flex flex-col items-center gap-3 text-center">
            <span className="studio-mark-halo inline-flex">
              <PaigeMark className="h-11 w-11" />
            </span>
            <span className="text-[11px] font-semibold uppercase tracking-[0.2em] text-white/85">
              Vibe Studio
            </span>
            <h1 className="studio-title-glow max-w-xl font-display text-4xl font-semibold leading-[1.08] text-white text-balance md:text-5xl">
              What do you want to build?
            </h1>
            <p className="max-w-lg text-sm text-white/80 md:text-base">
              Describe it in a sentence — Paige works out the shape and builds it with her team.
            </p>
          </div>
          <div className="studio-glass-card p-4">
            <PromptComposer
              mode="page"
              value={brief}
              onChange={setBrief}
              onSubmit={(value) => void startSession(value)}
              heading="Describe it in a sentence"
              placeholder="e.g. a webinar registration page for my Q3 masterclass, with an intake form and a thank-you."
              helperText="One sentence is enough to start — Paige asks for anything she needs, then builds it with her team."
              submitLabel="Start building"
              submitVariant="gold"
              busy={starting}
              busyLabel="Spinning up your session…"
              chips={STUDIO_HOME_CHIPS}
              minRows={3}
            />
          </div>
        </div>
      </section>

      {/* ── projects gallery — ONE grid, four filter VIEWS (mirrors the left rail). The anchor:
          the tenant's previous work, right under the hero. */}
      <div className="mx-auto w-full max-w-[90rem] space-y-4 px-4 py-8 md:px-8">
        <h2 className="font-display text-lg font-semibold tracking-tight text-foreground">
          Your projects
        </h2>
        <Toolbar>
          <div className="flex flex-wrap gap-1.5">
            {VIEWS.map((v) => (
              <FilterChip key={v.id} active={view === v.id} onClick={() => setView(v.id)}>
                {v.label}
              </FilterChip>
            ))}
          </div>
          {/* Blank-canvas start — a SECONDARY path to the same act. The hero composer's
              "Start building" is the one gold act on this surface (§11), so this stays outline. */}
          <Button variant="outline" onClick={() => void startSession()} disabled={starting}>
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
                  ? "Practice-ready starting points land here soon — for now, describe what you want above and Paige builds it from scratch."
                  : "Nothing here yet. Tell Paige what you want to make above, or start from a blank canvas."
              }
              action={
                !isTemplates ? (
                  <Button variant="outline" onClick={() => void startSession()} disabled={starting}>
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
    </div>
  );
}

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
import { motion, useReducedMotion } from "framer-motion";
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
import { cn } from "@/lib/utils";
import { PromptComposer } from "@/components/admin/studio/PromptComposer";
import { ProjectCard } from "@/components/admin/studio/ProjectCard";
import { useStudioSessions } from "@/components/admin/studio/useStudioSessions";
import {
  createStudioSession,
  ensureSessionForArtifact,
  isStudioError,
  loadKbSuggestionChips,
  uploadGrowthAsset,
} from "@/components/admin/studio/studio";
import { STUDIO_HOME_CHIPS } from "@/components/admin/studio/studio-copy";
import type { IntentChip, StudioSessionView } from "@/components/admin/studio/studio-types";
import type { GrowthAsset } from "@/lib/growth";
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
  // HOME-local attachment state — reference/deliverable files uploaded INSIDE the composer bar
  // and carried into the new session (§10/§13 — real Storage URLs via the one upload seam). Mirrors
  // StudioShell's own wiring so the framed builder dock and this bare HOME composer behave alike.
  const [attachments, setAttachments] = useState<GrowthAsset[]>([]);
  const [attachmentsBusy, setAttachmentsBusy] = useState(false);
  const { sessions, loading, error, toggleStar, rename, remove } = useStudioSessions(activeTenantId, view);

  // Upload picked file(s) through the single tenant-scoped seam (`uploadGrowthAsset`) and add each
  // returned asset (with its REAL public URL) as a removable chip in the composer dock. Per-file
  // try/catch so one bad file toasts without dropping the rest (§13 honest reporting).
  const handleFilesSelected = useCallback(
    async (files: File[]) => {
      if (!activeTenantId) {
        toast({
          title: "Pick a workspace first",
          description: "Choose a workspace up top, then attach files.",
          variant: "destructive",
        });
        return;
      }
      setAttachmentsBusy(true);
      try {
        for (const file of files) {
          try {
            const asset = await uploadGrowthAsset(activeTenantId, file);
            setAttachments((prev) => [...prev, asset]);
          } catch (err) {
            toast({
              title: "Couldn't attach that file",
              description: isStudioError(err) ? err.message : "Try a different file.",
              variant: "destructive",
            });
          }
        }
      } finally {
        setAttachmentsBusy(false);
      }
    },
    [activeTenantId, toast],
  );

  const handleRemoveAttachment = useCallback((index: number) => {
    setAttachments((prev) => prev.filter((_, i) => i !== index));
  }, []);

  // ── hero pointer parallax (§22 "the chrome is ALIVE") ────────────────────────────────
  // On pointer move over the hero, write the cursor position (normalized -1..1) into --px/--py on
  // the section; the decorative CSS layers each read them at their own depth and float toward the
  // cursor, giving the flat cosmic field real 3D parallax. rAF-throttled (one style write per frame,
  // transform-only), and — per the hard constraint — the whole subscription is GATED on
  // useReducedMotion: no listener at all when the viewer prefers reduced motion, so it rests on a
  // still frame. Mirrors PaigeScene's shared-`ptr` pointer-tracking pattern (§18: reuse, not reinvent).
  const heroRef = useRef<HTMLElement>(null);
  const reduce = useReducedMotion();
  useEffect(() => {
    if (reduce) return;
    const el = heroRef.current;
    if (!el) return;
    let raf = 0;
    let px = 0;
    let py = 0;
    const apply = () => {
      raf = 0;
      el.style.setProperty("--px", px.toFixed(3));
      el.style.setProperty("--py", py.toFixed(3));
    };
    const schedule = () => {
      if (!raf) raf = requestAnimationFrame(apply);
    };
    const onMove = (e: PointerEvent) => {
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) return;
      px = ((e.clientX - r.left) / r.width) * 2 - 1;
      py = ((e.clientY - r.top) / r.height) * 2 - 1;
      schedule();
    };
    const onLeave = () => {
      px = 0;
      py = 0;
      schedule();
    };
    el.addEventListener("pointermove", onMove, { passive: true });
    el.addEventListener("pointerleave", onLeave, { passive: true });
    return () => {
      el.removeEventListener("pointermove", onMove);
      el.removeEventListener("pointerleave", onLeave);
      if (raf) cancelAnimationFrame(raf);
    };
  }, [reduce]);

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

  // The brain's READ direction on the home composer (#310 Slice C): seed the starter chips from the
  // tenant's OWN knowledge base so building opens tuned to THEIR offers. Best-effort (§13) — any
  // problem leaves kbChips null and the composer falls back to the generic STUDIO_HOME_CHIPS.
  const [kbChips, setKbChips] = useState<IntentChip[] | null>(null);
  useEffect(() => {
    if (!activeTenantId) return;
    let live = true;
    loadKbSuggestionChips(activeTenantId)
      .then((chips) => {
        if (live) setKbChips(chips);
      })
      .catch(() => {
        if (live) setKbChips(null);
      });
    return () => {
      live = false;
    };
  }, [activeTenantId]);
  // Lead with the tenant's own KB suggestions, then top up with the generic set; cap at 5 so the
  // dock row stays compact (§11). Falls back to the static set whenever the KB has nothing to offer.
  const homeChips: IntentChip[] =
    kbChips && kbChips.length > 0 ? [...kbChips, ...STUDIO_HOME_CHIPS].slice(0, 5) : STUDIO_HOME_CHIPS;

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
        // `autostart` tells the builder this is ONE continuous act: the brief was already "sent"
        // here on Home, so the shell fires the build itself on arrival (Defect 1 — no second
        // submit). A blank-canvas start (no seed) carries the flag too, but the shell only fires
        // on a non-empty brief, so it just opens a clean composer.
        // Carry any HOME-uploaded attachments into the new session on nav state — exactly how the
        // brief already travels — so the autostart build (generateWholePage → draftPage) picks them
        // up on arrival. They're seeded into the shell's INITIAL state (render 0), before the build
        // fires, so no stale-closure timing risk.
        navigate(`/admin/studio/${session.id}`, { state: { brief: seed, autostart: true, attachments } });
      } catch (err) {
        toast({
          title: "Couldn't start a project",
          description: isStudioError(err) ? err.message : "Try again in a moment.",
          variant: "destructive",
        });
        setStarting(false);
      }
    },
    [activeTenantId, navigate, toast, attachments],
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
  // OWNER HERO CALL #1 (2026-07-18) — the full-viewport cosmic field is the FIRST-RUN moment; a
  // RETURNING tenant with projects gets a COMPACT composer band so "Your projects" peeks above the
  // fold on return (§11 above-the-fold). Empty/first-run keeps the full cinematic field (§22
  // composer-as-hero). Keyed on real data (sessions.length), so it only collapses once we KNOW
  // there's work below — no flash-then-shrink for a first-run tenant.
  // `|| loading` (the hook now starts loading=true) holds the compact band through the first fetch, so
  // a returning tenant never sees a full-height hero + false "no projects" flash before their work loads.
  const compactHero = sessions.length > 0 || loading;

  // StudioLayout owns the immersive frame (its own left rail); the home returns a scrollable
  // dashboard body: a vibrant gradient hero with the centered composer, then the projects.
  return (
    // Plain BLOCK scroll container (not a flex column — a flex column shrinks its children to fit
    // and the hero's overflow-hidden then clips the composer, which read as "frozen, no scroll").
    // As a block, the hero + gallery keep their natural height and the page scrolls normally.
    // bg = --studio-canvas: a real step DOWN from card-white (light) / a deep indigo room (dark) so
    // the gallery's cards LIFT off the page instead of white-on-near-white (#8 — light premium
    // through separation + elevation, never by darkening). The cosmic hero paints its own bg on top.
    <div className="h-full min-h-0 overflow-y-auto bg-[hsl(var(--studio-canvas))]">
      {/* ── COSMIC hero: the centered composer floating in a deep night-sky field. The composer
          sits in a theme-aware glass card so PromptComposer's app-token text stays AA (§11).
          min-h = the first screen MINUS the rail-footer block (owner 2026-07-17): the hero now
          fills down so its bottom edge — where the white "Your projects" panel begins — lines up
          with the rail's footer hairline that sits right above "Back to Paige" (StudioLayout footer:
          border-t + "Back to Paige" row + theme toggle ≈ 5.5rem from the viewport bottom). That both
          drops the projects line level with the sidebar AND opens the cosmic field so the comet has
          room to sweep. flex + justify-center re-centers the composer in the taller field so it
          stays balanced instead of clinging to the top. */}
      <section
        ref={heroRef}
        className={cn(
          "studio-hero relative flex flex-col justify-center overflow-hidden px-4",
          // The hero is ALWAYS the tall cinematic creative window — its bottom edge aligns with the
          // rail's footer hairline above "Back to Paige" (calc(100vh - 5.5rem) = viewport minus the
          // rail footer block), so the field and the rail run to the same line. It is NOT a slim
          // band: the shooting star / comet / aurora need real room to be seen and read (owner
          // 2026-07-19). Returning users get a slightly tighter vertical rhythm (leaner cluster,
          // subhead hidden), but the FIELD height is identical so the alignment never changes.
          // APPROVED-FROZEN (§28): do not shrink or re-align this without an explicit owner request.
          "min-h-[calc(100vh-5.5rem)]",
          compactHero ? "py-10 md:py-12" : "py-12 md:py-16",
        )}
      >
        {/* Decorative cosmic layers, back → front. All aria-hidden + pointer-events-none,
            motion-safe (frozen under prefers-reduced-motion) and pointer-parallaxed at their own
            depth via the section's --px/--py (see the hero handler above). */}
        <div aria-hidden className="studio-stars" />
        <div aria-hidden className="studio-nebula" />
        <div aria-hidden className="studio-shooting" />
        <div aria-hidden className="studio-orbit" />
        <div aria-hidden className="studio-comet" />

        {/* Soft scrim behind the text cluster — deepens the field under the fixed-white copy. */}
        <div
          aria-hidden
          className="pointer-events-none absolute left-1/2 top-1/2 z-0 h-[360px] w-[min(48rem,92%)] -translate-x-1/2 -translate-y-1/2 rounded-[999px] blur-3xl"
          style={{ background: "radial-gradient(closest-side, hsl(var(--studio-scrim) / 0.6), transparent)" }}
        />

        <div className="relative z-[1] mx-auto w-full max-w-2xl">
          {/* The text cluster tightens (and drops the subhead + shrinks the mark) in the compact
              band so the composer + "Your projects" sit close together on return. Colors read the
              theme-aware --studio-on-hero token (dark ink on the light field, white on the dark
              planetarium) so the hero flips with the toggle (§23), never hardcoded white. */}
          <div
            className={cn(
              "flex flex-col items-center text-center",
              compactHero ? "mb-3 gap-1.5" : "mb-7 gap-3",
            )}
          >
            <span className="studio-mark-halo inline-flex">
              <PaigeMark className={compactHero ? "h-9 w-9" : "h-11 w-11"} />
            </span>
            {/* Eyebrow: airier tracking + a dimmer on-hero ink so the H1 clearly outranks it (#2). */}
            <span className="text-[11px] font-semibold uppercase tracking-[0.28em] text-[hsl(var(--studio-on-hero)/0.7)]">
              Vibe Studio
            </span>
            {/* H1: at 44–48px Bricolage wants far tighter tracking than the blunt global -0.01em —
                override to a real display tightness so the hero reads crafted, not soft (#2). */}
            <h1
              className={cn(
                "studio-title-glow max-w-xl font-display font-semibold leading-[1.03] tracking-[-0.025em] text-[hsl(var(--studio-on-hero))] text-balance md:tracking-[-0.03em]",
                compactHero ? "text-3xl md:text-4xl" : "text-4xl md:text-5xl",
              )}
            >
              What do you want to build?
            </h1>
            {/* Subhead: a tuned measure (~2 lines) + relaxed leading + a step-back on-hero ink, so it
                supports the H1 instead of ribboning wide (#2). Hidden in the compact band. */}
            {!compactHero && (
              <p className="max-w-md text-[15px] leading-relaxed text-[hsl(var(--studio-on-hero)/0.72)] text-balance md:text-base">
                Describe it in a sentence — Paige works out the shape and builds it with her team.
              </p>
            )}
          </div>
          {/* The composer is deliberately COMPACT (owner: "why is this window so big"): the in-card
              heading and helper are GONE (the hero subhead above already carries the instruction), so
              what remains is exactly the act: example bubbles → a slim field → the gold ↑ send. The
              card follows the Studio theme (no forced `dark`) — see the block below. */}
          <motion.div
            className="mx-auto w-full max-w-xl"
            initial={reduce ? false : { opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ type: "spring", stiffness: 220, damping: 26, mass: 0.9 }}
          >
            {/* One tight command bar that IS the hero (§22): a slim, LONG horizontal bar as WIDE as
                the H1 "What do you want to build?" (max-w-xl, end-to-end symmetric), 1-row rest that
                WRAPS/grows as you type (owner: "slimmer and wider, not taller"). The card follows the
                Studio
                theme (no forced `dark`): in LIGHT it's a bright frosted glass panel with a WHITE input
                and dark text; in DARK a deep indigo glass — flipping unmistakably with the toggle
                (§311 (b)). The ONE gold on HOME is the circular ↑ send — the act moment (§11) — via
                sendShape="circle" + submitVariant="gold". A single refined hairline frames it (§311 (a),
                the studio-glass-card::before rim) and a soft indigo focus glow lives inside (§311 (c)).
                The neutral paperclip attach + removable chips render inside the same bar. */}
            <div className="studio-glass-card p-1">
              <PromptComposer
                mode="page"
                value={brief}
                onChange={setBrief}
                onSubmit={(value) => void startSession(value)}
                placeholder="e.g. a registration page for my Q3 masterclass, with an intake form…"
                helperText=""
                submitLabel="Start building"
                submitVariant="gold"
                sendShape="circle"
                surface="bare"
                busy={starting}
                busyLabel="Spinning up your session…"
                chips={homeChips}
                chipPlacement="dock"
                minRows={1}
                attachments={attachments}
                onFilesSelected={(files) => void handleFilesSelected(files)}
                onRemoveAttachment={handleRemoveAttachment}
                attachmentsBusy={attachmentsBusy}
              />
            </div>
          </motion.div>
        </div>
      </section>

      {/* ── projects gallery — ONE grid, four filter VIEWS (mirrors the left rail). The anchor:
          the tenant's previous work, right under the hero. */}
      <div className="mx-auto w-full max-w-[90rem] space-y-4 px-4 py-8 md:px-8">
        {/* Section header scaled UP with a count subline so it clearly outranks the 14px card
            titles below it — a real display → subhead → card-title → meta ladder (#2). */}
        <div>
          <h2 className="font-display text-xl font-semibold tracking-[-0.012em] text-foreground">
            Your projects
          </h2>
          {!loading && !error && (
            <p className="mt-0.5 text-xs text-muted-foreground">
              {isTemplates
                ? `${sessions.length} ${sessions.length === 1 ? "template" : "templates"}`
                : `${sessions.length} ${sessions.length === 1 ? "project" : "projects"}`}
            </p>
          )}
        </div>
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
            className="grid grid-cols-[repeat(auto-fill,minmax(min(100%,16rem),1fr))] gap-4"
            aria-hidden
          >
            {Array.from({ length: 8 }).map((_, i) => (
              <li
                key={i}
                className="h-[248px] animate-pulse rounded-[var(--radius)] border border-[hsl(var(--studio-chrome-border)/0.5)] bg-card shadow-[0_1px_2px_hsl(var(--shadow-ink)/0.05),0_5px_16px_-6px_hsl(var(--shadow-ink)/0.12)] motion-reduce:animate-none"
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
          // A parent stagger (spring, motion-safe) so the grid resolves as ONE continuous act, not
          // N independent fades (§22 transitions). Each ProjectCard is a variant child (hidden→show);
          // under reduced motion the container drops the stagger and the children rest at show (#6).
          <motion.ul
            className="grid grid-cols-[repeat(auto-fill,minmax(min(100%,16rem),1fr))] gap-4"
            variants={{
              hidden: {},
              show: { transition: { staggerChildren: reduce ? 0 : 0.045 } },
            }}
            initial="hidden"
            animate="show"
          >
            {sessions.map((s) => (
              <ProjectCard
                key={s.id}
                session={s}
                isTemplate={isTemplates}
                onOpen={() =>
                  isTemplates ? void startSession(s.seedBrief ?? undefined) : navigate(`/admin/studio/${s.id}`)
                }
                onToggleStar={() => toggleStar(s.id)}
                onRename={
                  isTemplates
                    ? undefined
                    : (title) =>
                        void rename(s.id, title).catch((err) =>
                          toast({
                            title: "Couldn't rename that project",
                            description: isStudioError(err) ? err.message : "Try again in a moment.",
                            variant: "destructive",
                          }),
                        )
                }
                onDelete={
                  isTemplates
                    ? undefined
                    : () =>
                        void remove(s.id).catch((err) =>
                          toast({
                            title: "Couldn't delete that project",
                            description: isStudioError(err) ? err.message : "Try again in a moment.",
                            variant: "destructive",
                          }),
                        )
                }
              />
            ))}
          </motion.ul>
        )}
      </div>
    </div>
  );
}

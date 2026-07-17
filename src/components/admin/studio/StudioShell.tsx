// The Studio — THE creation surface, one immersive workspace, five outputs.
//
// Dark chrome wrapping a light rendered canvas — the root carries the `dark` token scope,
// so every descendant re-resolves to the dark theme with ZERO hardcoded colors, while the
// LivePreview iframe clones document.documentElement's class (not this wrapper's), so the
// rendered page inside the frame stays in the app's theme + the page's own brand scope.
// Dark studio, light page — and the preview never lies about what publishes.
//
// One studio, five modes: Page (the original Vibe Studio machinery, verbatim), Funnel,
// Form, and the absorbed Content Studio pair — Copy and Image. Mode state is kept mounted
// for the session, so switching modes never eats work in progress.
//
// This is the ONLY file in the Studio that drives the page seam layer end-to-end. The
// mode components own their own narrow seams (content-draft, generate-image, the
// form/funnel functions in studio.ts) — every action here is also a function Paige can
// call headlessly (§10).
//
// GOLD (§11): one gold act per mode — the Publish trigger in the top bar (page), Publish
// funnel, Create form, the per-draft Save to library (copy) — plus the confirm inside
// PublishDialog. Image carries gold ONLY on its manual Save-to-library retry, and only
// when the server's own auto-file didn't happen (§13) — the ordinary path (auto-filed,
// confirmed by a real content_id) shows a plain success StatePill, no button to click.
// Not on Generate, not on Save, not on a chip, not on the selection outline (that's
// indigo `--ring`).
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Loader2, Send, Sparkles, Wand2 } from "lucide-react";
import { useTenantContext } from "@/hooks/useTenantContext";
import { useGeneratePage } from "@/hooks/useGeneratePage";
import { useToast } from "@/hooks/use-toast";
import type { GrowthBlock, GrowthFormSchema } from "@/lib/growth";
import { Button } from "@/components/ui/button";
import { EmptyState, PageShell, SectionCard } from "@/components/ui/page";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import { BuildProgress } from "./BuildProgress";
import { ClarifyingQuestions } from "./ClarifyingQuestions";
import { DeliveryEditor } from "./DeliveryEditor";
import { GenerationExperience } from "./GenerationExperience";
import { LivePreview } from "./LivePreview";
import { capturePageThumbnailBlob } from "./page-thumbnail";
import { PromptComposer } from "./PromptComposer";
import { PublishDialog, kebabSlug } from "./PublishDialog";
import { StudioTopBar } from "./StudioTopBar";
import { StudioRailHeading, StudioSplit } from "./StudioChrome";
import { useStudioImmersion } from "./StudioImmersion";
import { CopyMode } from "./modes/CopyMode";
import { ImageMode } from "./modes/ImageMode";
import { FormMode } from "./modes/FormMode";
import { FunnelFlow } from "./modes/FunnelFlow";
import { LibraryPanel } from "./modes/content-shared";
import {
  STUDIO_ERROR_COPY,
  buildFunnelFromDraft,
  classifyStudioIntent,
  composeBrief,
  draftFormSchema,
  draftFunnel,
  editBlocks,
  isFunnelPublishError,
  isStudioError,
  linkSessionArtifact,
  loadBrandFloor,
  loadPageDraft,
  loadSession,
  preflightPublish,
  publishFunnelCascade,
  publishPage,
  renameSessionArtifactRef,
  renameStudioSession,
  deriveProjectName,
  reviseBlock,
  savePageDraft,
  setSessionStatus,
  setSessionThumbnail,
  shouldClarify,
  uniqueGrowthPageSlug,
  uploadGrowthAsset,
  uploadPageThumbnail,
  type BuiltFunnel,
  type PublishPageResult,
} from "./studio";
import {
  clearPageDraftSnapshot,
  loadPageDraftSnapshot,
  savePageDraftSnapshot,
  studioDraftKey,
  type PageDraftSnapshot,
} from "./studio-draft";
import {
  BLOCK_LABELS,
  CLARIFYING_QUESTIONS,
  CLARIFYING_RAIL,
  INTENT_CHIPS,
  MODE_EMPTY,
  MODE_RAIL,
  QUESTIONNAIRE_FIELDS_QUESTION,
  QUESTIONNAIRE_FIELDS_QUESTION_ID,
} from "./studio-copy";
import {
  EMPTY_CLARIFYING,
  type ModeToolbarState,
  type StudioArtifactType,
  type StudioError,
  type StudioErrorCode,
  type StudioMode,
  type StudioSeoDraft,
  type StudioSessionMeta,
  type StudioState,
} from "./studio-types";

export interface StudioShellProps {
  /** Tenant scope. Falls back to the active tenant when omitted. */
  tenantId?: string;
  /** Tenant public web address — needed for the brand floor and for publish. */
  tenantSlug?: string;
  /** The owning authoring session (Slice 2). When present, the shell touches recency on mount,
   *  hydrates the session's primary artifact, seeds the brief from its durable seed_brief, and
   *  links each saved artifact back to it. Absent on the legacy ?pageId deep-link path. */
  sessionId?: string;
  /** The seed brief the HOME composer passed on navigation — a fast-path seed only; the durable
   *  brief is the session's own seed_brief, read from the row (blocking #4). */
  initialBrief?: string;
  /** The Home composer already "sent" this brief (Defect 1): fire the build ONCE on arrival —
   *  straight into runGenerate's brand/clarify gate — instead of waiting for a second submit.
   *  Only fires on a fresh (zero-artifact), non-restored session with a non-empty brief; a
   *  deep-link/resume never carries it, so a cold entry stays a normal single-submit. */
  autostart?: boolean;
  /** Open an existing page's DRAFT instead of a blank composer (page mode). */
  pageId?: string;
  /** Which output the workspace is building. The hub owns the ?mode= param. */
  mode?: StudioMode;
  onModeChange?: (mode: StudioMode) => void;
  /** Rendered inside a hub that already owns the masthead — suppress our own header. */
  embedded?: boolean;
  onPublished?: (result: PublishPageResult) => void;
  onSaved?: (page: { id: string; slug: string }) => void;
  /** A funnel shipped from funnel mode — the hub jumps to the Funnels library. */
  onFunnelCreated?: () => void;
  /** A form was created in form mode — the hub jumps to the Forms library. */
  onFormCreated?: () => void;
  /** The session's artifact manifest changed (link / rename). The shared active-session bundle
   *  (StudioLayout) passes its `applyMeta` here so the project navigator in the rail re-renders
   *  from the same row the stage just wrote — one source of truth, no split (Slice 1b). */
  onManifestChange?: (meta: StudioSessionMeta) => void;
  className?: string;
}

/** Generation lives in useGeneratePage (the abort path + the honest ticker belong together);
 *  the shell owns everything else in StudioState verbatim. */
type ShellState = Omit<StudioState, "generation">;

const EMPTY_SHELL: ShellState = {
  tenantId: null,
  tenantSlug: null,
  pageId: null,
  sessionId: null,
  artifacts: [],
  activeArtifactId: null,
  activeArtifactType: null,
  title: "",
  slug: "",
  slugTouched: false,
  status: "draft",
  blocks: [],
  theme: null,
  brandFloor: null,
  seo: null,
  formSchema: null,
  attachments: [],
  suggestedDeliveryAssetUrl: null,
  brief: "",
  composerValue: "",
  instruction: "",
  mode: "compose",
  clarifying: EMPTY_CLARIFYING,
  device: "desktop",
  selectedIndex: null,
  dirty: false,
  saving: false,
  publishing: false,
  editing: false,
  publishOpen: false,
  publishedUrl: null,
  error: null,
};

/** Anything the seam throws arrives here and leaves as a sentence the operator can act on.
 *  A raw error code, table name, or function name never reaches the screen (§11). */
function asStudioError(err: unknown, fallback: StudioErrorCode): StudioError {
  if (err && typeof err === "object" && "code" in err && "message" in err) {
    const e = err as StudioError;
    if (typeof e.message === "string" && e.message.length > 0) return e;
  }
  return { code: fallback, message: STUDIO_ERROR_COPY[fallback], recoverable: true };
}

/** The dark-chrome frame every state of the Studio renders inside — including the
 *  skeleton and the tenant gate, so the surface never flashes between shells.
 *
 *  Below lg this is a normal flowing block — the surrounding page scrolls, nothing here
 *  clips. At lg+ it becomes the fixed-height, self-contained workspace (StudioSplit's rail
 *  body / footer / canvas each own their own internal scroll) — `h-full`/`overflow-hidden`
 *  only apply there. Getting this backwards (unconditional `overflow-hidden`) is exactly
 *  what silently ate the composer's submit button once the textarea grew past the frame's
 *  resolved height, with no scrollbar anywhere to reach it — never repeat that. */
function StudioFrame({
  children,
  className,
  dark = true,
}: {
  children: ReactNode;
  className?: string;
  /** Studio-local only — never the platform's next-themes state (see StudioTopBar's doc
   *  comment). Defaults dark to match the look every prior version of this frame had; only
   *  the main authenticated session (where the toggle actually lives) ever passes `false`. */
  dark?: boolean;
}) {
  return (
    <div
      className={cn(
        dark && "dark",
        // shadow-xl is the single biggest "this is a serious workspace" cue this frame was
        // missing (§11) — the hairline border alone was doing 100% of the separation work
        // against whatever sits behind it. Softened to /60 now that the shadow, not the
        // border, carries the edge — full-strength border + full-strength shadow reads
        // busy, not premium (the same "carry it with one, not both" rule applies below).
        // The base slab is the committed indigo studio canvas (was platform bg-background, the
        // flat near-black/near-white that made the whole session read gray in both themes). Every
        // region inside (masthead, rail, dock, well) sits on this one deep-indigo field (§6/§11).
        "flex w-full flex-col rounded-xl border border-[hsl(var(--studio-chrome-border)/0.6)] bg-[hsl(var(--studio-canvas))] text-foreground shadow-xl lg:h-full lg:min-h-[620px] lg:overflow-hidden",
        className,
      )}
    >
      {children}
    </div>
  );
}

export function StudioShell({
  tenantId: tenantIdProp,
  tenantSlug: tenantSlugProp,
  sessionId,
  initialBrief,
  autostart = false,
  pageId: pageIdProp,
  mode = "page",
  onModeChange,
  embedded = false,
  onPublished,
  onSaved,
  onFunnelCreated,
  onFormCreated,
  onManifestChange,
  className,
}: StudioShellProps) {
  const { activeTenantId, activeTenant, loading: tenantLoading } = useTenantContext();
  const { toast } = useToast();
  const navigate = useNavigate();

  const tenantId = tenantIdProp ?? activeTenantId ?? null;
  const tenantSlug = tenantSlugProp ?? activeTenant?.slug ?? null;

  const [state, setState] = useState<ShellState>(EMPTY_SHELL);
  const { generation, isGenerating, generate, cancel, reset } = useGeneratePage(tenantId);

  // Studio-local dark/light — completely separate from the platform's own next-themes state
  // (there's no ThemeToggle in here anymore; see StudioTopBar's doc comment for why). This is
  // just a class on StudioFrame's own root div, read/written to its own localStorage key so a
  // choice survives a reload without ever touching <html>'s class or the platform's theme.
  // Defaults to DARK (owner call, 2026-07-17 — "a creative workspace is dark by definition"; the
  // light session shipped as a pale gray CRUD room). Light is now the explicit opt-in and stays
  // fully supported; only the no-preference default flipped from light → dark.
  const [studioDark, setStudioDark] = useState(() => {
    if (typeof window === "undefined") return true;
    return window.localStorage.getItem("paige-studio-theme") !== "light";
  });
  const toggleStudioTheme = useCallback(() => {
    setStudioDark((prev) => {
      const next = !prev;
      try {
        window.localStorage.setItem("paige-studio-theme", next ? "dark" : "light");
      } catch {
        // Storage can be unavailable (private browsing, quota) — the toggle still works for
        // the session, it just won't survive a reload. Not worth failing the click over.
      }
      return next;
    });
  }, []);

  // The Lovable/Replit "watch it build full-width" moment. FIRST build ONLY, and ONLY on the
  // page/funnel surface: gated on `isGenerating` (RUNNING_PHASES.has(generation.phase)) — NOT
  // state.mode==="generating", which stays stuck after a FAILED run (the error lives in
  // generation.phase, not state.mode) and would strand both rails retracted+inert forever (crew
  // catch). isGenerating clears the instant a run ends (done OR error), so the rails always slide
  // back. blocks.length===0 keeps a REGENERATE in the normal split; the (page|funnel) gate keeps a
  // Copy/Form/Image surface from ever retracting the rail with no immersive canvas showing. Reads
  // reactive state, never the non-reactive blocksBeforeRun ref. Published up to StudioLayout so the
  // OUTER project rail retracts too; the inner rail gets the same flag via StudioSplit below.
  const { setImmersive } = useStudioImmersion();
  // Mirrors a Copy/Image auto-run build in flight — extends firstBuildGenerating so BOTH rails
  // retract for the full-frame cutscene, exactly as the page path does on its first build.
  const [copyImageBuilding, setCopyImageBuilding] = useState(false);
  const firstBuildGenerating =
    (isGenerating && state.blocks.length === 0 && (mode === "page" || mode === "funnel")) ||
    // Copy/Image get the same full-frame moment while their autostart draft is in flight. Gated to
    // the active mode so a hidden mode's stale build flag can never retract the visible surface.
    (copyImageBuilding && (mode === "copy" || mode === "image"));
  useEffect(() => {
    setImmersive(firstBuildGenerating);
    // Clear on unmount so leaving a mid-build project never reopens the gallery with a hidden rail
    // (§13 — the UI never lies about state); the layout's !onProject effect is the extra backstop.
    return () => setImmersive(false);
  }, [firstBuildGenerating, setImmersive]);

  // Modes stay mounted once visited, so switching outputs never eats in-progress work.
  const [visited, setVisited] = useState<ReadonlySet<StudioMode>>(() => new Set([mode]));
  useEffect(() => {
    setVisited((prev) => (prev.has(mode) ? prev : new Set(prev).add(mode)));
  }, [mode]);

  // Form mode publishes its Save/act buttons into the top bar through here. (Funnel no longer
  // does — the AI funnel act is driven directly from the shell's funnel state, not a modeBar.)
  const [modeBars, setModeBars] = useState<Partial<Record<StudioMode, ModeToolbarState>>>({});
  const onFormToolbar = useCallback(
    (s: ModeToolbarState) => setModeBars((prev) => ({ ...prev, form: s })),
    [],
  );

  // The content library, one Sheet — the same LibraryPanel the Content Studio shipped.
  const [libraryOpen, setLibraryOpen] = useState(false);

  // ── Studio Phase 1 — the single entry point (§18) ─────────────────────────────────
  // `classifiedOnceRef` flips true the moment the FIRST brief this session is submitted from
  // the still-on-page-mode default composer, whatever it resolves to — every submission
  // after that (including a Regenerate) is already committed to a mode and never reclassified.
  const classifiedOnceRef = useRef(false);
  const [classifying, setClassifying] = useState(false);
  // Artifacts Paige already drafted from the classified brief, handed to the mode they
  // route into on its first mount. Null/undefined = that mode's own manual entry (a
  // template pick, a hand-typed brief) — never overwritten by a stale value from a
  // different session's classify run.
  const [draftedFormSchema, setDraftedFormSchema] = useState<GrowthFormSchema | null>(null);
  const [draftedCopyBrief, setDraftedCopyBrief] = useState<string | undefined>(undefined);
  const [draftedImagePrompt, setDraftedImagePrompt] = useState<string | undefined>(undefined);
  // Explicit auto-run flags (§18): true ONLY when the classify step routed a brief into Copy/Image,
  // so those modes fire their generation on mount for the "submit → cutscene → land with the result"
  // page-parity flow. Kept separate from the drafted-brief value so a future non-classifier caller of
  // initialBrief/initialPrompt never accidentally triggers a paid model call (§13).
  const [autoRunCopy, setAutoRunCopy] = useState(false);
  const [autoRunImage, setAutoRunImage] = useState(false);

  // ── AI funnel (§18/§19) — lives IN the page surface, never a separate tab ──────────
  // A funnel classified from the one composer is drafted + persisted into real rows and
  // rendered right here (FunnelFlow in the page canvas), refined by the same composer, and
  // shipped by the top bar's gold act. `funnel` holds the built funnel; null = ordinary page.
  const [funnel, setFunnel] = useState<BuiltFunnel | null>(null);
  const [funnelBuilding, setFunnelBuilding] = useState(false);
  const [funnelPublishing, setFunnelPublishing] = useState(false);
  const [funnelUrl, setFunnelUrl] = useState<string | null>(null);
  // The session committed to building a funnel — set when the classifier says "funnel" OR when
  // the operator entered via the funnel intent (mode="funnel"). Load-bearing on RETRY: if a
  // funnel build fails (funnel stays null), a resubmit must rebuild a FUNNEL, never silently
  // fall through to runGenerate and build a lone page (§13/§18).
  const funnelIntendedRef = useRef(mode === "funnel");
  // Entering the funnel intent (e.g. the Funnels library's "New funnel" flips the URL to
  // mode="funnel" after mount) must arm the ref too, so the very first brief — and any retry
  // after a failed build — routes to buildFunnel, never a lone page (§18).
  useEffect(() => {
    if (mode === "funnel") funnelIntendedRef.current = true;
  }, [mode]);

  // The blocks we hold when a run starts — restored verbatim if the operator stops it, so a
  // cancelled run never leaves a half-painted canvas.
  const blocksBeforeRun = useRef<GrowthBlock[]>([]);

  const patch = useCallback((next: Partial<ShellState>) => setState((s) => ({ ...s, ...next })), []);

  // ── session (Slice 2) ───────────────────────────────────────────────────────────────
  // A loadSession that throws NOT_FOUND is a hard stop (§11): the operator opened a session id
  // that isn't in their workspace. We render the operator-safe "couldn't find that project"
  // gate, never a raw code.
  const [sessionNotFound, setSessionNotFound] = useState(false);
  // True until the session's FIRST artifact is linked — the save that flips it names the project
  // from the real artifact. A resumed session that already has artifacts starts false.
  const firstLinkRef = useRef(true);
  // True once this session has been auto-named (#294) — from the first generation's real title,
  // so the rail + gallery never show "Untitled" while there's real content. A resumed session that
  // already has artifacts is an established, likely-already-named project; it starts true so a
  // regeneration never silently overwrites a name the operator (or the first build) already set.
  const autoNamedRef = useRef(false);

  // ── gallery thumbnail capture (#295) ────────────────────────────────────────────────
  // The settled LivePreview <body> lives here (fed by its onFrameSettled) so the capture reads
  // the pixel-accurate, styled render — never an unstyled early frame. The timer defers capture
  // past the final layout/font settle and is cleared on unmount so a late fire can't touch a
  // torn-down frame.
  const settledFrameBodyRef = useRef<HTMLElement | null>(null);
  const thumbnailTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Set on a successful build; consumed the moment the fresh canvas frame SETTLES, so capture is
  // driven by the real "styles are in" edge (§13) instead of racing a fixed delay in prod.
  const thumbnailPendingRef = useRef(false);

  /** Snapshot the settled preview → upload → set the project cover → reflect it in the rail/
   *  gallery via onManifestChange (§10/§19). Fully best-effort (§13): any miss leaves
   *  thumbnail_url null and ProjectCard keeps its glyph — it never stores a blank as a preview. */
  const capturePageThumbnail = useCallback(async () => {
    if (!tenantId || !sessionId) return;
    const body = settledFrameBodyRef.current;
    if (!body?.isConnected) return;
    try {
      const blob = await capturePageThumbnailBlob(body);
      if (!blob) return; // capture failed → keep the glyph
      const url = await uploadPageThumbnail(tenantId, sessionId, blob);
      if (!url) return; // upload failed → keep the glyph
      const meta = await setSessionThumbnail({ tenantId, sessionId, thumbnailUrl: url });
      onManifestChange?.(meta);
    } catch (err) {
      console.warn("[studio] page thumbnail persist failed (non-fatal):", err);
    }
  }, [tenantId, sessionId, onManifestChange]);

  /** Defer a capture past the final block/font/image settle (LivePreview re-measures at ~400ms;
   *  we wait a touch longer). Coalesces rapid regenerations to a single trailing snapshot. */
  const scheduleThumbnailCapture = useCallback(() => {
    if (thumbnailTimerRef.current) clearTimeout(thumbnailTimerRef.current);
    thumbnailTimerRef.current = setTimeout(() => {
      thumbnailTimerRef.current = null;
      void capturePageThumbnail();
    }, 700);
  }, [capturePageThumbnail]);

  useEffect(
    () => () => {
      if (thumbnailTimerRef.current) clearTimeout(thumbnailTimerRef.current);
    },
    [],
  );

  /** LivePreview's settled-body signal. Stashes the body for the capture, and — if a build just
   *  finished — arms the deferred snapshot on this exact "styles are in" edge. Gating on the
   *  pending flag keeps ordinary reloads/device toggles from re-snapshotting. */
  const handleFrameSettled = useCallback(
    (body: HTMLElement | null) => {
      settledFrameBodyRef.current = body;
      if (body && thumbnailPendingRef.current) {
        thumbnailPendingRef.current = false;
        scheduleThumbnailCapture();
      }
    },
    [scheduleThumbnailCapture],
  );

  /** Attach a saved artifact to the owning session and reflect it in state (§10/§19). Best-effort
   *  and non-fatal: a link hiccup must never fail the save the operator just performed (§13). On
   *  the FIRST link it also titles the project from the real artifact. */
  const linkPrimaryArtifact = useCallback(
    async (artifactType: StudioArtifactType, artifactId: string, title?: string) => {
      if (!tenantId || !sessionId || !artifactId) return;
      const isFirst = firstLinkRef.current;
      firstLinkRef.current = false;
      try {
        const meta = await linkSessionArtifact({ tenantId, sessionId, artifactType, artifactId });
        let latest = meta;
        const cleanTitle = (title ?? "").trim();
        // Keep the project-local chip label in sync with the artifact's real title. link is
        // idempotent and only titles a ref on FIRST insert, so a ref that pre-existed with a
        // stale label — e.g. an "Add a page" mint titled "Untitled page" the operator has since
        // named on save, or a page renamed across saves — would otherwise show the old label.
        if (cleanTitle) {
          const ref = latest.artifacts.find((a) => a.id === artifactId);
          if (ref && ref.title !== cleanTitle) {
            try {
              latest = await renameSessionArtifactRef({
                tenantId,
                sessionId,
                kind: ref.kind,
                artifactId,
                label: cleanTitle,
              });
            } catch (err) {
              console.warn("[studio] artifact ref label sync failed (non-fatal):", err);
            }
          }
        }
        setState((s) => ({
          ...s,
          artifacts: latest.artifacts,
          activeArtifactId: artifactId,
          activeArtifactType: artifactType,
        }));
        // Push the fresh manifest to the shared bundle so the rail's project navigator re-renders
        // with the new piece the instant it's linked (no refetch, no split source of truth).
        onManifestChange?.(latest);
        if (isFirst && cleanTitle) {
          try {
            const renamed = await renameStudioSession({ tenantId, sessionId, title: cleanTitle });
            onManifestChange?.(renamed);
          } catch (err) {
            console.warn("[studio] rename-on-first-save failed (non-fatal):", err);
          }
        }
      } catch (err) {
        // Don't undo the first-link flag on failure — a later save retries the link anyway, and
        // re-titling on a much later save would be surprising. Just log; the artifact is saved.
        console.warn("[studio] linkSessionArtifact failed (non-fatal):", err);
      }
    },
    [tenantId, sessionId, onManifestChange],
  );

  // Every non-page mode attaches its saved artifact to the owning project too, so ALL five
  // types land in the manifest — the project navigator shows the whole project, not just its
  // pages and funnels (§19: no artifact type is a second-class citizen). Each is best-effort
  // and non-fatal, same as the page/funnel path; the original per-mode "created" hooks (which
  // the embedded Campaigns hub used to jump libraries) still fire underneath.
  const handleFormCreated = useCallback(
    (created?: { id: string; title: string }) => {
      if (created?.id) void linkPrimaryArtifact("form", created.id, created.title);
      onFormCreated?.();
    },
    [linkPrimaryArtifact, onFormCreated],
  );
  const handleCopySaved = useCallback(
    (saved: { id: string; title: string }) => void linkPrimaryArtifact("copy", saved.id, saved.title),
    [linkPrimaryArtifact],
  );
  const handleImageSaved = useCallback(
    (saved: { id: string; title: string }) => void linkPrimaryArtifact("image", saved.id, saved.title),
    [linkPrimaryArtifact],
  );

  // ── scope ─────────────────────────────────────────────────────────────────────────
  useEffect(() => {
    patch({ tenantId, tenantSlug });
  }, [tenantId, tenantSlug, patch]);

  // ── the brand floor: resolved ONCE per tenant, by the SAME construction the published
  //    page uses. A brand miss is not a failure — the resolver floors it. ────────────────
  useEffect(() => {
    if (!tenantSlug) return;
    let live = true;
    loadBrandFloor(tenantSlug)
      .then((floor) => {
        if (live) patch({ brandFloor: floor });
      })
      .catch(() => {
        /* the floor is the fallback — a brand miss must never block the canvas */
      });
    return () => {
      live = false;
    };
  }, [tenantSlug, patch]);

  // ── recover an in-progress client-side draft (no DB write) ────────────────────────
  // Restores brief/blocks/theme/seo/formSchema (plus the composer/canvas state around
  // them) from localStorage before anything else falls back to EMPTY_SHELL — this is the
  // fix for "navigate away and the in-progress build vanishes with zero warning." Tenant-
  // AND page-scoped (§9): the key always carries tenantId, and a page that already has a
  // DB row gets its own key distinct from the tenant's blank-composer slot, so opening a
  // different page can never resurrect a stray draft written against a different one.
  const draftRestoreRef = useRef<{ key: string | null; applied: boolean }>({ key: null, applied: false });
  useEffect(() => {
    if (!tenantId) return;
    // Session-scoped when the builder is opened FOR a session (Slice 2), else page-scoped for
    // the legacy ?pageId path (behavior unchanged there).
    const key = studioDraftKey(tenantId, sessionId ?? null, pageIdProp ?? null);
    if (draftRestoreRef.current.key === key) return; // already resolved this exact draft once
    const snapshot = loadPageDraftSnapshot(key);
    draftRestoreRef.current = { key, applied: !!snapshot };
    if (!snapshot) return;
    setState((s) => ({
      ...s,
      pageId: snapshot.pageId,
      // Session scope (Slice 2) — prefer the live sessionId prop; fall back to whatever the
      // snapshot carried so an older, pre-session snapshot still restores cleanly.
      sessionId: sessionId ?? snapshot.sessionId ?? s.sessionId,
      artifacts: snapshot.artifacts ?? s.artifacts,
      activeArtifactId: snapshot.activeArtifactId ?? s.activeArtifactId,
      activeArtifactType: snapshot.activeArtifactType ?? s.activeArtifactType,
      title: snapshot.title,
      slug: snapshot.slug,
      slugTouched: snapshot.slugTouched,
      blocks: snapshot.blocks,
      theme: snapshot.theme,
      seo: snapshot.seo,
      formSchema: snapshot.formSchema,
      brief: snapshot.brief,
      composerValue: snapshot.composerValue ?? "",
      mode: snapshot.mode,
      clarifying: snapshot.clarifying,
      selectedIndex: snapshot.selectedIndex,
      // Recovered content hasn't been confirmed by a real Save from this mount's point of
      // view — mark it dirty so the top bar's Save affordance reads honestly, not silently.
      dirty: true,
      error: null,
    }));
    // A restored snapshot with artifacts already reflects a session past its first save — don't
    // re-title on the next link.
    if ((snapshot.artifacts?.length ?? 0) > 0) {
      firstLinkRef.current = false;
      autoNamedRef.current = true;
    }
    toast({
      title: "Draft restored",
      description: "Picked up right where you left off — hit Save to make it permanent.",
    });
  }, [tenantId, sessionId, pageIdProp, toast]);

  // ── open an existing draft ────────────────────────────────────────────────────────
  useEffect(() => {
    if (!tenantId || !pageIdProp) return;
    // A local client-side draft for this EXACT page was just restored above — it already
    // reflects everything the DB has, plus whatever wasn't saved yet, so re-fetching here
    // would clobber unsaved edits with the older saved row (the very bug this mechanism
    // exists to close).
    if (
      draftRestoreRef.current.key === studioDraftKey(tenantId, sessionId ?? null, pageIdProp) &&
      draftRestoreRef.current.applied
    ) {
      return;
    }
    let live = true;
    loadPageDraft({ tenantId, pageId: pageIdProp })
      .then((page) => {
        if (!live) return;
        patch({
          pageId: page.id,
          title: page.title,
          slug: page.slug,
          slugTouched: true,
          status: page.status,
          blocks: page.blocks,
          theme: page.theme,
          seo: page.seo,
          formSchema: null,
          mode: page.blocks.length > 0 ? "canvas" : "compose",
          clarifying: EMPTY_CLARIFYING,
          dirty: false,
          publishedUrl: null,
          error: null,
        });
      })
      .catch((err) => {
        if (live) patch({ error: asStudioError(err, "NOT_FOUND") });
      });
    return () => {
      live = false;
    };
  }, [tenantId, sessionId, pageIdProp, patch]);

  // ── open a SESSION (Slice 2) ──────────────────────────────────────────────────────
  // Sits ALONGSIDE the pageId-open effect above (which stays for the legacy ?pageId deep-link).
  // On mount with a sessionId: loadSession stamps recency (§10) and hydrates the primary page
  // artifact (delegating to loadPageDraft). A zero-artifact session seeds the composer brief from
  // the DURABLE seed_brief (blocking #4), never from ephemeral router state alone. A restored
  // local snapshot for this session ran first, so unsaved work WINS over the DB row — we still
  // adopt the session identity + manifest, but never clobber restored content.
  const sessionLoadRef = useRef<string | null>(null);
  // Bridge to handleBriefSubmit for the autostart fire (Defect 1). MUST be handleBriefSubmit, NOT
  // runGenerate: handleBriefSubmit is the ONE entry that runs classifyStudioIntent, so the Home
  // brief decides its own shape (page/funnel/form/copy/image) exactly like a manual first submit
  // (§18/§19). Firing runGenerate directly would hardwire every Home build to a lone page.
  // handleBriefSubmit is declared LATER, so the session-load effect can't take it as a dependency
  // without a TDZ at the deps-array eval. A ref kept pointed at the live callback (synced in an
  // effect below, after handleBriefSubmit exists) lets the async loadSession .then() invoke the
  // current one — the same indirection latestDraftWriteRef already uses for the unmount flush.
  const briefSubmitRef = useRef<(brief: string) => void>(() => {});
  // Guards the autostart fire to EXACTLY ONCE per session (R1) — mirrors sessionLoadRef/
  // autoNamedRef. Claimed (set to the sessionId) BEFORE firing, so a re-entered effect (a dep
  // change, StrictMode's setup→cleanup→setup) can never fire runGenerate a second time.
  const autostartRef = useRef<string | null>(null);
  useEffect(() => {
    if (!tenantId || !sessionId) return;
    if (sessionLoadRef.current === sessionId) return; // resolved this session once
    sessionLoadRef.current = sessionId;
    setSessionNotFound(false);

    const key = studioDraftKey(tenantId, sessionId, null);
    const restored = draftRestoreRef.current.key === key && draftRestoreRef.current.applied;
    // Seed the brief instantly from the navigation state so the composer isn't blank for a beat
    // (loadSession then confirms it from the durable seed_brief). Skipped on autostart: the brief
    // is a SENT turn, not text waiting to be sent — the box stays empty while the build fires.
    if (initialBrief && !restored && !autostart) patch({ composerValue: initialBrief });

    let live = true;
    loadSession({ tenantId, sessionId })
      .then((loaded) => {
        if (!live) return;
        firstLinkRef.current = loaded.artifacts.length === 0;
        // An established session (already has artifacts) is already named — don't re-title it on a
        // later regeneration. A fresh/empty resumed session may still auto-name on its first build.
        autoNamedRef.current = loaded.artifacts.length > 0;

        // Autostart decision (Defect 1). A fresh session opened WITH build intent from Home fires
        // the build ONCE, straight into runGenerate's brand/clarify gate. Computed OUTSIDE the
        // setState updater (updaters must stay pure — StrictMode double-invokes them) and gated so
        // it never fires over: a restored snapshot (R4), a built page (R5 has a primary), a
        // non-page-primary session (R5 — artifacts present), an empty brief / cold deep-link (R6),
        // or a second time for the same session (R1, autostartRef).
        const isZeroArtifact = !loaded.primary && loaded.artifacts.length === 0;
        const autostartSeed = (loaded.session.seedBrief ?? initialBrief ?? "").trim();
        const willAutostart =
          autostart &&
          !restored &&
          isZeroArtifact &&
          autostartSeed.length > 0 &&
          autostartRef.current !== sessionId;

        setState((s) => {
          // Always adopt the session's identity + manifest.
          const base: ShellState = { ...s, sessionId, artifacts: loaded.artifacts };
          // Unsaved local work already restored — keep it; just carry the session scope.
          if (restored) return base;
          if (loaded.primary) {
            return {
              ...base,
              pageId: loaded.primary.id,
              activeArtifactId: loaded.primary.id,
              activeArtifactType: loaded.primaryType,
              title: loaded.primary.title,
              slug: loaded.primary.slug,
              slugTouched: true,
              status: loaded.primary.status,
              blocks: loaded.primary.blocks,
              theme: loaded.primary.theme,
              seo: loaded.primary.seo,
              mode: loaded.primary.blocks.length > 0 ? "canvas" : "compose",
              dirty: false,
              // A RETURN to an already-built project opens a CLEAN composer — the old brief never
              // sticks in the box (owner: "no sticky words"). `brief` is left as `base`'s "" here;
              // Rebuild stays disabled until a fresh brief is submitted, which is correct.
              composerValue: "",
              publishedUrl: null,
              error: null,
            };
          }
          // Zero-artifact (fresh) session. On autostart the brief becomes a SENT turn (fired just
          // below) — keep the box empty for the cutscene. Otherwise seed the LIVE composer from the
          // navigation brief only; the DURABLE seed_brief is deliberately NOT a fallback here
          // (Defect 2), so a resume — where initialBrief is undefined — shows a clean box for EVERY
          // artifact type, not the old sticky prompt. Rebuild reads `brief`, written by runGenerate.
          return {
            ...base,
            composerValue: willAutostart ? "" : s.composerValue || initialBrief || "",
            mode: "compose",
            error: null,
          };
        });

        // Fire OUTSIDE the updater, once. Claim the guard BEFORE firing (R1) so nothing re-fires.
        // Routes through handleBriefSubmit → classifyStudioIntent, so the Home brief builds the
        // RIGHT artifact type (§18/§19), not a forced page.
        if (willAutostart) {
          autostartRef.current = sessionId;
          briefSubmitRef.current(loaded.session.seedBrief ?? initialBrief ?? "");
        }
      })
      .catch((err) => {
        if (!live) return;
        if (isStudioError(err) && err.code === "NOT_FOUND") {
          setSessionNotFound(true);
        } else {
          patch({ error: asStudioError(err, "NOT_FOUND") });
        }
      });
    return () => {
      live = false;
    };
  }, [tenantId, sessionId, initialBrief, autostart, patch]);

  // ── derived ───────────────────────────────────────────────────────────────────────
  const canvasBlocks = state.mode === "generating" ? generation.emitted : state.blocks;

  const selectedBlock =
    state.selectedIndex != null ? state.blocks[state.selectedIndex] ?? null : null;

  const target = selectedBlock
    ? {
        index: state.selectedIndex as number,
        blockType: selectedBlock.type,
        label: BLOCK_LABELS[selectedBlock.type],
      }
    : null;

  // The CURRENT page's own signup form, if this brief has one — DeliveryEditor needs its slug
  // to look up the (already auto-authored, on first save) growth_forms row.
  const embeddedFormSlug = useMemo(() => {
    const block = state.blocks.find(
      (b): b is Extract<GrowthBlock, { type: "embedded_form" }> => b.type === "embedded_form",
    );
    return block?.form_slug ?? null;
  }, [state.blocks]);

  const checks = useMemo(
    () =>
      preflightPublish({
        blocks: state.blocks,
        seo: state.seo,
        slug: state.slug,
        tenantSlug,
      }),
    [state.blocks, state.seo, state.slug, tenantSlug],
  );

  // ── the mode-tab strip (§18) — never an upfront 5-way picker ───────────────────────
  // `visited` (above) only proves a mode was MOUNTED, not that anything real lives there —
  // a fresh session mounts "page" the instant StudioShell renders, before the operator has
  // typed a word. The tab strip needs a STRICTER signal: does this mode actually hold an
  // §21 (owner 2026-07-17): there is NO artifact-type strip in the top bar — not an upfront
  // picker, and not a content-derived "switch what you built" tab row either. Everything a tenant
  // makes streams in this ONE session; the persistent navigator is the project rail
  // (ProjectNavigator), which lists artifacts by name. So the shell no longer computes a
  // per-type "visibleModes" set — the classifier still routes the brief to the right surface, but
  // the human never sees or clicks a type. See StudioTopBar.tsx for the matching removal.

  const setTitle = useCallback((title: string) => {
    setState((s) => ({
      ...s,
      title,
      slug: s.slugTouched ? s.slug : kebabSlug(title),
      dirty: true,
    }));
  }, []);

  const setSlug = useCallback((slug: string) => {
    setState((s) => ({ ...s, slug, slugTouched: true, dirty: true }));
  }, []);

  // ── reference/deliverable attachments (§10/§13) ────────────────────────────────────
  // Real uploads, tenant-scoped, real permanent URLs — never a File held only in memory.
  // The upload itself goes through studio.ts (the one file that touches Supabase); this is
  // just the shell absorbing the result into state, same discipline as every other action here.
  const [attachmentsBusy, setAttachmentsBusy] = useState(false);

  const handleFilesSelected = useCallback(
    async (files: File[]) => {
      if (!tenantId) {
        toast({ title: "Pick a workspace first", description: STUDIO_ERROR_COPY.NO_TENANT, variant: "destructive" });
        return;
      }
      setAttachmentsBusy(true);
      try {
        for (const file of files) {
          try {
            const asset = await uploadGrowthAsset(tenantId, file);
            setState((s) => ({ ...s, attachments: [...s.attachments, asset] }));
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
    [tenantId, toast],
  );

  const handleRemoveAttachment = useCallback((index: number) => {
    setState((s) => ({ ...s, attachments: s.attachments.filter((_, i) => i !== index) }));
  }, []);

  // ── generate (whole page) ─────────────────────────────────────────────────────────
  // The actual run: capture the pre-run blocks (for a clean cancel), flip to "generating",
  // call the seam, absorb the result. Shared by both the direct path (gate said "skip it")
  // and the clarifying rail's own submit — one generate call site, no fork.
  const generateWholePage = useCallback(
    async (compiledBrief: string, questionnaireAnswer?: string) => {
      blocksBeforeRun.current = state.blocks;
      const attachmentsForCall = state.attachments;
      setState((s) => ({
        ...s,
        mode: "generating",
        selectedIndex: null,
        instruction: "",
        error: null,
        publishedUrl: null,
      }));

      const result = await generate({
        brief: compiledBrief,
        questionnaireAnswer,
        attachments: attachmentsForCall.map((a) => ({ url: a.url, mediaType: a.mimeType, kind: a.kind })),
      });
      // A failure stays on the canvas and narrates itself inside GenerationExperience (with
      // a Retry). A cancel is handled by handleCancel, which restores the previous blocks.
      if (!result) return;

      const seo: StudioSeoDraft = result.seo ?? {};
      // Resolve the model's suggested_delivery index back to a REAL uploaded asset URL —
      // purely a proposal DeliveryEditor surfaces (§15); nothing here writes to a form.
      const suggestedUrl =
        result.suggestedDelivery != null
          ? attachmentsForCall[result.suggestedDelivery.assetIndex]?.url ?? null
          : null;
      setState((s) => ({
        ...s,
        blocks: result.blocks,
        theme: result.theme,
        seo,
        formSchema: result.formSchema ?? null,
        suggestedDeliveryAssetUrl: suggestedUrl,
        title: seo.title ?? s.title,
        slug: s.slugTouched ? s.slug : kebabSlug(seo.title ?? s.title),
        mode: "canvas",
        dirty: true,
        error: null,
      }));
      reset();

      // Auto-name the project the instant it has real content (#294) — best-effort, once per
      // session. Named from the generated page's own title (falling back to the brief) via the
      // same rename seam first-save uses, so the rail + gallery stop showing "Untitled" without
      // waiting for a save. Non-fatal: a rename failure never blocks the canvas.
      if (tenantId && sessionId && !autoNamedRef.current) {
        const derived = deriveProjectName(seo.title, compiledBrief);
        if (derived) {
          // Claim BOTH naming flags synchronously, BEFORE awaiting the rename — otherwise a save
          // landing during the RPC round trip sees firstLinkRef still true and fires a SECOND,
          // competing rename that races this one (and could disagree on a long title). Both are
          // restored on failure so a later build (or the first save) can reclaim the naming.
          autoNamedRef.current = true;
          firstLinkRef.current = false;
          void renameStudioSession({ tenantId, sessionId, title: derived })
            .then((renamed) => onManifestChange?.(renamed))
            .catch((err) => {
              autoNamedRef.current = false; // let a later build retry the name
              firstLinkRef.current = true; // and let the first save reclaim the naming
              console.warn("[studio] auto-name on first generate failed (non-fatal):", err);
            });
        }
      }

      // Capture a real gallery cover of the freshly-built page (#295): arm it now, let the
      // canvas frame's settle edge fire it (handleFrameSettled). Best-effort, page-only (this is
      // the whole-page path), never blocks the canvas (§13). If a build somehow yields zero
      // blocks (no LivePreview mounts, no settle edge), the flag simply stays armed and the next
      // successful build captures its own page — harmless, self-correcting.
      if (tenantId && sessionId) thumbnailPendingRef.current = true;
    },
    [state.blocks, state.attachments, generate, reset, tenantId, sessionId, onManifestChange],
  );

  // ── the clarifying gate (§15) — a thin or questionnaire-signaling brief is grounded in a
  //    few real specifics BEFORE a model call is spent, instead of Paige guessing them.
  //    Takes the raw (not-yet-committed) brief directly, rather than reading it back off
  //    `state` a tick later, so the fast path below never races React's setState batching. ──
  const runGenerate = useCallback(
    (brief: string) => {
      if (!tenantId) {
        patch({ error: { code: "NO_TENANT", message: STUDIO_ERROR_COPY.NO_TENANT, recoverable: false } });
        return;
      }
      const decision = shouldClarify(brief);
      if (!decision.needed) {
        setState((s) => ({ ...s, brief, clarifying: EMPTY_CLARIFYING }));
        void generateWholePage(brief);
        return;
      }
      setState((s) => ({
        ...s,
        brief,
        mode: "clarifying",
        clarifying: {
          questions: decision.formSignal
            ? [...CLARIFYING_QUESTIONS, QUESTIONNAIRE_FIELDS_QUESTION]
            : CLARIFYING_QUESTIONS,
          // Carry forward any answers already on hand (e.g. a Regenerate/Retry re-entering
          // this gate) — never wipe a previously-answered questionnaire back to blank, or a
          // second pass could silently fall back to the generic filler the operator already
          // fixed once.
          answers: s.clarifying.answers,
        },
        error: null,
      }));
    },
    [tenantId, patch, generateWholePage],
  );

  // Every rendered question must be answered before the gate lets the operator through —
  // otherwise "Build the page" is one click away from reproducing the exact generic-filler
  // behavior this step exists to close (composeBrief with empty answers is a no-op).
  const clarifyingAnswered = state.clarifying.questions.every(
    (q) => (state.clarifying.answers[q.id] ?? "").trim().length > 0,
  );

  // The clarifying rail's own submit. Gated on clarifyingAnswered above — reachable only once
  // every question has a real answer, so composeBrief never runs against an empty answer map.
  const proceedToGenerate = useCallback(() => {
    const compiled = composeBrief(state.brief, state.clarifying.answers);
    const questionnaireAnswer = state.clarifying.answers[QUESTIONNAIRE_FIELDS_QUESTION_ID]?.trim() || undefined;
    void generateWholePage(compiled, questionnaireAnswer);
  }, [state.brief, state.clarifying, generateWholePage]);

  const setClarifyingAnswer = useCallback((id: string, value: string) => {
    setState((s) => ({ ...s, clarifying: { ...s.clarifying, answers: { ...s.clarifying.answers, [id]: value } } }));
  }, []);

  const backToCompose = useCallback(() => {
    patch({ mode: "compose", clarifying: EMPTY_CLARIFYING });
  }, [patch]);

  const handleCancel = useCallback(() => {
    cancel();
    setState((s) => ({
      ...s,
      mode: blocksBeforeRun.current.length > 0 ? "canvas" : "compose",
      blocks: blocksBeforeRun.current,
    }));
  }, [cancel]);

  // ── save the draft ────────────────────────────────────────────────────────────────
  const saveDraft = useCallback(async (): Promise<{ id: string; slug: string } | null> => {
    if (!tenantId) {
      patch({ error: { code: "NO_TENANT", message: STUDIO_ERROR_COPY.NO_TENANT, recoverable: false } });
      return null;
    }
    if (state.blocks.length === 0) {
      patch({ error: { code: "NO_DRAFT", message: STUDIO_ERROR_COPY.NO_DRAFT, recoverable: true } });
      return null;
    }
    const desiredSlug = state.slug || kebabSlug(state.title) || kebabSlug(state.seo?.title ?? "");
    if (!desiredSlug) {
      patch({ error: { code: "INVALID_SLUG", message: STUDIO_ERROR_COPY.INVALID_SLUG, recoverable: true } });
      return null;
    }

    patch({ saving: true, error: null });
    try {
      // Creating (no pageId) must claim a slug nobody else owns. growth_page_upsert does
      // ON CONFLICT (tenant_id, slug) DO UPDATE — so saving a NEW page onto an existing
      // page's slug would silently overwrite that page's draft. Editing keeps its own slug.
      const slug = state.pageId ? desiredSlug : await uniqueGrowthPageSlug(tenantId, desiredSlug);

      const row = await savePageDraft({
        tenantId,
        pageId: state.pageId,
        slug,
        title: state.title || state.seo?.title || "Untitled",
        blocks: state.blocks,
        theme: state.theme,
        seo: state.seo,
        formSchema: state.formSchema,
      });
      setState((s) => ({
        ...s,
        pageId: row.id,
        slug: row.slug,
        title: row.title || s.title,
        status: row.status === "published" ? "published" : "draft",
        saving: false,
        dirty: false,
      }));
      // A real DB row backs this content now — the client-side recovery draft has done
      // its job and must not linger stale past the point the operator actually committed
      // (this fires for the explicit Save button, Publish's save-first step, and the
      // section-edit path's implicit save — every one of them means a DB row now exists).
      clearPageDraftSnapshot(studioDraftKey(tenantId, sessionId ?? null, state.pageId));
      // Wire the saved page into its owning session (Slice 2) — idempotent, non-fatal, and it
      // titles the project from the real page on the first save (§19). No-op without a session.
      void linkPrimaryArtifact("page", row.id, row.title || state.title);
      onSaved?.({ id: row.id, slug: row.slug });
      return { id: row.id, slug: row.slug };
    } catch (err) {
      const e = asStudioError(err, "SAVE_FAILED");
      patch({ saving: false, error: e });
      return null;
    }
  }, [tenantId, sessionId, state.blocks, state.slug, state.title, state.seo, state.pageId, state.theme, state.formSchema, onSaved, patch, linkPrimaryArtifact]);

  const handleSave = useCallback(async () => {
    const saved = await saveDraft();
    if (saved) toast({ title: "Draft saved", description: "Your page is safe. Publish it when you're ready." });
  }, [saveDraft, toast]);

  // ── publish (save FIRST, then publish — always, in that order) ─────────────────────
  const handlePublish = useCallback(async () => {
    patch({ publishing: true, error: null });
    try {
      const saved = await saveDraft();
      if (!saved) {
        patch({ publishing: false });
        return;
      }
      if (!tenantId) {
        patch({ publishing: false, error: { code: "NO_TENANT", message: STUDIO_ERROR_COPY.NO_TENANT, recoverable: false } });
        return;
      }

      const result = await publishPage({ tenantId, pageId: saved.id });
      setState((s) => ({
        ...s,
        publishing: false,
        status: "published",
        publishedUrl: result.url,
        dirty: false,
        error: null,
      }));
      onPublished?.(result);
    } catch (err) {
      patch({ publishing: false, error: asStudioError(err, "PUBLISH_FAILED") });
    }
  }, [saveDraft, tenantId, onPublished, patch]);

  // ── delete THIS project (session-level, all modes) ─────────────────────────────────
  // The in-session mirror of the gallery's card ⋯ Delete. Wired to the RECOVERABLE tier
  // (archive): the project drops out of every gallery view and can be restored, so an accidental
  // delete is never data loss (§13). We navigate back to the gallery ONLY after the archive
  // actually succeeds — never optimistically leave for a delete that didn't happen. The confirm
  // AlertDialog lives in StudioTopBar; this only runs on the operator's explicit confirm.
  const handleDeleteProject = useCallback(async () => {
    if (!tenantId || !sessionId) return;
    try {
      await setSessionStatus({ tenantId, sessionId, status: "archived" });
      navigate("/admin/studio");
    } catch (err) {
      patch({ error: asStudioError(err, "SAVE_FAILED") });
      toast({
        title: "Couldn't delete this project",
        description: isStudioError(err) ? err.message : "Try again in a moment.",
        variant: "destructive",
      });
    }
  }, [tenantId, sessionId, navigate, patch, toast]);

  // ── build a whole funnel from one brief (§19) ──────────────────────────────────────
  // draftFunnel plans + drafts (reusing the page/form drafters server-side); then we persist
  // the real page/form/funnel rows. It renders in this same page surface — no navigation, no
  // tab. A fresh brief while a funnel is already up rebuilds it (refine-by-re-briefing, v1).
  const buildFunnel = useCallback(
    async (brief: string) => {
      if (!tenantId) {
        patch({ error: { code: "NO_TENANT", message: STUDIO_ERROR_COPY.NO_TENANT, recoverable: false } });
        return;
      }
      funnelIntendedRef.current = true; // committed — a failed build retries as a funnel, not a page
      setFunnelBuilding(true);
      setFunnelUrl(null);
      patch({ error: null });
      try {
        const draft = await draftFunnel(brief);
        // Rebuild in place when a funnel is already up (refine-by-re-briefing) — updates the
        // same page/form/funnel rows instead of stranding orphans in the libraries (§12).
        const built = await buildFunnelFromDraft({ tenantId, draft, existing: funnel });
        setFunnel(built);
        // Wire the built funnel into its owning session (Slice 2) — the funnel is the session's
        // primary artifact; idempotent + non-fatal, and titles the project on first build (§19).
        void linkPrimaryArtifact("funnel", built.funnelId, built.name);
        toast({
          title: "Funnel drafted",
          description: built.pageBlanks.length
            ? "Almost there — the entry page has a few blanks to fill before it can go live."
            : "Review the steps, then Publish funnel to take the whole sequence live.",
        });
      } catch (err) {
        patch({ error: asStudioError(err, "GENERATION_FAILED") });
      } finally {
        setFunnelBuilding(false);
      }
    },
    [tenantId, funnel, patch, toast, linkPrimaryArtifact],
  );

  // Leave the funnel and return to a blank composer (§13 — never trap the operator in one
  // artifact with no way out). Clears the built funnel and lets classification run fresh.
  const exitFunnel = useCallback(() => {
    setFunnel(null);
    setFunnelUrl(null);
    setFunnelBuilding(false);
    funnelIntendedRef.current = false;
    classifiedOnceRef.current = false;
    patch({ brief: "", composerValue: "", error: null });
    if (mode === "funnel") onModeChange?.("page");
  }, [mode, onModeChange, patch]);

  // Ship the whole funnel in one act (§19) — the cascade publishes the entry page then the
  // funnel, and reports the REAL url (§13). Reflect each step going live in the flow view.
  const handlePublishFunnel = useCallback(async () => {
    if (!tenantId || !funnel) return;
    if (funnel.pageBlanks.length > 0) return; // guarded — the page would be refused server-side
    setFunnelPublishing(true);
    patch({ error: null });
    // Mark the entry page published in the flow (used on both success AND partial-failure).
    const markPagePublished = () =>
      setFunnel((f) =>
        f
          ? {
              ...f,
              pageStatus: "published",
              steps: f.steps.map((s) => (s.kind === "page" ? { ...s, status: "published" } : s)),
            }
          : f,
      );
    try {
      const { url } = await publishFunnelCascade({ tenantId, funnel });
      markPagePublished();
      setFunnelUrl(url);
      toast({ title: "Funnel is live", description: url ? `Live at ${url}` : "Your funnel is published." });
      onFunnelCreated?.();
    } catch (err) {
      // §13: if the entry page went live before the funnel step failed, say so — don't let the
      // flow keep showing the page as a draft when it is actually on the internet.
      if (isFunnelPublishError(err)) {
        if (err.pagePublished) markPagePublished();
        patch({ error: asStudioError(err.cause, "PUBLISH_FAILED") });
      } else {
        patch({ error: asStudioError(err, "PUBLISH_FAILED") });
      }
    } finally {
      setFunnelPublishing(false);
    }
  }, [tenantId, funnel, patch, toast, onFunnelCreated]);

  // ── the conversational per-section edit ───────────────────────────────────────────
  const handleSectionEdit = useCallback(
    async (instruction: string) => {
      const index = state.selectedIndex;
      const block = index != null ? state.blocks[index] : null;
      if (!tenantId || index == null || !block) return;

      patch({ editing: true, error: null });
      try {
        // The page must exist before a structural edit can be persisted against it.
        const pageId = state.pageId ?? (await saveDraft())?.id ?? null;
        if (!pageId) {
          patch({ editing: false });
          return;
        }

        const revised = await reviseBlock({ tenantId, index, block, instruction });
        // Reconcile from the array the server RETURNS, never from an optimistic local
        // mutation — the same page can be edited from Paige's chat at the same time.
        const next = await editBlocks({
          tenantId,
          pageId,
          ops: [{ op: "update", index, block: revised }],
        });
        setState((s) => ({
          ...s,
          blocks: next,
          instruction: "",
          editing: false,
          dirty: false,
          error: null,
        }));
        toast({ title: `Section ${index + 1} updated`, description: "The canvas shows exactly what will publish." });
      } catch (err) {
        patch({ editing: false, error: asStudioError(err, "EDIT_FAILED") });
      }
    },
    [tenantId, state.selectedIndex, state.blocks, state.pageId, saveDraft, patch, toast],
  );

  // ── the single entry point's routing decision (§18) ────────────────────────────────
  // Every submission from the page-mode composer lands here first. A section edit always
  // behaves exactly as before. Everything else classifies EXACTLY ONCE per session — the
  // first submission this session — and every submission after that (including the same
  // brief resubmitted via Rebuild it) is already committed to whatever mode it landed in.
  const handleBriefSubmit = useCallback(
    (value: string) => {
      if (target) {
        void handleSectionEdit(value);
        return;
      }
      // Clear the LIVE composer the instant we submit — `value` is already captured, so the build
      // is unaffected, and returning to this project shows a clean box (no sticky words). The
      // durable `brief` (Rebuild's source) is written separately by runGenerate.
      patch({ composerValue: "" });
      // Committed to a funnel this session (built, building, entered via funnel intent, or a
      // prior funnel build that failed) — a new brief (re)builds the funnel in this same
      // surface (§19), and a post-failure retry stays a funnel instead of falling through to
      // a lone page build (§13/§18). Checked BEFORE classifiedOnceRef, which is already true.
      if (funnel || funnelBuilding || funnelIntendedRef.current) {
        void buildFunnel(value);
        return;
      }
      if (classifiedOnceRef.current) {
        void runGenerate(value);
        return;
      }
      classifiedOnceRef.current = true;
      setClassifying(true);
      void (async () => {
        try {
          const { artifact } = await classifyStudioIntent(value);
          switch (artifact) {
            case "funnel":
              // The whole funnel builds right here — no tab, no navigation (§18/§19).
              void buildFunnel(value);
              break;
            case "form": {
              onModeChange?.("form");
              try {
                const schema = await draftFormSchema(value);
                setDraftedFormSchema(schema);
              } catch (err) {
                // The classify step already spent a call getting this far — an honest miss
                // here still lands the operator in Form mode with its normal template picker,
                // never a dead end (§13).
                toast({
                  title: "Couldn't draft that form",
                  description: isStudioError(err) ? err.message : "Pick a template below to keep going.",
                  variant: "destructive",
                });
              }
              break;
            }
            case "copy":
              setDraftedCopyBrief(value);
              setAutoRunCopy(true);
              onModeChange?.("copy");
              break;
            case "image":
              setDraftedImagePrompt(value);
              setAutoRunImage(true);
              onModeChange?.("image");
              break;
            case "page":
            default:
              void runGenerate(value);
              break;
          }
        } finally {
          setClassifying(false);
        }
      })();
    },
    [target, funnel, funnelBuilding, buildFunnel, runGenerate, handleSectionEdit, onModeChange, toast],
  );

  // Keep the autostart bridge pointed at the live handleBriefSubmit (declared just above, so this
  // sync must live AFTER it to avoid a TDZ on the deps array). loadSession is real async IO, so its
  // .then() always runs after this effect has set the ref — the autostart fire never sees the no-op
  // placeholder, and it always classifies the Home brief into the right artifact type (§18/§19).
  useEffect(() => {
    briefSubmitRef.current = handleBriefSubmit;
  }, [handleBriefSubmit]);

  // ── persist the client-side draft (no DB write) ───────────────────────────────────
  // The Studio holds the in-progress design ONLY in this component's state until an
  // explicit Save/Publish — route-swapping to any other admin section unmounts this whole
  // tree and, without this, silently destroys whatever wasn't saved. Debounced so typing a
  // brief doesn't hammer localStorage on every keystroke; only the fields needed to recover
  // (never saving/publishing/editing/error/dirty — those reset fresh on rehydrate).
  const latestDraftWriteRef = useRef<() => void>(() => {});
  useEffect(() => {
    if (!tenantId) return;
    // Nothing worth protecting yet (a blank composer, or right after Cancel/backToCompose
    // restored an empty canvas) — skip the write entirely rather than stamp an empty
    // snapshot over whatever's already stored, which would otherwise surface a hollow
    // "Draft restored" toast on the next mount for content that was never really there.
    const hasContent =
      state.blocks.length > 0 ||
      state.brief.trim().length > 0 ||
      state.composerValue.trim().length > 0 ||
      state.title.trim().length > 0;
    if (!hasContent) return;
    const key = studioDraftKey(tenantId, sessionId ?? null, state.pageId);
    const snapshot: PageDraftSnapshot = {
      pageId: state.pageId,
      sessionId: state.sessionId,
      artifacts: state.artifacts,
      activeArtifactId: state.activeArtifactId,
      activeArtifactType: state.activeArtifactType,
      title: state.title,
      slug: state.slug,
      slugTouched: state.slugTouched,
      blocks: state.blocks,
      theme: state.theme,
      seo: state.seo,
      formSchema: state.formSchema,
      brief: state.brief,
      composerValue: state.composerValue,
      mode: state.mode,
      clarifying: state.clarifying,
      selectedIndex: state.selectedIndex,
    };
    const write = () => savePageDraftSnapshot(key, snapshot);
    latestDraftWriteRef.current = write;
    const id = window.setTimeout(write, 400);
    return () => window.clearTimeout(id);
  }, [
    tenantId,
    sessionId,
    state.pageId,
    state.sessionId,
    state.artifacts,
    state.activeArtifactId,
    state.activeArtifactType,
    state.title,
    state.slug,
    state.slugTouched,
    state.blocks,
    state.theme,
    state.seo,
    state.formSchema,
    state.brief,
    state.composerValue,
    state.mode,
    state.clarifying,
    state.selectedIndex,
  ]);

  // A true unmount (the route swap that eats in-progress work today) flushes whatever the
  // debounce hadn't gotten to yet — the one moment this bug actually bites, so it's the one
  // moment the timer is never allowed to lose the race against navigation.
  useEffect(() => {
    return () => {
      latestDraftWriteRef.current();
    };
  }, []);

  // ── the page canvas ───────────────────────────────────────────────────────────────
  const busy = isGenerating || state.editing;

  // A funnel — classified from this composer, OR entered via the funnel intent (mode="funnel",
  // e.g. the Funnels library's "New funnel") — renders IN this same page surface (§18/§19):
  // FunnelFlow replaces the page canvas, the composer builds/refines it, the top bar ships it.
  // There is no separate funnel mode/tab; funnelIntent just primes this same surface.
  const funnelIntent = mode === "funnel";
  const funnelActive = (mode === "page" || funnelIntent) && (funnel != null || funnelBuilding || funnelIntent);

  let pageCanvas: ReactNode;
  if (funnelActive) {
    if (funnel) {
      pageCanvas = <FunnelFlow funnel={funnel} url={funnelUrl} />;
    } else if (funnelBuilding) {
      // Building state — Paige's team drafting the whole funnel (page + form) at once.
      pageCanvas = (
        <div className="grid h-full place-items-center">
          <SectionCard className="max-w-md">
            <div className="flex flex-col items-center gap-3 py-6 text-center">
              <Loader2 className="h-6 w-6 animate-spin text-primary motion-reduce:animate-none" aria-hidden />
              <div>
                <p className="font-display text-sm font-semibold text-foreground">Building your funnel</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Paige is drafting the landing page and the intake form, then wiring them together.
                </p>
              </div>
            </div>
          </SectionCard>
        </div>
      );
    } else {
      // Funnel intent, nothing built yet — a crafted prompt to describe the funnel (never a
      // blank or a stray "loading"). The composer below is the one way in (§18).
      pageCanvas = (
        <div className="grid h-full place-items-center">
          <SectionCard className="max-w-md">
            <EmptyState
              icon={Wand2}
              tone="brand"
              title="Describe your funnel"
              description="Tell Paige what the funnel is for and who it's for — she'll build the whole sequence: a landing page, an intake form, and a thank-you, wired together and ready to publish."
            />
          </SectionCard>
        </div>
      );
    }
  } else if (state.mode === "generating") {
    pageCanvas = (
      <GenerationExperience
        generation={generation}
        theme={state.theme}
        brandFloor={state.brandFloor}
        tenantId={tenantId ?? undefined}
        device={state.device}
        onRetry={() => void runGenerate(state.brief)}
      />
    );
  } else if ((state.mode === "canvas" || state.mode === "clarifying") && canvasBlocks.length > 0) {
    // "clarifying" is included here so a REGENERATE of an already-built page (existing
    // blocks) never blanks the canvas while the operator answers a few more questions —
    // only a genuinely fresh page (no blocks yet) falls through to the empty state below.
    pageCanvas = (
      <LivePreview
        blocks={canvasBlocks}
        theme={state.theme}
        brandFloor={state.brandFloor}
        tenantId={tenantId ?? undefined}
        device={state.device}
        interactive
        selectedIndex={state.selectedIndex}
        onSelectBlock={(index) => patch({ selectedIndex: index, instruction: "" })}
        onFrameSettled={handleFrameSettled}
      />
    );
  } else {
    // The empty state sits on a real elevated SectionCard (the reference-bar primitive —
    // bg-card + border + shadow-card) centered on the drafting-surface well, so it reads as a
    // crafted card floating on the working surface instead of bare text top-anchored in a dead
    // expanse. `grid h-full place-items-center` fixes EmptyState's own py-12 top-anchoring;
    // wrapping EmptyState in SectionCard is the exact pattern the no-workspace gate below
    // already uses (§11 primitive reuse, in-file precedent). EmptyState stays unforked.
    pageCanvas = (
      <div className="grid h-full place-items-center">
        <SectionCard className="max-w-md">
          <EmptyState
            icon={Wand2}
            tone="brand"
            title={MODE_EMPTY.page.title}
            description={MODE_EMPTY.page.description}
          />
        </SectionCard>
      </div>
    );
  }

  // h-full on PageShell gives the inner h-full a definite parent to resolve against — the
  // immersive StudioLayout outlet is definite-height, but PageShell's own root is auto-height,
  // so without this the builder collapsed to StudioFrame's 620px floor with dead space below.
  const wrap = (node: ReactNode) =>
    embedded ? (
      <>{node}</>
    ) : (
      <PageShell width="full" className={cn("h-full min-h-0", className)}>
        <div className="h-full min-h-0 lg:h-full">{node}</div>
      </PageShell>
    );

  // ── still resolving the workspace: a themed skeleton, never a live-but-inert composer.
  //    Platform staff carry no active tenant (§9), so we wait for the resolve to settle
  //    before deciding between the Studio and the hard gate — a composer that can't write
  //    anywhere must never render as if it can. ───────────────────────────────────────
  if (tenantLoading && !tenantId) {
    return wrap(
      <StudioFrame className={embedded ? className : undefined} dark={studioDark}>
        {/* Skeleton parity (StudioFrame's own "never flashes between shells" contract): the
            loading strip/rail/well must carry the SAME masthead wash, top-lit rail gradient,
            and drafting-surface texture the live Studio now has, or the surface visibly
            flattens for a beat and then pops richer once the workspace resolves. */}
        <div className="h-14 shrink-0 border-b border-border/60 bg-gradient-to-b from-card to-muted/20 shadow-sm" />
        <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
          <div className="border-b border-border/60 bg-gradient-to-b from-card to-background p-4 lg:w-[380px] lg:shrink-0 lg:border-b-0 lg:border-r">
            <div className="h-64 animate-pulse rounded-xl border border-border bg-muted/40 motion-reduce:animate-none" />
          </div>
          <div className="studio-drafting-grid flex-1 p-4 md:p-6">
            <div className="h-full min-h-[16rem] animate-pulse rounded-xl border border-border bg-muted/40 motion-reduce:animate-none" />
          </div>
        </div>
      </StudioFrame>,
    );
  }

  // ── no workspace: a hard gate, not a broken surface ───────────────────────────────
  if (!tenantLoading && !tenantId) {
    return wrap(
      <StudioFrame className={embedded ? className : undefined} dark={studioDark}>
        <div className="flex h-14 shrink-0 items-center border-b border-border/60 bg-gradient-to-b from-card to-muted/20 px-4 shadow-sm">
          <span className="font-display text-sm font-semibold text-foreground">Studio</span>
        </div>
        <div className="grid flex-1 place-items-center p-6">
          <SectionCard className="max-w-lg">
            <EmptyState
              icon={Sparkles}
              tone="brand"
              title="Pick a workspace to build in"
              description="Everything here is built inside a workspace so it carries its brand and its signups. Choose one from the switcher up top and the Studio opens."
            />
          </SectionCard>
        </div>
      </StudioFrame>,
    );
  }

  // ── session not found: a hard stop, never a raw code (§11) ─────────────────────────
  if (sessionNotFound) {
    return wrap(
      <StudioFrame className={embedded ? className : undefined} dark={studioDark}>
        <div className="flex h-14 shrink-0 items-center border-b border-border/60 bg-gradient-to-b from-card to-muted/20 px-4 shadow-sm">
          <span className="font-display text-sm font-semibold text-foreground">Studio</span>
        </div>
        <div className="grid flex-1 place-items-center p-6">
          <SectionCard className="max-w-lg">
            <EmptyState
              icon={Wand2}
              tone="brand"
              title="We couldn't find that project"
              description="It may have been removed, or it belongs to another workspace. Head back to the Studio to pick up another one — or start something new."
              action={
                <Button asChild variant="default">
                  <Link to="/admin/studio">Back to the Studio</Link>
                </Button>
              }
            />
          </SectionCard>
        </div>
      </StudioFrame>,
    );
  }

  return wrap(
    <>
      <StudioFrame className={embedded ? className : undefined} dark={studioDark}>
        <StudioTopBar
          mode={mode}
          studioDark={studioDark}
          onToggleStudioTheme={toggleStudioTheme}
          title={state.title}
          onTitleChange={setTitle}
          device={state.device}
          onDeviceChange={(device) => patch({ device })}
          status={state.status}
          dirty={state.dirty}
          onSave={() => void handleSave()}
          saving={state.saving}
          saveDisabled={state.saving || state.publishing || busy || state.blocks.length === 0}
          onPublish={() => patch({ publishOpen: true, publishedUrl: null, error: null })}
          publishing={state.publishing}
          publishDisabled={state.publishing || busy || state.blocks.length === 0}
          onOpenLibrary={() => setLibraryOpen(true)}
          modeBar={modeBars[mode] ?? null}
          funnelActive={funnelActive}
          funnelLive={funnelUrl != null}
          onPublishFunnel={() => void handlePublishFunnel()}
          funnelPublishing={funnelPublishing}
          publishFunnelDisabled={
            !funnel || funnelBuilding || funnelPublishing || (funnel?.pageBlanks.length ?? 0) > 0
          }
          onExitFunnel={funnel || funnelBuilding ? exitFunnel : undefined}
          onDeleteProject={sessionId ? () => void handleDeleteProject() : undefined}
          projectTitle={state.title}
        />

        {/* ── page mode (and the funnel surface, which lives inside it) — the original Vibe
             Studio, re-skinned onto the same state machine. Shown for "page" AND "funnel";
             hidden only for the form/copy/image modes that own their own surface. ── */}
        <StudioSplit
          className={mode === "page" || mode === "funnel" ? undefined : "hidden"}
          immersive={firstBuildGenerating}
          railHeader={
            funnelActive ? (
              <StudioRailHeading
                heading="Your funnel"
                description="Paige built the whole sequence — a landing page, an intake form, and a thank-you. Review the steps and publish when it's ready."
                teamLine
              />
            ) : state.mode === "clarifying" ? (
              <StudioRailHeading heading={CLARIFYING_RAIL.heading} description={CLARIFYING_RAIL.description} />
            ) : (
              <StudioRailHeading
                heading={state.selectedIndex != null ? "Change one section" : MODE_RAIL.page.heading}
                description={
                  state.selectedIndex != null
                    ? "Same conversation — Paige rewrites the section you picked."
                    : MODE_RAIL.page.description
                }
                teamLine={state.selectedIndex == null}
              />
            )
          }
          railBody={
            funnelActive ? (
              <>
                {funnel?.goal && (
                  <p className="text-xs text-muted-foreground">{funnel.goal}</p>
                )}
                <p className="text-xs text-muted-foreground">
                  Want to change it? Describe the funnel differently below and Paige rebuilds it.
                </p>
                {state.error && (
                  <SectionCard className="border-destructive/40">
                    <div className="space-y-3">
                      <p className="text-sm text-foreground">{state.error.message}</p>
                      {state.error.recoverable && (
                        <Button variant="outline" size="sm" onClick={() => patch({ error: null })}>
                          Got it
                        </Button>
                      )}
                    </div>
                  </SectionCard>
                )}
              </>
            ) : state.mode === "clarifying" ? (
              <ClarifyingQuestions
                brief={state.brief}
                questions={state.clarifying.questions}
                answers={state.clarifying.answers}
                onAnswerChange={setClarifyingAnswer}
                onBack={backToCompose}
              />
            ) : (
              <>
                {/* Post-submit delivery — only once the page has been saved at least once
                    (the embedded_form's backing row only exists after that first save). */}
                {state.selectedIndex == null && tenantId && state.pageId && embeddedFormSlug && (
                  <DeliveryEditor
                    tenantId={tenantId}
                    formSlug={embeddedFormSlug}
                    suggestedAssetUrl={state.suggestedDeliveryAssetUrl}
                  />
                )}

                {/* Paige's team, working — the build progress lives in the conversation. */}
                {state.mode === "generating" && (
                  <BuildProgress generation={generation} onCancel={handleCancel} />
                )}

                {state.error && (
                  <SectionCard className="border-destructive/40">
                    <div className="space-y-3">
                      <p className="text-sm text-foreground">{state.error.message}</p>
                      {state.error.recoverable && (
                        <Button variant="outline" size="sm" onClick={() => patch({ error: null })}>
                          Got it
                        </Button>
                      )}
                    </div>
                  </SectionCard>
                )}
              </>
            )
          }
          railFooter={
            state.mode === "clarifying" ? (
              <div className="space-y-1.5">
                <div className="flex flex-wrap items-center gap-2">
                  <Button type="button" variant="outline" onClick={backToCompose}>
                    Back
                  </Button>
                  {/* Indigo, deliberately — same discipline as PromptComposer's own submit
                      (§11): gold is spent only on Publish. Disabled until every question has
                      a real answer — see clarifyingAnswered above. */}
                  <Button
                    type="button"
                    variant="default"
                    onClick={() => proceedToGenerate()}
                    disabled={!clarifyingAnswered}
                  >
                    <Send className="h-4 w-4" aria-hidden />
                    Build the page
                  </Button>
                </div>
                {!clarifyingAnswered && (
                  <p className="text-xs text-muted-foreground">Answer each question to continue.</p>
                )}
              </div>
            ) : (
              <PromptComposer
                mode={target ? "section" : "page"}
                value={target ? state.instruction : state.composerValue}
                onChange={(value) => patch(target ? { instruction: value } : { composerValue: value })}
                onSubmit={(value) => handleBriefSubmit(value)}
                busy={busy || classifying || funnelBuilding}
                busyLabel={
                  funnelBuilding
                    ? "Building your funnel…"
                    : classifying
                      ? "Figuring out what to build…"
                      : undefined
                }
                disabled={state.saving || state.publishing || funnelPublishing}
                target={target}
                onClearTarget={() => patch({ selectedIndex: null, instruction: "" })}
                onRegenerate={() => void runGenerate(state.brief)}
                canRegenerate={state.blocks.length > 0 && state.brief.trim().length >= 5}
                attachments={state.attachments}
                onFilesSelected={(files) => void handleFilesSelected(files)}
                onRemoveAttachment={handleRemoveAttachment}
                attachmentsBusy={attachmentsBusy}
                chips={INTENT_CHIPS}
                sendShape="circle"
                chipPlacement="dock"
              />
            )
          }
          canvas={pageCanvas}
        />

        {/* ── the other outputs — mounted once visited, kept alive across switches ──
             Funnel is NOT here: it has no separate mode/surface anymore. An AI funnel builds
             and renders IN the page surface above (funnelActive), reached only conversationally
             or via the funnel intent (mode="funnel"). The old manual FunnelMode is retired. */}
        {visited.has("form") && (
          <FormMode
            className={mode !== "form" ? "hidden" : undefined}
            tenantId={tenantId}
            onToolbar={onFormToolbar}
            onCreated={handleFormCreated}
            initialSchema={draftedFormSchema}
          />
        )}
        {visited.has("copy") && (
          <CopyMode
            className={mode !== "copy" ? "hidden" : undefined}
            tenantId={tenantId}
            initialBrief={draftedCopyBrief}
            autoRun={autoRunCopy}
            onGeneratingChange={setCopyImageBuilding}
            onOpenLibrary={() => setLibraryOpen(true)}
            onSaved={handleCopySaved}
          />
        )}
        {visited.has("image") && (
          <ImageMode
            className={mode !== "image" ? "hidden" : undefined}
            tenantId={tenantId}
            initialPrompt={draftedImagePrompt}
            autoRun={autoRunImage}
            onGeneratingChange={setCopyImageBuilding}
            onOpenLibrary={() => setLibraryOpen(true)}
            onSaved={handleImageSaved}
          />
        )}
      </StudioFrame>

      {/* The saved library — the Content Studio's third panel, one Sheet away. */}
      <Sheet open={libraryOpen} onOpenChange={setLibraryOpen}>
        <SheetContent className="dark w-full overflow-y-auto border-border bg-background text-foreground sm:max-w-2xl">
          <SheetHeader>
            <SheetTitle>Content library</SheetTitle>
            <SheetDescription>
              Everything you've saved — copy and images — ready to reuse across your campaigns.
            </SheetDescription>
          </SheetHeader>
          <div className="mt-4">
            <LibraryPanel tenantId={tenantId} active={libraryOpen} />
          </div>
        </SheetContent>
      </Sheet>

      <PublishDialog
        open={state.publishOpen}
        onOpenChange={(open) => patch({ publishOpen: open, ...(open ? {} : { publishedUrl: null }) })}
        title={state.title}
        onTitleChange={setTitle}
        slug={state.slug}
        onSlugChange={setSlug}
        status={state.status}
        tenantSlug={tenantSlug}
        checks={checks}
        onConfirm={handlePublish}
        publishing={state.publishing}
        onFixBlock={(index) => patch({ selectedIndex: index, instruction: "", mode: "canvas" })}
        publishedUrl={state.publishedUrl}
        error={state.error}
      />
    </>,
  );
}

export default StudioShell;

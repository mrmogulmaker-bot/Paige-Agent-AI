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
// PublishDialog. Not on Generate, not on Save, not on a chip, not on the selection
// outline (that's indigo `--ring`).
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Send, Sparkles, Wand2 } from "lucide-react";
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
import { PromptComposer } from "./PromptComposer";
import { PublishDialog, kebabSlug } from "./PublishDialog";
import { StudioTopBar } from "./StudioTopBar";
import { StudioRailHeading, StudioSplit } from "./StudioChrome";
import { CopyMode } from "./modes/CopyMode";
import { ImageMode } from "./modes/ImageMode";
import { FormMode } from "./modes/FormMode";
import { FunnelMode } from "./modes/FunnelMode";
import { LibraryPanel } from "./modes/content-shared";
import {
  STUDIO_ERROR_COPY,
  classifyStudioIntent,
  composeBrief,
  draftFormSchema,
  editBlocks,
  isStudioError,
  loadBrandFloor,
  loadPageDraft,
  preflightPublish,
  publishPage,
  reviseBlock,
  savePageDraft,
  shouldClarify,
  uniqueGrowthPageSlug,
  uploadGrowthAsset,
  type PublishPageResult,
} from "./studio";
import {
  clearPageDraftSnapshot,
  loadPageDraftSnapshot,
  pageDraftKey,
  savePageDraftSnapshot,
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
  type StudioError,
  type StudioErrorCode,
  type StudioMode,
  type StudioSeoDraft,
  type StudioState,
} from "./studio-types";

export interface StudioShellProps {
  /** Tenant scope. Falls back to the active tenant when omitted. */
  tenantId?: string;
  /** Tenant public web address — needed for the brand floor and for publish. */
  tenantSlug?: string;
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
  className?: string;
}

/** Generation lives in useGeneratePage (the abort path + the honest ticker belong together);
 *  the shell owns everything else in StudioState verbatim. */
type ShellState = Omit<StudioState, "generation">;

const EMPTY_SHELL: ShellState = {
  tenantId: null,
  tenantSlug: null,
  pageId: null,
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
 *  skeleton and the tenant gate, so the surface never flashes between shells. */
function StudioFrame({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={cn(
        "dark flex h-full min-h-[620px] w-full flex-col overflow-hidden rounded-xl border border-border bg-background text-foreground",
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
  pageId: pageIdProp,
  mode = "page",
  onModeChange,
  embedded = false,
  onPublished,
  onSaved,
  onFunnelCreated,
  onFormCreated,
  className,
}: StudioShellProps) {
  const { activeTenantId, activeTenant, loading: tenantLoading } = useTenantContext();
  const { toast } = useToast();

  const tenantId = tenantIdProp ?? activeTenantId ?? null;
  const tenantSlug = tenantSlugProp ?? activeTenant?.slug ?? null;

  const [state, setState] = useState<ShellState>(EMPTY_SHELL);
  const { generation, isGenerating, generate, cancel, reset } = useGeneratePage(tenantId);

  // Modes stay mounted once visited, so switching outputs never eats in-progress work.
  const [visited, setVisited] = useState<ReadonlySet<StudioMode>>(() => new Set([mode]));
  useEffect(() => {
    setVisited((prev) => (prev.has(mode) ? prev : new Set(prev).add(mode)));
  }, [mode]);

  // Funnel/form modes publish their Save/act buttons into the top bar through here.
  const [modeBars, setModeBars] = useState<Partial<Record<StudioMode, ModeToolbarState>>>({});
  const onFunnelToolbar = useCallback(
    (s: ModeToolbarState) => setModeBars((prev) => ({ ...prev, funnel: s })),
    [],
  );
  const onFormToolbar = useCallback(
    (s: ModeToolbarState) => setModeBars((prev) => ({ ...prev, form: s })),
    [],
  );

  // The content library, one Sheet — the same LibraryPanel the Content Studio shipped.
  const [libraryOpen, setLibraryOpen] = useState(false);

  // A manual mode-chip click is a deliberate power-user choice — the classify step (§18)
  // must never override it. This flips true ONLY inside a real click, never on a prop the
  // parent set from a URL (a deep link into e.g. Form mode leaves the page composer hidden
  // and untouched, so classification simply never has a reason to fire there).
  const modeChipClickedRef = useRef(false);
  const handleModeChange = useCallback(
    (next: StudioMode) => {
      modeChipClickedRef.current = true;
      onModeChange?.(next);
    },
    [onModeChange],
  );

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

  // The blocks we hold when a run starts — restored verbatim if the operator stops it, so a
  // cancelled run never leaves a half-painted canvas.
  const blocksBeforeRun = useRef<GrowthBlock[]>([]);

  const patch = useCallback((next: Partial<ShellState>) => setState((s) => ({ ...s, ...next })), []);

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
    const key = pageDraftKey(tenantId, pageIdProp ?? null);
    if (draftRestoreRef.current.key === key) return; // already resolved this exact draft once
    const snapshot = loadPageDraftSnapshot(key);
    draftRestoreRef.current = { key, applied: !!snapshot };
    if (!snapshot) return;
    setState((s) => ({
      ...s,
      pageId: snapshot.pageId,
      title: snapshot.title,
      slug: snapshot.slug,
      slugTouched: snapshot.slugTouched,
      blocks: snapshot.blocks,
      theme: snapshot.theme,
      seo: snapshot.seo,
      formSchema: snapshot.formSchema,
      brief: snapshot.brief,
      mode: snapshot.mode,
      clarifying: snapshot.clarifying,
      selectedIndex: snapshot.selectedIndex,
      // Recovered content hasn't been confirmed by a real Save from this mount's point of
      // view — mark it dirty so the top bar's Save affordance reads honestly, not silently.
      dirty: true,
      error: null,
    }));
    toast({
      title: "Draft restored",
      description: "Picked up right where you left off — hit Save to make it permanent.",
    });
  }, [tenantId, pageIdProp, toast]);

  // ── open an existing draft ────────────────────────────────────────────────────────
  useEffect(() => {
    if (!tenantId || !pageIdProp) return;
    // A local client-side draft for this EXACT page was just restored above — it already
    // reflects everything the DB has, plus whatever wasn't saved yet, so re-fetching here
    // would clobber unsaved edits with the older saved row (the very bug this mechanism
    // exists to close).
    if (draftRestoreRef.current.key === pageDraftKey(tenantId, pageIdProp) && draftRestoreRef.current.applied) {
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
  }, [tenantId, pageIdProp, patch]);

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
  // artifact this session? Page's is its own canonical state (state.blocks). Form/copy/image
  // don't lift their internal drafts up to the shell (CopyMode's `drafts` array and
  // ImageMode's result stay local component state — out of scope here, see StudioTopBar.tsx
  // for why), so the honest signal available at THIS level is "Paige already routed a real,
  // classified brief/prompt into it" — draftedFormSchema / draftedCopyBrief / draftedImagePrompt,
  // the exact same state Phase 1 already threads through as each mode's `initial…` prop.
  const modeHasContent = useMemo(
    () => ({
      page: state.blocks.length > 0,
      form: draftedFormSchema != null,
      copy: draftedCopyBrief !== undefined,
      image: draftedImagePrompt !== undefined,
    }),
    [state.blocks.length, draftedFormSchema, draftedCopyBrief, draftedImagePrompt],
  );

  // Funnel is the one deliberate exception — zero AI-generation path (100% manual, confirmed
  // in FunnelMode), so it never earns a spot in this strip; it gets its own small, always-on,
  // deliberately-secondary entry point in the top bar instead (never a 6th co-equal tab).
  const visibleModes = useMemo<StudioMode[]>(() => {
    // Page is always a candidate (it's the home surface). The current mode is too, UNLESS
    // it's funnel — funnel is deliberately never "the current tab," it has its own control —
    // so it never strands the operator with no indication of, or way out of, where a
    // classify/deep-link just placed them. Anything else needs real content to earn a tab.
    const relevant = new Set<StudioMode>(["page"]);
    if (mode !== "funnel") relevant.add(mode);
    if (modeHasContent.form) relevant.add("form");
    if (modeHasContent.copy) relevant.add("copy");
    if (modeHasContent.image) relevant.add("image");
    const ordered: StudioMode[] = ["page", "form", "copy", "image"];
    const list = ordered.filter((m) => relevant.has(m));
    // Parked in Funnel, "Page" is always the one way back home — show it even alone. Anywhere
    // else, a lone "Page" chip with nothing else going on IS the upfront-picker framing the
    // owner rejected — suppress the whole strip until there's a genuine second destination.
    return mode === "funnel" ? list : list.length > 1 ? list : [];
  }, [mode, modeHasContent]);

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
    },
    [state.blocks, state.attachments, generate, reset],
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
      clearPageDraftSnapshot(pageDraftKey(tenantId, state.pageId));
      onSaved?.({ id: row.id, slug: row.slug });
      return { id: row.id, slug: row.slug };
    } catch (err) {
      const e = asStudioError(err, "SAVE_FAILED");
      patch({ saving: false, error: e });
      return null;
    }
  }, [tenantId, state.blocks, state.slug, state.title, state.seo, state.pageId, state.theme, state.formSchema, onSaved, patch]);

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
      if (classifiedOnceRef.current || modeChipClickedRef.current) {
        void runGenerate(value);
        return;
      }
      classifiedOnceRef.current = true;
      setClassifying(true);
      void (async () => {
        try {
          const { artifact } = await classifyStudioIntent(value);
          switch (artifact) {
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
              onModeChange?.("copy");
              break;
            case "image":
              setDraftedImagePrompt(value);
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
    [target, runGenerate, handleSectionEdit, onModeChange, toast],
  );

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
      state.blocks.length > 0 || state.brief.trim().length > 0 || state.title.trim().length > 0;
    if (!hasContent) return;
    const key = pageDraftKey(tenantId, state.pageId);
    const snapshot: PageDraftSnapshot = {
      pageId: state.pageId,
      title: state.title,
      slug: state.slug,
      slugTouched: state.slugTouched,
      blocks: state.blocks,
      theme: state.theme,
      seo: state.seo,
      formSchema: state.formSchema,
      brief: state.brief,
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
    state.pageId,
    state.title,
    state.slug,
    state.slugTouched,
    state.blocks,
    state.theme,
    state.seo,
    state.formSchema,
    state.brief,
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

  let pageCanvas: ReactNode;
  if (state.mode === "generating") {
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
      />
    );
  } else {
    pageCanvas = (
      <EmptyState
        icon={Wand2}
        tone="brand"
        title={MODE_EMPTY.page.title}
        description={MODE_EMPTY.page.description}
      />
    );
  }

  const wrap = (node: ReactNode) =>
    embedded ? (
      <>{node}</>
    ) : (
      <PageShell width="full" className={className}>
        <div className="lg:h-[calc(100dvh-8rem)]">{node}</div>
      </PageShell>
    );

  // ── still resolving the workspace: a themed skeleton, never a live-but-inert composer.
  //    Platform staff carry no active tenant (§9), so we wait for the resolve to settle
  //    before deciding between the Studio and the hard gate — a composer that can't write
  //    anywhere must never render as if it can. ───────────────────────────────────────
  if (tenantLoading && !tenantId) {
    return wrap(
      <StudioFrame className={embedded ? className : undefined}>
        <div className="h-14 shrink-0 border-b border-border bg-card" />
        <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
          <div className="border-b border-border p-4 lg:w-[380px] lg:shrink-0 lg:border-b-0 lg:border-r">
            <div className="h-64 animate-pulse rounded-xl border border-border bg-muted/40 motion-reduce:animate-none" />
          </div>
          <div className="flex-1 bg-muted/30 p-4 md:p-6">
            <div className="h-full min-h-[16rem] animate-pulse rounded-xl border border-border bg-muted/40 motion-reduce:animate-none" />
          </div>
        </div>
      </StudioFrame>,
    );
  }

  // ── no workspace: a hard gate, not a broken surface ───────────────────────────────
  if (!tenantLoading && !tenantId) {
    return wrap(
      <StudioFrame className={embedded ? className : undefined}>
        <div className="flex h-14 shrink-0 items-center border-b border-border bg-card px-4">
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

  return wrap(
    <>
      <StudioFrame className={embedded ? className : undefined}>
        <StudioTopBar
          mode={mode}
          onModeChange={handleModeChange}
          visibleModes={visibleModes}
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
        />

        {/* ── page mode — the original Vibe Studio, re-skinned onto the same state machine ── */}
        <StudioSplit
          className={mode !== "page" ? "hidden" : undefined}
          railHeader={
            state.mode === "clarifying" ? (
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
            state.mode === "clarifying" ? (
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
                value={target ? state.instruction : state.brief}
                onChange={(value) => patch(target ? { instruction: value } : { brief: value })}
                onSubmit={(value) => handleBriefSubmit(value)}
                busy={busy || classifying}
                busyLabel={classifying ? "Figuring out what to build…" : undefined}
                disabled={state.saving || state.publishing}
                target={target}
                onClearTarget={() => patch({ selectedIndex: null, instruction: "" })}
                onRegenerate={() => void runGenerate(state.brief)}
                canRegenerate={state.blocks.length > 0 && state.brief.trim().length >= 5}
                attachments={state.attachments}
                onFilesSelected={(files) => void handleFilesSelected(files)}
                onRemoveAttachment={handleRemoveAttachment}
                attachmentsBusy={attachmentsBusy}
                chips={INTENT_CHIPS}
              />
            )
          }
          canvas={pageCanvas}
        />

        {/* ── the other outputs — mounted once visited, kept alive across switches ── */}
        {visited.has("funnel") && (
          <FunnelMode
            className={mode !== "funnel" ? "hidden" : undefined}
            tenantId={tenantId}
            onToolbar={onFunnelToolbar}
            onCreated={onFunnelCreated}
          />
        )}
        {visited.has("form") && (
          <FormMode
            className={mode !== "form" ? "hidden" : undefined}
            tenantId={tenantId}
            onToolbar={onFormToolbar}
            onCreated={onFormCreated}
            initialSchema={draftedFormSchema}
          />
        )}
        {visited.has("copy") && (
          <CopyMode
            className={mode !== "copy" ? "hidden" : undefined}
            tenantId={tenantId}
            initialBrief={draftedCopyBrief}
          />
        )}
        {visited.has("image") && (
          <ImageMode
            className={mode !== "image" ? "hidden" : undefined}
            tenantId={tenantId}
            initialPrompt={draftedImagePrompt}
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

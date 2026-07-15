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
import { Sparkles, Wand2 } from "lucide-react";
import { useTenantContext } from "@/hooks/useTenantContext";
import { useGeneratePage } from "@/hooks/useGeneratePage";
import { useToast } from "@/hooks/use-toast";
import type { GrowthBlock } from "@/lib/growth";
import { Button } from "@/components/ui/button";
import { EmptyState, FilterChip, PageShell, SectionCard } from "@/components/ui/page";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import { BuildProgress } from "./BuildProgress";
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
  editBlocks,
  loadBrandFloor,
  loadPageDraft,
  preflightPublish,
  publishPage,
  reviseBlock,
  savePageDraft,
  uniqueGrowthPageSlug,
  type PublishPageResult,
} from "./studio";
import { BLOCK_LABELS, INTENT_CHIPS, MODE_EMPTY, MODE_RAIL } from "./studio-copy";
import type {
  ModeToolbarState,
  StudioError,
  StudioErrorCode,
  StudioMode,
  StudioSeoDraft,
  StudioState,
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
  brief: "",
  instruction: "",
  mode: "compose",
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

  const handleModeChange = useCallback(
    (next: StudioMode) => onModeChange?.(next),
    [onModeChange],
  );

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

  // ── open an existing draft ────────────────────────────────────────────────────────
  useEffect(() => {
    if (!tenantId || !pageIdProp) return;
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
          mode: page.blocks.length > 0 ? "canvas" : "compose",
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

  // ── generate (whole page) ─────────────────────────────────────────────────────────
  const runGenerate = useCallback(
    async (brief: string) => {
      if (!tenantId) {
        patch({ error: { code: "NO_TENANT", message: STUDIO_ERROR_COPY.NO_TENANT, recoverable: false } });
        return;
      }
      blocksBeforeRun.current = state.blocks;
      setState((s) => ({
        ...s,
        brief,
        mode: "generating",
        selectedIndex: null,
        instruction: "",
        error: null,
        publishedUrl: null,
      }));

      const result = await generate({ brief });
      // A failure stays on the canvas and narrates itself inside GenerationExperience (with
      // a Retry). A cancel is handled by handleCancel, which restores the previous blocks.
      if (!result) return;

      const seo: StudioSeoDraft = result.seo ?? {};
      setState((s) => ({
        ...s,
        blocks: result.blocks,
        theme: result.theme,
        seo,
        title: seo.title ?? s.title,
        slug: s.slugTouched ? s.slug : kebabSlug(seo.title ?? s.title),
        mode: "canvas",
        dirty: true,
        error: null,
      }));
      reset();
    },
    [tenantId, state.blocks, generate, reset, patch],
  );

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
      onSaved?.({ id: row.id, slug: row.slug });
      return { id: row.id, slug: row.slug };
    } catch (err) {
      const e = asStudioError(err, "SAVE_FAILED");
      patch({ saving: false, error: e });
      return null;
    }
  }, [tenantId, state.blocks, state.slug, state.title, state.seo, state.pageId, state.theme, onSaved, patch]);

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
  } else if (state.mode === "canvas" && canvasBlocks.length > 0) {
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
            <StudioRailHeading
              heading={state.selectedIndex != null ? "Change one section" : MODE_RAIL.page.heading}
              description={
                state.selectedIndex != null
                  ? "Same conversation — Paige rewrites the section you picked."
                  : MODE_RAIL.page.description
              }
              teamLine={state.selectedIndex == null}
            />
          }
          railBody={
            <>
              {state.selectedIndex == null && (
                <div className="space-y-2">
                  <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                    Start from a brief
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {INTENT_CHIPS.map((chip) => (
                      <FilterChip
                        key={chip.id}
                        active={state.brief.trim() === chip.seed.trim()}
                        onClick={() => patch({ brief: chip.seed })}
                      >
                        {chip.label}
                      </FilterChip>
                    ))}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Each one drops a full brief in the box. Edit it until it's yours.
                  </p>
                </div>
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
          }
          railFooter={
            <PromptComposer
              mode={target ? "section" : "page"}
              value={target ? state.instruction : state.brief}
              onChange={(value) => patch(target ? { instruction: value } : { brief: value })}
              onSubmit={(value) => void (target ? handleSectionEdit(value) : runGenerate(value))}
              busy={busy}
              disabled={state.saving || state.publishing}
              target={target}
              onClearTarget={() => patch({ selectedIndex: null, instruction: "" })}
              onRegenerate={() => void runGenerate(state.brief)}
              canRegenerate={state.blocks.length > 0 && state.brief.trim().length >= 5}
            />
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
          />
        )}
        {visited.has("copy") && (
          <CopyMode className={mode !== "copy" ? "hidden" : undefined} tenantId={tenantId} />
        )}
        {visited.has("image") && (
          <ImageMode className={mode !== "image" ? "hidden" : undefined} tenantId={tenantId} />
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

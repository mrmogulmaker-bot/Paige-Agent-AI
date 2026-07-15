// Vibe Studio — the surface.
//
// Two panes: the composer rail (one conversational input) and the live canvas (the REAL
// renderer). The generation itself is the product demo — you watch the page you're going to
// ship draw itself, section by section, in the same component that will ship it.
//
// This is the ONLY file in the Studio that touches the seam layer. The other four components
// are pure presentation and drive everything through props, so every action the operator can
// take is also a function Paige can call headlessly (§10). There are zero `supabase.` calls
// anywhere under this folder.
//
// GOLD (§11): exactly two gold buttons exist in the whole surface — the Publish trigger in
// the toolbar below, and the confirm inside PublishDialog. Not on Generate, not on Save, not
// on a chip, not on the selection outline (that's indigo `--ring`).
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Monitor, Smartphone, Sparkles, Users, Wand2 } from "lucide-react";
import { useTenantContext } from "@/hooks/useTenantContext";
import { useGeneratePage } from "@/hooks/useGeneratePage";
import { useToast } from "@/hooks/use-toast";
import type { GrowthBlock } from "@/lib/growth";
import { Button } from "@/components/ui/button";
import {
  EmptyState,
  FilterChip,
  PageHeader,
  PageShell,
  SectionCard,
  StatePill,
  Toolbar,
} from "@/components/ui/page";
import { GenerationExperience } from "./GenerationExperience";
import { LivePreview } from "./LivePreview";
import { PromptComposer } from "./PromptComposer";
import { PublishDialog, kebabSlug } from "./PublishDialog";
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
import { BLOCK_LABELS, INTENT_CHIPS } from "./studio-copy";
import type { StudioError, StudioErrorCode, StudioSeoDraft, StudioState } from "./studio-types";

export interface StudioShellProps {
  /** Tenant scope. Falls back to the active tenant when omitted. */
  tenantId?: string;
  /** Tenant public web address — needed for the brand floor and for publish. */
  tenantSlug?: string;
  /** Open an existing page's DRAFT instead of a blank composer. */
  pageId?: string;
  /** Rendered inside a hub that already owns the masthead — suppress our own header. */
  embedded?: boolean;
  onPublished?: (result: PublishPageResult) => void;
  onSaved?: (page: { id: string; slug: string }) => void;
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

export function StudioShell({
  tenantId: tenantIdProp,
  tenantSlug: tenantSlugProp,
  pageId: pageIdProp,
  embedded = false,
  onPublished,
  onSaved,
  className,
}: StudioShellProps) {
  const { activeTenantId, activeTenant, loading: tenantLoading } = useTenantContext();
  const { toast } = useToast();

  const tenantId = tenantIdProp ?? activeTenantId ?? null;
  const tenantSlug = tenantSlugProp ?? activeTenant?.slug ?? null;

  const [state, setState] = useState<ShellState>(EMPTY_SHELL);
  const { generation, isGenerating, generate, cancel, reset } = useGeneratePage(tenantId);

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

  // ── canvas ────────────────────────────────────────────────────────────────────────
  const busy = isGenerating || state.editing;

  let canvas: ReactNode;
  if (state.mode === "generating") {
    canvas = (
      <GenerationExperience
        generation={generation}
        theme={state.theme}
        brandFloor={state.brandFloor}
        tenantId={tenantId ?? undefined}
        device={state.device}
        onCancel={handleCancel}
        onRetry={() => void runGenerate(state.brief)}
      />
    );
  } else if (state.mode === "canvas" && canvasBlocks.length > 0) {
    canvas = (
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
    canvas = (
      <EmptyState
        icon={Wand2}
        tone="brand"
        title="Your page shows up here"
        description="Describe the page on the left. Paige drafts it in front of you — every section is the real thing, not a mockup."
      />
    );
  }

  // ── still resolving the workspace: a themed skeleton, never a live-but-inert composer.
  //    Platform staff carry no active tenant (§9), so we wait for the resolve to settle
  //    before deciding between the Studio and the hard gate — a composer that can't write
  //    anywhere must never render as if it can. ───────────────────────────────────────
  if (tenantLoading && !tenantId) {
    return (
      <PageShell width="full" className={className}>
        {!embedded && (
          <PageHeader
            variant="hero"
            eyebrow="Vibe Studio"
            title="Build a page"
            description="Describe it. Paige builds it. You publish it."
          />
        )}
        <div className="grid gap-6 lg:grid-cols-[380px_1fr]">
          <div className="h-96 animate-pulse rounded-xl border border-border bg-muted/40 motion-reduce:animate-none" />
          <div className="h-96 animate-pulse rounded-xl border border-border bg-muted/40 motion-reduce:animate-none" />
        </div>
      </PageShell>
    );
  }

  // ── no workspace: a hard gate, not a broken surface ───────────────────────────────
  if (!tenantLoading && !tenantId) {
    return (
      <PageShell width="full" className={className}>
        {!embedded && (
          <PageHeader
            variant="hero"
            eyebrow="Vibe Studio"
            title="Build a page"
            description="Describe it. Paige builds it. You publish it."
          />
        )}
        <SectionCard>
          <EmptyState
            icon={Sparkles}
            tone="brand"
            title="Pick a workspace to build in"
            description="Pages are built inside a workspace so they carry its brand and its signups. Choose one from the switcher up top and the Studio opens."
          />
        </SectionCard>
      </PageShell>
    );
  }

  return (
    <PageShell width="full" className={className}>
      {!embedded && (
        <PageHeader
          variant="hero"
          eyebrow="Vibe Studio"
          title="Build a page"
          description="Describe it. Paige builds it. You publish it."
        />
      )}

      <div className="grid gap-6 lg:grid-cols-[380px_1fr]">
        {/* ── the composer rail ── */}
        <div className="space-y-4 lg:sticky lg:top-6 lg:self-start">
          <SectionCard
            icon={Sparkles}
            title={state.selectedIndex != null ? "Change one section" : "Describe the page"}
            description={
              state.selectedIndex != null
                ? "Same conversation — Paige rewrites the section you picked."
                : "One brief. Paige drafts the whole page in front of you."
            }
            footer={
              state.selectedIndex == null ? (
                // §8/§14 — the moat, stated once and quietly: it's a crew, not a chatbot.
                <p className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Users className="h-3.5 w-3.5 shrink-0" aria-hidden />
                  Paige runs a team — a brand, design, and quality agent build every page with her.
                </p>
              ) : undefined
            }
          >
            <PromptComposer
              mode={target ? "section" : "page"}
              value={target ? state.instruction : state.brief}
              onChange={(value) => patch(target ? { instruction: value } : { brief: value })}
              onSubmit={(value) => void (target ? handleSectionEdit(value) : runGenerate(value))}
              busy={busy}
              disabled={state.saving || state.publishing}
              target={target}
              onClearTarget={() => patch({ selectedIndex: null, instruction: "" })}
              chips={INTENT_CHIPS}
              onRegenerate={() => void runGenerate(state.brief)}
              canRegenerate={state.blocks.length > 0 && state.brief.trim().length >= 5}
            />
          </SectionCard>

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
        </div>

        {/* ── the live canvas ── */}
        <SectionCard padded={false} className="overflow-hidden">
          <div className="border-b border-border/60 px-4 py-3">
            <Toolbar>
              <div className="flex items-center gap-1.5">
                <FilterChip active={state.device === "desktop"} onClick={() => patch({ device: "desktop" })}>
                  <Monitor className="h-3.5 w-3.5" aria-hidden />
                  Desktop
                </FilterChip>
                <FilterChip active={state.device === "mobile"} onClick={() => patch({ device: "mobile" })}>
                  <Smartphone className="h-3.5 w-3.5" aria-hidden />
                  Mobile
                </FilterChip>
              </div>

              <div className="flex items-center gap-2">
                {/* GOLD (§11): the ONLY gold that lives at rest — and only on a page that is
                    genuinely live and in sync. Unpublished edits drop it to warning; a draft
                    is off. Gold means "this is on the internet right now," nothing less. */}
                <StatePill
                  state={state.status === "published" ? (state.dirty ? "warning" : "on") : "off"}
                >
                  {state.status === "published" ? (state.dirty ? "Unpublished changes" : "Live") : "Draft"}
                </StatePill>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => void handleSave()}
                  disabled={state.saving || state.publishing || busy || state.blocks.length === 0}
                >
                  {state.saving ? "Saving…" : "Save"}
                </Button>
                {/* GOLD #1 of 2 — the act. */}
                <Button
                  variant="gold"
                  size="sm"
                  onClick={() => patch({ publishOpen: true, publishedUrl: null, error: null })}
                  disabled={state.publishing || busy || state.blocks.length === 0}
                >
                  Publish
                </Button>
              </div>
            </Toolbar>
          </div>

          <div className="bg-muted/30 p-4">{canvas}</div>
        </SectionCard>
      </div>

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
    </PageShell>
  );
}

export default StudioShell;

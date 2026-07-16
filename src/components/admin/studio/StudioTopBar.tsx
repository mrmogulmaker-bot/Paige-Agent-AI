// The Studio's real toolbar — the top strip of the immersive workspace.
//
// Pure presentation: everything here is driven through props (§10 — the seam functions
// behind these buttons are what Paige calls headlessly; this bar is just one caller's UI).
//
// GOLD (§11): exactly ONE gold act lives here per mode —
//   page   → Publish (opens PublishDialog; the confirm inside is the second, dialog-scoped gold)
//   funnel → Publish funnel
//   form   → Create form
//   copy   → none in the bar (gold lives on each draft card's "Save to library")
//   image  → none at all (the act is the server's auto-file; the result pill reports it)
// Everything else — mode chips, device chips, Save, Library — is indigo/neutral.
//
// The theme toggle here is Studio-LOCAL (owner-requested follow-up) — it does NOT use
// `ThemeToggle`/next-themes, which drives the platform's single global `<html>` class. That
// was tried once and removed: it changed the whole platform's theme once the operator left
// Studio, which read as "the Studio broke my theme." Instead, `studioDark`/onToggleStudioTheme
// are owned by StudioShell as plain local state (persisted to its own localStorage key) and
// only ever flip the literal `dark` class on StudioFrame's own root div — nothing outside
// this component tree is touched, in either direction.
//
// MODE STRIP (§18): this used to render all five modes as a permanent, equal-weight tab row
// — the exact "pick a type before Paige has heard the brief" gate §18 exists to forbid. It's
// now driven entirely by `visibleModes`, computed in StudioShell from REAL content per mode
// (never just "this mode was mounted"). A fresh session passes an EMPTY array — no strip at
// all — and the row only reappears once there's a genuine second destination to switch to.
// Funnel never appears in that array (zero AI-generation path — 100% manual); it gets its own
// small, deliberately-secondary ghost button instead, always reachable, never a co-equal tab.
import {
  FileText,
  GitBranch,
  Image as ImageIcon,
  LayoutGrid,
  Library,
  Loader2,
  Monitor,
  Moon,
  PenLine,
  Smartphone,
  Sun,
  Wand2,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FilterChip, GlyphPlate, StatePill } from "@/components/ui/page";
import { cn } from "@/lib/utils";
import { MODE_LABELS } from "./studio-copy";
import {
  type DeviceFrame,
  type ModeToolbarState,
  type StudioMode,
} from "./studio-types";

const MODE_ICONS: Record<StudioMode, LucideIcon> = {
  page: LayoutGrid,
  funnel: GitBranch,
  form: FileText,
  copy: PenLine,
  image: ImageIcon,
};

export interface StudioTopBarProps {
  mode: StudioMode;
  onModeChange: (mode: StudioMode) => void;
  /** Which of page/form/copy/image have earned a real tab this session (StudioShell decides —
   *  see its "the mode-tab strip" block). Never includes "funnel" — that has its own ghost
   *  button below, always available regardless of content. Empty = render no strip at all. */
  visibleModes: readonly StudioMode[];
  /** Studio-LOCAL dark/light (StudioShell's own state, StudioFrame's own `dark` class) — never
   *  the platform's next-themes. See the doc comment above for why this isn't `ThemeToggle`. */
  studioDark: boolean;
  onToggleStudioTheme: () => void;

  // — page mode —
  title?: string;
  onTitleChange?: (title: string) => void;
  device?: DeviceFrame;
  onDeviceChange?: (device: DeviceFrame) => void;
  status?: "draft" | "published";
  dirty?: boolean;
  onSave?: () => void;
  saving?: boolean;
  saveDisabled?: boolean;
  onPublish?: () => void;
  publishing?: boolean;
  publishDisabled?: boolean;

  // — copy / image modes —
  onOpenLibrary?: () => void;

  // — funnel / form modes (published by the mounted mode component) —
  modeBar?: ModeToolbarState | null;

  // — AI funnel (§18/§19): a funnel built from the page composer renders IN the page surface,
  //   so when it's active the page-only controls give way to the funnel's own gold act. This
  //   is NOT a separate tab — there's no funnel chip, no funnel button, just this act. —
  funnelActive?: boolean;
  funnelLive?: boolean;
  onPublishFunnel?: () => void;
  funnelPublishing?: boolean;
  publishFunnelDisabled?: boolean;

  className?: string;
}

export function StudioTopBar({
  mode,
  onModeChange,
  visibleModes,
  studioDark,
  onToggleStudioTheme,
  title,
  onTitleChange,
  device,
  onDeviceChange,
  status = "draft",
  dirty = false,
  onSave,
  saving = false,
  saveDisabled = false,
  onPublish,
  publishing = false,
  publishDisabled = false,
  onOpenLibrary,
  modeBar,
  funnelActive = false,
  funnelLive = false,
  onPublishFunnel,
  funnelPublishing = false,
  publishFunnelDisabled = false,
  className,
}: StudioTopBarProps) {
  // When a funnel is up, the page-only controls (title, device, Save, Publish, the page
  // StatePill) stand down in favour of the funnel's own act — same surface, different act.
  const isPage = mode === "page" && !funnelActive;
  const hasLibrary = mode === "copy" || mode === "image";

  return (
    <div
      className={cn(
        // shadow-sm gives this bar real separation from the rail/canvas below it — the
        // border alone was the whole "flat wireframe" tell (§11). Softened to /60 now that
        // the shadow carries the edge, so the two don't stack at full strength. `relative
        // z-10` is load-bearing, not decoration: this bar is EARLIER in DOM order than the
        // rail/canvas below it, and non-positioned siblings paint in tree order — without a
        // stacking context ahead of them, the rail/canvas's own opaque backgrounds (painted
        // later) would silently cover this shadow's downward bleed, making it a no-op.
        // bg-gradient-to-b from-card to-muted/20: the masthead is a top-lit tonal wash, and
        // its bottom stop (to-muted/20) lands on the EXACT tone the canvas well opens with
        // (StudioChrome's from-muted/20), so masthead → working surface reads as one continuous
        // machined surface instead of two flat panels stacked with a shadow between (§6/§11).
        "relative z-10 flex min-h-14 shrink-0 flex-wrap items-center justify-between gap-x-3 gap-y-2 border-b border-border/60 bg-gradient-to-b from-card to-muted/20 px-3 py-2 shadow-sm md:px-4",
        className,
      )}
    >
      {/* ── identity + the mode switcher ── */}
      <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-2">
        <div className="flex items-center gap-2">
          <GlyphPlate icon={Wand2} size="sm" />
          <span className="font-display text-sm font-semibold text-foreground">Studio</span>
          {/* Honest state (§13) — the Studio is under active, ongoing development;
              say so rather than let a rough edge read as a bug nobody knows about. */}
          <Badge
            variant="outline"
            className="text-[10px] font-medium uppercase tracking-wide border-border text-muted-foreground bg-transparent"
          >
            Beta
          </Badge>
        </div>
        {/* A fresh session — nothing generated, drafted, or saved yet — renders NOTHING here:
            one composer, no picker. The strip earns its place back one real tab at a time as
            `visibleModes` grows (StudioShell owns that call). Never framed as "pick a type." */}
        {visibleModes.length > 0 && (
          <div role="group" aria-label="Switch what you've built this session" className="flex flex-wrap items-center gap-1">
            {visibleModes.map((m) => {
              const Icon = MODE_ICONS[m];
              return (
                <FilterChip key={m} active={mode === m} onClick={() => onModeChange(m)}>
                  <Icon className="h-3.5 w-3.5" aria-hidden />
                  {MODE_LABELS[m]}
                </FilterChip>
              );
            })}
          </div>
        )}

        {/* No funnel tab/button here by design (§18/§19): a funnel is born from the ONE composer
            like every other artifact — the classifier routes it, it renders in the page surface,
            and its gold act appears on the right when it's active. There is no upfront funnel
            gate for the operator to clear before Paige has heard the brief. */}
      </div>

      {/* ── the page's name, inline (page mode; hidden when the bar is tight) ── */}
      {isPage && onTitleChange && (
        <div className="hidden min-w-0 flex-1 px-2 xl:block">
          <Input
            value={title ?? ""}
            onChange={(e) => onTitleChange(e.target.value)}
            placeholder="Untitled page"
            aria-label="Page title"
            className="h-8 w-full max-w-sm border-transparent bg-transparent px-1 font-display text-sm font-semibold focus-visible:border-input"
          />
        </div>
      )}

      {/* ── the acts ── */}
      <div className="flex flex-wrap items-center gap-2">
        {/* Studio-local only (§ above) — flips StudioFrame's own `dark` class, nothing else. */}
        {/* h-9 w-9 folds this into the 36px act-row rhythm — size="icon" is 40px, the ONE
            control that broke the cluster (it filled the bar edge-to-edge while Save/Publish
            floated with breathing room). Studio-local theme wiring is untouched. */}
        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={onToggleStudioTheme}
          aria-label={studioDark ? "Switch this session to light mode" : "Switch this session to dark mode"}
          className="h-9 w-9"
        >
          {studioDark ? <Sun className="h-4 w-4" aria-hidden /> : <Moon className="h-4 w-4" aria-hidden />}
        </Button>
        {isPage && onDeviceChange && (
          // A binary XOR choice belongs in ONE recessed segmented track with a lifted thumb —
          // reads as a single machined control, not two competing pills (the Linear/macOS
          // affordance, and semantically more correct than loose chips). FilterChip stays the
          // shared primitive, unforked (§18): border-transparent drops the inactive hairline so
          // the inactive segment is clean text-on-track, and the active chip gains shadow-sm so
          // its indigo bg-primary fill reads as a thumb sitting in the well. Inset uses the
          // shared --shadow-ink token (dark ink in both themes). Active stays indigo, never gold.
          <div
            className="flex items-center gap-0.5 rounded-full bg-muted/60 p-0.5 shadow-[inset_0_1px_1px_hsl(var(--shadow-ink)/0.08)]"
            role="group"
            aria-label="Preview device"
          >
            <FilterChip
              active={device === "desktop"}
              onClick={() => onDeviceChange("desktop")}
              className={cn("border-transparent", device === "desktop" && "shadow-sm")}
            >
              <Monitor className="h-3.5 w-3.5" aria-hidden />
              Desktop
            </FilterChip>
            <FilterChip
              active={device === "mobile"}
              onClick={() => onDeviceChange("mobile")}
              className={cn("border-transparent", device === "mobile" && "shadow-sm")}
            >
              <Smartphone className="h-3.5 w-3.5" aria-hidden />
              Mobile
            </FilterChip>
          </div>
        )}

        {isPage && (
          /* GOLD (§11): the ONLY gold that lives at rest — and only on a page that is
             genuinely live and in sync. Unpublished edits drop it to warning; a draft
             is off. Gold means "this is on the internet right now," nothing less. */
          <StatePill state={status === "published" ? (dirty ? "warning" : "on") : "off"}>
            {status === "published" ? (dirty ? "Unpublished changes" : "Live") : "Draft"}
          </StatePill>
        )}

        {hasLibrary && onOpenLibrary && (
          <Button variant="ghost" size="sm" onClick={onOpenLibrary}>
            <Library className="h-3.5 w-3.5" aria-hidden />
            Library
          </Button>
        )}

        {isPage && onSave && (
          // shadow-xs hover:shadow-sm: the outline variant has NO resting shadow, so its
          // hairline read as a drawn line next to gold Publish — the owner's literal note
          // ("the outlines and the lines themselves look like they're there"). A whisper of
          // ink depth grounds the edge as a real raised button; the lift stays subordinate to
          // Publish's own -translate-y hover, so the hierarchy stays intentional. Ink, never gold.
          <Button variant="outline" size="sm" onClick={onSave} disabled={saveDisabled} className="shadow-xs hover:shadow-sm">
            {saving ? "Saving…" : "Save"}
          </Button>
        )}

        {!isPage && modeBar?.save && (
          <Button
            variant="outline"
            size="sm"
            onClick={modeBar.save.onClick}
            disabled={modeBar.save.disabled}
            className="shadow-xs hover:shadow-sm"
          >
            {modeBar.save.busy && (
              <Loader2 className="h-3.5 w-3.5 animate-spin motion-reduce:animate-none" aria-hidden />
            )}
            {modeBar.save.label}
          </Button>
        )}

        {/* GOLD #1 — the act. */}
        {isPage && onPublish && (
          <Button variant="gold" size="sm" onClick={onPublish} disabled={publishDisabled}>
            Publish
          </Button>
        )}

        {/* AI funnel act — the SAME page surface, its own gold moment (§11/§18/§19). The pill
            reads the funnel's real live state; gold ships the whole sequence (page + funnel). */}
        {funnelActive && (
          <>
            <StatePill state={funnelLive ? "on" : "off"}>{funnelLive ? "Live" : "Draft"}</StatePill>
            {onPublishFunnel && (
              <Button
                variant="gold"
                size="sm"
                onClick={onPublishFunnel}
                disabled={publishFunnelDisabled}
              >
                {funnelPublishing && (
                  <Loader2 className="h-3.5 w-3.5 animate-spin motion-reduce:animate-none" aria-hidden />
                )}
                {funnelPublishing ? "Publishing…" : funnelLive ? "Republish funnel" : "Publish funnel"}
              </Button>
            )}
          </>
        )}

        {!isPage && modeBar?.act && (
          <Button
            variant="gold"
            size="sm"
            onClick={modeBar.act.onClick}
            disabled={modeBar.act.disabled}
          >
            {modeBar.act.busy && (
              <Loader2 className="h-3.5 w-3.5 animate-spin motion-reduce:animate-none" aria-hidden />
            )}
            {modeBar.act.label}
          </Button>
        )}
      </div>
    </div>
  );
}

export default StudioTopBar;

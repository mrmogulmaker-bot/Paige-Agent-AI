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
  PenLine,
  Smartphone,
  Wand2,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FilterChip, GlyphPlate, StatePill } from "@/components/ui/page";
import { ThemeToggle } from "@/components/ThemeToggle";
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

  className?: string;
}

export function StudioTopBar({
  mode,
  onModeChange,
  visibleModes,
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
  className,
}: StudioTopBarProps) {
  const isPage = mode === "page";
  const hasLibrary = mode === "copy" || mode === "image";

  return (
    <div
      className={cn(
        "flex min-h-14 shrink-0 flex-wrap items-center justify-between gap-x-3 gap-y-2 border-b border-border bg-card px-3 py-2 md:px-4",
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

        {/* Funnel — the one deliberate exception (§18): zero AI-generation path, 100% manual,
            so it can never earn a spot in the tab strip above. A quiet ghost button, always
            here regardless of session content — ISN'T styled as a co-equal tab (no active-pill
            fill, no icon-plus-label pair matching the FilterChips) so it never restores the
            "6th tab" picker the owner rejected. Toggles: click in from anywhere, click again
            (while parked there) to head back to the Page composer. */}
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => onModeChange(mode === "funnel" ? "page" : "funnel")}
          aria-pressed={mode === "funnel"}
          className={cn(
            "h-7 gap-1.5 px-2.5 text-xs text-muted-foreground hover:text-foreground",
            mode === "funnel" && "bg-muted text-foreground",
          )}
        >
          <GitBranch className="h-3.5 w-3.5" aria-hidden />
          {mode === "funnel" ? "Back to page" : "Funnel"}
        </Button>
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
        <ThemeToggle />
        {isPage && onDeviceChange && (
          <div className="flex items-center gap-1" role="group" aria-label="Preview device">
            <FilterChip active={device === "desktop"} onClick={() => onDeviceChange("desktop")}>
              <Monitor className="h-3.5 w-3.5" aria-hidden />
              Desktop
            </FilterChip>
            <FilterChip active={device === "mobile"} onClick={() => onDeviceChange("mobile")}>
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
          <Button variant="outline" size="sm" onClick={onSave} disabled={saveDisabled}>
            {saving ? "Saving…" : "Save"}
          </Button>
        )}

        {!isPage && modeBar?.save && (
          <Button
            variant="outline"
            size="sm"
            onClick={modeBar.save.onClick}
            disabled={modeBar.save.disabled}
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

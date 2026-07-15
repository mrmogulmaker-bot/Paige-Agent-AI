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
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FilterChip, GlyphPlate, StatePill } from "@/components/ui/page";
import { cn } from "@/lib/utils";
import { MODE_LABELS } from "./studio-copy";
import {
  STUDIO_MODES,
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
        </div>
        <div role="group" aria-label="What are you creating" className="flex flex-wrap items-center gap-1">
          {STUDIO_MODES.map((m) => {
            const Icon = MODE_ICONS[m];
            return (
              <FilterChip key={m} active={mode === m} onClick={() => onModeChange(m)}>
                <Icon className="h-3.5 w-3.5" aria-hidden />
                {MODE_LABELS[m]}
              </FilterChip>
            );
          })}
        </div>
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

// The Studio's real toolbar — the top strip of the immersive workspace.
//
// Pure presentation: everything here is driven through props (§10 — the seam functions
// behind these buttons are what Paige calls headlessly; this bar is just one caller's UI).
//
// GOLD (§11): exactly ONE gold act lives here per mode —
//   page   → Publish (opens PublishDialog; the confirm inside is the second, dialog-scoped gold)
//   funnel → Publish funnel
//   form   → Create form
//   image  → none at all (the act is the server's auto-file; the result pill reports it)
// Everything else — device chips, Save, Library — is indigo/neutral.
//
// The theme toggle here is Studio-LOCAL (owner-requested follow-up) — it does NOT use
// `ThemeToggle`/next-themes, which drives the platform's single global `<html>` class. That
// was tried once and removed: it changed the whole platform's theme once the operator left
// Studio, which read as "the Studio broke my theme." Instead, `studioDark`/onToggleStudioTheme
// are owned by StudioShell as plain local state (persisted to its own localStorage key) and
// only ever flip the literal `dark` class on StudioFrame's own root div — nothing outside
// this component tree is touched, in either direction.
//
// NO MODE STRIP (§18/§21): there is no artifact-type row in this bar at all — not an upfront
// picker, and not a content-derived "switch what you built" tab row either. This used to render
// the five modes as tabs; that was the exact "pick a type before Paige has heard the brief" gate
// §18 forbids, and §21 (owner 2026-07-17) made it explicit: everything a tenant makes streams in
// ONE session, the persistent navigator is the project rail (ProjectNavigator, which lists
// artifacts by NAME — navigation, never a type-picker), and the brief + Paige's classifier are the
// ONLY thing that picks a type. A tenant never clicks a type; they describe what they want and the
// classifier routes it — including PIVOTING mid-session ("now build the intake form" → form).
// Funnel likewise has no button (§18/§19): an AI funnel builds inside the page surface, reached
// only conversationally; when one is active its gold act (`funnelActive`) replaces the page acts.
import { useState } from "react";
import {
  Bookmark,
  Library,
  Loader2,
  Sparkles,
  Monitor,
  Moon,
  MoreHorizontal,
  Smartphone,
  Sun,
  Trash2,
  Wand2,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { FilterChip, GlyphPlate, StatePill } from "@/components/ui/page";
import { cn } from "@/lib/utils";
import {
  type DeviceFrame,
  type ModeToolbarState,
  type StudioMode,
} from "./studio-types";

export interface StudioTopBarProps {
  mode: StudioMode;
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
  /** Keep THIS page in the tenant's media library (#284) — a deliberate curation act, distinct
   *  from publish. Neutral (not gold): gold stays on the publish moment (§11). Omit when there's
   *  no saved page yet to keep. */
  onSaveToLibrary?: () => void;
  savingToLibrary?: boolean;

  // — image mode (the library button; also lists any legacy saved copy rows read-only) —
  onOpenLibrary?: () => void;
  /** Open the session's creative-design chat (#292). Shown in every session. */
  onOpenChat?: () => void;

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
  /** Leave the funnel and return to a blank composer — the operator's way out (§13). */
  onExitFunnel?: () => void;

  // — session-level acts (all modes) —
  /** Delete THIS project. Fires only after the operator confirms in the AlertDialog below —
   *  never a native confirm() (§11). Session-scoped, so it's reachable in EVERY mode via one
   *  consistent neutral ⋯ actions menu beside the mode's act (never a gold caret). Omit
   *  (e.g. the legacy ?pageId path with no session) to hide it entirely. */
  onDeleteProject?: () => void;
  /** The project's name, shown in the delete confirmation copy. */
  projectTitle?: string;

  className?: string;
}

export function StudioTopBar({
  mode,
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
  onSaveToLibrary,
  savingToLibrary = false,
  onOpenLibrary,
  onOpenChat,
  modeBar,
  funnelActive = false,
  funnelLive = false,
  onPublishFunnel,
  funnelPublishing = false,
  publishFunnelDisabled = false,
  onExitFunnel,
  onDeleteProject,
  projectTitle,
  className,
}: StudioTopBarProps) {
  // When a funnel is up, the page-only controls (title, device, Save, Publish, the page
  // StatePill) stand down in favour of the funnel's own act — same surface, different act.
  const isPage = mode === "page" && !funnelActive;
  const hasLibrary = mode === "image";

  // Delete-project confirm (§11: the shared AlertDialog, never confirm()). Reached from the
  // page Publish split-button's dropdown OR the neutral session ⋯ in every other mode; the
  // seam + navigation only run on the operator's explicit confirm (§13).
  const [deleteOpen, setDeleteOpen] = useState(false);
  const projectLabel = projectTitle?.trim() || "this project";

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
        // The masthead is a LIT indigo tonal wash (was platform card→muted, two desaturated
        // grays — the exact "lifeless gray toolbar" tell). Its top stop is a lifted indigo glass
        // (--studio-topbar-from) and its bottom stop (--studio-topbar-to) lands on the canvas
        // tone, so masthead → rail/well reads as one continuous machined indigo surface, not two
        // flat panels stacked with a shadow between (§6/§11). Publish stays gold — untouched.
        "relative z-10 flex min-h-14 shrink-0 flex-wrap items-center justify-between gap-x-3 gap-y-2 border-b border-[hsl(var(--studio-chrome-border)/0.5)] bg-gradient-to-b from-[hsl(var(--studio-topbar-from))] to-[hsl(var(--studio-topbar-to))] px-3 py-2 shadow-sm md:px-4",
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
        {/* §21 (owner 2026-07-17): there is NO artifact-type strip here — not an upfront picker,
            and not a "switch what you built" type-tab row either. Everything a tenant makes streams
            inside this ONE session; the persistent navigator is the project rail (ProjectNavigator),
            which lists the session's artifacts by NAME — navigation, never a type-picker. A tenant
            never clicks a type; they describe what they want and the classifier routes it. */}

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

        {onOpenChat && (
          // The session's creative-design chat (#292) — talk to your design agent to CREATE by
          // conversation; what it makes renders in the session. Neutral (gold stays on Publish, §11).
          <Button variant="ghost" size="sm" onClick={onOpenChat} className="gap-1.5">
            <Sparkles className="h-3.5 w-3.5" aria-hidden />
            Chat
          </Button>
        )}

        {hasLibrary && onOpenLibrary && (
          // "Assets" = this mode's recent generations/copy (everything filed to marketing_content).
          // Distinct from the cross-type curated "Saved library" in the rail (§18 — two layers, two
          // names): assets is everything you've made here; the saved library is the winners you kept.
          <Button variant="ghost" size="sm" onClick={onOpenLibrary}>
            <Library className="h-3.5 w-3.5" aria-hidden />
            Assets
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

        {/* GOLD #1 — the act. Gold is spent ONLY here, on Publish itself; the other project
            actions live in the neutral ⋯ "bubble" beside it (below), never on a gold caret. That
            keeps the gold budget on the single publish moment (§11) while still giving the operator
            the actions menu the owner asked for — one consistent control in every mode. */}
        {/* Neutral keep — save this page to the media library (#284). Curation, not the act, so it
            stays off the gold budget (§11); gold remains on Publish alone. */}
        {isPage && onSaveToLibrary && (
          <Button variant="outline" size="sm" onClick={onSaveToLibrary} disabled={savingToLibrary} className="gap-1.5">
            {savingToLibrary
              ? <Loader2 className="h-3.5 w-3.5 animate-spin motion-reduce:animate-none" aria-hidden />
              : <Bookmark className="h-3.5 w-3.5" aria-hidden />}
            Save to library
          </Button>
        )}

        {isPage && onPublish && (
          <Button variant="gold" size="sm" onClick={onPublish} disabled={publishDisabled}>
            Publish
          </Button>
        )}

        {/* AI funnel act — the SAME page surface, its own gold moment (§11/§18/§19). The pill
            reads the funnel's real live state; gold ships the whole sequence (page + funnel).
            "Start over" is the way out so the operator is never trapped in one artifact (§13). */}
        {funnelActive && (
          <>
            {onExitFunnel && (
              <Button variant="ghost" size="sm" onClick={onExitFunnel} className="text-muted-foreground hover:text-foreground">
                Start over
              </Button>
            )}
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

        {/* Session-level ⋯ actions "bubble" — the ONE home for project acts (Delete today, room
            for more). Delete is a PROJECT act, not a page act, so it renders IDENTICALLY in every
            mode (page / image / form / funnel) — one neutral ⋯ beside the mode's gold act,
            never a gold caret and never a different chrome per mode (§11 gold discipline + one
            consistent control the owner asked for). */}
        {onDeleteProject && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" aria-label="Project actions" className="h-9 w-9">
                <MoreHorizontal className="h-4 w-4" aria-hidden />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              <DropdownMenuItem
                onClick={() => setDeleteOpen(true)}
                className="text-destructive focus:bg-destructive/10 focus:text-destructive"
              >
                <Trash2 className="mr-2 h-4 w-4" aria-hidden />
                Delete project
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>

      {/* The shared delete confirm — one dialog for both entry points (the Publish split and the
          session ⋯). onDeleteProject runs ONLY on the operator's confirm (§11/§13). */}
      {onDeleteProject && (
        <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete this project?</AlertDialogTitle>
              <AlertDialogDescription>
                “{projectLabel}” will be removed from your projects. Are you sure?
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={onDeleteProject}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                Confirm deletion
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}
    </div>
  );
}

export default StudioTopBar;

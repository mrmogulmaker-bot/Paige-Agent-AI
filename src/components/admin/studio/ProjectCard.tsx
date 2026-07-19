// One session on the projects gallery — an authoring PROJECT, not an artifact row (§18).
//
// The card IS the session (the resumable room), and it shows which artifacts live inside via a
// glyph row (§19). Premium per §11: the cover routes through the shared ArtifactPreview primitive
// (§12/§18 — a real scaled thumbnail when the session has one, else the branded cosmic field with
// the primary-kind glyph on an INDIGO hairline) — never a broken <img>, never a bare "Loading…".
// Keyboard-openable (role=button + Enter/Space), motion guarded by useReducedMotion (the card is a
// variant child of the gallery's stagger container), token-only classes, indigo --ring focus. The
// star is a resting per-user flag, so it is deliberately NOT gold — gold is the act/on moment (§11).
import { useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import {
  Copy,
  FileText,
  FolderOpen,
  GitBranch,
  Image as ImageIcon,
  LayoutGrid,
  MoreHorizontal,
  Pencil,
  Star,
  Trash2,
  Wand2,
  type LucideIcon,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { ArtifactPreview, StatePill } from "@/components/ui/page";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import type { StudioArtifactType, StudioSessionCard } from "./studio-types";

const ARTIFACT_GLYPH: Record<StudioArtifactType, LucideIcon> = {
  page: LayoutGrid,
  form: FileText,
  funnel: GitBranch,
  image: ImageIcon,
};

export interface ProjectCardProps {
  session: StudioSessionCard;
  /** Templates render without the star toggle, the live/draft pill, and the manage menu. */
  isTemplate?: boolean;
  onOpen: () => void;
  onToggleStar: () => void;
  /** Rename the project. Receives the new title. Omit to hide the Rename item. Fire-and-forget:
   *  the caller owns the optimistic update + error surfacing (§13). */
  onRename?: (title: string) => void;
  /** Duplicate the project. Omit to hide the item — there is no clone seam yet, so the gallery
   *  ships WITHOUT a Duplicate item rather than a dead one (§13). */
  onDuplicate?: () => void;
  /** Delete the project. Called on the operator's confirm inside the AlertDialog (never a native
   *  confirm(), §11). Omit to hide the Delete item. */
  onDelete?: () => void;
}

/** "Edited 3 days ago" — relative, honest, never a raw timestamp on a card. */
function editedAgo(iso: string): string {
  try {
    return `Edited ${formatDistanceToNow(new Date(iso), { addSuffix: true })}`;
  } catch {
    return "Edited recently";
  }
}

export function ProjectCard({
  session,
  isTemplate = false,
  onOpen,
  onToggleStar,
  onRename,
  onDuplicate,
  onDelete,
}: ProjectCardProps) {
  const reduce = useReducedMotion();
  // The ⋯ manage menu + its two dialogs. Delete confirms in a shared AlertDialog; rename collects
  // the new title in a shared Dialog — never a native confirm()/prompt() (§11).
  const [renameOpen, setRenameOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [renameValue, setRenameValue] = useState(session.title || "");
  const projectLabel = session.title || "Untitled project";
  // The menu earns its place only when the operator can actually DO something with this card and
  // it isn't a read-only starter template.
  const hasMenu = !isTemplate && (!!onRename || !!onDuplicate || !!onDelete);

  const submitRename = () => {
    const next = renameValue.trim();
    setRenameOpen(false);
    if (next && next !== session.title) onRename?.(next);
  };

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      onOpen();
    }
  };

  return (
    <motion.li
      // A variant child of the gallery's stagger container (StudioHome): hidden→show cascades from
      // the parent as one continuous act (§22). No own initial/animate — it inherits the parent's
      // orchestration. Under reduced motion both states are identical (no offset), so it rests.
      variants={{
        hidden: reduce ? { opacity: 1 } : { opacity: 0, y: 10 },
        show: reduce
          ? { opacity: 1 }
          : { opacity: 1, y: 0, transition: { type: "spring", stiffness: 300, damping: 30, mass: 0.8 } },
      }}
    >
      <div
        role="button"
        tabIndex={0}
        onClick={onOpen}
        onKeyDown={onKey}
        aria-label={`Open ${session.title || "Untitled project"}`}
        className={cn(
          // The premium card surface (§11 primitive): tokenized indigo hairline + layered
          // elevation, rising with an indigo bloom on hover (#4/#5). `.studio-card` owns the
          // border/fill/shadow/lift; the focus ring stays indigo --ring (never gold).
          "studio-card group relative flex h-full flex-col overflow-hidden rounded-[var(--radius)]",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))]",
          // ACTIVELY BUILDING → the traveling GOLD edge-beam (§22/§27 #5a). Gold is sanctioned here
          // because building IS the act (§11); every other card stays indigo/plain. Static under
          // reduced motion (index.css). NOTE (§13): the beam lights only when the session row's
          // status is 'building' — see the honesty note in StudioHome / the build report; no client
          // write path sets 'building' today, so this is wired behind the real flag, not faked on.
          session.status === "building" && "studio-card--building",
        )}
      >
        {/* Thumbnail well — the ONE shared ArtifactPreview primitive (§12/§18): a REAL scaled cover
            when the session carries a captured page/document thumbnail or an image artifact's Storage
            URL, else the branded per-project cosmic field with the primary-kind glyph resting on an
            INDIGO hairline (§11 — the resting-gold fix). 404/tombstone-safe. The well clips the hover
            zoom (overflow-hidden), so nothing bleeds past the card edge. */}
        <div className="relative aspect-[16/10] overflow-hidden bg-[hsl(var(--studio-canvas))]">
          {/* Hover micro-interaction (§27 #5c): the real cover eases a hair toward the viewer as the
              card lifts — the well clips the zoom (overflow-hidden), so nothing bleeds past the edge.
              Transform-only, no-oped under reduced motion. */}
          <div className="absolute inset-0 transition-transform duration-500 ease-[cubic-bezier(0.16,1,0.3,1)] group-hover:scale-[1.04] motion-reduce:transform-none motion-reduce:transition-none">
            <ArtifactPreview
              kind={session.primaryKind}
              thumbnailUrl={session.thumbnailUrl}
              seed={session.id}
              reduce={!!reduce}
            />
          </div>
          {/* Top-right controls — the star and the ⋯ manage menu ride together. The whole cluster
              stops click/keydown from bubbling to the card's role=button, so operating a control
              never also opens the project. Star stays neutral; ⋯ stays neutral — gold is spent
              only on the act/on moment (§11). */}
          {(!isTemplate || hasMenu) && (
            <div
              className="absolute right-2 top-2 flex items-center gap-1"
              onClick={(e) => e.stopPropagation()}
              onKeyDown={(e) => e.stopPropagation()}
            >
              {!isTemplate && (
                <button
                  type="button"
                  aria-pressed={session.starred}
                  aria-label={session.starred ? "Unstar project" : "Star project"}
                  onClick={onToggleStar}
                  className="rounded-full border border-[hsl(var(--studio-glass-border)/0.5)] bg-background/85 p-1.5 shadow-sm backdrop-blur transition-[background-color,border-color,transform] hover:border-[hsl(var(--studio-glass-border)/0.9)] hover:bg-background active:scale-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))] motion-reduce:active:scale-100"
                >
                  <Star
                    className={cn(
                      "h-4 w-4",
                      session.starred ? "fill-current text-foreground" : "text-muted-foreground",
                    )}
                    aria-hidden
                  />
                </button>
              )}
              {hasMenu && (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button
                      type="button"
                      aria-label={`Manage ${projectLabel}`}
                      className="rounded-full border border-[hsl(var(--studio-glass-border)/0.5)] bg-background/85 p-1.5 text-muted-foreground shadow-sm backdrop-blur transition-[background-color,border-color,color,transform] hover:border-[hsl(var(--studio-glass-border)/0.9)] hover:bg-background hover:text-foreground active:scale-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))] motion-reduce:active:scale-100"
                    >
                      <MoreHorizontal className="h-4 w-4" aria-hidden />
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-44">
                    <DropdownMenuItem onClick={onOpen}>
                      <FolderOpen className="mr-2 h-4 w-4" aria-hidden />
                      Open
                    </DropdownMenuItem>
                    {onRename && (
                      <DropdownMenuItem
                        onClick={() => {
                          setRenameValue(session.title || "");
                          setRenameOpen(true);
                        }}
                      >
                        <Pencil className="mr-2 h-4 w-4" aria-hidden />
                        Rename
                      </DropdownMenuItem>
                    )}
                    {onDuplicate && (
                      <DropdownMenuItem onClick={onDuplicate}>
                        <Copy className="mr-2 h-4 w-4" aria-hidden />
                        Duplicate
                      </DropdownMenuItem>
                    )}
                    {onDelete && (
                      <>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          onClick={() => setDeleteOpen(true)}
                          className="text-destructive focus:bg-destructive/10 focus:text-destructive"
                        >
                          <Trash2 className="mr-2 h-4 w-4" aria-hidden />
                          Delete
                        </DropdownMenuItem>
                      </>
                    )}
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
            </div>
          )}
        </div>

        {/* Body */}
        <div className="flex min-w-0 flex-1 flex-col gap-2 p-4">
          <div className="flex items-start justify-between gap-2">
            <h3 className="truncate font-display text-sm font-semibold leading-tight tracking-[-0.011em] text-foreground">
              {session.title || "Untitled project"}
            </h3>
            {!isTemplate && (
              <StatePill
                state={
                  session.status === "building"
                    ? "building"
                    : session.status === "published"
                      ? "on"
                      : "pending"
                }
              >
                {session.status === "building"
                  ? "Building"
                  : session.status === "published"
                    ? "Live"
                    : "Draft"}
              </StatePill>
            )}
          </div>

          {/* What lives inside this session — the multi-artifact glyph row (§19). */}
          {session.artifactKinds.length > 0 && (
            <div className="flex items-center gap-1.5" aria-label="Artifacts in this project">
              {session.artifactKinds.map((k) => {
                const G = ARTIFACT_GLYPH[k] ?? Wand2;
                return <G key={k} className="h-3.5 w-3.5 text-muted-foreground" aria-hidden />;
              })}
            </div>
          )}

          <p className="mt-auto text-[11px] tabular-nums text-muted-foreground">
            {isTemplate ? "Start from this" : editedAgo(session.lastEditedAt)}
          </p>
        </div>
      </div>

      {/* Rename — a real dialog with an input, never a native prompt() (§11). Portalled, so its
          clicks never reach the card's role=button beneath it. */}
      {onRename && (
        <Dialog open={renameOpen} onOpenChange={setRenameOpen}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Rename project</DialogTitle>
              <DialogDescription>Give this project a name you'll recognize.</DialogDescription>
            </DialogHeader>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                submitRename();
              }}
            >
              <Input
                value={renameValue}
                onChange={(e) => setRenameValue(e.target.value)}
                aria-label="Project name"
                placeholder="Untitled project"
                autoFocus
                maxLength={120}
              />
              <DialogFooter className="mt-4">
                <Button type="button" variant="outline" onClick={() => setRenameOpen(false)}>
                  Cancel
                </Button>
                <Button type="submit" disabled={!renameValue.trim() || renameValue.trim() === session.title}>
                  Save
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      )}

      {/* Delete — the shared AlertDialog confirm (§11). The act only runs on the operator's
          explicit confirm; the caller archives it (recoverable) and removes it from the gallery
          only once that actually succeeds (§13). */}
      {onDelete && (
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
                onClick={onDelete}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                Confirm deletion
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}
    </motion.li>
  );
}

export default ProjectCard;

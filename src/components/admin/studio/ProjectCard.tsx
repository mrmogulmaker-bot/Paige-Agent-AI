// One session on the projects gallery — an authoring PROJECT, not an artifact row (§18).
//
// The card IS the session (the resumable room), and it shows which artifacts live inside via a
// glyph row (§19). Premium per §11: a real cover when the session has one, else the embossed
// GlyphPlate keyed to the primary artifact — never a broken <img>, never a bare "Loading…".
// Keyboard-openable (role=button + Enter/Space), motion guarded by useReducedMotion, token-only
// classes, indigo --ring focus. The star is a resting per-user flag, so it is deliberately NOT
// gold — gold is spent only on the act/on moment (§11).
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
  Type,
  Wand2,
  type LucideIcon,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { GlyphPlate, StatePill } from "@/components/ui/page";
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
import { PaigeMark } from "@/components/brand/PaigeMark";
import { cn } from "@/lib/utils";
import type { StudioArtifactType, StudioSessionCard } from "./studio-types";

const ARTIFACT_GLYPH: Record<StudioArtifactType, LucideIcon> = {
  page: LayoutGrid,
  form: FileText,
  funnel: GitBranch,
  copy: Type,
  image: ImageIcon,
};

/** A stable 32-bit hash of the session id (FNV-1a) — the seed for a project's own deterministic
 *  cover, so an artifact-less project still reads as ITS distinct cover, not one shared gray box. */
function hashSeed(id: string): number {
  let h = 2166136261;
  for (let i = 0; i < id.length; i += 1) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

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
  // A cover URL can 404 (a deleted asset, a moved bucket) — fall back to the GlyphPlate rather
  // than render a broken image (§11, compliance: tolerate tombstoned refs).
  const [coverFailed, setCoverFailed] = useState(false);
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
  const showCover = !!session.thumbnailUrl && !coverFailed;
  const CoverGlyph = session.primaryKind ? ARTIFACT_GLYPH[session.primaryKind] ?? Wand2 : Wand2;

  // Deterministic per-project cover geometry (§11 token-only): the COLORS are all studio brand
  // tokens (indigo → primary → electric blue); only the gradient ANGLE, the light-sheen focal
  // point, and a BOUNDED hue-rotate vary by seed. ±16° keeps every cover inside the indigo/violet/
  // blue band — it can never wander to gold (#7B, §11: depth from the brand cosmos, never gold).
  const seed = hashSeed(session.id);
  const gradAngle = 108 + (seed % 64); // 108°–171°
  const hueShift = (seed % 33) - 16; // −16°…+16°, provably never gold
  const sheenX = 22 + (seed % 56); // 22%–77%
  const sheenY = 16 + ((seed >>> 5) % 40); // 16%–55% (unsigned shift — keeps the focal point in-card)

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      onOpen();
    }
  };

  return (
    <motion.li
      initial={reduce ? false : { opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25 }}
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
        )}
      >
        {/* Thumbnail well — real preview when captured, else a PREMIUM branded cover that is always
            present (#7): a per-project deterministic indigo→violet→blue gradient, a light sheen for
            depth, a base vignette, a faint PaigeMark watermark for §6 continuity, and the primary-
            kind glyph plate on top — never a flat gray box with a tiny icon. The cover zooms subtly
            on hover; the well clips it (overflow-hidden), so nothing bleeds past the card edge. */}
        <div className="relative aspect-[16/10] overflow-hidden bg-[hsl(var(--studio-canvas))]">
          {showCover ? (
            <img
              src={session.thumbnailUrl as string}
              alt=""
              loading="lazy"
              onError={() => setCoverFailed(true)}
              className="h-full w-full object-cover transition-transform duration-500 ease-out group-hover:scale-[1.04] motion-reduce:transform-none motion-reduce:transition-none"
            />
          ) : (
            <div className="relative h-full w-full">
              {/* Brand gradient — token colors, per-project geometry + bounded hue-rotate (§11). */}
              <div
                aria-hidden
                className="absolute inset-0 transition-transform duration-500 ease-out group-hover:scale-105 motion-reduce:transform-none motion-reduce:transition-none"
                style={{
                  background: `linear-gradient(${gradAngle}deg, hsl(var(--studio-nebula-indigo) / 0.9), hsl(var(--primary)) 54%, hsl(var(--studio-nebula-blue) / 0.7))`,
                  filter: `hue-rotate(${hueShift}deg)`,
                }}
              />
              {/* Soft light sheen (upper-band focal point) for a lit, three-dimensional read. */}
              <div
                aria-hidden
                className="absolute inset-0"
                style={{ background: `radial-gradient(60% 60% at ${sheenX}% ${sheenY}%, hsl(0 0% 100% / 0.2), transparent 68%)` }}
              />
              {/* Base vignette in fixed cosmic ink so the cover sinks at the bottom (§11 shadow ink). */}
              <div
                aria-hidden
                className="absolute inset-0"
                style={{ background: "radial-gradient(120% 92% at 50% 122%, hsl(var(--studio-ink) / 0.55), transparent 56%)" }}
              />
              {/* Faint PaigeMark watermark — §6 brand continuity, kept low enough to read as texture.
                  Wrapped in an aria-hidden span so the decorative mark isn't announced per card. */}
              <span aria-hidden className="pointer-events-none absolute -bottom-5 -right-5 opacity-[0.09]">
                <PaigeMark className="h-28 w-28" />
              </span>
              {/* The primary-kind glyph plate, centered on top. */}
              <div className="relative grid h-full place-items-center">
                <GlyphPlate icon={CoverGlyph} size="lg" />
              </div>
            </div>
          )}
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
                  className="rounded-full bg-background/80 p-1.5 backdrop-blur transition-colors hover:bg-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))]"
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
                      className="rounded-full bg-background/80 p-1.5 text-muted-foreground backdrop-blur transition-colors hover:bg-background hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))]"
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
            <h3 className="truncate font-display text-sm font-semibold leading-tight tracking-[-0.006em] text-foreground">
              {session.title || "Untitled project"}
            </h3>
            {!isTemplate && (
              <StatePill state={session.status === "published" ? "on" : "pending"}>
                {session.status === "published" ? "Live" : "Draft"}
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

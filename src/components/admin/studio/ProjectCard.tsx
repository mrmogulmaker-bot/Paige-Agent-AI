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
  FileText,
  GitBranch,
  Image as ImageIcon,
  LayoutGrid,
  Star,
  Type,
  Wand2,
  type LucideIcon,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { GlyphPlate, StatePill } from "@/components/ui/page";
import { cn } from "@/lib/utils";
import type { StudioArtifactType, StudioSessionCard } from "./studio-types";

const ARTIFACT_GLYPH: Record<StudioArtifactType, LucideIcon> = {
  page: LayoutGrid,
  form: FileText,
  funnel: GitBranch,
  copy: Type,
  image: ImageIcon,
};

export interface ProjectCardProps {
  session: StudioSessionCard;
  /** Templates render without the star toggle and the live/draft pill. */
  isTemplate?: boolean;
  onOpen: () => void;
  onToggleStar: () => void;
}

/** "Edited 3 days ago" — relative, honest, never a raw timestamp on a card. */
function editedAgo(iso: string): string {
  try {
    return `Edited ${formatDistanceToNow(new Date(iso), { addSuffix: true })}`;
  } catch {
    return "Edited recently";
  }
}

export function ProjectCard({ session, isTemplate = false, onOpen, onToggleStar }: ProjectCardProps) {
  const reduce = useReducedMotion();
  // A cover URL can 404 (a deleted asset, a moved bucket) — fall back to the GlyphPlate rather
  // than render a broken image (§11, compliance: tolerate tombstoned refs).
  const [coverFailed, setCoverFailed] = useState(false);
  const showCover = !!session.thumbnailUrl && !coverFailed;
  const CoverGlyph = session.primaryKind ? ARTIFACT_GLYPH[session.primaryKind] ?? Wand2 : Wand2;

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
          "group relative flex h-full flex-col overflow-hidden rounded-[var(--radius)] border border-border bg-card shadow-card transition-shadow duration-200",
          "hover:shadow-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))]",
        )}
      >
        {/* Thumbnail well — real preview, else the embossed GlyphPlate keyed to the primary. */}
        <div className="relative aspect-[16/10] overflow-hidden bg-muted">
          {showCover ? (
            <img
              src={session.thumbnailUrl as string}
              alt=""
              loading="lazy"
              onError={() => setCoverFailed(true)}
              className="h-full w-full object-cover"
            />
          ) : (
            <div className="grid h-full place-items-center bg-gradient-to-br from-muted to-background">
              <GlyphPlate icon={CoverGlyph} size="lg" />
            </div>
          )}
          {!isTemplate && (
            <button
              type="button"
              aria-pressed={session.starred}
              aria-label={session.starred ? "Unstar project" : "Star project"}
              onClick={(e) => {
                e.stopPropagation();
                onToggleStar();
              }}
              className="absolute right-2 top-2 rounded-full bg-background/80 p-1.5 backdrop-blur transition-colors hover:bg-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))]"
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
        </div>

        {/* Body */}
        <div className="flex min-w-0 flex-1 flex-col gap-2 p-4">
          <div className="flex items-start justify-between gap-2">
            <h3 className="truncate font-display text-sm font-semibold text-foreground">
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

          <p className="mt-auto text-xs text-muted-foreground">
            {isTemplate ? "Start from this" : editedAgo(session.lastEditedAt)}
          </p>
        </div>
      </div>
    </motion.li>
  );
}

export default ProjectCard;

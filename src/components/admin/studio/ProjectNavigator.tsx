// The rail's PROJECT-CONTEXT body — the multi-page redesign's visible half (Slice 1b).
//
// The owner's Lovable comparison: "when I open a new session on Lovable, it just opens up the
// screen" — the platform projects-nav gets out of the way and the left panel becomes THAT
// project's own context. Today the Studio rail always showed the four gallery VIEWS (Recently
// viewed / My / Starred / Templates) even inside a project — the platform nav, not the project.
// This component is what the rail swaps to on a project route (/admin/studio/:sessionId): a
// "back to all projects" escape, the project's name, and its artifact manifest — every page,
// form, funnel, and piece of copy/imagery the project holds.
//
// It is a pure READER of the shared ActiveStudioSession bundle (loaded once in StudioLayout, §
// single-source): it never fetches the manifest itself, so it can never diverge from the stage.
// The one WRITE it performs — "add a page" — goes through the createSessionArtifact seam and
// hands the returned row back to applyMeta, so the rail and stage re-render in lockstep (§10/§13).
//
// Reopen (#290): EVERY row now reopens onto the #292 session canvas — clicking one sets ?open=<kind>:
// <id> on the SAME session route (never the legacy ?pageId builder stage, §21), which the shell
// resolves to a live render: page→LivePreview, image→the asset, document→DocumentPreview, copy→its
// real words (read-only), and funnel/form→an honest "built" state (no in-canvas loader yet, #319).
// ?open is a one-shot command the shell consumes, so the rail deliberately shows no persistent
// "active" highlight (a stale one would lie once a chat build moves the canvas on, §13).
import { useCallback, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { motion, useReducedMotion } from "framer-motion";
import {
  ArrowLeft,
  ClipboardList,
  FilePlus,
  FileText,
  FolderOpen,
  Image as ImageIcon,
  Loader2,
  Type,
  Workflow,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ArtifactPreview, type ArtifactPreviewKind } from "@/components/ui/page";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { createSessionArtifact, isStudioError } from "./studio";
import type { ActiveStudioSession } from "./useActiveStudioSession";
import type { SessionArtifactRef } from "./studio-types";

/** How one manifest ref presents in the rail: its glyph and a human label for the type.
 *  `content` is copy OR image — disambiguated by thumbnailUrl (images carry a real Storage URL;
 *  copy doesn't), so the rail shows the right glyph. */
interface RefFace {
  icon: LucideIcon;
  typeLabel: string;
}

function faceForRef(ref: SessionArtifactRef): RefFace {
  switch (ref.kind) {
    case "page":
      return { icon: FileText, typeLabel: "Page" };
    case "form":
      return { icon: ClipboardList, typeLabel: "Form" };
    case "funnel":
      return { icon: Workflow, typeLabel: "Funnel" };
    case "content":
    default:
      return ref.thumbnailUrl
        ? { icon: ImageIcon, typeLabel: "Image" }
        : { icon: Type, typeLabel: "Copy" };
  }
}

/** The ArtifactPreview kind for a manifest ref — 'content' disambiguates to image (carries a real
 *  Storage URL) or copy (doesn't), mirroring faceForRef so the mini-thumb matches the label. */
function previewKindForRef(ref: SessionArtifactRef): ArtifactPreviewKind {
  switch (ref.kind) {
    case "page":
      return "page";
    case "form":
      return "form";
    case "funnel":
      return "funnel";
    case "content":
    default:
      return ref.thumbnailUrl ? "image" : "copy";
  }
}

function ArtifactRow({
  artifact,
  collapsed,
  onOpen,
}: {
  artifact: SessionArtifactRef;
  collapsed: boolean;
  /** Reopen this artifact onto the session canvas (#290). Every row is openable now. */
  onOpen: () => void;
}) {
  const reduce = useReducedMotion();
  const face = faceForRef(artifact);
  const label = artifact.title?.trim() || `Untitled ${face.typeLabel.toLowerCase()}`;
  // No persistent "active" highlight: ?open is a one-shot command the shell consumes, so a highlight
  // would go stale (lie) the moment a chat build moves the canvas on (§13). Every row is openable.

  // A small REAL mini-thumbnail (§22) — the shared ArtifactPreview: a page/image ref shows its real
  // captured thumb / Storage URL, everything else the branded compact fallback (glyph on an indigo
  // tile). It lifts on hover with a spring — the parent button's "lift" hover state propagates here,
  // so the rail reads as a living manifest, not a file tree. Reduced motion drops the lift.
  const thumb = (
    <motion.span
      variants={reduce ? undefined : { lift: { y: -2, scale: 1.06 } }}
      transition={{ type: "spring", stiffness: 400, damping: 22 }}
      className="grid h-9 w-9 shrink-0 place-items-center overflow-hidden rounded-lg border border-[hsl(var(--studio-glass-border)/0.5)] bg-[hsl(var(--studio-canvas))]"
    >
      <ArtifactPreview
        kind={previewKindForRef(artifact)}
        thumbnailUrl={artifact.thumbnailUrl}
        seed={artifact.id}
        compact
        reduce={!!reduce}
      />
    </motion.span>
  );

  const body = !collapsed && (
    <span className="flex min-w-0 flex-1 flex-col">
      <span className="truncate leading-tight">{label}</span>
      <span className="truncate text-[11px] font-normal text-muted-foreground">{face.typeLabel}</span>
    </span>
  );

  const base = cn(
    "group flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-left text-sm transition-colors",
    collapsed && "justify-center px-0",
  );

  return (
    <motion.button
      type="button"
      onClick={onOpen}
      whileHover={reduce ? undefined : "lift"}
      title={collapsed ? `${label} · ${face.typeLabel}` : undefined}
      className={cn(
        base,
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))]",
        "text-muted-foreground hover:bg-[hsl(var(--studio-glass-border)/0.25)] hover:text-foreground",
      )}
    >
      {thumb}
      {body}
    </motion.button>
  );
}

export function ProjectNavigator({
  session,
  collapsed,
}: {
  session: ActiveStudioSession;
  collapsed: boolean;
}) {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [params, setParams] = useSearchParams();
  const [adding, setAdding] = useState(false);

  const { sessionId, tenantId, artifacts, session: meta, loading, notFound, error } = session;

  // Reopen ANY artifact onto the #292 session canvas (#290): set ?open=<kind>:<id> on the SAME
  // session route — never the legacy ?pageId builder stage (§21). The shell resolves + consumes it.
  const openArtifact = useCallback((ref: SessionArtifactRef) => {
    const p = new URLSearchParams(params);
    p.set("open", `${ref.kind}:${ref.id}`);
    p.delete("pageId"); // leave the legacy builder stage behind — reopen lands on the canvas
    p.delete("mode");
    setParams(p, { replace: true }); // refining one session, not a new history entry
  }, [params, setParams]);

  const projectTitle = useMemo(() => meta?.title?.trim() || "Untitled project", [meta]);

  // "Add a page" — mint a blank page into the project via the §10 seam, reflect it in the shared
  // bundle (so the rail updates without a refetch), then open it for briefing. The default way
  // to add is still the conversational composer on the stage (§18); this is the explicit
  // "start another blank page" affordance — pages, because they're the type that re-opens cleanly.
  const addPage = useCallback(async () => {
    if (!tenantId || !sessionId || adding) return;
    setAdding(true);
    const before = new Set(artifacts.map((a) => `${a.kind}:${a.id}`));
    try {
      const next = await createSessionArtifact({ tenantId, sessionId, type: "page" });
      session.applyMeta(next);
      const fresh = next.artifacts.find((a) => !before.has(`${a.kind}:${a.id}`));
      // Open the fresh page onto the #292 canvas (not the legacy ?pageId stage, §21).
      if (fresh) navigate(`/admin/studio/${sessionId}?open=page:${fresh.id}`);
    } catch (err) {
      toast({
        title: "Couldn't add a page",
        description: isStudioError(err) ? err.message : "Try again in a moment.",
        variant: "destructive",
      });
    } finally {
      setAdding(false);
    }
  }, [tenantId, sessionId, adding, artifacts, session, navigate, toast]);

  const railBorder = "border-[hsl(var(--studio-glass-border)/0.6)]";
  // The manifest region only invites building into a project that actually exists and loaded — a
  // not-found / errored session shows nothing here (the header + the stage carry the message), so
  // the rail never says "build your first piece" for a project that isn't there (§13).
  const showEmptyInvite = !loading && !notFound && !error && artifacts.length === 0;

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* back to the gallery — the "all projects" escape */}
      <div className="px-2 pb-1">
        <button
          type="button"
          onClick={() => navigate("/admin/studio")}
          title={collapsed ? "All projects" : undefined}
          className={cn(
            "flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-xs font-medium text-muted-foreground transition-colors",
            "hover:bg-[hsl(var(--studio-glass-border)/0.25)] hover:text-foreground",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))]",
            collapsed && "justify-center px-0",
          )}
        >
          <ArrowLeft className="h-3.5 w-3.5 shrink-0" aria-hidden />
          {!collapsed && "All projects"}
        </button>
      </div>

      {/* project identity */}
      {!collapsed && (
        <div className={cn("border-t px-3 pb-2 pt-2", railBorder)}>
          <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
            Project
          </p>
          <h2 className="mt-0.5 line-clamp-2 font-display text-sm font-semibold leading-snug text-foreground">
            {loading && !meta
              ? "Opening…"
              : notFound
                ? "Project not found"
                : error
                  ? "Couldn't open this project"
                  : projectTitle}
          </h2>
          {error && !notFound && (
            <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{error}</p>
          )}
        </div>
      )}
      {collapsed && <div className={cn("mx-2 border-t", railBorder)} />}

      {/* the manifest — every piece the project holds */}
      <div className="min-h-0 flex-1 overflow-y-auto px-2 py-1">
        {!collapsed && !notFound && !error && (
          <p className="px-1 pb-1 pt-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
            In this project
          </p>
        )}
        {loading && artifacts.length === 0 ? (
          <ul className="space-y-1" aria-hidden>
            {Array.from({ length: 3 }).map((_, i) => (
              <li
                key={i}
                className="h-9 animate-pulse rounded-md bg-[hsl(var(--studio-glass-border)/0.3)] motion-reduce:animate-none"
              />
            ))}
          </ul>
        ) : showEmptyInvite ? (
          !collapsed && (
            <div className={cn("rounded-md border border-dashed px-3 py-4 text-center", railBorder)}>
              <FolderOpen className="mx-auto h-5 w-5 text-muted-foreground" aria-hidden />
              <p className="mt-1.5 text-xs text-muted-foreground">
                Nothing here yet. Describe what you want in the chat and Paige builds the first
                piece — it lands here.
              </p>
            </div>
          )
        ) : artifacts.length > 0 ? (
          <ul className="space-y-0.5">
            {artifacts.map((ref) => (
              <li key={`${ref.kind}:${ref.id}`}>
                <ArtifactRow
                  artifact={ref}
                  collapsed={collapsed}
                  onOpen={() => openArtifact(ref)}
                />
              </li>
            ))}
          </ul>
        ) : null}
      </div>

      {/* add another piece — the explicit blank-start (the conversational add lives on the stage).
          FilePlus (not the gold "New project" Plus) so the two never blur together collapsed. */}
      {!notFound && (
        <div className={cn("shrink-0 border-t px-2 pb-1 pt-1", railBorder)}>
          <Button
            variant="outline"
            size="sm"
            onClick={() => void addPage()}
            disabled={adding || !tenantId || !sessionId || !!error}
            title={collapsed ? "Add a page" : undefined}
            className={cn("w-full", collapsed && "px-0")}
          >
            {adding ? (
              <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden />
            ) : (
              <FilePlus className="h-4 w-4" aria-hidden />
            )}
            {!collapsed && (adding ? "Adding…" : "Add a page")}
          </Button>
        </div>
      )}
    </div>
  );
}

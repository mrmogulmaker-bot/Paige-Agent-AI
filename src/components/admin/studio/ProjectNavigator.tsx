// The rail's PROJECT-CONTEXT body — the multi-page redesign's visible half (Slice 1b).
//
// The owner's Lovable comparison: "when I open a new session on Lovable, it just opens up the
// screen" — the platform projects-nav gets out of the way and the left panel becomes THAT
// project's own context. Today the Studio rail always showed the four gallery VIEWS (Recently
// viewed / My / Starred / Templates) even inside a project — the platform nav, not the project.
// This component is what the rail swaps to on a project route (/admin/studio/:sessionId): a
// "back to all projects" escape, the project's name, and its artifact manifest — every page,
// form, funnel, and piece of copy/imagery the project holds, each openable onto the stage.
//
// It is a pure READER of the shared ActiveStudioSession bundle (loaded once in StudioLayout, §
// single-source): it never fetches the manifest itself, so it can never diverge from the stage.
// The one WRITE it performs — "add a page" — goes through the createSessionArtifact seam and
// hands the returned row back to applyMeta, so the rail and stage re-render in lockstep (§10/§13).
import { useCallback, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import {
  ArrowLeft,
  ClipboardList,
  FileText,
  FolderOpen,
  Image as ImageIcon,
  Loader2,
  Plus,
  Type,
  Workflow,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { createSessionArtifact, isStudioError } from "./studio";
import type { ActiveStudioSession } from "./useActiveStudioSession";
import type { SessionArtifactRef, StudioMode } from "./studio-types";

/** How one manifest ref presents in the rail: its glyph, a human label for the type, and the
 *  builder mode it opens into. `content` is copy OR image — disambiguated by thumbnailUrl
 *  (images carry a real Storage URL; copy doesn't), so the rail shows the right glyph/mode. */
interface RefFace {
  icon: LucideIcon;
  typeLabel: string;
  mode: StudioMode;
}

function faceForRef(ref: SessionArtifactRef): RefFace {
  switch (ref.kind) {
    case "page":
      return { icon: FileText, typeLabel: "Page", mode: "page" };
    case "form":
      return { icon: ClipboardList, typeLabel: "Form", mode: "form" };
    case "funnel":
      return { icon: Workflow, typeLabel: "Funnel", mode: "funnel" };
    case "content":
    default:
      return ref.thumbnailUrl
        ? { icon: ImageIcon, typeLabel: "Image", mode: "image" }
        : { icon: Type, typeLabel: "Copy", mode: "copy" };
  }
}

/** The deep-link that opens a ref onto the builder stage. Pages carry a real ?pageId so the
 *  shell hydrates that exact draft; the other kinds land on their own mode surface (per-artifact
 *  re-hydration for form/funnel/content is a tracked follow-up — the shell can't reopen their
 *  saved content yet, so we take the operator to the right surface, never a dead end, §13). */
function hrefForRef(sessionId: string, ref: SessionArtifactRef): string {
  const { mode } = faceForRef(ref);
  const base = `/admin/studio/${sessionId}?mode=${mode}`;
  return ref.kind === "page" ? `${base}&pageId=${ref.id}` : base;
}

function ArtifactRow({
  ref: artifact,
  sessionId,
  collapsed,
  active,
  onOpen,
}: {
  ref: SessionArtifactRef;
  sessionId: string;
  collapsed: boolean;
  active: boolean;
  onOpen: () => void;
}) {
  const face = faceForRef(artifact);
  const Icon = face.icon;
  const label = artifact.title?.trim() || `Untitled ${face.typeLabel.toLowerCase()}`;
  return (
    <button
      type="button"
      onClick={onOpen}
      aria-current={active ? "true" : undefined}
      title={collapsed ? `${label} · ${face.typeLabel}` : undefined}
      className={cn(
        "group flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-left text-sm transition-colors",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))]",
        active
          ? "bg-[hsl(var(--studio-glass-border)/0.4)] font-medium text-foreground"
          : "text-muted-foreground hover:bg-[hsl(var(--studio-glass-border)/0.25)] hover:text-foreground",
        collapsed && "justify-center px-0",
      )}
    >
      <span
        className={cn(
          "grid h-6 w-6 shrink-0 place-items-center rounded-md border transition-colors",
          active
            ? "border-transparent bg-[hsl(var(--studio-glass-border)/0.6)] text-foreground"
            : "border-[hsl(var(--studio-glass-border)/0.5)] text-muted-foreground group-hover:text-foreground",
        )}
      >
        <Icon className="h-3.5 w-3.5" aria-hidden />
      </span>
      {!collapsed && (
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="truncate leading-tight">{label}</span>
          <span className="truncate text-[11px] font-normal text-muted-foreground/80">
            {face.typeLabel}
          </span>
        </span>
      )}
    </button>
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
  const [params] = useSearchParams();
  const [adding, setAdding] = useState(false);

  const { sessionId, tenantId, artifacts, session: meta, loading, notFound } = session;

  const activePageId = params.get("pageId");
  const activeMode = params.get("mode");

  // Which ref (if any) is the one currently on the stage — a page matches by its exact id; the
  // other kinds match by mode (best-effort; multiple same-mode refs share the highlight).
  const isActive = useCallback(
    (ref: SessionArtifactRef) => {
      const face = faceForRef(ref);
      if (ref.kind === "page") return !!activePageId && activePageId === ref.id;
      return !activePageId && activeMode === face.mode;
    },
    [activePageId, activeMode],
  );

  const projectTitle = useMemo(() => meta?.title?.trim() || "Untitled project", [meta]);

  // "Add a page" — mint a blank page into the project via the §10 seam, reflect it in the shared
  // bundle (so the rail updates without a refetch), then open it for briefing. The default way
  // to add is still the conversational composer on the stage (§18); this is the explicit
  // "start another blank page in this project" affordance a project navigator is expected to have.
  const addPage = useCallback(async () => {
    if (!tenantId || !sessionId || adding) return;
    setAdding(true);
    const before = new Set(artifacts.map((a) => `${a.kind}:${a.id}`));
    try {
      const next = await createSessionArtifact({ tenantId, sessionId, type: "page" });
      session.applyMeta(next);
      const fresh = next.artifacts.find((a) => !before.has(`${a.kind}:${a.id}`));
      if (fresh) navigate(hrefForRef(sessionId, fresh));
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
        <div className="px-3 pb-2 pt-1">
          <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground/70">
            Project
          </p>
          <h2 className="mt-0.5 line-clamp-2 font-display text-sm font-semibold leading-snug text-foreground">
            {loading && !meta ? "Opening…" : notFound ? "Project not found" : projectTitle}
          </h2>
        </div>
      )}

      {/* the manifest — every piece the project holds */}
      <div className="min-h-0 flex-1 overflow-y-auto px-2 py-1">
        {!collapsed && (
          <p className="px-1 pb-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground/70">
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
        ) : artifacts.length === 0 ? (
          !collapsed && (
            <div className="rounded-md border border-dashed border-[hsl(var(--studio-glass-border)/0.6)] px-3 py-4 text-center">
              <FolderOpen className="mx-auto h-5 w-5 text-muted-foreground/70" aria-hidden />
              <p className="mt-1.5 text-xs text-muted-foreground">
                Nothing here yet. Describe what you want in the chat and Paige builds the first
                piece — it lands here.
              </p>
            </div>
          )
        ) : (
          <ul className="space-y-0.5">
            {artifacts.map((ref) => (
              <li key={`${ref.kind}:${ref.id}`}>
                <ArtifactRow
                  ref={ref}
                  sessionId={sessionId}
                  collapsed={collapsed}
                  active={isActive(ref)}
                  onOpen={() => navigate(hrefForRef(sessionId, ref))}
                />
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* add another piece — the explicit blank-start (the conversational add lives on the stage) */}
      <div className="shrink-0 px-2 pb-1 pt-1">
        <Button
          variant="outline"
          size="sm"
          onClick={() => void addPage()}
          disabled={adding || !tenantId || !sessionId || notFound}
          title={collapsed ? "Add a page" : undefined}
          className={cn("w-full", collapsed && "px-0")}
        >
          {adding ? (
            <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden />
          ) : (
            <Plus className="h-4 w-4" aria-hidden />
          )}
          {!collapsed && (adding ? "Adding…" : "Add a page")}
        </Button>
      </div>
    </div>
  );
}

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
// Honesty note (§13): only PAGE rows re-open their saved content today (the shell hydrates a page
// draft via ?pageId). Form/funnel/copy/image are create-only in the builder — it has no
// "open existing" path yet — so their rows are LISTED (the project's contents, truthfully, §19)
// but NOT presented as openable, because clicking through to a blank builder and saving would
// silently mint a duplicate. Re-hydrating them is its own tracked task (Studio Slice-1b follow-up).
import { useCallback, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
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

/** The deep-link that re-opens a PAGE ref onto the builder stage — the shell hydrates that exact
 *  draft from ?pageId. Only pages re-hydrate today (see the honesty note above). */
function pageHref(sessionId: string, ref: SessionArtifactRef): string {
  return `/admin/studio/${sessionId}?mode=page&pageId=${ref.id}`;
}

function ArtifactRow({
  artifact,
  collapsed,
  active,
  onOpen,
}: {
  artifact: SessionArtifactRef;
  collapsed: boolean;
  active: boolean;
  /** Present only for rows that can genuinely re-open their saved content (pages today). When
   *  absent the row is informational — listed but not clickable, so it can't mislead or mint a
   *  duplicate (§13). */
  onOpen?: () => void;
}) {
  const face = faceForRef(artifact);
  const Icon = face.icon;
  const label = artifact.title?.trim() || `Untitled ${face.typeLabel.toLowerCase()}`;
  const interactive = !!onOpen;

  const glyph = (
    <span
      className={cn(
        "grid h-6 w-6 shrink-0 place-items-center rounded-md border transition-colors",
        active
          ? "border-transparent bg-[hsl(var(--studio-glass-border)/0.6)] text-foreground"
          : "border-[hsl(var(--studio-glass-border)/0.5)] text-muted-foreground",
        interactive && "group-hover:text-foreground",
      )}
    >
      <Icon className="h-3.5 w-3.5" aria-hidden />
    </span>
  );

  const body = !collapsed && (
    <span className="flex min-w-0 flex-1 flex-col">
      <span className="truncate leading-tight">{label}</span>
      <span className="truncate text-[11px] font-normal text-muted-foreground">
        {face.typeLabel}
        {!interactive && " · view only for now"}
      </span>
    </span>
  );

  const base = cn(
    "group flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-left text-sm transition-colors",
    collapsed && "justify-center px-0",
  );

  if (!interactive) {
    // Listed but not yet reopenable — informational, not a button (no pointer, no hover-as-click).
    return (
      <div
        className={cn(base, "cursor-default text-muted-foreground")}
        title={
          collapsed
            ? `${label} · ${face.typeLabel} — reopening saved ${face.typeLabel.toLowerCase()}s from here is coming`
            : `Reopening saved ${face.typeLabel.toLowerCase()}s from the project is coming — build new pieces in the chat`
        }
      >
        {glyph}
        {body}
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={onOpen}
      aria-current={active ? "true" : undefined}
      title={collapsed ? `${label} · ${face.typeLabel}` : undefined}
      className={cn(
        base,
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))]",
        active
          ? "bg-[hsl(var(--studio-glass-border)/0.4)] font-medium text-foreground"
          : "text-muted-foreground hover:bg-[hsl(var(--studio-glass-border)/0.25)] hover:text-foreground",
      )}
    >
      {glyph}
      {body}
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

  const { sessionId, tenantId, artifacts, session: meta, loading, notFound, error } = session;

  const activePageId = params.get("pageId");

  // A page row is the active one when its id matches the ?pageId on the stage.
  const isActivePage = useCallback(
    (ref: SessionArtifactRef) => !!activePageId && activePageId === ref.id,
    [activePageId],
  );

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
      if (fresh) navigate(pageHref(sessionId, fresh));
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
                  active={ref.kind === "page" && isActivePage(ref)}
                  onOpen={
                    ref.kind === "page" ? () => navigate(pageHref(sessionId, ref)) : undefined
                  }
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
            disabled={adding || !tenantId || !sessionId}
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

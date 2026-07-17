// Vibe Studio — the immersive shell (owner: Antonio, 2026-07-16).
//
// Entering Vibe Studio becomes its OWN full room: AdminLayout steps its top nav aside (see
// AdminLayout `isStudio`) and this layout owns the viewport with a PERSISTENT left rail that
// stays put across the home ↔ builder (a nested-route layout renders the rail once and swaps
// only the <Outlet/>, so the rail never remounts). It applies the `.studio-surface` scope so the
// vibrant Paige gradient tokens resolve for everything inside — home hero AND builder — and
// nowhere else (§6/§11 palette exception, contained). The rail is an IN-SURFACE object navigator
// (projects, the four gallery views, New project) plus a single "Back to Paige" escape — not a
// second copy of the hub bar (§18), the Lovable/Figma/Linear pattern.
import { useEffect, useMemo, useRef, useState } from "react";
import { Link, Outlet, useLocation, useMatch } from "react-router-dom";
import {
  ChevronLeft,
  Clock,
  FolderOpen,
  LayoutTemplate,
  PanelLeftClose,
  PanelLeftOpen,
  Plus,
  Star,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PaigeMark } from "@/components/brand/PaigeMark";
import { ThemeToggle } from "@/components/ThemeToggle";
import { cn } from "@/lib/utils";
import { useTenantContext } from "@/hooks/useTenantContext";
import { ProjectNavigator } from "./ProjectNavigator";
import { useActiveStudioSession } from "./useActiveStudioSession";
import { StudioImmersionProvider } from "./StudioImmersion";
import type { StudioSessionView } from "./studio-types";

interface ViewNavItem {
  view: StudioSessionView;
  label: string;
  icon: LucideIcon;
}

// The four gallery VIEWS the rail carries — each a `?view=` filter over the ONE home grid, never
// a separate route (§18). StudioHome reads `view` from the same search param, so the rail is the
// single source of truth for the active filter.
const VIEW_NAV: ViewNavItem[] = [
  { view: "recent", label: "Recently viewed", icon: Clock },
  { view: "mine", label: "My projects", icon: FolderOpen },
  { view: "starred", label: "Starred", icon: Star },
  { view: "templates", label: "Templates", icon: LayoutTemplate },
];

function StudioNavItem({
  item,
  collapsed,
  activeView,
  onHome,
}: {
  item: ViewNavItem;
  collapsed: boolean;
  activeView: StudioSessionView;
  onHome: boolean;
}) {
  const active = onHome && activeView === item.view;
  const Icon = item.icon;
  return (
    <Link
      to={`/admin/studio?view=${item.view}`}
      aria-current={active ? "page" : undefined}
      title={collapsed ? item.label : undefined}
      className={cn(
        "flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))]",
        active
          ? "bg-[hsl(var(--studio-glass-border)/0.35)] font-medium text-foreground"
          : "text-muted-foreground hover:bg-[hsl(var(--studio-glass-border)/0.25)] hover:text-foreground",
        collapsed && "justify-center px-0",
      )}
    >
      <Icon className="h-4 w-4 shrink-0" aria-hidden />
      {!collapsed && <span className="truncate">{item.label}</span>}
    </Link>
  );
}

export default function StudioLayout() {
  const location = useLocation();
  const { activeTenantId } = useTenantContext();

  // Builder routes (/admin/studio/new, /admin/studio/:id) default the rail to a thin icon spine
  // so it doesn't compete with the builder's own 380px chat column; the bare home is expanded.
  const onBuilder = location.pathname.startsWith("/admin/studio/");
  const onHome = !onBuilder;

  // Are we INSIDE a project? `/admin/studio/:sessionId` (but NOT `/admin/studio/new`, which is the
  // create-and-redirect entry, not a session). When we are, the rail sheds the platform gallery
  // nav and becomes THIS project's own navigator (the owner's Lovable ask) — and the session is
  // loaded ONCE here, then shared with both the rail and the stage (<Outlet context>) so a single
  // source of truth drives both and they can never diverge.
  const projectMatch = useMatch("/admin/studio/:sessionId");
  const projectId =
    projectMatch && projectMatch.params.sessionId && projectMatch.params.sessionId !== "new"
      ? projectMatch.params.sessionId
      : null;
  const onProject = !!projectId;
  const activeSession = useActiveStudioSession(activeTenantId, projectId, onProject);

  const [collapsed, setCollapsed] = useState(onBuilder);
  // Reset the rail to its sensible default whenever we cross between the expanded home and a
  // builder/project route — collapsed inside a project (the chat leads), expanded on the gallery.
  // Deps on `onBuilder` only, so a manual toggle within one route class is never fought.
  useEffect(() => {
    setCollapsed(onBuilder);
  }, [onBuilder]);

  // The first-build FULL-WIDTH moment (owner's Lovable ask): StudioShell (a deep child) publishes
  // its first-build-generating flag up here; while true the outer project rail retracts to 0 so the
  // build canvas runs edge-to-edge, then slides back the instant the page lands. Held at this level
  // so the SAME flag drives the layout's own rail, not just the inner conversation rail.
  const [immersive, setImmersive] = useState(false);
  // Backstop: leaving a project (back to the gallery) can never strand a hidden rail, even if the
  // child's own cleanup didn't run (project→project switch keeps StudioShell mounted).
  useEffect(() => {
    if (!onProject) setImmersive(false);
  }, [onProject]);
  const immersionValue = useMemo(() => ({ immersive, setImmersive }), [immersive]);
  // React 18 renders a declarative `inert={false}` as the string "false" — still inert (any present
  // value counts). Setting the DOM property directly is the only correct path; it also removes the
  // retracted rail's links from the tab order + a11y tree while it's at w-0 (implicit aria-hidden).
  const railRef = useRef<HTMLElement>(null);
  useEffect(() => {
    const el = railRef.current;
    if (el) el.inert = immersive;
  }, [immersive]);

  const activeView = (new URLSearchParams(location.search).get("view") as StudioSessionView) ?? "recent";

  return (
    <StudioImmersionProvider value={immersionValue}>
    <div className="studio-surface flex h-full min-h-0 w-full overflow-hidden bg-[hsl(var(--studio-rail-bg))] text-foreground">
      {/* ── persistent LEFT RAIL ── */}
      <nav
        ref={railRef}
        aria-label="Vibe Studio"
        className={cn(
          "relative z-20 flex h-full shrink-0 flex-col",
          // ease-in-out matches the inner conversation rail's curve so BOTH rails retract in
          // perfect lockstep (Tailwind's arbitrary transition-[width] sets only the property, not
          // a timing function — without this the outer rail would ride the default `ease`).
          "transition-[width] duration-300 ease-in-out motion-reduce:transition-none",
          // Immersive (first build): retract to 0 and drop the right border + rightward shadow so
          // nothing bleeds at w-0. Otherwise the normal icon-spine / expanded widths, bordered.
          immersive
            ? "w-0 overflow-hidden border-r-0 bg-[hsl(var(--studio-rail-bg))]"
            : cn(
                "border-r border-[hsl(var(--studio-glass-border)/0.6)]",
                "bg-[hsl(var(--studio-rail-bg))] shadow-[4px_0_16px_-12px_hsl(var(--shadow-ink)/0.18)]",
                collapsed ? "w-[64px]" : "w-[248px]",
              ),
        )}
      >
        {/* brand + collapse toggle */}
        <div className="flex h-14 shrink-0 items-center gap-2 px-3">
          <Link to="/admin/studio" className="flex min-w-0 items-center gap-2" aria-label="Vibe Studio home">
            <PaigeMark className="h-7 w-7 shrink-0" />
            {!collapsed && <span className="truncate font-display text-sm font-semibold">Vibe Studio</span>}
          </Link>
          <button
            type="button"
            onClick={() => setCollapsed((v) => !v)}
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            aria-expanded={!collapsed}
            className="ml-auto rounded-md p-1.5 text-muted-foreground hover:bg-[hsl(var(--studio-glass-border)/0.3)] hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))]"
          >
            {collapsed ? <PanelLeftOpen className="h-4 w-4" aria-hidden /> : <PanelLeftClose className="h-4 w-4" aria-hidden />}
          </button>
        </div>

        {/* the single GOLD act — New project (§11 gold budget) */}
        <div className="px-3 pb-2">
          <Button asChild variant="gold" className={cn("w-full", collapsed && "px-0")}>
            <Link to="/admin/studio/new" aria-label="New project" title={collapsed ? "New project" : undefined}>
              <Plus className="h-4 w-4" aria-hidden />
              {!collapsed && "New project"}
            </Link>
          </Button>
        </div>

        {/* the rail body — INSIDE a project it becomes that project's own navigator (its
            artifacts + a way back); everywhere else it's the four gallery views (§18: one rail,
            content by context — never a second nav home). */}
        {onProject ? (
          <div className="min-h-0 flex-1 py-2">
            <ProjectNavigator session={activeSession} collapsed={collapsed} />
          </div>
        ) : (
          <ul className="flex-1 space-y-0.5 overflow-y-auto px-2 py-2">
            {VIEW_NAV.map((item) => (
              <li key={item.view}>
                <StudioNavItem item={item} collapsed={collapsed} activeView={activeView} onHome={onHome} />
              </li>
            ))}
          </ul>
        )}

        {/* Back to Paige + theme */}
        <div className="mt-auto shrink-0 border-t border-[hsl(var(--studio-glass-border)/0.6)] p-2">
          <Link
            to="/admin"
            title={collapsed ? "Back to Paige" : undefined}
            className={cn(
              "flex items-center gap-2 rounded-md px-3 py-2 text-sm text-muted-foreground",
              "hover:bg-[hsl(var(--studio-glass-border)/0.3)] hover:text-foreground",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))]",
              collapsed && "justify-center px-0",
            )}
          >
            <ChevronLeft className="h-4 w-4 shrink-0" aria-hidden />
            {!collapsed && "Back to Paige"}
          </Link>
          <div className={cn("flex items-center gap-1 px-1 pt-1", collapsed && "justify-center")}>
            <ThemeToggle />
          </div>
        </div>
      </nav>

      {/* ── main content: the outlet (home hero OR builder). The active-session bundle rides
           <Outlet context> so the stage reads the SAME loaded project the rail does. ── */}
      <div className="relative flex min-w-0 flex-1 flex-col overflow-hidden">
        <Outlet context={activeSession} />
      </div>
    </div>
    </StudioImmersionProvider>
  );
}

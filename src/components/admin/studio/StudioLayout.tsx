// Vibe Studio — the immersive shell (owner: Antonio, 2026-07-16).
//
// Entering Vibe Studio becomes its OWN full room: AdminLayout steps its top nav aside (see
// AdminLayout `isStudio`) and this layout owns the viewport with a PERSISTENT left rail that
// stays put across the home ↔ builder (a nested-route layout renders the rail once and swaps
// only the <Outlet/>, so the rail never remounts). It applies the `.studio-surface` scope so the
// vibrant Paige gradient tokens resolve for everything inside — home hero AND builder — and
// nowhere else (§6/§11 palette exception, contained). The rail is an IN-SURFACE object navigator
// (projects, the four gallery views, New project) plus a single "Back to Growth" escape (Vibe
// Studio lives under the Growth container, Slice 1c-iv) — not a second copy of the hub bar
// (§18), the Lovable/Figma/Linear pattern.
import { useEffect, useMemo, useRef, useState } from "react";
import { Link, Outlet, useLocation, useMatch, useNavigate } from "react-router-dom";
import {
  ChevronLeft,
  Clock,
  FolderOpen,
  LayoutTemplate,
  LibraryBig,
  Moon,
  PanelLeftClose,
  PanelLeftOpen,
  Plus,
  Star,
  Sun,
  Zap,
  ZapOff,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PaigeMark } from "@/components/brand/PaigeMark";
import { cn } from "@/lib/utils";
import { useTenantContext } from "@/hooks/useTenantContext";
import { ProjectNavigator } from "./ProjectNavigator";
import { useActiveStudioSession } from "./useActiveStudioSession";
import { StudioImmersionProvider } from "./StudioImmersion";
import { StudioThemeProvider, useStudioThemeState, type StudioThemeValue } from "./StudioTheme";
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

/** The rail's theme control — the STUDIO-LOCAL toggle (not the platform `ThemeToggle`). It flips
 *  only the `dark` class on the `.studio-surface` root (below), so it themes the gallery + rail
 *  the same way the builder top-bar toggle themes the builder — one shared signal, and the global
 *  platform theme is never touched (owner 2026-07-17). Styled to match StudioNavItem so it reads
 *  as a first-class rail control in both themes. */
function StudioThemeToggleRow({
  theme,
  collapsed,
}: {
  theme: StudioThemeValue;
  collapsed: boolean;
}) {
  const rowLabel = theme.studioDark ? "Light mode" : "Dark mode";
  const Icon = theme.studioDark ? Sun : Moon;
  return (
    <button
      type="button"
      onClick={theme.toggleStudioTheme}
      aria-label={theme.studioDark ? "Switch the Studio to light mode" : "Switch the Studio to dark mode"}
      title={collapsed ? rowLabel : undefined}
      className={cn(
        "flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm text-muted-foreground transition-colors",
        "hover:bg-[hsl(var(--studio-glass-border)/0.3)] hover:text-foreground",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))]",
        collapsed && "justify-center px-0",
      )}
    >
      <Icon className="h-4 w-4 shrink-0" aria-hidden />
      {!collapsed && <span className="truncate">{rowLabel}</span>}
    </button>
  );
}

/** The rail's MOTION control — the Studio-LOCAL cinematic-motion preference (owner 2026-07-19). The
 *  Studio plays full motion by DEFAULT even when the OS asks to reduce (the product's motion is the
 *  point on a creative surface, §11/§22); this is the accessible opt-out that freezes it. Flips only
 *  the `studio-motion-reduced` class on the `.studio-surface` root (below), which re-gates the CSS
 *  freezes to fire on this explicit choice. Styled to match StudioThemeToggleRow. */
function StudioMotionToggleRow({
  theme,
  collapsed,
}: {
  theme: StudioThemeValue;
  collapsed: boolean;
}) {
  const rowLabel = theme.studioMotionReduced ? "Full motion" : "Reduce motion";
  const Icon = theme.studioMotionReduced ? Zap : ZapOff;
  return (
    <button
      type="button"
      onClick={theme.toggleStudioMotion}
      aria-pressed={theme.studioMotionReduced}
      aria-label={
        theme.studioMotionReduced
          ? "Turn on full Studio motion"
          : "Reduce Studio motion for accessibility"
      }
      title={collapsed ? rowLabel : undefined}
      className={cn(
        "flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm text-muted-foreground transition-colors",
        "hover:bg-[hsl(var(--studio-glass-border)/0.3)] hover:text-foreground",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))]",
        collapsed && "justify-center px-0",
      )}
    >
      <Icon className="h-4 w-4 shrink-0" aria-hidden />
      {!collapsed && <span className="truncate">{rowLabel}</span>}
    </button>
  );
}

export default function StudioLayout() {
  const location = useLocation();
  const { activeTenantId } = useTenantContext();
  // Studio-LOCAL theme — owned here (the `.studio-surface` root's parent) so the ROOT class themes
  // BOTH the rail and the outlet in lockstep, and shared down to StudioShell's top-bar toggle via
  // context. Never next-themes, never the global `<html>` class (see StudioTheme.ts).
  const studioTheme = useStudioThemeState();

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
    projectMatch &&
    projectMatch.params.sessionId &&
    projectMatch.params.sessionId !== "new" &&
    // `/admin/studio/library` also matches :sessionId — it's the Media Library, a
    // GALLERY-level destination, not a project. Excluding it keeps the gallery rail
    // (VIEW_NAV) + the workspace exit on that route (not a phantom project navigator).
    projectMatch.params.sessionId !== "library"
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

  const navigate = useNavigate();
  // Esc exits the workspace to Growth — GALLERY ONLY (§21: inside a project the
  // ProjectNavigator "All projects" owns back; Esc there would be ambiguous). Ignores
  // typing targets and any Esc a dropdown/dialog already handled (defaultPrevented).
  useEffect(() => {
    if (onProject) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || e.defaultPrevented || e.metaKey || e.ctrlKey || e.altKey) return;
      const t = e.target as HTMLElement | null;
      if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return;
      navigate("/admin/campaigns");
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onProject, navigate]);

  return (
    <StudioImmersionProvider value={immersionValue}>
    <StudioThemeProvider value={studioTheme}>
    {/* The `.studio-surface` ROOT carries the Studio-local `dark` class (owner 2026-07-17): it
        wraps BOTH the rail and the outlet, so ONE toggle flips every in-Studio surface — rail, top
        bar, composer dock, canvas, empty states, cards, cutscene, AND the gallery — in lockstep,
        while the global platform theme is never touched. Nothing here writes `<html>`/`<body>`. */}
    <div
      className={cn(
        "studio-surface flex h-full min-h-0 w-full overflow-hidden bg-[hsl(var(--studio-rail-bg))] text-foreground",
        studioTheme.studioDark && "dark",
        // Studio-LOCAL motion preference (owner 2026-07-19): by DEFAULT (no class) the cosmic hero,
        // the living mark, the ambient rail, and the build cutscene all play — even when the OS asks
        // to reduce motion — because the product's motion is the point on this creative surface
        // (§11/§22). This class is added ONLY on the explicit "Reduced" choice and re-gates the CSS
        // freezes (src/index.css) to fire on the choice, not merely on the OS media query.
        studioTheme.studioMotionReduced && "studio-motion-reduced",
      )}
    >
      {/* ── persistent LEFT RAIL ── */}
      <nav
        ref={railRef}
        aria-label="Vibe Studio"
        className={cn(
          // The rail no longer hardcodes `dark` — it inherits the Studio-local theme from the
          // `.studio-surface` root above, so flipping the toggle flips the rail too (the old forced
          // `dark` made the toggle look dead on this surface). Its own --studio-rail-* tokens carry
          // the deep-indigo (dark) / crisp indigo-off-white (light) chrome either way (§6/§11).
          // overflow-hidden on BOTH states (not just the immersive branch): the rail is z-20 ABOVE
          // the gallery, and while its width animates 64↔248 its chrome could paint over the cards
          // during the tween (the collapse-overlap bug, #3). Clipping the rail to its own box means
          // nothing bleeds across the seam at any point in the animation. Inner lists keep their own
          // vertical scroll, so this only clips the horizontal bleed.
          "relative z-20 flex h-full shrink-0 flex-col overflow-hidden",
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
        {/* Ambient FALLING stardust — a SUBTLE background layer that complements the hero's cosmic
            field (§22 "the chrome is ALIVE"). aria-hidden + pointer-events-none, and z-index:-1 so it
            sits BEHIND every nav control (the nav is position:relative + z-20 → its own stacking
            context, so -1 stays inside it, above the rail fill, below the content). Low opacity so it
            never competes with the nav; light-tinted in light / star-tinted in dark; motion-safe in
            index.css. */}
        <div aria-hidden className="studio-rail-stardust" />

        {/* ── top exit / context. Makes ENTERING explicit and, on the gallery, IS the prominent
             workspace exit (was a buried footer link). §21: a real back LINK appears ONLY on the
             gallery (!onProject) → "Back to Growth"; inside a project it degrades to STATIC context
             ("‹ Growth", not a link) so the ProjectNavigator's "All projects" stays the single
             unambiguous back — never two at once. Neutral tokens — NO gold (§11). */}
        {!collapsed &&
          (onProject ? (
            <div className="flex h-8 shrink-0 items-center gap-1 px-3 pt-1 text-xs text-muted-foreground/80">
              <ChevronLeft className="h-3.5 w-3.5 shrink-0 opacity-60" aria-hidden />
              <span className="truncate">Growth</span>
            </div>
          ) : (
            <div className="flex h-8 shrink-0 items-center px-3 pt-1">
              <Link
                to="/admin/campaigns"
                aria-label="Back to Growth"
                className="group flex items-center gap-1.5 rounded-md px-1.5 py-1 text-xs text-muted-foreground transition-colors hover:bg-[hsl(var(--studio-glass-border)/0.3)] hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))]"
              >
                <ChevronLeft className="h-3.5 w-3.5 shrink-0" aria-hidden />
                <span className="font-medium">Back to Growth</span>
                <kbd className="ml-1 rounded border border-[hsl(var(--studio-glass-border)/0.7)] px-1 text-[10px] font-medium leading-tight text-muted-foreground opacity-60 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100">
                  Esc
                </kbd>
              </Link>
            </div>
          ))}

        {/* Collapsed rail, gallery only: icon-only back at the top (tooltip carries the label).
             Its own row so the 64px header never overflows. */}
        {collapsed && !onProject && (
          <div className="flex shrink-0 justify-center pt-2">
            <Link
              to="/admin/campaigns"
              aria-label="Back to Growth"
              title="Back to Growth"
              className="rounded-md p-1.5 text-muted-foreground hover:bg-[hsl(var(--studio-glass-border)/0.3)] hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))]"
            >
              <ChevronLeft className="h-4 w-4" aria-hidden />
            </Link>
          </div>
        )}

        {/* brand + collapse toggle. Collapsed = ONLY the (centered) toggle, so the 64px header can
            never overflow (the old layout packed a 28px mark + a non-shrinking 28px toggle + 24px
            padding into 64px and they overlapped, #3). The brand returns the instant the rail
            expands; the gold New-project button below anchors the collapsed rail. */}
        <div className={cn("flex h-14 shrink-0 items-center px-3", collapsed ? "justify-center" : "gap-2")}>
          {!collapsed && (
            <Link to="/admin/studio" className="flex min-w-0 items-center gap-2" aria-label="Vibe Studio home">
              <PaigeMark className="h-7 w-7 shrink-0" />
              <span className="truncate font-display text-sm font-semibold">Vibe Studio</span>
            </Link>
          )}
          <button
            type="button"
            onClick={() => setCollapsed((v) => !v)}
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            aria-expanded={!collapsed}
            className={cn(
              "shrink-0 rounded-md p-1.5 text-muted-foreground hover:bg-[hsl(var(--studio-glass-border)/0.3)] hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))]",
              !collapsed && "ml-auto",
            )}
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
            {/* The Media Library — every kept creative across projects (#284). Navigation by
                NAME, not a type-picker: it's one destination, filtered by kind inside (§18/§21). */}
            <li className="pt-1">
              <Link
                to="/admin/studio/library"
                aria-current={location.pathname.endsWith("/studio/library") ? "page" : undefined}
                title={collapsed ? "Saved library" : undefined}
                className={cn(
                  "flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))]",
                  location.pathname.endsWith("/studio/library")
                    ? "bg-[hsl(var(--studio-glass-border)/0.35)] font-medium text-foreground"
                    : "text-muted-foreground hover:bg-[hsl(var(--studio-glass-border)/0.25)] hover:text-foreground",
                  collapsed && "justify-center px-0",
                )}
              >
                <LibraryBig className="h-4 w-4 shrink-0" aria-hidden />
                {!collapsed && <span className="truncate">Saved library</span>}
              </Link>
            </li>
          </ul>
        )}

        {/* Footer = theme + motion toggles only. The workspace exit ("Back to Growth") moved to
            the TOP of the rail (Slice 1c-iv) so it's prominent, not buried here. §21 preserved:
            the top exit is a real link ONLY on the gallery; inside a project it's static context,
            so the ProjectNavigator "All projects" remains the single session-level back. */}
        <div className="mt-auto shrink-0 border-t border-[hsl(var(--studio-glass-border)/0.6)] p-2">
          {/* The Studio-LOCAL theme switch — flips the `.studio-surface` root class only, so the
              gallery/rail flip with the same signal the builder's top-bar toggle uses. Never the
              global platform theme (owner 2026-07-17). */}
          <div className="pt-1">
            <StudioThemeToggleRow theme={studioTheme} collapsed={collapsed} />
            <StudioMotionToggleRow theme={studioTheme} collapsed={collapsed} />
          </div>
        </div>
      </nav>

      {/* ── main content: the outlet (home hero OR builder). The active-session bundle rides
           <Outlet context> so the stage reads the SAME loaded project the rail does. The
           `studio-enter` one-shot fade fires once on StudioLayout mount (crossing INTO Studio
           from Growth) — this wrapper is stable across internal route changes, so it never
           replays when opening a project/library (§6/§22 "one continuous act"). ── */}
      <div className="studio-enter relative flex min-w-0 flex-1 flex-col overflow-hidden">
        <Outlet context={activeSession} />
      </div>
    </div>
    </StudioThemeProvider>
    </StudioImmersionProvider>
  );
}

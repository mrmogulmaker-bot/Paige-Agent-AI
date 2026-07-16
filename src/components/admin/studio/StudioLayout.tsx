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
import { useState } from "react";
import { Link, NavLink, Outlet, useLocation } from "react-router-dom";
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
  // Builder routes (/admin/studio/new, /admin/studio/:id) default the rail to a thin icon spine
  // so it doesn't compete with the builder's own 380px chat column; the bare home is expanded.
  const onBuilder = location.pathname.startsWith("/admin/studio/");
  const onHome = !onBuilder;
  const [collapsed, setCollapsed] = useState(onBuilder);

  const activeView = (new URLSearchParams(location.search).get("view") as StudioSessionView) ?? "recent";

  return (
    <div className="studio-surface flex h-full min-h-0 w-full overflow-hidden bg-[hsl(var(--studio-rail-bg))] text-foreground">
      {/* ── persistent LEFT RAIL ── */}
      <nav
        aria-label="Vibe Studio"
        className={cn(
          "relative z-20 flex h-full shrink-0 flex-col border-r border-[hsl(var(--studio-glass-border)/0.6)]",
          "bg-[hsl(var(--studio-rail-bg))] shadow-[4px_0_16px_-12px_hsl(var(--shadow-ink)/0.18)]",
          "transition-[width] duration-200 motion-reduce:transition-none",
          collapsed ? "w-[64px]" : "w-[248px]",
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

        {/* the four gallery views */}
        <ul className="flex-1 space-y-0.5 overflow-y-auto px-2 py-2">
          {VIEW_NAV.map((item) => (
            <li key={item.view}>
              <StudioNavItem item={item} collapsed={collapsed} activeView={activeView} onHome={onHome} />
            </li>
          ))}
        </ul>

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

      {/* ── main content: the outlet (home hero OR builder) ── */}
      <div className="relative flex min-w-0 flex-1 flex-col overflow-hidden">
        <Outlet />
      </div>
    </div>
  );
}

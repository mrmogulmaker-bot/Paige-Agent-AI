// Light/dark switch — wired to next-themes (already a dependency, previously imported only by
// the toast component with no ThemeProvider ever mounted, so it silently did nothing). Tailwind
// is configured `darkMode: ["class"]` (tailwind.config.ts) and src/index.css's overrides key off
// a `.dark` class on <html> — next-themes's `attribute="class"` mode is the exact match, and it
// persists the choice (localStorage) and defaults to the visitor's OS preference until they pick.
import { Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export interface ThemeToggleProps {
  className?: string;
  /** Matches the surrounding bar's foreground so this reads correctly on both the indigo
   *  AdminLayout header and the light StudioTopBar. */
  variant?: "on-primary" | "default";
  /** Render a full LABELED nav row ([icon] + "Dark mode" / "Light mode") instead of the bare
   *  icon button — used in the Studio rail so the toggle is obviously a theme switch in BOTH
   *  themes (#6). It styles itself exactly like a rail nav item and, crucially, RE-DECLARES its
   *  own `color` via `text-muted-foreground`, so under the rail's forced `.dark` scope the icon
   *  resolves the dark theme's near-white foreground instead of inheriting the light theme's
   *  dark-indigo (the CSS custom-property inheritance trap that made the moon invisible). */
  labeled?: boolean;
  /** In `labeled` mode, collapse to just the centered icon (rail collapsed). */
  collapsed?: boolean;
}

export function ThemeToggle({ className, variant = "default", labeled = false, collapsed = false }: ThemeToggleProps) {
  const { resolvedTheme, setTheme } = useTheme();
  // next-themes resolves after mount (it reads localStorage/matchMedia client-side); rendering
  // a fixed icon before that would flash the wrong one. A neutral placeholder avoids that without
  // a layout shift once resolvedTheme lands.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const isDark = mounted && resolvedTheme === "dark";
  const toggle = () => setTheme(isDark ? "light" : "dark");
  const ariaLabel = mounted ? (isDark ? "Switch to light mode" : "Switch to dark mode") : "Toggle color theme";
  const Icon = isDark ? Sun : Moon;

  if (labeled) {
    // A labeled affordance styled to match StudioNavItem — same shape, same hover, same color
    // re-declaration — so it reads as a first-class rail control, not a mystery glyph.
    const rowLabel = mounted ? (isDark ? "Light mode" : "Dark mode") : "Theme";
    return (
      <button
        type="button"
        onClick={toggle}
        aria-label={ariaLabel}
        title={collapsed ? rowLabel : undefined}
        className={cn(
          "flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm text-muted-foreground transition-colors",
          "hover:bg-[hsl(var(--studio-glass-border)/0.3)] hover:text-foreground",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))]",
          collapsed && "justify-center px-0",
          className,
        )}
      >
        <Icon className="h-4 w-4 shrink-0" aria-hidden />
        {!collapsed && <span className="truncate">{rowLabel}</span>}
      </button>
    );
  }

  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      onClick={toggle}
      aria-label={ariaLabel}
      className={cn(
        variant === "on-primary" && "text-primary-foreground/80 hover:text-primary-foreground hover:bg-sidebar-accent/50",
        className,
      )}
    >
      <Icon className="h-4 w-4" aria-hidden />
    </Button>
  );
}

export default ThemeToggle;

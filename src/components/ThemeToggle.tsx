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
}

export function ThemeToggle({ className, variant = "default" }: ThemeToggleProps) {
  const { resolvedTheme, setTheme } = useTheme();
  // next-themes resolves after mount (it reads localStorage/matchMedia client-side); rendering
  // a fixed icon before that would flash the wrong one. A neutral placeholder avoids that without
  // a layout shift once resolvedTheme lands.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const isDark = mounted && resolvedTheme === "dark";

  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      onClick={() => setTheme(isDark ? "light" : "dark")}
      aria-label={mounted ? (isDark ? "Switch to light mode" : "Switch to dark mode") : "Toggle color theme"}
      className={cn(
        variant === "on-primary" && "text-primary-foreground/80 hover:text-primary-foreground hover:bg-sidebar-accent/50",
        className,
      )}
    >
      {isDark ? <Sun className="h-4 w-4" aria-hidden /> : <Moon className="h-4 w-4" aria-hidden />}
    </Button>
  );
}

export default ThemeToggle;

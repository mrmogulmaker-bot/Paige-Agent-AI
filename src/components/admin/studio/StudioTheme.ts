// Studio-LOCAL light/dark theme — the single signal that themes EVERY in-Studio surface
// (rail, top bar, composer dock, canvas, empty states, cards, the build cutscene, the gallery).
//
// SCOPING (owner 2026-07-17): this theme is GATED INSIDE the Studio and never bleeds out. It is
// NOT next-themes and NEVER writes the global <html>/<body> `.dark` class — it only flips a `dark`
// class on the `.studio-surface` ROOT (StudioLayout), which wraps both the rail and the outlet and
// lives only inside the Studio. The rest of the platform keeps its own theme; the platform theme
// does not dictate the Studio (the `.studio-surface:not(.dark)` block in src/index.css shields a
// light Studio from a dark platform's token leakage). Lifted to a context at the StudioLayout level
// (mirroring StudioImmersion) so the RAIL — a sibling of the outlet, above StudioShell — flips too.
//
// The persisted signal is `studioDark` in localStorage key "paige-studio-theme" (default DARK — a
// creative workspace is dark by definition; light is the explicit opt-in and stays fully supported).
import { createContext, useCallback, useContext, useMemo, useState } from "react";

export const STUDIO_THEME_STORAGE_KEY = "paige-studio-theme";

/** Read the persisted Studio theme. SSR-safe; defaults DARK unless "light" is stored. */
export function readStudioDark(): boolean {
  if (typeof window === "undefined") return true;
  try {
    return window.localStorage.getItem(STUDIO_THEME_STORAGE_KEY) !== "light";
  } catch {
    return true;
  }
}

export interface StudioThemeValue {
  /** True = the Studio renders dark; false = light. Drives the `dark` class on `.studio-surface`. */
  studioDark: boolean;
  /** Flip the Studio-local theme and persist it. Never touches the global platform theme. */
  toggleStudioTheme: () => void;
  /** True only under a real StudioThemeProvider (StudioLayout). An EMBEDDED StudioShell rendered
   *  with no provider sees false and falls back to its own local state — the same safe-default
   *  pattern StudioImmersion uses for the no-provider case. */
  scoped: boolean;
}

// Default is an unscoped no-op so an embedded consumer stays safe. `scoped: false` is the signal
// that lets StudioShell know to fall back to its own local state instead of this inert default.
const StudioThemeContext = createContext<StudioThemeValue>({
  studioDark: true,
  toggleStudioTheme: () => {},
  scoped: false,
});

export const StudioThemeProvider = StudioThemeContext.Provider;

export function useStudioTheme(): StudioThemeValue {
  return useContext(StudioThemeContext);
}

/** Owns the Studio-local theme state + persistence. Used by StudioLayout so the ROOT `.studio-surface`
 *  class and the rail's own toggle read the SAME source as StudioShell's top-bar toggle. */
export function useStudioThemeState(): StudioThemeValue {
  const [studioDark, setStudioDark] = useState(readStudioDark);
  const toggleStudioTheme = useCallback(() => {
    setStudioDark((prev) => {
      const next = !prev;
      try {
        window.localStorage.setItem(STUDIO_THEME_STORAGE_KEY, next ? "dark" : "light");
      } catch {
        // Storage can be unavailable (private browsing, quota) — the toggle still works for the
        // session, it just won't survive a reload. Not worth failing the click over.
      }
      return next;
    });
  }, []);
  return useMemo(
    () => ({ studioDark, toggleStudioTheme, scoped: true }),
    [studioDark, toggleStudioTheme],
  );
}

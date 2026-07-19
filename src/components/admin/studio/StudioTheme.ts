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
//
// MOTION (owner 2026-07-19): the Studio also carries its OWN motion preference — `studioMotionReduced`
// in localStorage key "paige-studio-motion" — that DEFAULTS TO FULL CINEMATIC MOTION and deliberately
// does NOT obey the OS `prefers-reduced-motion` flag for the decorative cosmic/mark/ambient layers.
// The Studio is a cinematic creative surface where the product's motion IS the point (§11/§22), so the
// hero field, the living mark, and the build cutscene play by default even when the OS asks to reduce.
// Accessibility stays available via the explicit "Reduced" toggle in the rail, which THEN freezes
// everything cleanly (an owner-approved, single-surface deviation — not a platform-wide one). The
// preference surfaces as a `studio-motion-reduced` class on the `.studio-surface` root (StudioLayout),
// which re-gates the CSS freezes from "the OS asked" to "the user explicitly chose reduced".
import { createContext, useCallback, useContext, useMemo, useState } from "react";
import { useReducedMotion } from "framer-motion";

export const STUDIO_THEME_STORAGE_KEY = "paige-studio-theme";
export const STUDIO_MOTION_STORAGE_KEY = "paige-studio-motion";

/** Read the persisted Studio theme. SSR-safe; defaults DARK unless "light" is stored. */
export function readStudioDark(): boolean {
  if (typeof window === "undefined") return true;
  try {
    return window.localStorage.getItem(STUDIO_THEME_STORAGE_KEY) !== "light";
  } catch {
    return true;
  }
}

/** Read the persisted Studio MOTION preference. SSR-safe; defaults FULL (false = not reduced) unless
 *  the user has explicitly stored "reduced". The OS flag is intentionally NOT consulted here — inside
 *  the Studio the default is full cinematic motion regardless of the OS setting (owner 2026-07-19). */
export function readStudioMotionReduced(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(STUDIO_MOTION_STORAGE_KEY) === "reduced";
  } catch {
    return false;
  }
}

export interface StudioThemeValue {
  /** True = the Studio renders dark; false = light. Drives the `dark` class on `.studio-surface`. */
  studioDark: boolean;
  /** Flip the Studio-local theme and persist it. Never touches the global platform theme. */
  toggleStudioTheme: () => void;
  /** True = the user explicitly chose REDUCED motion; false (default) = FULL cinematic motion. Drives
   *  the `studio-motion-reduced` class on `.studio-surface`, which re-gates the decorative freezes so
   *  they fire on THIS choice, not merely because the OS asked to reduce. */
  studioMotionReduced: boolean;
  /** Flip the Studio-local motion preference (Full ↔ Reduced) and persist it. */
  toggleStudioMotion: () => void;
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
  studioMotionReduced: false,
  toggleStudioMotion: () => {},
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
  const [studioMotionReduced, setStudioMotionReduced] = useState(readStudioMotionReduced);
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
  const toggleStudioMotion = useCallback(() => {
    setStudioMotionReduced((prev) => {
      const next = !prev;
      try {
        window.localStorage.setItem(STUDIO_MOTION_STORAGE_KEY, next ? "reduced" : "full");
      } catch {
        // Same graceful degradation as the theme toggle — persistence is best-effort.
      }
      return next;
    });
  }, []);
  return useMemo(
    () => ({ studioDark, toggleStudioTheme, studioMotionReduced, toggleStudioMotion, scoped: true }),
    [studioDark, toggleStudioTheme, studioMotionReduced, toggleStudioMotion],
  );
}

/** The single JS gate the Studio uses in place of framer-motion's raw `useReducedMotion()`. INSIDE
 *  the real Studio (a StudioThemeProvider is present) the Studio-local motion preference governs and
 *  DEFAULTS TO FULL — the OS `prefers-reduced-motion` flag does NOT force the decorative/mark/cutscene
 *  layers off (owner 2026-07-19); the explicit "Reduced" toggle is the accessible opt-out. With NO
 *  provider (an embedded StudioShell), there is no toggle to offer, so it honestly falls back to
 *  honoring the OS flag. Returns true only when motion should be reduced. */
export function useStudioReducedMotion(): boolean {
  const { studioMotionReduced, scoped } = useStudioTheme();
  const osReduce = useReducedMotion();
  return scoped ? studioMotionReduced : !!osReduce;
}

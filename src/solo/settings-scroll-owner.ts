/**
 * WHICH ELEMENT SCROLLS A SETTINGS DESTINATION — resolved in ONE place.
 *
 * `SoloApp` renders a screen host between the shell's `#tenant-shell-main` and
 * the surface, and for a document-flow route like Settings that host is the
 * element with `overflow: auto`. `#tenant-shell-main` cannot overflow above it,
 * because its only child is `height: 100%`.
 *
 * The fallback is not decoration: Settings is also mounted bare in unit tests and
 * in drive harnesses that supply no screen host, and there the shell main is the
 * scroll owner. Both callers must agree, or one dresses an element the other
 * scrolls — which is exactly what happened when `SoloSettings` moved to the host
 * and `CalendarsView` kept resolving `#tenant-shell-main`: the surface restored a
 * scrollbar on an element with no scroll extent while the real owner kept none.
 * One home, so the two cannot drift again (§18).
 */
export function settingsScrollOwner(root: HTMLElement | null): HTMLElement | null {
  return (
    root?.closest<HTMLElement>("[data-solo-screen-host]") ??
    root?.closest<HTMLElement>("#tenant-shell-main") ??
    null
  );
}

/**
 * Settings is the intentionally scrollable browse class (owner policy 2026-08-31),
 * so its scroll owner shows a bar a human can see and drag. This is ADDED next to
 * `tcs-main--settings-scrollbar-hidden` rather than removing it: both are applied
 * by `SoloSettings` in the same effect, and the cascade — not effect ordering —
 * decides which wins. See `settings.css` for why the winning selector has to name
 * both classes.
 */
export const SETTINGS_SCROLLBAR_SHOWN = "tcs-main--settings-scrollbar-shown";

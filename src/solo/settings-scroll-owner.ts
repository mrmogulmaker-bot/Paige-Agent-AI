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
 * Added by a Settings surface that is long enough to need a scrollbar a human can
 * see and drag. It does NOT fight `tcs-main--settings-scrollbar-hidden` by
 * removing it — React runs CHILD effects before PARENT effects, so a removal
 * inside the surface is undone microseconds later when `SoloSettings` re-adds it.
 * Two classes and a cascade cannot lose that race.
 */
export const SETTINGS_SCROLLBAR_SHOWN = "tcs-main--settings-scrollbar-shown";

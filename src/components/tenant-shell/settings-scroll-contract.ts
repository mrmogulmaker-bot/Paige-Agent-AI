/**
 * THE ONE CONTRACT BETWEEN SHARED SHELL CHROME AND A SETTINGS SURFACE.
 *
 * The shell restores focus to the PAIGE command field on every route change while
 * the rail is folded. A Settings destination deliberately focuses the element that
 * scrolls it, and that focus has to survive the restore — otherwise End, PageDown
 * and Space do nothing until the human clicks or Tabs back into the page.
 *
 * This module owns the class and the predicate so the two sides are linked by the
 * compiler. The first version of the guard duplicated the class literal into the
 * shell with a test asserting the strings matched; an independent review showed
 * that assertion stayed green against an INVERTED guard, a guard moved after the
 * `focus()` call, and a guard moved into a function nobody called. A string
 * comparison cannot see any of that. A shared predicate can be tested directly.
 *
 * The dependency points the right way: shared chrome owns the contract and the
 * tier consumes it, so `src/solo` imports from here and never the reverse.
 */
export const SETTINGS_SCROLL_OWNER_CLASS = "tcs-main--settings-scrollbar-shown";

/**
 * True when focus is on the Settings scroll owner OR anywhere inside it.
 *
 * `closest`, not `classList.contains`. The reviewer drove the difference: with
 * focus one Tab into the content, a nav toggle (Ctrl+Alt+\) or a window resize
 * across 1080px re-runs the restore, and a `classList` check on the active element
 * does not match a CHILD of the owner — so the command field took focus and `End`
 * left `scrollTop` at 0 of 649. That is the exact symptom the guard exists to
 * remove, still reachable one Tab in.
 *
 * Widening to `closest` cannot widen the guard's REACH, because only `SoloSettings`
 * ever applies the class — it only stops the guard missing the subtree it already
 * meant to cover.
 */
export function holdsSettingsScrollFocus(element: Element | null): boolean {
  return !!element?.closest?.(`.${SETTINGS_SCROLL_OWNER_CLASS}`);
}

/**
 * Cross-reload switch notice (agency ⇄ sub-account).
 *
 * Switching the active tenant writes `profiles.active_tenant_id` server-side and
 * then HARD-navigates (`window.location.assign('/admin')`) so every consumer of
 * the per-instance `useTenantContext` hook re-reads the new scope from scratch —
 * a soft refresh would only update the caller's own copy, leaving AdminLayout on
 * the old tenant. Because the reload tears down the toast queue, we hand the
 * confirmation message across the reload in `sessionStorage`: the switch site
 * stashes it, and whatever mounts on the far side (the AccountSwitcher in the
 * header) consumes it once and fires the toast. One-shot, self-clearing, and
 * degrades silently if storage is unavailable (Safari private mode, §client.ts).
 */
const KEY = "paige.agency.switchNotice";

export function stashSwitchNotice(message: string): void {
  try {
    sessionStorage.setItem(KEY, message);
  } catch {
    /* storage unavailable — the switch still happens, just without the toast */
  }
}

export function consumeSwitchNotice(): string | null {
  try {
    const v = sessionStorage.getItem(KEY);
    if (v) sessionStorage.removeItem(KEY);
    return v;
  } catch {
    return null;
  }
}

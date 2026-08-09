// signupPlanIntent — the ONE home (§18) for carrying a chosen platform plan through
// the signup flow: pricing (?plan=slug&billing=period) → /auth (or /signup) →
// /onboarding?plan=…&billing=… → Stripe checkout.
//
// Two carriers, used together so the intent survives every hop including the OAuth
// provider round-trip:
//   • the URL query (?plan/?billing/?invite) — survives an in-tab OAuth redirect when
//     we point redirectTo back at the auth page with the params re-appended; and
//   • a sessionStorage stash — belt-and-suspenders for the same round-trip.
// On return the auth page re-hydrates from the ref (email path), then the stash, then
// the URL, and routes to /onboarding carrying the plan (never straight to checkout —
// checkout is the LAST step, after the /onboarding business-context + terms step).

export type PlanIntent = { plan: string; billing: string; invite?: string };

const STASH_KEY = "paige_signup_plan_intent";

/** monthly unless explicitly annual (mirrors the edge fn's billing normalization). */
export function normalizeBilling(v: string | null | undefined): string {
  return v === "annual" ? "annual" : "monthly";
}

export function stashPlanIntent(intent: PlanIntent): void {
  try {
    // SECURITY (CodeQL clear-text-storage): persist ONLY the public pricing intent
    // (plan + billing). The `invite` token is NEVER written to sessionStorage — it is
    // already carried in the URL query across the OAuth round-trip (authRedirectWithPlan
    // / onboardingPathWithPlan) and read from there where consumed, so nothing is lost.
    const { plan, billing } = intent;
    sessionStorage.setItem(STASH_KEY, JSON.stringify({ plan, billing }));
  } catch {
    /* private-mode / storage disabled — the URL carrier still covers the hop */
  }
}

export function readPlanIntent(): PlanIntent | null {
  try {
    const raw = sessionStorage.getItem(STASH_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<PlanIntent>;
    if (!parsed || typeof parsed.plan !== "string" || !parsed.plan) return null;
    // No `invite` here by design (it's never stashed — see stashPlanIntent). Callers
    // backfill it from the URL when needed.
    return {
      plan: parsed.plan,
      billing: normalizeBilling(parsed.billing),
    };
  } catch {
    return null;
  }
}

export function clearPlanIntent(): void {
  try {
    sessionStorage.removeItem(STASH_KEY);
  } catch {
    /* ignore */
  }
}

/** Build the /onboarding URL that carries the plan (and invite) forward, or the bare
 *  /onboarding for the free/no-plan path. */
export function onboardingPathWithPlan(intent: PlanIntent | null): string {
  if (!intent) return "/onboarding";
  const q = new URLSearchParams({ plan: intent.plan, billing: normalizeBilling(intent.billing) });
  if (intent.invite) q.set("invite", intent.invite);
  return `/onboarding?${q.toString()}`;
}

/** Re-hydrate the auth-page's OAuth-return redirect target so it carries the plan
 *  params (used only for the plan-intent, non-invite OAuth signup path). */
export function authRedirectWithPlan(origin: string, intent: PlanIntent): string {
  const q = new URLSearchParams({
    mode: "signup",
    plan: intent.plan,
    billing: normalizeBilling(intent.billing),
  });
  if (intent.invite) q.set("invite", intent.invite);
  return `${origin}/auth?${q.toString()}`;
}

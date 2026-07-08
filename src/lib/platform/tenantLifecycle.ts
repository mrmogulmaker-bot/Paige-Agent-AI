// ---------------------------------------------------------------------------
// Tenant lifecycle — the Agency/God-view control-plane operations.
// ---------------------------------------------------------------------------
// Pure helpers (status metadata, trial math, at-risk scoring) + the RLS-gated
// mutations the Fleet Console drives. Writes go straight to `tenants`, which the
// "Platform owner manages tenants" RLS policy already permits for is_platform_owner().
// Blueprint: God View → Agency View → Sub-Account, Phase 1 (no Stripe).

import { supabase } from "@/integrations/supabase/client";

export type TenantStatus = "trial" | "active" | "past_due" | "suspended" | "canceled";

export const TENANT_STATUSES: TenantStatus[] = ["trial", "active", "past_due", "suspended", "canceled"];

/** Display metadata per status — label + a badge tone the console maps to color. */
export const STATUS_META: Record<TenantStatus, { label: string; tone: "positive" | "notice" | "warn" | "critical" | "neutral" }> = {
  trial: { label: "Trial", tone: "notice" },
  active: { label: "Active", tone: "positive" },
  past_due: { label: "Past due", tone: "warn" },
  suspended: { label: "Suspended", tone: "critical" },
  canceled: { label: "Canceled", tone: "neutral" },
};

/** Lifecycle transitions offered from a given status (drives the action buttons). */
export function allowedTransitions(status: TenantStatus): TenantStatus[] {
  switch (status) {
    case "trial": return ["active", "suspended", "canceled"];
    case "active": return ["suspended", "canceled"];
    case "past_due": return ["active", "suspended", "canceled"];
    case "suspended": return ["active", "canceled"];
    case "canceled": return ["active"];
    default: return [];
  }
}

/** A destructive transition warrants a confirm step in the UI. */
export function isDestructiveStatus(status: TenantStatus): boolean {
  return status === "suspended" || status === "canceled";
}

// --- Trial math -------------------------------------------------------------

/** Whole days until the trial ends (negative = already lapsed). null if no trial date. */
export function trialDaysLeft(trialEndsAt: string | null | undefined, now: number = Date.now()): number | null {
  if (!trialEndsAt) return null;
  const end = new Date(trialEndsAt).getTime();
  if (Number.isNaN(end)) return null;
  const raw = (end - now) / 86_400_000;
  // Round up while the trial is in the future ("7 days left" reads as 7 right
  // after a +7 extension), but round down once lapsed so any past date is a
  // strictly negative day count — never a deceptive 0.
  return raw >= 0 ? Math.ceil(raw) : Math.floor(raw);
}

/** ISO timestamp N days from the later of (current trial end, now) — an extension never shortens. */
export function extendedTrialEnd(trialEndsAt: string | null | undefined, days: number, now: number = Date.now()): string {
  const base = trialEndsAt ? Math.max(new Date(trialEndsAt).getTime() || now, now) : now;
  return new Date(base + days * 86_400_000).toISOString();
}

// --- At-risk / health scoring ----------------------------------------------

export interface TenantHealthInput {
  status: TenantStatus;
  trial_ends_at: string | null;
  seat_limit: number;
  customer_limit: number;
  member_count: number;
  customer_count: number;
}

export type HealthLevel = "healthy" | "watch" | "critical";

export interface TenantHealth {
  level: HealthLevel;
  reasons: string[];
}

/**
 * Deterministic, evidence-based health. No ML — just the signals a platform
 * owner acts on: billing trouble, a trial about to lapse, and hitting limits.
 * (Client-side today; the blueprint moves this to a server-side rollup at scale.)
 */
export function tenantHealth(t: TenantHealthInput, now: number = Date.now()): TenantHealth {
  const reasons: string[] = [];
  let level: HealthLevel = "healthy";

  if (t.status === "suspended") { reasons.push("Suspended"); level = "critical"; }
  else if (t.status === "past_due") { reasons.push("Payment past due"); level = "critical"; }
  // `canceled` is a resolved terminal state — the status badge conveys it; it is
  // deliberately NOT flagged "needs attention" so the at-risk count stays actionable.

  const days = trialDaysLeft(t.trial_ends_at, now);
  if (t.status === "trial" && days !== null) {
    if (days < 0) { reasons.push("Trial lapsed"); level = worst(level, "critical"); }
    else if (days <= 3) { reasons.push(`Trial ends in ${days}d`); level = worst(level, "watch"); }
  }

  if (t.seat_limit > 0 && t.member_count >= t.seat_limit) {
    reasons.push("Seats at limit"); level = worst(level, "watch");
  }
  if (t.customer_limit > 0 && t.customer_count >= t.customer_limit) {
    reasons.push("Customers at limit"); level = worst(level, "watch");
  }

  return { level, reasons };
}

function worst(a: HealthLevel, b: HealthLevel): HealthLevel {
  const rank: Record<HealthLevel, number> = { healthy: 0, watch: 1, critical: 2 };
  return rank[b] > rank[a] ? b : a;
}

// --- RLS-gated mutations (platform owner) -----------------------------------

export interface TenantLifecyclePatch {
  status?: TenantStatus;
  plan_offer?: string | null;
  seat_limit?: number;
  customer_limit?: number;
  trial_ends_at?: string | null;
}

/** Raw RLS-gated write to a tenant. Throws on error so callers can toast. */
async function writeTenant(tenantId: string, patch: TenantLifecyclePatch): Promise<void> {
  const { error } = await supabase.from("tenants").update(patch).eq("id", tenantId);
  if (error) throw new Error(error.message);
}

/**
 * Best-effort audit of a privileged tenant action to the shared `audit_logs`
 * sink (RLS requires user_id = auth.uid()). Deliberately swallows its own
 * failure: an audit hiccup must not make a completed lifecycle action report as
 * failed to the operator. Every owner-level tenant mutation records a trail.
 */
async function logTenantAction(action: string, tenantId: string, data: Record<string, unknown>): Promise<void> {
  try {
    const { data: auth } = await supabase.auth.getUser();
    const uid = auth.user?.id;
    if (!uid) return;
    await supabase.from("audit_logs").insert({
      user_id: uid, action, entity: "tenant", entity_id: tenantId, data,
    });
  } catch {
    /* audit is best-effort — never block or fail the action it records */
  }
}

/** Apply a lifecycle patch to a tenant + record it. Throws on write error. */
export async function updateTenant(tenantId: string, patch: TenantLifecyclePatch): Promise<void> {
  await writeTenant(tenantId, patch);
  await logTenantAction("tenant.update", tenantId, { ...patch });
}

export async function setTenantStatus(tenantId: string, status: TenantStatus): Promise<void> {
  await writeTenant(tenantId, { status });
  await logTenantAction("tenant.status_change", tenantId, { status });
}

export async function extendTrial(tenantId: string, currentEnd: string | null, days: number): Promise<string> {
  const next = extendedTrialEnd(currentEnd, days);
  await writeTenant(tenantId, { trial_ends_at: next, status: "trial" });
  await logTenantAction("tenant.trial_extend", tenantId, { days, trial_ends_at: next });
  return next;
}

export async function expireTrial(tenantId: string): Promise<void> {
  // Strictly in the past so it reads as lapsed immediately (not a same-day "0d").
  const past = new Date(Date.now() - 1000).toISOString();
  await writeTenant(tenantId, { trial_ends_at: past });
  await logTenantAction("tenant.trial_expire", tenantId, { trial_ends_at: past });
}

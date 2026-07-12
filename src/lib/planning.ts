import { supabase } from "@/integrations/supabase/client";
import type { PlanItem, PlanItemStatus } from "@/hooks/usePlanList";

/** The date a plan item lands on the timeline — a task/milestone by its due
 * date, a reminder by its fire time. */
export function itemDate(item: PlanItem): string | null {
  return item.due_at ?? item.remind_at ?? null;
}

export type TimeBucket = "overdue" | "today" | "week" | "later" | "none";

const DONE_STATUSES: PlanItemStatus[] = ["done", "cancelled"];

export function isClosed(item: PlanItem): boolean {
  return DONE_STATUSES.includes(item.status);
}

/** Bucket an OPEN item on the viewer's local day boundary. Closed items are
 * never overdue (callers show them in a separate "Done" group). */
export function bucketOf(item: PlanItem, now: Date = new Date()): TimeBucket {
  const iso = itemDate(item);
  if (!iso) return "none";
  const when = new Date(iso);
  if (Number.isNaN(when.getTime())) return "none";

  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startOfTomorrow = new Date(startOfToday.getTime() + 86_400_000);
  const endOfWeek = new Date(startOfToday.getTime() + 7 * 86_400_000);

  if (when.getTime() < now.getTime()) return "overdue"; // any past time is overdue
  if (when < startOfTomorrow) return "today";           // later today
  if (when < endOfWeek) return "week";
  return "later";
}

const RTF = typeof Intl !== "undefined" && "RelativeTimeFormat" in Intl
  ? new Intl.RelativeTimeFormat("en", { numeric: "auto" })
  : null;

/** "in 2 hours", "Overdue by 3 days", "just now" — viewer-local, humane. */
export function relativeWhen(iso: string | null, now: Date = new Date()): string {
  if (!iso) return "No date";
  const when = new Date(iso);
  if (Number.isNaN(when.getTime())) return "No date";
  const diffMs = when.getTime() - now.getTime();
  const past = diffMs < 0;
  const abs = Math.abs(diffMs);
  if (abs < 45_000) return "Just now";
  const mins = Math.round(abs / 60_000);
  const hours = Math.round(abs / 3_600_000);
  const days = Math.round(abs / 86_400_000);
  const months = Math.round(days / 30);

  let unit: Intl.RelativeTimeFormatUnit, val: number;
  if (mins < 60) { unit = "minute"; val = Math.max(1, mins); }
  else if (hours < 24) { unit = "hour"; val = hours; }
  else if (days < 30) { unit = "day"; val = days; }
  else { unit = "month"; val = months; }

  if (past) return `Overdue by ${val} ${unit}${val === 1 ? "" : "s"}`;
  if (RTF) return RTF.format(val, unit);
  return `in ${val} ${unit}${val === 1 ? "" : "s"}`;
}

/** Absolute, for the tooltip. */
export function absoluteWhen(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return new Intl.DateTimeFormat("en-US", {
    weekday: "short", month: "short", day: "numeric",
    hour: "numeric", minute: "2-digit",
  }).format(d);
}

/** Map a plan_* RPC error code to human, jargon-free copy (§11). */
export function friendlyPlanError(message: string): string {
  const m = message || "";
  if (m.includes("PLAN_FORBIDDEN: reassigning")) return "Only a coach or admin can reassign work.";
  if (m.includes("PLAN_FORBIDDEN")) return "You don't have permission for that.";
  if (m.includes("PLAN_ASSIGNEE_NOT_IN_TENANT")) return "That person isn't on your team.";
  if (m.includes("PLAN_ITEM_NOT_FOUND")) return "That item was already removed.";
  if (m.includes("PLAN_BAD_STATUS")) return "That status isn't valid.";
  return "That didn't go through. Try again.";
}

// ── Mutations (the same RPCs Paige's tools call — §10) ──────────────────────

export async function setItemStatus(itemId: string, status: PlanItemStatus): Promise<void> {
  const { error } = await supabase.rpc("plan_update_item", { p_item_id: itemId, p_status: status });
  if (error) throw new Error(friendlyPlanError(error.message));
}

export async function rescheduleItem(item: PlanItem, whenIso: string): Promise<void> {
  // A reminder reschedules its fire time (clears reminded_at server-side so it
  // re-fires); a task/milestone moves its due date.
  const args: Record<string, unknown> = { p_item_id: item.id };
  if (item.item_type === "reminder") args.p_remind_at = whenIso;
  else args.p_due_at = whenIso;
  const { error } = await supabase.rpc("plan_update_item", args);
  if (error) throw new Error(friendlyPlanError(error.message));
}

export async function reassignItem(itemId: string, userId: string): Promise<void> {
  const { error } = await supabase.rpc("plan_update_item", { p_item_id: itemId, p_assigned_to_user_id: userId });
  if (error) throw new Error(friendlyPlanError(error.message));
}

export async function removeItem(itemId: string): Promise<void> {
  const { error } = await supabase.rpc("plan_remove_item", { p_item_id: itemId });
  if (error) throw new Error(friendlyPlanError(error.message));
}

/** Quick snooze presets → a concrete future ISO timestamp (viewer-local). */
export function snoozePresets(now: Date = new Date()): { label: string; iso: string }[] {
  const mk = (ms: number) => new Date(now.getTime() + ms).toISOString();
  const tomorrow9 = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 9, 0, 0);
  const nextWeek9 = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 7, 9, 0, 0);
  const thisEvening = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 18, 0, 0);
  const out: { label: string; iso: string }[] = [{ label: "In 1 hour", iso: mk(3_600_000) }];
  if (thisEvening.getTime() > now.getTime() + 3_600_000) out.push({ label: "This evening", iso: thisEvening.toISOString() });
  out.push({ label: "Tomorrow 9 AM", iso: tomorrow9.toISOString() });
  out.push({ label: "Next week", iso: nextWeek9.toISOString() });
  return out;
}

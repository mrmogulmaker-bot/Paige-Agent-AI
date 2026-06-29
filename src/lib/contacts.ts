// Shared CRM contact helpers — lifecycle stages, sources, formatters.
// Note: product/offer catalogs are NOT defined here. Each tenant defines its
// own offers in Admin → Settings → Storefront. Use the `useTenantOffers` hook
// in React, or call `offerLabel` for legacy fallback rendering only.

export type LifecycleStage =
  | "lead" | "mql" | "sql" | "opportunity"
  | "customer" | "evangelist" | "churned" | "archived";

export const LIFECYCLE_STAGES: { value: LifecycleStage; label: string; color: string }[] = [
  { value: "lead",        label: "Lead",        color: "bg-slate-500/15 text-slate-700 dark:text-slate-300" },
  { value: "mql",         label: "MQL",         color: "bg-sky-500/15 text-sky-700 dark:text-sky-300" },
  { value: "sql",         label: "SQL",         color: "bg-indigo-500/15 text-indigo-700 dark:text-indigo-300" },
  { value: "opportunity", label: "Opportunity", color: "bg-amber-500/15 text-amber-700 dark:text-amber-300" },
  { value: "customer",    label: "Customer",    color: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300" },
  { value: "evangelist",  label: "Evangelist",  color: "bg-fuchsia-500/15 text-fuchsia-700 dark:text-fuchsia-300" },
  { value: "churned",     label: "Churned",     color: "bg-red-500/15 text-red-700 dark:text-red-300" },
  { value: "archived",    label: "Archived",    color: "bg-muted text-muted-foreground" },
];

export const CONTACT_SOURCES = [
  "manual", "referral", "website", "tenant_invite", "stripe", "paige", "import", "event", "partner",
];

// Pure helper for legacy/static rendering paths (e.g. rows where the React
// hook isn't readily available). For real UI pickers use `useTenantOffers`.
// Returns a humanized version of the raw stored value (id, slug, or label).
export function offerLabel(value: string | null | undefined): string | null {
  if (!value) return null;
  // UUIDs (tenant_products.id) — display as-is; the hook-powered components
  // will replace this with the real product name once loaded.
  if (/^[0-9a-f-]{36}$/i.test(value)) return value;
  // Slug → Title Case
  return value
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

export function lifecycleMeta(stage: string | null | undefined) {
  return LIFECYCLE_STAGES.find((s) => s.value === stage) ||
    { value: stage || "lead", label: stage || "Lead", color: "bg-muted text-muted-foreground" };
}

export function contactsToCSV(rows: Record<string, unknown>[]): string {
  if (!rows.length) return "";
  const headers = Object.keys(rows[0]);
  const escape = (v: unknown) => {
    const s = v == null ? "" : Array.isArray(v) ? v.join("; ") : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [headers.join(","), ...rows.map((r) => headers.map((h) => escape(r[h])).join(","))].join("\n");
}

export function downloadCSV(filename: string, csv: string) {
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

// -----------------------------------------------------------------------------
// Contact CRUD helpers (admin-side). Centralized so list, detail, and bulk
// flows all funnel through the same shape and the same realtime invalidation.
// -----------------------------------------------------------------------------

import { supabase } from "@/integrations/supabase/client";

export type ContactPatch = Partial<{
  first_name: string;
  last_name: string;
  email: string | null;
  phone: string | null;
  entity_name: string | null;
  title: string | null;
  funding_goal: number | null;
  status: string;
  lifecycle_stage: LifecycleStage | string;
  source: string | null;
  tags: string[] | null;
  do_not_contact: boolean | null;
  current_notes: string | null;
  assigned_coach_user_id: string | null;
  primary_offer: string | null;
}>;

export async function updateContact(id: string, patch: ContactPatch) {
  const { data, error } = await supabase
    .from("clients")
    .update(patch)
    .eq("id", id)
    .select()
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function bulkUpdateContacts(ids: string[], patch: ContactPatch) {
  if (!ids.length) return 0;
  const { error, count } = await supabase
    .from("clients")
    .update(patch, { count: "exact" })
    .in("id", ids);
  if (error) throw error;
  return count ?? ids.length;
}

/** Add a tag to many contacts (union, no duplicates). */
export async function bulkAddTag(ids: string[], tag: string) {
  if (!ids.length || !tag) return 0;
  const { data, error } = await supabase
    .from("clients")
    .select("id, tags")
    .in("id", ids);
  if (error) throw error;
  const updates = (data || []).map((r: any) => {
    const next = Array.from(new Set([...(r.tags || []), tag]));
    return supabase.from("clients").update({ tags: next }).eq("id", r.id);
  });
  await Promise.all(updates);
  return updates.length;
}

/** Remove a tag from many contacts. */
export async function bulkRemoveTag(ids: string[], tag: string) {
  if (!ids.length || !tag) return 0;
  const { data, error } = await supabase
    .from("clients")
    .select("id, tags")
    .in("id", ids);
  if (error) throw error;
  const updates = (data || []).map((r: any) => {
    const next = (r.tags || []).filter((t: string) => t !== tag);
    return supabase.from("clients").update({ tags: next }).eq("id", r.id);
  });
  await Promise.all(updates);
  return updates.length;
}

/** Admin-only hard delete via edge function (handles FK cleanup + audit). */
export async function deleteContact(id: string) {
  const { data, error } = await supabase.functions.invoke("delete-contact", {
    body: { contact_id: id },
  });
  if (error) throw error;
  if (!data?.ok) throw new Error(data?.error || "Delete failed");
  return data;
}

export async function findDuplicates(contact: {
  id: string;
  email?: string | null;
  phone?: string | null;
}) {
  const filters: string[] = [];
  if (contact.email) filters.push(`email.eq.${contact.email}`);
  if (contact.phone) filters.push(`phone.eq.${contact.phone}`);
  if (!filters.length) return [];
  const { data, error } = await supabase
    .from("clients")
    .select("id, first_name, last_name, email, phone, entity_name, lifecycle_stage, created_at")
    .or(filters.join(","))
    .neq("id", contact.id)
    .limit(5);
  if (error) throw error;
  return data || [];
}

export async function logQuickActivity(args: {
  user_id: string; // contact.linked_user_id required
  channel: "call" | "email" | "sms" | "meeting" | "note";
  subject?: string | null;
  preview?: string | null;
}) {
  const { error } = await supabase.from("communication_log").insert({
    user_id: args.user_id,
    channel: args.channel,
    message_type: args.channel === "note" ? "internal_note" : "manual_log",
    subject: args.subject ?? null,
    preview: args.preview ?? null,
    status: "logged",
  });
  if (error) throw error;
  await supabase.from("clients").update({
    last_contacted_at: new Date().toISOString(),
  }).eq("linked_user_id", args.user_id);
}


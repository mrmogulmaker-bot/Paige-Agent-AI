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

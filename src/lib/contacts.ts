// Shared CRM contact helpers — lifecycle stages, sources, formatters.

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
  "manual", "referral", "website", "ghl", "stripe", "paige", "import", "skool", "event", "partner",
];

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

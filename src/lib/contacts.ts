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
  "manual", "referral", "website", "tenant_invite", "stripe", "paige", "import", "event", "partner",
];

// Productized offers a contact can be enrolled in.
// SOURCE OF TRUTH (June 28, 2026): the CRM only sells BTF and Paige Agent AI.
// Community / Launch Pad live in other systems — never enroll a contact in those here.
// Two distinct buckets:
//   1. CRM-suite offers (`crm_*`) — what a TENANT subscribes to to use this platform.
//   2. Customer offers (BTF / Paige plans) — what a TENANT enrolls a CONSUMER in.
export type OfferKind = "crm_suite" | "btf" | "paige";

export const OFFER_TYPES: { value: string; label: string; group: string; kind: OfferKind }[] = [
  // ── CRM-Suite (Tenant subscriptions — sold by us to coaches/agencies/buyers) ──
  { value: "crm_coach",      label: "CRM — Coach Workspace ($97/mo)",         group: "CRM Suite", kind: "crm_suite" },
  { value: "crm_agency",     label: "CRM — Agency Workspace ($297/mo)",       group: "CRM Suite", kind: "crm_suite" },
  { value: "crm_enterprise", label: "CRM — Enterprise (custom)",              group: "CRM Suite", kind: "crm_suite" },

  // ── BUILD-to-FUND ($4,997 flagship — done-for-you) ──
  { value: "btf_pif",        label: "BTF — Pay in Full ($4,997)",             group: "BUILD-to-FUND", kind: "btf" },
  { value: "btf_split",      label: "BTF — Split ($1,997 down + $1,000 × 3)", group: "BUILD-to-FUND", kind: "btf" },
  { value: "btf_getstarted", label: "BTF — Get-Started ($997 + $497/mo)",     group: "BUILD-to-FUND", kind: "btf" },

  // ── Paige Agent AI (consumer plans — enrolled by tenant for their consumers) ──
  { value: "paige_enterprise", label: "Paige Enterprise — $497/mo",           group: "Paige Agent AI", kind: "paige" },
  { value: "paige_scale",      label: "Paige Scale — $397/mo",                group: "Paige Agent AI", kind: "paige" },
  { value: "paige_growth",     label: "Paige Growth — $149/mo",               group: "Paige Agent AI", kind: "paige" },
  { value: "paige_starter",    label: "Paige Starter — $49/mo",               group: "Paige Agent AI", kind: "paige" },
  { value: "paige_free",       label: "Paige Free",                           group: "Paige Agent AI", kind: "paige" },

  { value: "other",          label: "Other (custom)",                         group: "Other", kind: "btf" },
];

// Legacy slugs that may still live in DB rows — map onto the new canon so
// older records still render a readable label instead of a raw slug.
const LEGACY_OFFER_ALIASES: Record<string, string> = {
  btf: "btf_pif",
  premium: "paige_growth",
  vip: "paige_scale",
  standard: "paige_free",
  accel: "other",
  build_personal: "other",
  build_business: "other",
  fund: "other",
  launch: "other",
  drive: "other",
  shield: "other",
  acquire: "other",
  coaching: "other",
  consult: "other",
};

export function canonicalOffer(value: string | null | undefined): string | null {
  if (!value) return null;
  return LEGACY_OFFER_ALIASES[value] ?? value;
}

export function offerLabel(value: string | null | undefined): string | null {
  if (!value) return null;
  const canonical = canonicalOffer(value)!;
  return OFFER_TYPES.find((o) => o.value === canonical)?.label ?? value;
}

export function offerKind(value: string | null | undefined): OfferKind | null {
  if (!value) return null;
  const canonical = canonicalOffer(value)!;
  return OFFER_TYPES.find((o) => o.value === canonical)?.kind ?? null;
}

// Offers shown when enrolling a CONSUMER (the typical New Contact / New Deal case).
// Excludes the CRM-suite SKUs, which are picked at tenant-signup time, not here.
export const CONSUMER_OFFER_TYPES = OFFER_TYPES.filter((o) => o.kind !== "crm_suite");

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

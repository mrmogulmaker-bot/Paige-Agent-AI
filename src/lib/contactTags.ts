// Suggested tag palette surfaced inside TagPicker. Tenants can always add their
// own — these just seed an empty database so the picker is never blank.

export const SUGGESTED_TAGS: string[] = [
  "BTF Active",
  "BTF Lead",
  "BTF Interested",
  "VIP",
  "Premium",
  "Standard",
  "Hot Lead",
  "Warm Lead",
  "Cold",
  "Needs Follow-Up",
  "Funded",
  "Churn Risk",
  "Coach Required",
  "Personal Credit",
  "Business Credit",
  "Bookkeeping",
  "Referral Partner",
  "Skool Member",
];

// Optional color map keyed by tag name; falls back to "secondary".
export const TAG_COLOR_MAP: Record<string, string> = {
  VIP: "bg-amber-500/20 text-amber-700 dark:text-amber-300",
  Premium: "bg-indigo-500/20 text-indigo-700 dark:text-indigo-300",
  "Hot Lead": "bg-red-500/20 text-red-700 dark:text-red-300",
  "Warm Lead": "bg-orange-500/20 text-orange-700 dark:text-orange-300",
  "Churn Risk": "bg-rose-500/20 text-rose-700 dark:text-rose-300",
  Funded: "bg-emerald-500/20 text-emerald-700 dark:text-emerald-300",
  "BTF Active": "bg-emerald-500/20 text-emerald-700 dark:text-emerald-300",
};

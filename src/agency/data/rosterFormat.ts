/**
 * rosterFormat — shared presentational helpers for REAL AgencyRosterRow data
 * (§65 Option B). §18 one home: any screen rendering a roster row (chrome
 * switcher, Clients-hub Directory, …) imports from here rather than
 * re-deriving its own health-dot / swatch / tenure logic.
 *
 * These are NOT fixture design-math (that stays in ./helpers.ts, the verbatim
 * ported spark/pstr) and NOT a data-fetch adapter (those live beside this file
 * as useAgency*.ts) — this is the small, pure "real row → presentation" layer.
 */
import type { PortfolioHealthKey } from "@/hooks/useAgencyPortfolio";

export const HEALTH_META: Record<PortfolioHealthKey, { label: string; color: string }> = {
  healthy: { label: "Healthy", color: "var(--ok)" },
  watch: { label: "Watch", color: "var(--warn)" },
  at_risk: { label: "At risk", color: "var(--bad)" },
};

/** Health bucket → dot color. Unknown/null bucket → neutral dot, never a guess (§13). */
export function healthDot(bucket: PortfolioHealthKey | null | undefined): string {
  return (bucket && HEALTH_META[bucket]?.color) || "var(--ink-3)";
}

/** Health bucket → display label. Unknown/null → an honest "not yet scored", never a fake value. */
export function healthLabel(bucket: PortfolioHealthKey | null | undefined): string {
  return (bucket && HEALTH_META[bucket]?.label) || "Not yet scored";
}

// Stable per-sub swatch. Real sub-accounts have no brand-color field yet — this
// derives a deterministic, purely decorative dot from the tenant id so it stays
// consistent across renders without claiming to be a real brand color (§13).
const SUB_SWATCH = ["#7C6CE0", "#3F7F5C", "#2F6FA8", "#C1652F", "#A8425A", "#B3932A"];
export function swatchFor(key: string | null | undefined): string {
  let h = 0;
  const s = key || "";
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return SUB_SWATCH[h % SUB_SWATCH.length];
}

/** REAL tenure line from the child tenant's actual created_at. Null → null (§13 — never a fake date). */
export function tenureLabel(createdAtIso: string | null | undefined): string | null {
  if (!createdAtIso) return null;
  const created = new Date(createdAtIso);
  if (Number.isNaN(created.getTime())) return null;
  const now = new Date();
  const months = (now.getFullYear() - created.getFullYear()) * 12 + (now.getMonth() - created.getMonth());
  if (months <= 0) return "New this month";
  if (months === 1) return "1 month with you";
  if (months < 24) return months + " months with you";
  const years = Math.floor(months / 12);
  return years + (years === 1 ? " year" : " years") + " with you";
}

/** REAL "onboarded this calendar month" predicate from created_at. */
export function isNewThisMonth(createdAtIso: string | null | undefined): boolean {
  if (!createdAtIso) return false;
  const created = new Date(createdAtIso);
  if (Number.isNaN(created.getTime())) return false;
  const now = new Date();
  return created.getFullYear() === now.getFullYear() && created.getMonth() === now.getMonth();
}

/** REAL MRR (cents) → "$1.2K" label. null/undefined → an honest "—", never $0 (§13). */
export function mrrLabel(cents: number | null | undefined): string {
  if (typeof cents !== "number") return "—";
  const dollars = cents / 100;
  return "$" + (dollars >= 1000 ? (dollars / 1000).toFixed(dollars >= 10000 ? 0 : 1) + "K" : Math.round(dollars));
}

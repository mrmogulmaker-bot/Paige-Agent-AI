/**
 * Tier book-noun labels — the §57 top-down source of truth for what each account
 * type calls "its book" (§18: one home, never a per-surface hardcode).
 *
 * Every tier refers to the set of accounts it governs by a DIFFERENT noun, and
 * that noun is owner-LOCKED (§57, 2026-08-11):
 *   - Solo / `standalone` / `sub_account` (and unresolved) → "People"
 *   - `agency`                                             → "Sub-accounts"
 *   - `enterprise`                                         → "Portfolio"  ← RESERVED
 *   - Super Admin / platform operator                     → "Fleet"
 *
 * "Portfolio" is RESERVED for `enterprise` ONLY (§57 owner-locked 2026-08-11) —
 * no enterprise tenants ship yet, so in practice today the word never renders to
 * a live tenant. NO surface may hardcode a tier label; DERIVE it from here so the
 * §57 taxonomy stays consistent top-down and a future tier resolves everywhere
 * the moment it's added in one place.
 *
 * This is a PURE function — no data fetch. Callers pass the already-resolved
 * classification (from `useTenantContext`). Keep the `account_type` vocabulary in
 * lockstep with `accountCapabilities.ts` (the parent-capable predicate) — the two
 * files are the paired UI mirror of the server's account-type authority.
 */

export type TierBookNoun = "People" | "Sub-accounts" | "Portfolio" | "Fleet";

/**
 * The already-resolved facts a surface holds about the current tenant/operator.
 * `isPlatformStaff` = operating at the God/platform tier (typically no active
 * tenant); `account_type` / `parent_tenant_id` come straight off the active
 * tenant summary.
 */
export type TierClassification = {
  account_type: string | null;
  parent_tenant_id: string | null;
  isPlatformStaff: boolean;
};

/**
 * The noun a tier uses for its book of governed accounts. Resolution order:
 * platform operator → "Fleet"; `agency` → "Sub-accounts"; `enterprise` →
 * "Portfolio" (RESERVED); everything else (`standalone` / `sub_account` / null)
 * → "People".
 */
export function getTierBookNoun(c: TierClassification): TierBookNoun {
  if (c.isPlatformStaff) return "Fleet";
  if (c.account_type === "agency") return "Sub-accounts";
  if (c.account_type === "enterprise") return "Portfolio";
  return "People";
}

/** Singular of each book noun, for prose like "{Singular} revenue". */
const SINGULAR: Record<TierBookNoun, string> = {
  People: "Person",
  "Sub-accounts": "Sub-account",
  Portfolio: "Portfolio",
  Fleet: "Fleet",
};

/** The singular book noun (e.g. "Sub-account revenue", "Portfolio revenue"). */
export function getTierBookNounSingular(c: TierClassification): string {
  return SINGULAR[getTierBookNoun(c)];
}

/** Lowercase book noun, for mid-sentence prose like "Your {noun}". */
export function getTierBookNounLower(c: TierClassification): string {
  return getTierBookNoun(c).toLowerCase();
}

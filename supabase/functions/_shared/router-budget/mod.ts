/**
 * Paige Router Budget Enforcement — shared seam module.
 *
 * Implements `docs/brain/paige-router-budget-contract.md` (merged 2026-09-10, #1100),
 * which extends the Paige Runtime Harness doctrine in
 * `docs/PAIGE-MASTER-PROJECT-REFERENCE.md` §3, responsibility #2 (model routing).
 * The doctrine's line this module exists to close: "estimates are not budget
 * enforcement."
 *
 * EVERY model call crosses a budget decision before it is made. The decision is a
 * pure function of (accrued spend, ceiling, job band) — never of the caller's hopes:
 *
 *   soft  (≥80% of ceiling) — all bands continue; gate hit `budget_soft` recorded.
 *   hard  (≥100%)           — CHEAP kinds continue (they ARE the economy tier) with
 *                             `budget_hard` recorded; REASONING kinds fail closed;
 *                             SENSITIVE kinds fail closed — never silently degraded,
 *                             the same cost-for-safety direction as the router's
 *                             existing sensitive-never-open-model wall.
 *
 * Ceilings are config-as-data (§10/§200 precedent): `admin_app_settings` key
 * `llm_budget_daily_usd` (platform default) with per-tenant override
 * `llm_budget_daily_usd__t_<tenantId>`. Absent or malformed → the finite platform
 * DEFAULT. `unlimited` is not a settable value — it parses to null and falls back.
 *
 * Accrual basis: the tenant's `SUM(cost_estimate_usd)` over the rolling UTC day from
 * `paige_llm_trace` — the ONE cost ledger (no new store). Estimates, honestly labeled;
 * the ceiling guards against runaway spend, not invoice reconciliation.
 *
 * HONEST DEGRADATION NOTE (deliberate, documented deviation): if the accrual READ
 * itself fails, the caller proceeds UNGATED with `budget_accrual_unknown` audited —
 * observable, not silent — rather than bricking the revenue path on a metrics-read
 * blip. The pure ladder below never sees a null; only the IO wrapper does.
 *
 * Dependency-free (no `npm:` / Deno globals) so vitest imports it directly, like
 * `_shared/durable-job/mod.ts` and `_shared/paige-context/mod.ts`.
 */

/** The router's three bands, as the CALLER (model-router) classifies them. */
export type BudgetBand = "cheap" | "reasoning" | "sensitive";

/** Finite, conservative platform default. Changing it is a settings change, not a deploy. */
export const DEFAULT_CEILING_USD = 50;

export const PLATFORM_CEILING_KEY = "llm_budget_daily_usd";
export const tenantCeilingKey = (tenantId: string) => `llm_budget_daily_usd__t_${tenantId}`;

/** Soft threshold: at or past this fraction of the ceiling, every trace carries a gate hit. */
export const SOFT_THRESHOLD = 0.8;

export type BudgetGate =
  | "budget_soft"
  | "budget_hard"
  | "budget_exceeded";

export interface BudgetDecision {
  readonly decision: "allow" | "allow_gated" | "block";
  readonly gate?: BudgetGate;
  readonly accrued_usd: number;
  readonly ceiling_usd: number;
  readonly band: BudgetBand;
}

/** The pure enforcement ladder. No IO, no clock, no exceptions — safe to log/inspect/test. */
export function enforceBudget(input: {
  accrued_usd: number;
  ceiling_usd: number;
  band: BudgetBand;
}): BudgetDecision {
  const accrued = Math.max(0, Number(input.accrued_usd) || 0);
  // A non-positive ceiling is treated as fully spent (fail toward the safe side),
  // because the resolver is the component that guarantees a positive default.
  const ceiling = Number(input.ceiling_usd) > 0 ? Number(input.ceiling_usd) : 0;
  const ratio = ceiling > 0 ? accrued / ceiling : 1;
  if (ratio >= 1) {
    return input.band === "cheap"
      ? { decision: "allow_gated", gate: "budget_hard", accrued_usd: accrued, ceiling_usd: ceiling, band: input.band }
      : { decision: "block", gate: "budget_exceeded", accrued_usd: accrued, ceiling_usd: ceiling, band: input.band };
  }
  if (ratio >= SOFT_THRESHOLD) {
    return { decision: "allow_gated", gate: "budget_soft", accrued_usd: accrued, ceiling_usd: ceiling, band: input.band };
  }
  return { decision: "allow", accrued_usd: accrued, ceiling_usd: ceiling, band: input.band };
}

/** Parse a settings-stored ceiling. Valid finite positive number (or numeric string) only;
 *  anything else — including "unlimited", Infinity, negatives, objects — is null so the
 *  caller falls back. `unlimited` is not a settable value by design. */
export function parseCeilingUsd(value: unknown): number | null {
  const n = typeof value === "number" ? value : typeof value === "string" && value.trim() !== "" ? Number(value) : NaN;
  if (!Number.isFinite(n) || n <= 0) return null;
  return n;
}

/** Start of the current UTC day — the rolling accrual window boundary. */
export function utcDayStartIso(now: Date): string {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())).toISOString();
}

/** Thrown by the adopter when the ladder blocks. Carries the numbers so the caller can
 *  surface an honest "resets at UTC midnight / raise it in settings" message. */
export class BudgetExceeded extends Error {
  readonly code = "budget_exceeded";
  readonly ceilingUsd: number;
  readonly accruedUsd: number;
  constructor(ceilingUsd: number, accruedUsd: number) {
    super(`daily model budget ceiling reached ($${accruedUsd.toFixed(2)} of $${ceilingUsd}); resets at UTC midnight`);
    this.name = "BudgetExceeded";
    this.ceilingUsd = ceilingUsd;
    this.accruedUsd = accruedUsd;
  }
}

// ── IO wrappers (structural client, the capability-record Rpc / client-context ContextDb precedent) ──

/** A read chain: .select().eq().gte().maybeSingle() compositions, awaitable. */
export interface BudgetQuery extends PromiseLike<{ data: unknown; error: { message?: string } | null }> {
  select(...args: unknown[]): BudgetQuery;
  eq(...args: unknown[]): BudgetQuery;
  gte(...args: unknown[]): BudgetQuery;
  maybeSingle(): BudgetQuery;
}
export interface BudgetDb {
  from(table: string): BudgetQuery;
}

const CEILING_TTL_MS = 60_000;
const ceilingCache = new Map<string, { value: number; expires: number }>();

/**
 * Resolve the tenant's effective daily ceiling: tenant override → platform value →
 * DEFAULT_CEILING_USD. TTL-cached per tenant (60s); a read error is logged and falls
 * back WITHOUT being cached (the §200 resolver precedent).
 */
export async function resolveCeiling(db: BudgetDb, tenantId: string): Promise<number> {
  const cached = ceilingCache.get(tenantId);
  const now = Date.now();
  if (cached && cached.expires > now) return cached.value;

  const read = async (key: string): Promise<number | null> => {
    try {
      const { data, error } = await db.from("admin_app_settings").select("value").eq("key", key).maybeSingle();
      if (error) {
        console.error(`[router-budget] ceiling read error (${key}):`, error.message ?? "unknown");
        return null;
      }
      const row = data as { value?: unknown } | null;
      return parseCeilingUsd(row?.value);
    } catch (e) {
      console.error(`[router-budget] ceiling read threw (${key}):`, e instanceof Error ? e.message : "unknown");
      return null;
    }
  };

  const value =
    (await read(tenantCeilingKey(tenantId))) ??
    (await read(PLATFORM_CEILING_KEY)) ??
    DEFAULT_CEILING_USD;
  ceilingCache.set(tenantId, { value, expires: now + CEILING_TTL_MS });
  return value;
}

/** Test seam: clear the ceiling cache between test cases. */
export function clearCeilingCacheForTests(): void {
  ceilingCache.clear();
}

/**
 * The tenant's accrued spend in the current UTC day, from the one cost ledger.
 * Returns NULL (not 0) when the read fails — an unknown accrual is never a $0
 * claim; the caller records `budget_accrual_unknown` and proceeds ungated.
 */
export async function accruedSpendToday(db: BudgetDb, tenantId: string, now: Date = new Date()): Promise<number | null> {
  try {
    const { data, error } = await db
      .from("paige_llm_trace")
      .select("cost_estimate_usd")
      .eq("tenant_id", tenantId)
      .gte("created_at", utcDayStartIso(now));
    if (error) {
      console.error("[router-budget] accrual read error:", error.message ?? "unknown");
      return null;
    }
    const rows = (data ?? []) as Array<{ cost_estimate_usd?: number | null }>;
    return rows.reduce((sum, r) => sum + (Number(r?.cost_estimate_usd) || 0), 0);
  } catch (e) {
    console.error("[router-budget] accrual read threw:", e instanceof Error ? e.message : "unknown");
    return null;
  }
}

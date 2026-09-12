/**
 * Media seam configuration — config-as-data (§10) with env fallbacks, mirroring
 * the router-budget ceiling convention exactly:
 *
 *   admin_app_settings key → per-tenant override `…__t_<tenantId>` → env → default.
 *
 * OWNER GATES ENCODED HERE (build authorization 2026-09-12):
 *   • `media_provider_ceiling_usd` has NO default — fal provider calls stay
 *     GATED until the owner explicitly sets it (with the FAL_KEY secret). This
 *     is the "no provider calls until the owner has set a prepaid provider
 *     ceiling" constraint, enforced in code, fail-closed.
 *   • `media_video_enabled` defaults FALSE. Video is additionally per-job
 *     approval-gated and daily-capped by `media_daily_video_limit` (default 1,
 *     the owner's controlled-Beta limit).
 *   • `media_budget_daily_usd` has NO default — unset means media spend is
 *     OFF until the owner (or a per-tenant override) sets it explicitly.
 *   • `media_draft_allowance_usd` defaults $0.10 — the automatic-draft boundary
 *     for standard-tier image jobs.
 */

// Deno global guarded so this shared module type-checks when app-tsc/vitest
// pulls it in (no Deno types there); edge behavior identical.
const env = (name: string): string | undefined =>
  (globalThis as { Deno?: { env?: { get(n: string): string | undefined } } }).Deno?.env?.get(name);

export const MEDIA_CEILING_KEY = "media_budget_daily_usd";
export const mediaCeilingKey = (tenantId: string) => `media_budget_daily_usd__t_${tenantId}`;
export const DRAFT_ALLOWANCE_KEY = "media_draft_allowance_usd";
export const DEFAULT_DRAFT_ALLOWANCE_USD = 0.1;
export const VIDEO_ENABLED_KEY = "media_video_enabled";
export const VIDEO_DAILY_LIMIT_KEY = "media_daily_video_limit";
export const DEFAULT_VIDEO_DAILY_LIMIT = 1;
/**
 * TRUTHFUL NAMING (owner correction 2026-09-12): this key is the ACTIVATION
 * acknowledgment of the fal prepaid balance — presence lets fal submissions
 * leave the building. It is NOT a spend cap and never was; the ENFORCED guards
 * are media_budget_daily_usd (per tenant/day) and media_spend_ceiling_usd
 * (platform-wide/day, actually metered against media_spend_today_all()).
 */
export const PROVIDER_CEILING_KEY = "media_provider_ceiling_usd";
/** The REAL platform-level guard: enforced daily media spend across ALL tenants. */
export const SPEND_CEILING_KEY = "media_spend_ceiling_usd";
/** Conservative enforced default — a platform guard must exist to be truthful. */
export const DEFAULT_PLATFORM_SPEND_CEILING_USD = 25;
/** Customer-facing credit config (owner product rules 2026-09-12). */
export const CREDITS_INCLUDED_MONTHLY_KEY = "media_credits_included_monthly";
export const DEFAULT_CREDITS_INCLUDED_MONTHLY = 300;
export const CREDIT_USD_KEY = "media_credit_usd";
export const DEFAULT_CREDIT_USD = 0.01;

/**
 * Purchased credit packs — PRODUCT DATA ONLY (no Stripe products exist; no
 * charge path is live). Prices chosen for >=20% contribution margin after
 * payment processing (2.9% + $0.30): credits_granted <= 0.771x price - 0.30.
 *   $5 -> 350cr -> (5-0.145-0.30-3.50)/5 = 21.1%
 *   $15 -> 1100cr -> 21.8%
 *   $40 -> 3000cr -> 21.4%
 */
export const MEDIA_CREDIT_PACKS = [
  { id: "media5", priceUsd: 5, credits: 350, label: "Starter pack — 350 Media Credits" },
  { id: "media15", priceUsd: 15, credits: 1100, label: "Creator pack — 1,100 Media Credits" },
  { id: "media40", priceUsd: 40, credits: 3000, label: "Studio pack — 3,000 Media Credits" },
] as const;

/** Structural client (the router-budget BudgetDb precedent). */
export interface SettingsQuery extends PromiseLike<{ data: unknown; error: { message?: string } | null }> {
  select(...args: unknown[]): SettingsQuery;
  eq(...args: unknown[]): SettingsQuery;
  maybeSingle(): SettingsQuery;
}
export interface SettingsDb {
  from(table: string): SettingsQuery;
}

function parseNumber(value: unknown): number | null {
  const n = typeof value === "number" ? value : typeof value === "string" && value.trim() !== "" ? Number(value) : NaN;
  return Number.isFinite(n) ? n : null;
}

async function readSetting(db: SettingsDb, key: string): Promise<{ value: unknown | null; error: string | null }> {
  try {
    const { data, error } = await db.from("admin_app_settings").select("value").eq("key", key).maybeSingle();
    if (error) return { value: null, error: error.message ?? "read error" };
    return { value: (data as { value?: unknown } | null)?.value ?? null, error: null };
  } catch (e) {
    return { value: null, error: e instanceof Error ? e.message : "read threw" };
  }
}

function parseBool(value: unknown): boolean | null {
  if (value === true) return true;
  if (value === false) return false;
  if (typeof value === "string") {
    const v = value.trim().toLowerCase();
    if (v === "true" || v === "1" || v === "yes" || v === "on") return true;
    if (v === "false" || v === "0" || v === "no" || v === "off" || v === "") return false;
  }
  return null;
}

export interface MediaConfig {
  /**
   * Daily media budget ceiling (USD), PER TENANT. NULL when neither the settings
   * key nor an env fallback exists — spend stays OFF (no silent default; the
   * owner rules when media spend turns on). Per-tenant overrides resolve in the
   * seam.
   */
  dailyCeilingUsd: number | null;
  /** The ENFORCED platform-wide daily media-spend guard (media_spend_ceiling_usd). */
  platformSpendCeilingUsd: number;
  /** Included monthly media credits for every Solo workspace (default 300). */
  creditsIncludedMonthly: number;
  /** Provider-cost value of one Media Credit (default $0.01). */
  creditUsd: number;
  /** Automatic-draft boundary (USD). Standard-tier images at/below run without confirmation. */
  draftAllowanceUsd: number;
  /** Video capability flag — default false (owner-controlled Beta). */
  videoEnabled: boolean;
  /** Completed video jobs allowed per tenant per UTC day — default 1. */
  videoDailyLimit: number;
  /**
   * The owner's prepaid provider ceiling (USD). Null = NOT SET → all fal
   * provider calls stay gated. This is the owner's go-live switch for spend.
   */
  providerCeilingUsd: number | null;
}

export async function loadMediaConfig(db: SettingsDb): Promise<MediaConfig> {
  const [platform, draft, video, videoLimit, providerCeiling, spendCeiling, creditsMonthly, creditUsd] = await Promise.all([
    readSetting(db, MEDIA_CEILING_KEY),
    readSetting(db, DRAFT_ALLOWANCE_KEY),
    readSetting(db, VIDEO_ENABLED_KEY),
    readSetting(db, VIDEO_DAILY_LIMIT_KEY),
    readSetting(db, PROVIDER_CEILING_KEY),
    readSetting(db, SPEND_CEILING_KEY),
    readSetting(db, CREDITS_INCLUDED_MONTHLY_KEY),
    readSetting(db, CREDIT_USD_KEY),
  ]);

  const envCeiling = parseNumber(env("MEDIA_BUDGET_DAILY_USD"));
  const envDraft = parseNumber(env("MEDIA_DRAFT_ALLOWANCE_USD"));
  const envVideo = parseBool(env("MEDIA_VIDEO_ENABLED"));
  const envVideoLimit = parseNumber(env("MEDIA_DAILY_VIDEO_LIMIT"));
  const envProviderCeiling = parseNumber(env("MEDIA_PROVIDER_CEILING_USD"));
  const envSpendCeiling = parseNumber(env("MEDIA_SPEND_CEILING_USD"));
  const envCreditsMonthly = parseNumber(env("MEDIA_CREDITS_INCLUDED_MONTHLY"));
  const envCreditUsd = parseNumber(env("MEDIA_CREDIT_USD"));

  return {
    dailyCeilingUsd: parseNumber(platform.value) ?? envCeiling ?? null,
    platformSpendCeilingUsd: parseNumber(spendCeiling.value) ?? envSpendCeiling ?? DEFAULT_PLATFORM_SPEND_CEILING_USD,
    creditsIncludedMonthly: Math.max(0, Math.round(parseNumber(creditsMonthly.value) ?? envCreditsMonthly ?? DEFAULT_CREDITS_INCLUDED_MONTHLY)),
    creditUsd: parseNumber(creditUsd.value) ?? envCreditUsd ?? DEFAULT_CREDIT_USD,
    draftAllowanceUsd: parseNumber(draft.value) ?? envDraft ?? DEFAULT_DRAFT_ALLOWANCE_USD,
    videoEnabled: parseBool(video.value) ?? envVideo ?? false,
    videoDailyLimit: Math.max(1, Math.round(parseNumber(videoLimit.value) ?? envVideoLimit ?? DEFAULT_VIDEO_DAILY_LIMIT)),
    providerCeilingUsd: parseNumber(providerCeiling.value) ?? envProviderCeiling,
  };
}

/** Resolve the tenant's effective ceiling: tenant override → platform value → null (unset). */
export async function resolveMediaCeiling(
  db: SettingsDb,
  tenantId: string,
  platformCeiling: number | null,
): Promise<number | null> {
  const tenant = await readSetting(db, mediaCeilingKey(tenantId));
  return parseNumber(tenant.value) ?? platformCeiling;
}

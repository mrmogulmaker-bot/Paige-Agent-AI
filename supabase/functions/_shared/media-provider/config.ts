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

export const MEDIA_CEILING_KEY = "media_budget_daily_usd";
export const mediaCeilingKey = (tenantId: string) => `media_budget_daily_usd__t_${tenantId}`;
export const DRAFT_ALLOWANCE_KEY = "media_draft_allowance_usd";
export const DEFAULT_DRAFT_ALLOWANCE_USD = 0.1;
export const VIDEO_ENABLED_KEY = "media_video_enabled";
export const VIDEO_DAILY_LIMIT_KEY = "media_daily_video_limit";
export const DEFAULT_VIDEO_DAILY_LIMIT = 1;
export const PROVIDER_CEILING_KEY = "media_provider_ceiling_usd";

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
   * Daily media budget ceiling (USD). NULL when neither the settings key nor an
   * env fallback exists — spend stays OFF (no silent default; the owner rules
   * when media spend turns on). Per-tenant overrides resolve in the seam.
   */
  dailyCeilingUsd: number | null;
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
  const [platform, draft, video, videoLimit, providerCeiling] = await Promise.all([
    readSetting(db, MEDIA_CEILING_KEY),
    readSetting(db, DRAFT_ALLOWANCE_KEY),
    readSetting(db, VIDEO_ENABLED_KEY),
    readSetting(db, VIDEO_DAILY_LIMIT_KEY),
    readSetting(db, PROVIDER_CEILING_KEY),
  ]);

  const envCeiling = parseNumber(Deno.env.get("MEDIA_BUDGET_DAILY_USD"));
  const envDraft = parseNumber(Deno.env.get("MEDIA_DRAFT_ALLOWANCE_USD"));
  const envVideo = parseBool(Deno.env.get("MEDIA_VIDEO_ENABLED"));
  const envVideoLimit = parseNumber(Deno.env.get("MEDIA_DAILY_VIDEO_LIMIT"));
  const envProviderCeiling = parseNumber(Deno.env.get("MEDIA_PROVIDER_CEILING_USD"));

  return {
    dailyCeilingUsd: parseNumber(platform.value) ?? envCeiling ?? null,
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

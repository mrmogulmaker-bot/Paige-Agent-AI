// The ONE home for resolving the platform-operator tenant (§18/§10/§200).
//
// WHY THIS EXISTS
// The god/platform actor (the PAIGE_MCP_PLATFORM_KEY bearer, or any service-role
// caller with no user JWT) has no tenant of its own. It used to be pinned to a
// hardcoded `MMA_TENANT_ID` constant — which had gone STALE: that UUID no longer
// matched any tenant row, so every god-key tenant-scoped operation resolved to a
// PHANTOM tenant (zero rows ever landed there). That is the exact §200 platform-
// independence failure: a specific tenant's id baked into a code path that ships
// to the whole platform.
//
// THE FIX (config-as-data, §10)
// The operator designates ONE real, coaching-generic "operator system workspace"
// (a dedicated tenant they dogfood — never the God account, never the platform
// Defaults registry) by writing its id into `admin_app_settings` under the key
// `platform_operator_tenant_id`. This resolver reads that key. The operator tenant
// becomes swappable with a single data write, no code change or redeploy.
//
// FAIL CLOSED, ALWAYS (§9/§13)
// When the key is unset (not yet designated), malformed, or the read errors, this
// returns `null` — NEVER the old phantom, NEVER an arbitrary/first tenant. Every
// caller already treats a falsy tenant as "tenant_not_resolved" and fails closed,
// which is strictly safer than dispatching against a phantom. It never throws — a
// throw here would break the ~56 call sites that await it.

// A structural slice of the supabase-js client — just the read this resolver does.
// Kept structural (not an imported `SupabaseClient`) so both callers can pass their
// own client regardless of which supabase-js specifier they use: paige-mcp is on
// `npm:@supabase/supabase-js@2`, workflowDispatch on `esm.sh/@supabase/supabase-js@2.45.0`.
export interface AdminSettingsReader {
  from(table: string): {
    select(columns: string): {
      eq(column: string, value: string): {
        maybeSingle(): PromiseLike<{
          data: { value?: unknown } | null;
          error: { message?: string } | null;
        }>;
      };
    };
  };
}

const SETTING_KEY = "platform_operator_tenant_id";
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Per-warm-isolate cache. A resolved hit is stable, so cache it a full minute; an
// unset-null is cached only briefly so a fresh designation takes effect within ~10s
// without a redeploy. A read ERROR is NEVER cached — a transient DB blip must not
// pin `null` and keep the god path down after the DB recovers.
const HIT_TTL_MS = 60_000;
const UNSET_TTL_MS = 10_000;
let cache: { value: string | null; expiresAt: number } | null = null;

/** Test-only: clear the module cache between smoke assertions. */
export function resetPlatformOperatorTenantCache(): void {
  cache = null;
}

/**
 * Resolve the designated platform-operator tenant id, or `null` if none is set
 * (fail closed). Reads `admin_app_settings.platform_operator_tenant_id` via the
 * caller's own service-role client (RLS-bypassing read — the designation WRITE is
 * separately `is_platform_owner()`-gated, so a tenant can never self-designate).
 */
export async function platformOperatorTenantId(
  admin: AdminSettingsReader,
): Promise<string | null> {
  const now = Date.now();
  if (cache && now < cache.expiresAt) return cache.value;

  try {
    const { data, error } = await admin
      .from("admin_app_settings")
      .select("value")
      .eq("key", SETTING_KEY)
      .maybeSingle();

    if (error) {
      // Loud, not silent (§32) — and do NOT cache an errored null.
      console.error("[platform-operator-tenant] resolve failed:", error.message ?? "unknown error");
      return null;
    }

    const raw = data?.value;
    // Storage contract: the value is a bare JSON string scalar written via
    // to_jsonb('<uuid>'::text), so supabase-js hands it back as a JS string.
    // Accept ONLY a well-formed UUID string; reject any object/array/garbage so a
    // poisoned setting can never steer tenant resolution.
    if (typeof raw === "string" && UUID_RE.test(raw)) {
      cache = { value: raw, expiresAt: now + HIT_TTL_MS };
      return raw;
    }

    // Unset / missing / malformed → fail closed, short cache.
    cache = { value: null, expiresAt: now + UNSET_TTL_MS };
    return null;
  } catch (e) {
    // Never throw into the ~56 actorTenantId() call sites.
    console.error(
      "[platform-operator-tenant] resolve threw:",
      e instanceof Error ? e.message : String(e),
    );
    return null;
  }
}

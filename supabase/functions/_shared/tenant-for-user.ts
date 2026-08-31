/**
 * resolveTenantForUser — the ONE home for "which tenant does this user act in?",
 * asked from an edge function running as SERVICE ROLE (§18).
 *
 * WHY THIS EXISTS. Four OAuth/connect callbacks each hand-rolled the same lookup:
 *
 *     .from("profiles").select("tenant_id").eq("id", <auth user id>)
 *
 * and every one of them was wrong twice over, measured against production on
 * 2026-08-31:
 *
 *   1. `public.profiles` HAS NO `tenant_id` COLUMN. The select errors, and each
 *      caller destructured only `{ data }` and ignored `error`, so the failure
 *      was invisible and `tenantId` silently became null.
 *   2. `profiles.id` is a `gen_random_uuid()` surrogate primary key; the FK to
 *      `auth.users(id)` is `profiles.user_id`. Of 15 production profiles, ZERO
 *      have `id = user_id`. So even against a column that existed, the key was
 *      wrong for every user on the platform.
 *
 * Net effect: `no_tenant_for_user`, always, for every caller. Gmail connect,
 * Google Calendar connect, Zoom connect and SMTP connect could not succeed for
 * anybody. This is the §51/#588 tenant-resolution class of defect, in four more
 * places.
 *
 * WHAT THIS DOES INSTEAD. It calls `public.get_user_primary_tenant(_user_id)`,
 * the resolver that already exists, is `SECURITY DEFINER`, ranks memberships
 * deterministically (owner → owner role → admin → coach, then oldest tenant,
 * then id) and reads `tenant_members` where `status = 'active'`. Determinism
 * matters: #588's fallback used `LIMIT 1` with no `ORDER BY` and returned a
 * different tenant on different calls for the same user.
 *
 * THE ACTIVE-WORKSPACE PROBLEM, AND WHY `preferredTenantId` IS NOT A BODY FIELD.
 * A person may belong to several tenants. Connecting a mailbox while inside one
 * workspace must attach it to THAT workspace, not to whichever one ranks first.
 * So a caller may pass `preferredTenantId` — but ONLY from a value it derived
 * server-side and signed (an OAuth `state` this platform minted), never from a
 * request body or a query parameter, and this function still refuses it unless
 * the user holds an ACTIVE membership in it. An unvalidated preference would be
 * a tenant-crossing write primitive (§9), which is the opposite of the bug being
 * fixed here.
 *
 * HONEST LIMIT (§13): membership is the check. A user who genuinely belongs to
 * two tenants can direct a connection at either one, which is correct — it is
 * their workspace either way. This function does not, and cannot, decide whether
 * they SHOULD have been in that workspace; `tenant_members` owns that.
 */
/**
 * The two calls this makes, and nothing else.
 *
 * Declared structurally rather than imported from the esm.sh `SupabaseClient`
 * type, because this module is also exercised by a test under `src/` and the
 * app's tsconfig cannot resolve a Deno URL import.
 *
 * The method shapes are deliberately loose. An earlier version spelled out the
 * `.select().eq().eq().eq().maybeSingle()` chain exactly, which read better and
 * did not COMPILE: against a real `SupabaseClient` it produced TS2345 (not
 * assignable) plus TS2589 (type instantiation excessively deep) in every caller
 * — ten new diagnostics across four edge functions. A precise-looking type that
 * rejects the only client anyone passes is worse than a loose one that documents
 * the surface honestly in prose.
 */
interface TenantLookupClient {
  /** A filtered read; the builder chain is the provider's, not ours to restate. */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- see above: restating the builder chain breaks assignability
  from(table: string): any;
  /** One RPC, awaited directly. */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- the provider's rpc is generic over its own function registry
  rpc(fn: string, args?: any): PromiseLike<{ data: unknown; error: { message: string } | null }>;
}

export interface ResolvedTenant {
  tenantId: string | null;
  /** How the answer was reached, for logs and for the caller's error copy. */
  source: "preferred" | "primary" | "none";
  /** Set when resolution failed outright, so the caller can report the real cause (§13). */
  error: string | null;
}

/**
 * @param admin  a SERVICE-ROLE client. `get_user_primary_tenant` raises
 *               `PRIMARY_TENANT_FORBIDDEN` when `auth.uid()` is a different
 *               user, so an anon/user client is the wrong caller here.
 * @param userId the authenticated user the connection is being made for, taken
 *               from a verified JWT or a signed state — never from a body.
 * @param preferredTenantId a server-derived, signed workspace preference. It is
 *               honoured only after an active-membership check.
 */
export async function resolveTenantForUser(
  admin: TenantLookupClient,
  userId: string,
  preferredTenantId?: string | null,
): Promise<ResolvedTenant> {
  if (!userId) return { tenantId: null, source: "none", error: "missing_user_id" };

  // The preference wins only if the user is really a member of it. Checked
  // FIRST so a legitimate multi-workspace user lands where they were standing.
  if (preferredTenantId) {
    const { data, error } = await admin
      .from("tenant_members")
      .select("tenant_id")
      .eq("user_id", userId)
      .eq("tenant_id", preferredTenantId)
      .eq("status", "active")
      .maybeSingle();
    // A read failure is NOT silently treated as "not a member" — that would
    // reintroduce the exact swallow that hid this bug for months. It falls
    // through to the primary resolver and the reason is returned.
    if (error) {
      const primary = await primaryTenant(admin, userId);
      return { ...primary, error: primary.error ?? `membership_check_failed: ${error.message}` };
    }
    if (data?.tenant_id) return { tenantId: String(data.tenant_id), source: "preferred", error: null };
    // Not a member: fall through rather than fail, so a stale signed preference
    // degrades to the user's real primary workspace instead of dead-ending.
  }

  return await primaryTenant(admin, userId);
}

async function primaryTenant(admin: TenantLookupClient, userId: string): Promise<ResolvedTenant> {
  const { data, error } = await admin.rpc("get_user_primary_tenant", { _user_id: userId });
  if (error) return { tenantId: null, source: "none", error: `primary_tenant_failed: ${error.message}` };
  // The function RETURNS TABLE, so supabase-js hands back an array.
  const row = Array.isArray(data) ? data[0] : data;
  const tenantId = (row as { tenant_id?: string } | null)?.tenant_id ?? null;
  return tenantId
    ? { tenantId: String(tenantId), source: "primary", error: null }
    : { tenantId: null, source: "none", error: null };
}

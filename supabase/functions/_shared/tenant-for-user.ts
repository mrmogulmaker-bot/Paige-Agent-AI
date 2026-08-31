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
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

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
  admin: SupabaseClient,
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

async function primaryTenant(admin: SupabaseClient, userId: string): Promise<ResolvedTenant> {
  const { data, error } = await admin.rpc("get_user_primary_tenant", { _user_id: userId });
  if (error) return { tenantId: null, source: "none", error: `primary_tenant_failed: ${error.message}` };
  // The function RETURNS TABLE, so supabase-js hands back an array.
  const row = Array.isArray(data) ? data[0] : data;
  const tenantId = (row as { tenant_id?: string } | null)?.tenant_id ?? null;
  return tenantId
    ? { tenantId: String(tenantId), source: "primary", error: null }
    : { tenantId: null, source: "none", error: null };
}

// _shared/systems-check-http.ts — the ONE home (§18) for the HTTP plumbing the three Systems Check
// flavor edge fns share: CORS/json, the dual-client build, §9/§588 tenant resolution, and the
// cron/service internal-caller gate. Keeping the security-sensitive tenant-resolution in ONE reviewed
// place (never three drifting copies) is the point — a §588 leak is a §9 defect.
//
// DUAL-CLIENT (§9, mirrors paige-operator-sms-send):
//   • JWT-scoped client  (ANON_KEY + forwarded Authorization) → authz + tenant/identity resolution.
//   • Service-role client (SERVICE_ROLE_KEY)                    → the run/finding writes + file_action.
// Identity + tenant ALWAYS come from the VERIFIED JWT, NEVER the request body (§588) — the only
// exception is a platform OWNER targeting a specific tenant via body.tenant_id (explicitly owner-gated).

import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.75.0";

export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-token",
};

export function json(status: number, body: Record<string, unknown>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function env() {
  return {
    url: Deno.env.get("SUPABASE_URL")!,
    anon: Deno.env.get("SUPABASE_ANON_KEY")!,
    service: Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  };
}

/** The service-role writer client (bypasses RLS; the core self-scopes every read to tenantId). */
export function adminClient(): SupabaseClient {
  const { url, service } = env();
  return createClient(url, service);
}

export interface JwtResolve {
  /** Service-role client — the writer the core uses. Always present (even on an error result). */
  admin: SupabaseClient;
  /** Server-resolved tenant (VERIFIED JWT, never body — §588), or null when none resolves. */
  tenantId: string | null;
  isOwner: boolean;
  /** Present ⇒ the caller failed authz; return json(error.status, error.body) verbatim. */
  error?: { status: number; body: Record<string, unknown> };
}

/**
 * §9/§588 tenant resolution for a JWT-gated flavor (onboarding / change). Fails CLOSED: a missing or
 * invalid Bearer JWT returns an error result (nothing is scanned). Tenant is derived from the VERIFIED
 * caller (current_user_tenant_id) — EXCEPT a platform OWNER may target one tenant via body.tenant_id
 * (the ONE allowed body-tenant path, explicitly owner-gated; a non-owner body tenant_id is ignored).
 */
export async function resolveTenantFromJwt(
  req: Request,
  bodyTenantId?: string | null,
): Promise<JwtResolve> {
  const { url, anon } = env();
  const admin = adminClient();

  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return { admin, tenantId: null, isOwner: false, error: { status: 401, body: { error: "unauthorized" } } };
  }

  const caller = createClient(url, anon, { global: { headers: { Authorization: authHeader } } });

  // Verify the JWT actually resolves a user (fail closed — never trust an unverified token).
  const { data: userData, error: userErr } = await caller.auth.getUser();
  if (userErr || !userData?.user) {
    return { admin, tenantId: null, isOwner: false, error: { status: 401, body: { error: "invalid_jwt" } } };
  }

  const { data: ownerFlag, error: ownerErr } = await caller.rpc("is_platform_owner");
  if (ownerErr) {
    return { admin, tenantId: null, isOwner: false, error: { status: 500, body: { error: "authz_check_failed" } } };
  }
  const isOwner = ownerFlag === true;

  let tenantId: string | null = null;
  if (isOwner && bodyTenantId) {
    tenantId = bodyTenantId; // owner override — the ONE allowed body-tenant path (§9/§588)
  } else {
    const { data: t } = await caller.rpc("current_user_tenant_id");
    tenantId = typeof t === "string" && t ? t : null;
  }

  return { admin, tenantId, isOwner };
}

/**
 * §53 operator-tier gate for the OPERATOR flavor. A JWT caller is authorized ONLY when the VERIFIED JWT
 * resolves is_platform_operator() (super_admin OR platform_admin) — NEVER a request body (§588), NEVER an
 * email/identity check (§53 tier-scoped, not identity-scoped). Fail-closed: a missing/invalid JWT, an
 * authz-check error, or a non-operator all return false. This is the operator counterpart to
 * resolveTenantFromJwt (which resolves a TENANT); the operator scan is tenant-less, so it needs only the
 * operator boolean.
 */
export async function isOperatorJwt(req: Request): Promise<boolean> {
  const { url, anon } = env();
  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) return false;

  const caller = createClient(url, anon, { global: { headers: { Authorization: authHeader } } });
  const { data: userData, error: userErr } = await caller.auth.getUser();
  if (userErr || !userData?.user) return false;

  const { data: opFlag, error: opErr } = await caller.rpc("is_platform_operator");
  if (opErr) return false;
  return opFlag === true;
}

/**
 * Internal-caller gate for the cron-invoked 'scheduled' flavor (verify_jwt=false): a service-role
 * bearer OR a valid x-cron-token. Mirrors comms-scheduled-drain / paige-action-worker. Fail-closed.
 */
export async function isAuthorizedInternalCaller(req: Request, admin: SupabaseClient): Promise<boolean> {
  const { service } = env();
  const bearer = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
  if (bearer.length > 0 && bearer === service) return true;
  const cronToken = req.headers.get("x-cron-token") ?? "";
  if (!cronToken) return false;
  const { data, error } = await admin.rpc("verify_cron_token", { _token: cronToken });
  return !error && data === true;
}

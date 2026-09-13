// deno-lint-ignore-file no-explicit-any
// Nav.com: batch refresh stale business credit profiles — a PLATFORM-WIDE operation (it selects stale
// profiles across EVERY tenant), so it is an OPERATOR / cron job, never a tenant action.
//
// GOVERNED AUTHORITY. This was `requireAdmin`-gated (the GLOBAL `user_roles` admin role, tenant-
// AGNOSTIC — the §53/§59 trap), then service-role-selected up to 25 stale profiles ACROSS ALL TENANTS
// and forwarded each `contact_id` to `nav-pull-profile` with the service-role key. Since nav-pull-profile
// now treats a service-role bearer as a trusted `system` caller that bypasses `can_access_contact`, that
// left a cross-tenant hole reachable through THIS door: any tenant's global admin could trigger paid
// Nav.com pulls + writes for OTHER tenants' contacts, even though direct nav-pull-profile invocation is
// fixed (the business-verifier "close the sibling door too" lesson). And because `requireAdmin` requires
// a PERSON JWT, a genuine service-role cron could never run it.
//
// FIX: authenticate the caller — a verified user JWT → `person`, else the bearer == service-role key →
// trusted `system` (a genuine cron / internal batch runner); else 401. A PERSON must be a PLATFORM OWNER
// (super_admin) — triggering a cross-tenant, platform-wide batch is the operator's action, and
// cross-tenant authority is super_admin ONLY (§53), never a tenant-level or global admin role. A `system`
// caller (the cron) is allowed. Only then does the cross-tenant select + service-key fan-out proceed —
// so the initiator is always someone authorized cross-tenant (the operator or the cron), which is what
// makes nav-pull-profile's `system`-bypass sound. A tenant admin can still refresh a single contact they
// own via nav-pull-profile directly (authorized by `can_access_contact`); no legitimate capability is
// removed (§58) — only the cross-tenant trigger a tenant admin never legitimately had.
import { corsHeaders, jsonResponse } from "../_shared/adminAuth.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  // ── AUTHENTICATE + AUTHORIZE — operator (super_admin) person, or trusted service-role cron ─────────
  const authHeader = req.headers.get("Authorization");
  if (!authHeader) {
    return jsonResponse({ error: "unauthorized", message: "Authorization is required." }, 401);
  }
  const bearer = authHeader.replace(/^Bearer\s+/i, "").trim();

  const authClient = createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: { user } } = await authClient.auth.getUser();

  const admin = createClient(SUPABASE_URL, SERVICE_KEY);

  if (user) {
    // A person triggering a cross-tenant platform batch must be a PLATFORM OWNER (super_admin, §53).
    // Explicit is_platform_owner(_user_id) overload (a no-arg .rpc is PGRST203-ambiguous); called on the
    // service-role client, keyed on the verified uid; error fails closed.
    const { data: isOwner, error } = await admin.rpc("is_platform_owner", { _user_id: user.id });
    if (error) {
      console.error("nav-refresh-scores is_platform_owner check failed", error.message ?? String(error));
      return jsonResponse({ error: "authz_check_failed" }, 403);
    }
    if (isOwner !== true) {
      return jsonResponse({ error: "not_authorized", message: "Platform owner required for a cross-tenant refresh." }, 403);
    }
  } else if (!bearer || bearer !== SERVICE_KEY) {
    // Not a person and not the service-role key → refuse (an anon-key JWT is neither).
    return jsonResponse({ error: "unauthorized", message: "Invalid or unauthorized token." }, 401);
  }
  // else: trusted service-role `system` caller (the cron) — allowed.

  const cutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const { data: stale } = await admin
    .from("paige_business_credit_profiles")
    .select("contact_id")
    .or(`last_pulled_at.is.null,last_pulled_at.lt.${cutoff}`)
    .limit(25);

  let queued = 0;
  for (const row of stale ?? []) {
    try {
      await fetch(`${SUPABASE_URL}/functions/v1/nav-pull-profile`, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${SERVICE_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ contact_id: row.contact_id }),
      });
      queued++;
    } catch {
      // continue
    }
  }
  return jsonResponse({ ok: true, refreshed: queued });
});

// deno-lint-ignore-file no-explicit-any
// Paige Secure Browser request boundary. The external worker path remains deliberately unavailable
// until every vendor gate in the approved MVP plan is independently cleared.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function safeTarget(raw: unknown): string | null {
  if (typeof raw !== "string" || !raw.trim()) return null;
  try {
    const u = new URL(raw.trim());
    if (u.protocol !== "https:" && u.protocol !== "http:") return null;
    return `${u.origin}${u.pathname}`.slice(0, 2048);
  } catch {
    return null;
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const authorization = req.headers.get("Authorization") ?? "";
  if (!authorization.startsWith("Bearer ")) return json({ error: "session_required" }, 401);
  const token = authorization.slice(7).trim();
  if (!token) return json({ error: "session_required" }, 401);

  const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });
  const { data: userData, error: authError } = await admin.auth.getUser(token);
  const user = userData.user;
  if (authError || !user) return json({ error: "session_invalid" }, 401);

  // The active workspace is the requested workspace. Do not fall back to another membership when it
  // is missing or stale: a tenant switch must fail closed rather than file the run elsewhere.
  const { data: profile } = await admin
    .from("profiles")
    .select("active_tenant_id")
    .eq("user_id", user.id)
    .maybeSingle();
  const tenantId = typeof profile?.active_tenant_id === "string" ? profile.active_tenant_id : null;
  if (!tenantId) return json({ error: "active_workspace_required" }, 403);

  const [{ data: isAdmin, error: adminError }, { data: isAgencyManager, error: agencyError }] = await Promise.all([
    admin.rpc("is_tenant_admin_as", { _actor: user.id, _tenant: tenantId }),
    admin.rpc("agency_can_manage_child", { _child: tenantId, _actor: user.id }),
  ]);
  if ((adminError && agencyError) || (isAdmin !== true && isAgencyManager !== true)) {
    return json({ error: "not_authorized" }, 403);
  }

  // Read the flag from the same resolved tenant snapshot. Calling tenant_has_feature() through the
  // user JWT would independently re-resolve the active tenant and create an account-switch race.
  const { data: tenant, error: flagError } = await admin
    .from("tenants")
    .select("features")
    .eq("id", tenantId)
    .maybeSingle();
  const features = tenant?.features && typeof tenant.features === "object" ? tenant.features as Record<string, unknown> : {};
  if (flagError || features.secure_browser !== true) {
    return json({ status: "unavailable", reason: "feature_not_enabled" }, 404);
  }

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return json({ error: "invalid_json" }, 400); }
  const purpose = typeof body.goal === "string" ? body.goal.trim().slice(0, 1000) : "";
  const startUrl = safeTarget(body.start_url);
  if (!purpose || !startUrl) return json({ error: "purpose_and_valid_target_required" }, 400);

  const relatedContactId = typeof body.related_contact_id === "string" ? body.related_contact_id : null;
  const relatedBusinessId = typeof body.related_business_id === "string" ? body.related_business_id : null;
  if (relatedContactId) {
    const { data } = await admin.from("clients").select("id").eq("id", relatedContactId).eq("tenant_id", tenantId).maybeSingle();
    if (!data) return json({ error: "related_contact_outside_workspace" }, 403);
  }
  if (relatedBusinessId) {
    const { data } = await admin.from("businesses").select("id").eq("id", relatedBusinessId).eq("tenant_id", tenantId).maybeSingle();
    if (!data) return json({ error: "related_business_outside_workspace" }, 403);
  }

  const { data: session, error: insertError } = await admin.from("browser_use_sessions").insert({
    tenant_id: tenantId,
    goal: purpose,
    start_url: startUrl,
    steps: [],
    related_contact_id: relatedContactId,
    related_business_id: relatedBusinessId,
    invoker_user_id: user.id,
    invoker_kind: isAdmin === true ? "admin" : "agency",
    status: "failed",
    error: "secure_browser_worker_gated",
    completed_at: new Date().toISOString(),
  }).select("id").single();
  if (insertError || !session) return json({ error: "request_record_failed" }, 500);

  return json({
    session_id: session.id,
    status: "unavailable",
    reason: "secure_worker_under_setup",
    message: "Paige Secure Browser is under setup for this workspace.",
  }, 503);
});

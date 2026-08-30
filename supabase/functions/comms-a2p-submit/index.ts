// comms-a2p-submit — the coach approves the Paige-drafted A2P copy. IT DOES NOT SUBMIT.
//
// After comms-a2p-draft produced the campaign copy and the coach reviewed and edited it, this
// function PERSISTS that reviewed copy through the shared durable seam
// (tenant_a2p_registration_save_draft) and returns an explicit "prepared, not submitted" refusal.
// It performs NO provider call.
//
// ── §13 HONESTY — SUBMISSION IS REFUSED, NOT DEFERRED ───────────────────────
// It used to call createBrand/createCampaign (honest needs_config stubs) and, because they return no
// SID, write status='pending' while telling the coach their copy "will be submitted automatically
// once A2P registration is enabled". Nothing would ever pick it up: there is no carrier contract, no
// queue, no retry. A promise with no mechanism is the same class of lie as a fabricated SID, so the
// endpoint now refuses submission outright and says so. It NEVER fabricates a SID or an approved
// state:
//   • It records the APPROVED COPY (real — the coach authored/approved it) into the registration row.
//   • brand_status / campaign_status / status stay 'pending'; brand_sid / campaign_sid stay NULL;
//     submitted_at is set ONLY if a real SID actually comes back (today it never does).
//   • The response carries { a2p_submit_wired: false, needs_config: true } + a clear message so no
//     caller mistakes "copy saved" for "registered with carriers".
// When TrustHub is wired, the stubs return real SIDs and this same code path records them + advances
// the statuses — the contract is stable, only the stub bodies change.
//
// ── CONTRACT ────────────────────────────────────────────────────────────────
// POST (JWT required; verify_jwt=true). Service-role bearer = Paige headless (§10) may name a tenant.
//
//   Request (the approved fields — the coach's reviewed copy):
//     {
//       legal_business_name: string,   // REQUIRED
//       website?: string,
//       ein?: string,                  // optional business tax id (never logged)
//       use_case: string,              // REQUIRED
//       campaign_description: string,  // REQUIRED
//       sample_messages: string[],     // REQUIRED — 1..5 real messages
//       optin_flow?: string,
//       tenant_id?: string             // SERVICE-ROLE CALLERS ONLY (UUID). Ignored for JWT callers.
//     }
//
//   200  {
//          saved: true,
//          a2p_submit_wired: false,     // §13 — carrier submit not wired yet
//          needs_config: true,          // (present while unwired)
//          brand_status: "pending",
//          campaign_status: "pending",
//          status: "pending",
//          brand_sid: null,
//          campaign_sid: null,
//          message: string              // human-readable "saved, pending, not yet submitted to carriers"
//        }
//   4xx/5xx { error: { code, message } }
//
// ── DOCTRINE ────────────────────────────────────────────────────────────────
//  §9  tenant server-DERIVED (current_user_tenant_id()) for JWT callers, NEVER the body. The
//      tenant_a2p_registrations insert lets the set_tenant_a2p_registration_tenant trigger set
//      tenant_id (JWT path); a service-role caller passes the tenant it already resolved. The body
//      can never widen scope.
//  §37 NEW PRODUCER of tenant_a2p_registrations. This upsert satisfies: the BEFORE-INSERT trigger
//      (derives tenant_id), RLS insert/update (tenant_id = current_user_tenant_id() + admin/coach |
//      is_platform_owner()), and every NOT NULL / CHECK column — brand_status/campaign_status/status
//      default 'pending' and are written with in-enum values; sample_messages is jsonb; use_case /
//      campaign_description / optin_flow are nullable text.
//  §13 no fabricated SID/approved state; honest needs_config surfaced.
//  §18 one write path: persistence goes through tenant_a2p_registration_save_draft, the same seam
//      the draft path uses, so there is one immutability guard and no second registration store.
//  §2  the copy is coaching-generic by construction (produced by comms-a2p-draft, §2). This function
//      does not add finance wording.
import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.75.0";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const jsonHeaders = { ...corsHeaders, "Content-Type": "application/json" };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const str = (v: unknown): string => (typeof v === "string" ? v : v == null ? "" : String(v));
const fail = (status: number, code: string, message: string): Response =>
  new Response(JSON.stringify({ error: { code, message } }), { status, headers: jsonHeaders });
const ok = (payload: unknown): Response =>
  new Response(JSON.stringify(payload), { status: 200, headers: jsonHeaders });

function parseJwtClaims(token: string): Record<string, unknown> | null {
  const parts = token.split(".");
  if (parts.length < 2) return null;
  try {
    const payload = parts[1]
      .replaceAll("-", "+")
      .replaceAll("_", "/")
      .padEnd(Math.ceil(parts[1].length / 4) * 4, "=");
    return JSON.parse(atob(payload)) as Record<string, unknown>;
  } catch {
    return null;
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return fail(405, "METHOD_NOT_ALLOWED", "POST only.");

  try {
    // ── 1. Authenticate + caller kind ───────────────────────────────────────
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) return fail(401, "UNAUTHENTICATED", "A bearer token is required.");
    const token = authHeader.slice("Bearer ".length).trim();
    const isServiceRole = parseJwtClaims(token)?.role === "service_role";

    // ── 2. Parse + validate the approved fields ─────────────────────────────
    let body: Record<string, unknown> = {};
    try {
      body = (await req.json()) as Record<string, unknown>;
    } catch {
      return fail(400, "BAD_JSON", "Request body must be JSON.");
    }
    const legalName = str(body?.legal_business_name).trim().slice(0, 200);
    const website = str(body?.website).trim().slice(0, 300);
    const ein = str(body?.ein).trim().slice(0, 32); // never logged
    const useCase = str(body?.use_case).trim().slice(0, 160);
    const campaignDescription = str(body?.campaign_description).trim().slice(0, 2000);
    const optinFlow = str(body?.optin_flow).trim().slice(0, 2000);
    const sampleMessages = (Array.isArray(body?.sample_messages) ? (body!.sample_messages as unknown[]) : [])
      .map((s) => str(s).trim().slice(0, 320))
      .filter(Boolean)
      .slice(0, 5);

    if (!legalName) return fail(400, "MISSING_LEGAL_NAME", "legal_business_name is required.");
    if (!useCase) return fail(400, "MISSING_USE_CASE", "use_case is required.");
    if (!campaignDescription) return fail(400, "MISSING_DESCRIPTION", "campaign_description is required.");
    if (sampleMessages.length < 1) return fail(400, "MISSING_SAMPLES", "At least one sample message is required.");

    // ── 3. Resolve the tenant SERVER-SIDE (IDOR-safe, §9) + gate ────────────
    let tenantId: string | null = null;
    let writeClient: SupabaseClient;
    const admin = createClient(supabaseUrl, supabaseServiceKey);

    if (isServiceRole) {
      const named = str(body?.tenant_id).trim();
      if (!named) return fail(400, "MISSING_TENANT_ID", "A service-role caller must name tenant_id.");
      if (!UUID_RE.test(named)) return fail(400, "INVALID_TENANT_ID", "tenant_id must be a UUID.");
      tenantId = named;
      writeClient = admin; // service-role write; tenant_id is passed explicitly (trigger coalesces to it)
    } else {
      const authed = createClient(supabaseUrl, supabaseAnonKey, { global: { headers: { Authorization: authHeader } } });
      const { data: { user }, error: uErr } = await authed.auth.getUser();
      if (uErr || !user) return fail(401, "UNAUTHENTICATED", uErr?.message || "Could not verify this session.");

      const { data: roleRows, error: rErr } = await authed.from("user_roles").select("role").eq("user_id", user.id);
      if (rErr) {
        console.error("comms-a2p-submit: role lookup failed:", rErr);
        return fail(500, "INTERNAL", `Could not read your roles: ${rErr.message}`);
      }
      const roles = (roleRows || []).map((r: { role: string }) => r.role);
      // §37 gate↔RLS agreement: tenant_a2p_registrations RLS admits is_platform_owner() OR an
      // admin/coach of the caller's OWN tenant — a bare super_admin is NOT in that set. Gate on the
      // SAME authority so a platform-staff super_admin (not the owner, no admin/coach) gets a clean
      // 403 HERE rather than an opaque RLS rejection surfacing as a 500 at the upsert. The platform
      // owner still passes via is_platform_owner() even if their only role is super_admin.
      const { data: ownerFlag } = await authed.rpc("is_platform_owner");
      const canWrite = ownerFlag === true || roles.some((r: string) => r === "admin" || r === "coach");
      if (!canWrite) {
        return fail(403, "FORBIDDEN", "Admin or coach access required.");
      }
      const { data: resolved, error: tErr } = await authed.rpc("current_user_tenant_id");
      if (tErr) {
        console.error("comms-a2p-submit: tenant resolve failed:", tErr);
        return fail(500, "INTERNAL", `Could not resolve your workspace: ${tErr.message}`);
      }
      tenantId = str(resolved) || null;
      // JWT path: write through the caller's own JWT so RLS applies AND the trigger derives tenant_id
      // from current_user_tenant_id() — the body can never widen scope (§9).
      writeClient = authed;
    }

    if (!tenantId) {
      return ok({ needs_config: true, error: "tenant_not_resolved", message: "No active workspace to register." });
    }

    // ── 4. SUBMISSION IS REFUSED, EXPLICITLY, AND NOTHING EXTERNAL IS CALLED ──
    //
    // This function used to call createBrand/createCampaign (both honest
    // needs_config stubs) and then upsert whatever came back. Because they always
    // return no SID, it wrote status='pending' with submitted_at=null and told the
    // coach their copy was "saved… will be submitted automatically once A2P
    // registration is enabled". That reads as a queued submission. Nothing is
    // queued: there is no carrier contract, no retry, and nothing that would ever
    // pick it up. It also meant the durable draft path's immutability guard could
    // never fire against a real submit, so re-drafting silently replaced copy a
    // human had reviewed.
    //
    // Until a real carrier submission contract exists, this endpoint does not
    // submit and does not pretend to. It performs NO provider call. It persists the
    // reviewed copy through the SAME durable seam the draft path uses — one write
    // path, one immutability guard, no second registration store — and returns an
    // explicit "prepared, not submitted" refusal.
    const { error: saveErr } = await writeClient.rpc("tenant_a2p_registration_save_draft", {
      p_use_case: useCase,
      p_campaign_description: campaignDescription,
      p_sample_messages: sampleMessages,
      p_optin_flow: optinFlow || null,
      ...(isServiceRole ? { p_tenant_id: tenantId } : {}),
    });
    if (saveErr) {
      const code = (saveErr.hint || "").trim() || "SAVE_FAILED";
      console.error("comms-a2p-submit: reviewed copy not saved:", code, saveErr.code, saveErr.message);
      return fail(code === "LEGAL_PROFILE_REQUIRED" || code === "REGISTRATION_IMMUTABLE" ? 422 : 500,
                  code, saveErr.message);
    }

    return ok({
      saved: true,
      submitted: false,
      a2p_submit_wired: false,
      needs_config: true,
      state: "prepared",
      status: "pending",
      brand_sid: null,
      campaign_sid: null,
      message:
        "Your reviewed copy is saved and prepared. It has NOT been submitted — carrier registration " +
        "is not available yet, so nothing has been sent to a carrier and nothing is queued. When " +
        "submission is available you will be able to send it from here.",
    });
  } catch (e) {
    console.error("comms-a2p-submit: unhandled error:", e);
    return fail(500, "INTERNAL", (e as Error)?.message || "Failed to submit the A2P registration.");
  }
});

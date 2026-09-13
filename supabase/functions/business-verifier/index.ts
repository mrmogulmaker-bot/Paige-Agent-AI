// deno-lint-ignore-file no-explicit-any
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import { ALL_ADAPTERS, type BusinessVerifyInput } from "../_shared/businessVerifyAdapters/index.ts";
import {
  authorizeBusinessVerify,
  buildBusinessVerifyAudit,
  businessVerifyGovernedAuditRow,
  type BusinessVerifyAuthzDeps,
  type BusinessVerifyGovernedAudit,
  type BusinessVerifyPrincipal,
} from "../_shared/business-verifier/governed-adapter.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

const jsonResponse = (payload: Record<string, unknown>, status = 200) =>
  new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

/**
 * Write ONE governed-decision row to `paige_audit_log` (service-role). For a REFUSED verification this
 * is the ONLY trace, since a refusal creates no run and contacts no provider. Non-fatal: a logging
 * failure never changes the decision (mirrors `paige-write-back`'s `writeGovernedWriteBackAudit`).
 */
async function writeGovernedVerifyAudit(
  admin: any,
  actorUserId: string | null,
  audit: BusinessVerifyGovernedAudit,
): Promise<void> {
  try {
    const row = businessVerifyGovernedAuditRow(audit);
    // supabase-js resolves a DB rejection as `{ error }` rather than THROWING, so the catch below never
    // sees it. For a REFUSED verification this row is the only trace — a silently-dropped insert would
    // erase a security-relevant attempt. Inspect and log the returned error loudly.
    const { error } = await admin.from("paige_audit_log").insert({
      actor_user_id: actorUserId,
      actor_role: `business_verify:${audit.principal}`,
      ...row,
    });
    if (error) {
      console.error("business-verifier governed audit not recorded", error.message ?? String(error));
    }
  } catch (e) {
    console.error("business-verifier governed audit not recorded (threw)", String(e));
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    // ── AUTHENTICATE — person (verified user JWT) or system (trusted service-role caller) ───────────
    // The function is invocation-gated (`verify_jwt = true`), but the prior code NEVER used the caller
    // identity — the §9 IDOR. Resolve WHO is calling before touching any business:
    //   - a verified user JWT (`getUser` returns a user) → `person`, actor = `auth.uid()`.
    //   - else, the bearer IS the service-role key → `system` (skill-runner / paige-mcp / internal job).
    //   - else (anon key, or any other token with no user) → 401. This closes the "any caller" hole:
    //     an anon-key JWT passes `verify_jwt` but is neither a user nor the service key, so it is refused.
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return jsonResponse({ ok: false, error: "UNAUTHORIZED", message: "Authorization is required." }, 401);
    }
    const bearer = authHeader.replace(/^Bearer\s+/i, "").trim();

    const authClient = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user } } = await authClient.auth.getUser();

    let principal: BusinessVerifyPrincipal;
    let callerUserId: string | null;
    if (user) {
      principal = "person";
      callerUserId = user.id;
    } else if (bearer && bearer === SERVICE_KEY) {
      principal = "system";
      callerUserId = null;
    } else {
      return jsonResponse({ ok: false, error: "UNAUTHORIZED", message: "Invalid or unauthorized token." }, 401);
    }

    const body = await req.json().catch(() => ({}));
    const business_id: string | undefined = body.business_id;
    // A provenance LABEL only — recorded, NEVER trusted as the actor or as authority (§13).
    const source: string = typeof body.triggered_by === "string" ? body.triggered_by : "system";
    if (!business_id) {
      return jsonResponse({ ok: false, error: "BUSINESS_ID_REQUIRED", message: "A business ID is required." }, 400);
    }

    const admin = createClient(SUPABASE_URL, SERVICE_KEY);

    const { data: biz, error: bizErr } = await admin
      .from("businesses")
      .select("id, tenant_id, owner_user_id, legal_name, dba, ein, state_of_formation, business_state, business_city, business_street_address, business_zip, business_phone, website, entity_type")
      .eq("id", business_id)
      .maybeSingle();
    if (bizErr) {
      console.error("business-verifier business lookup error", bizErr);
      return jsonResponse({
        ok: false,
        error: "BUSINESS_LOOKUP_FAILED",
        message: "Business verification could not load this business. Please retry.",
        fallback: true,
      });
    }

    if (!biz) {
      return jsonResponse({
        ok: false,
        error: "BUSINESS_NOT_FOUND",
        message: "This business record is no longer available. Refresh the contact and try again.",
        business_id,
        fallback: true,
      });
    }

    // ── AUTHORIZE — the §9/§53/§59 authority decision, BEFORE any run insert or provider contact ────
    // The authority is resolved against the BUSINESS'S own tenant (`biz.tenant_id`): a person must be a
    // platform owner (super_admin), an owner/admin of that tenant, or an agency operator managing it;
    // a trusted service-role caller (`system`) is allowed. A denied person NEVER creates a run row and
    // NEVER contacts a provider (no budget burned). See the adapter header for why a coach may not
    // verify, and why this door records the `high` risk class but deliberately does not run the seam's
    // autonomy/propose gate (§67 — the caller-initiated vs Paige-autonomous distinction).
    const startedAtMs = Date.now();
    const businessTenantId = (biz.tenant_id ?? null) as string | null;

    const authzDeps: BusinessVerifyAuthzDeps = {
      // super_admin ONLY (§53), keyed on the VERIFIED caller uid — never the body. The one sanctioned
      // cross-tenant caller. Uses the EXPLICIT is_platform_owner(_user_id) overload: a no-arg
      // .rpc("is_platform_owner") is AMBIGUOUS under PostgREST (both () and (uuid) overloads exist →
      // PGRST203 "could not choose the best candidate function"), which would swallow to `false` and
      // silently deny a legitimate operator (the paige-operator-sms-send D.1 live-500 lesson). Passing
      // _user_id disambiguates to the uuid overload. Errors are logged and fail closed (never a silent
      // opaque swallow, §32/§13). Inert for a `system` caller (not consulted).
      isPlatformOwner: async () => {
        if (!callerUserId) return false;
        const { data, error } = await authClient.rpc("is_platform_owner", { _user_id: callerUserId });
        if (error) {
          console.error("business-verifier is_platform_owner check failed", error.message ?? String(error));
          return false;
        }
        return data === true;
      },
      // owner/admin of the BUSINESS'S tenant, JWT-derived (is_tenant_admin keys on auth.uid() +
      // tenant_members for the passed tenant, role IN ('owner','admin')). A role held for another
      // tenant never authorizes here (§53/§59 global-role trap avoided).
      callerIsTenantAdmin: async (tenantId) => {
        const { data } = await authClient.rpc("is_tenant_admin", { _tenant: tenantId });
        return data === true;
      },
      // agency DELEGATION over the business's tenant. agency_can_manage_child is SECURITY DEFINER,
      // granted to service_role; called with the explicit (child, actor) overload since the service
      // client carries no auth.uid().
      callerManagesTenantViaAgency: async (tenantId) => {
        if (!callerUserId) return false;
        const { data } = await admin.rpc("agency_can_manage_child", { _child: tenantId, _actor: callerUserId });
        return data === true;
      },
    };

    const authz = await authorizeBusinessVerify(authzDeps, {
      principal,
      callerUserId,
      businessTenantId,
    });

    const audit = buildBusinessVerifyAudit({
      principal,
      userId: callerUserId,
      businessId: business_id,
      tenantId: authz.tenantId,
      authzBasis: authz.basis,
      allowed: authz.allowed,
      source,
      startedAtMs,
      nowIso: new Date().toISOString(),
    });

    // The governed receipt — written for every decision; the ONLY trace of a refused verification.
    await writeGovernedVerifyAudit(admin, callerUserId, audit);

    if (!authz.allowed) {
      return jsonResponse({ ok: false, error: "NOT_AUTHORIZED", message: authz.reason }, 403);
    }

    // Resolve contact_id (best-effort) via owner
    let contact_id: string | null = null;
    if (biz.owner_user_id) {
      const { data: contact } = await admin
        .from("clients")
        .select("id")
        .eq("linked_user_id", biz.owner_user_id)
        .limit(1)
        .maybeSingle();
      contact_id = contact?.id ?? null;
    }

    const { data: run, error: runErr } = await admin
      .from("business_verification_runs")
      .insert({
        business_id,
        contact_id,
        triggered_by: source,
        status: "running",
      })
      .select()
      .single();
    if (runErr || !run) throw runErr ?? new Error("failed to create run");

    const input: BusinessVerifyInput = {
      legal_name: biz.legal_name ?? "",
      dba: biz.dba,
      ein: biz.ein,
      state: biz.state_of_formation ?? biz.business_state,
      city: biz.business_city,
      address_line_1: biz.business_street_address,
      postal_code: biz.business_zip,
      phone: biz.business_phone,
      website: biz.website,
      entity_type: biz.entity_type,
    };

    if (!input.legal_name) {
      await admin.from("business_verification_runs")
        .update({ status: "failed", error: "missing legal_name", completed_at: new Date().toISOString() })
        .eq("id", run.id);
      return jsonResponse({ ok: true, run_id: run.id, status: "failed" });
    }

    const results = await Promise.allSettled(
      ALL_ADAPTERS.map(async (a) => ({ adapter: a, result: await a.verify(input) })),
    );

    const rows = results.map((r) => {
      if (r.status === "fulfilled") {
        const { adapter, result } = r.value;
        return {
          run_id: run.id,
          business_id,
          source: result.source ?? adapter.source,
          source_kind: result.source_kind,
          status: result.status,
          confidence: result.confidence ?? null,
          matched_fields: result.matched_fields ?? [],
          mismatched_fields: result.mismatched_fields ?? [],
          raw_payload: result.raw_payload ?? {},
          normalized: result.normalized ?? {},
          source_url: result.source_url ?? null,
          error: result.error ?? null,
        };
      }
      return {
        run_id: run.id,
        business_id,
        source: "unknown",
        source_kind: "public",
        status: "error",
        error: String((r as PromiseRejectedResult).reason),
      };
    });

    await admin.from("business_verifications").insert(rows);

    // Composite: average confidence of successful matches; cap at 100
    const matchRows = rows.filter((r) => r.status === "match" && typeof r.confidence === "number");
    const composite = matchRows.length
      ? Math.min(100, Math.round(matchRows.reduce((s, r) => s + (r.confidence as number), 0) / matchRows.length))
      : null;

    const mismatches = rows.filter((r) => r.status === "mismatch").map((r) => ({
      source: r.source,
      fields: r.mismatched_fields,
    }));

    const finalStatus = rows.some((r) => r.status === "match")
      ? (rows.some((r) => r.status === "error" || r.status === "unavailable") ? "partial" : "succeeded")
      : "failed";

    await admin.from("business_verification_runs")
      .update({
        status: finalStatus,
        composite_score: composite,
        summary: {
          sources_run: rows.length,
          matches: rows.filter((r) => r.status === "match").length,
          unavailable: rows.filter((r) => r.status === "unavailable").length,
          errors: rows.filter((r) => r.status === "error").length,
        },
        mismatches,
        completed_at: new Date().toISOString(),
      })
      .eq("id", run.id);

    return jsonResponse({ ok: true, run_id: run.id, status: finalStatus, composite_score: composite, sources: rows.length });
  } catch (err) {
    console.error("business-verifier error", err);
    return jsonResponse({
      ok: false,
      error: "BUSINESS_VERIFICATION_FAILED",
      message: "Business verification could not complete. Please retry.",
      fallback: true,
    });
  }
});

// signup-cancel — self-serve deletion of an ABANDONED pre-signup shell (Task #187)
//
// Owner directive (2026-07-14): "make sure there's a cancel feature so we don't
// actually have that account stuck inside of our database." A user who signed in
// (OAuth/email) but never completed provisioning (never picked a lane + signed
// the agreement) is a "ghost" — a bare auth.users row with no tenant/role/client.
// This function lets THAT user remove their own shell.
//
// Hard guardrails (§13):
//   - The caller may only delete THEMSELVES (uid comes from the verified JWT,
//     never from the request body — no IDOR).
//   - Refuse if the caller is already a completed account (is_signup_complete):
//     a real tenant owner/member/client/staff must NOT be deletable here; that
//     is a different, audited flow. This makes the endpoint safe by construction.
//
// Deployed with verify_jwt=true — the gateway rejects anon calls; we then
// re-derive and re-authorize the uid from the token ourselves.

import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.75.0";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders },
  });

serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "No authorization header" }, 401);
    const token = authHeader.replace("Bearer ", "");

    // The ONLY source of the target uid is the verified token — never the body.
    const { data: { user }, error: userError } = await supabase.auth.getUser(token);
    if (userError || !user) return json({ error: "Unauthorized" }, 401);
    const uid = user.id;

    // Refuse to delete a completed account. is_signup_complete() is TRUE for any
    // real user (owns/member of a tenant, a role beyond the auto-granted
    // 'user'/'client', a genuine invited client, or the explicit completion
    // marker) — so tenant owners, staff, and real clients are all protected here.
    // Only a bare pre-provisioning shell reads FALSE and can be removed.
    const { data: complete, error: rpcError } = await supabase.rpc("is_signup_complete", { _uid: uid });
    if (rpcError) {
      console.error("signup-cancel is_signup_complete error:", rpcError);
      return json({ error: "Could not verify account state" }, 500);
    }
    if (complete === true) {
      return json({
        error: "This account is already set up and can't be cancelled here. Use account settings to manage or close it.",
      }, 409);
    }

    // A bare identity may be removed only before billing work begins. Once a
    // Solo Beta enrollment has left intake_ready (or carries any provider ID),
    // deletion could orphan a Checkout Session or trialing subscription and
    // allow Stripe to bill an identity Paige can no longer fulfill. Treat even
    // a stale checkout_creating/retryable_failure state as outcome-unknown and
    // fail closed; billing recovery owns that lifecycle from this point on.
    const { data: enrollment, error: enrollmentError } = await supabase
      .from("solo_beta_enrollments")
      .select("state,stripe_customer_id,checkout_session_id,stripe_subscription_id")
      .eq("user_id", uid)
      .maybeSingle();
    if (enrollmentError) {
      console.error("signup-cancel solo enrollment read error:", enrollmentError);
      return json({ error: "Could not verify billing state" }, 500);
    }
    const billingMayExist = Boolean(
      enrollment && (
        enrollment.state !== "intake_ready"
        || enrollment.stripe_customer_id
        || enrollment.checkout_session_id
        || enrollment.stripe_subscription_id
      ),
    );
    if (billingMayExist) {
      return json({
        error: "Checkout has started, so this sign-up can't be removed here. Review your Solo status or contact support before changing the account.",
      }, 409);
    }

    // Write the audit record BEFORE the irreversible delete, while the user
    // still exists (so user_id FKs hold and the cancellation is never a silent
    // destructive op — §13, systems report what actually happened). An audit
    // failure blocks deletion: this destructive action must never become an
    // unrecorded outcome.
    const { error: auditError } = await supabase.from("audit_logs").insert({
      user_id: uid,
      entity: "auth_user",
      action: "signup_cancelled",
      entity_id: uid,
      data: { email: user.email ?? null, reason: "self-serve pre-provisioning cancel" },
    });
    if (auditError) {
      console.error("signup-cancel audit insert failed:", auditError);
      return json({ error: "Could not record the cancellation safely. Please try again." }, 500);
    }

    // Delete the auth user once; database foreign keys own dependent cleanup.
    // Avoid a separate profile delete that could partially succeed if the
    // subsequent auth deletion fails.
    const { error: delError } = await supabase.auth.admin.deleteUser(uid);
    if (delError) {
      console.error("signup-cancel deleteUser error:", delError);
      return json({ error: `Could not remove the sign-up: ${delError.message}` }, 500);
    }

    console.log("signup-cancel: removed abandoned shell", uid);
    return json({ success: true });
  } catch (error) {
    console.error("Error in signup-cancel:", error);
    return json({ error: error instanceof Error ? error.message : "Unexpected error" }, 500);
  }
});

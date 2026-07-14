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
    // real user (any role, owned/member tenant, linked client, or the explicit
    // marker) — so tenant owners, staff, and clients are all protected here.
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

    // Best-effort cleanup of the pre-signup profile shell, then the auth user.
    // Deleting auth.users cascades to identities/sessions/refresh_tokens.
    await supabase.from("profiles").delete().eq("user_id", uid);

    const { error: delError } = await supabase.auth.admin.deleteUser(uid);
    if (delError) {
      console.error("signup-cancel deleteUser error:", delError);
      return json({ error: `Could not remove the sign-up: ${delError.message}` }, 500);
    }

    // Audit the self-cancellation. (No user_id FK dependency — the user is gone.)
    try {
      await supabase.from("audit_logs").insert({
        entity: "auth_user",
        action: "signup_cancelled",
        entity_id: uid,
        data: { email: user.email ?? null, reason: "self-serve pre-provisioning cancel" },
      });
    } catch (_e) { /* audit is best-effort */ }

    console.log("signup-cancel: removed abandoned shell", uid);
    return json({ success: true });
  } catch (error) {
    console.error("Error in signup-cancel:", error);
    return json({ error: error instanceof Error ? error.message : "Unexpected error" }, 500);
  }
});

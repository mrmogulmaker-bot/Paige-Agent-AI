// Admin actions to "reset" another user's account.
// Supports four non-destructive operations any tenant admin can run on
// their members or customers; deletes still live in `admin-delete-user`.
//
//   action: "password_reset"   → emails a recovery link
//   action: "signout_all"      → invalidates every active session
//   action: "resend_invite"    → fresh signup / magic link to the email
//   action: "wipe_onboarding"  → re-runs welcome flow on next login
//                                (clears onboarding/intake/consent flags;
//                                 NEVER touches credit data, businesses,
//                                 or CRM history)
//
// Authorized roles: owner, super_admin, admin, developer.
// Developer = full platform admin minus destructive deletes (handled
// in admin-delete-user).
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.75.0";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders },
  });

type Action =
  | "password_reset"
  | "signout_all"
  | "resend_invite"
  | "wipe_onboarding";

const AUTHORIZED = new Set([
  "owner",
  "super_admin",
  "admin",
  "developer",
]);

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const admin = createClient(SUPABASE_URL, SERVICE_KEY);

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "Unauthorized" }, 401);
    const token = authHeader.replace("Bearer ", "");
    const { data: { user: caller }, error: authErr } = await admin.auth.getUser(token);
    if (authErr || !caller) return json({ error: "Unauthorized" }, 401);

    const { data: callerRoles } = await admin
      .from("user_roles")
      .select("role")
      .eq("user_id", caller.id);
    const roleSet = new Set((callerRoles ?? []).map((r: any) => r.role));
    const authorized = [...AUTHORIZED].some((r) => roleSet.has(r));
    if (!authorized) return json({ error: "Forbidden" }, 403);

    const body = await req.json().catch(() => ({}));
    const action = body?.action as Action;
    const user_id: string | undefined = body?.user_id ?? body?.userId;
    if (!action || !user_id) return json({ error: "Missing action or user_id" }, 400);

    // Resolve target email
    const { data: target } = await admin.auth.admin.getUserById(user_id);
    const targetEmail = target?.user?.email ?? null;
    if (!targetEmail && action !== "wipe_onboarding" && action !== "signout_all") {
      return json({ error: "Target user has no email on file" }, 400);
    }

    // Protect platform owner from sign-out/reset by non-owner
    const { data: ownerRow } = await admin
      .from("app_settings_owner")
      .select("owner_email").limit(1).maybeSingle();
    if (ownerRow?.owner_email && targetEmail &&
        targetEmail.toLowerCase() === ownerRow.owner_email.toLowerCase() &&
        caller.id !== user_id && !roleSet.has("owner") && !roleSet.has("super_admin")) {
      return json({ error: "Only the platform owner can reset the platform owner account" }, 403);
    }

    const result: Record<string, unknown> = { action, user_id };

    if (action === "password_reset") {
      const redirectTo = (body?.redirect_to as string) || `${new URL(req.url).origin}/reset-password`;
      const { data, error } = await admin.auth.admin.generateLink({
        type: "recovery",
        email: targetEmail!,
        options: { redirectTo },
      });
      if (error) throw error;
      result.action_link = data?.properties?.action_link ?? null;
      // The auth-email-hook will deliver the actual email; we just minted the link.
    } else if (action === "signout_all") {
      const { error } = await admin.auth.admin.signOut(user_id, "global");
      if (error) throw error;
      result.signed_out = true;
    } else if (action === "resend_invite") {
      const redirectTo = (body?.redirect_to as string) || `${new URL(req.url).origin}/`;
      // Use magic link to cover both never-accepted invites and lost links.
      const { data, error } = await admin.auth.admin.generateLink({
        type: "magiclink",
        email: targetEmail!,
        options: { redirectTo },
      });
      if (error) throw error;
      result.action_link = data?.properties?.action_link ?? null;
    } else if (action === "wipe_onboarding") {
      // Reset onboarding/intake/consent flags. Leave credit data, businesses,
      // CRM history, and roles untouched.
      const { error: pErr } = await admin
        .from("profiles")
        .update({
          onboarding_completed: false,
          intake_completed: false,
          welcome_seen: false,
          updated_at: new Date().toISOString(),
        })
        .eq("user_id", user_id);
      if (pErr) result.profile_error = pErr.message;

      const { error: cErr } = await admin
        .from("clients")
        .update({ onboarding_stage: "welcome" })
        .eq("linked_user_id", user_id);
      if (cErr) result.client_error = cErr.message;

      // Clear platform legal acceptances so the consent gate re-prompts.
      const { error: lErr } = await admin
        .from("legal_acceptances")
        .delete()
        .eq("user_id", user_id);
      if (lErr) result.legal_error = lErr.message;

      result.wiped = true;
    } else {
      return json({ error: `Unknown action: ${action}` }, 400);
    }

    // Audit
    await admin.from("audit_logs").insert({
      user_id: caller.id,
      entity: "user",
      action: `admin_account_action:${action}`,
      entity_id: user_id,
      data: { target_email: targetEmail, by: caller.email ?? caller.id },
    });

    return json({ success: true, ...result });
  } catch (e: any) {
    console.error("admin-account-actions error:", e);
    return json({ error: e?.message ?? String(e) }, 500);
  }
});

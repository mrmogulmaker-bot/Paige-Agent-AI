// Admin actions to "reset" another user's account.
// Supports four non-destructive operations any tenant admin can run on
// their members or customers; deletes still live in `admin-delete-user`.
//
//   action: "password_reset"   → emails a recovery link
//   action: "signout_all"      → invalidates every active session
//   action: "resend_invite"    → fresh signup / magic link to the email
//   action: "wipe_onboarding"  → re-runs welcome flow on next login
//
// Authorized roles: owner, super_admin, admin, developer.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.75.0";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const json = (body: unknown, status = 200, reqId?: string) =>
  new Response(JSON.stringify(reqId ? { request_id: reqId, ...(body as object) } : body), {
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

// Structured logger — every line is JSON so it greps cleanly out of
// edge-function logs. Tag with request_id so a single invocation's
// breadcrumbs cluster together across boot/handler/shutdown.
const log = (reqId: string, stage: string, payload: Record<string, unknown> = {}) => {
  try {
    console.log(JSON.stringify({
      fn: "admin-account-actions",
      request_id: reqId,
      stage,
      ts: new Date().toISOString(),
      ...payload,
    }));
  } catch {
    console.log(`[${reqId}] ${stage}`);
  }
};

Deno.serve(async (req) => {
  const reqId = (globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`).toString();
  const started = performance.now();

  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  log(reqId, "request_in", {
    method: req.method,
    url: req.url,
    has_auth: !!req.headers.get("Authorization"),
    ua: req.headers.get("user-agent") ?? null,
    origin: req.headers.get("origin") ?? null,
  });

  try {
    const admin = createClient(SUPABASE_URL, SERVICE_KEY);

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      log(reqId, "auth_missing");
      return json({ error: "Unauthorized" }, 401, reqId);
    }
    const token = authHeader.replace("Bearer ", "");
    const { data: { user: caller }, error: authErr } = await admin.auth.getUser(token);
    if (authErr || !caller) {
      log(reqId, "auth_failed", { error: authErr?.message });
      return json({ error: "Unauthorized" }, 401, reqId);
    }
    log(reqId, "caller_resolved", { caller_id: caller.id, caller_email: caller.email });

    const { data: callerRoles } = await admin
      .from("user_roles")
      .select("role")
      .eq("user_id", caller.id);
    const roleSet = new Set((callerRoles ?? []).map((r: any) => r.role));
    const authorized = [...AUTHORIZED].some((r) => roleSet.has(r));
    log(reqId, "roles_loaded", { roles: [...roleSet], authorized });
    if (!authorized) return json({ error: "Forbidden" }, 403, reqId);

    const body = await req.json().catch(() => ({}));
    const action = body?.action as Action;
    const user_id: string | undefined = body?.user_id ?? body?.userId;
    log(reqId, "body_parsed", { action, target_user_id: user_id });
    if (!action || !user_id) return json({ error: "Missing action or user_id" }, 400, reqId);

    const { data: target, error: tgtErr } = await admin.auth.admin.getUserById(user_id);
    const targetEmail = target?.user?.email ?? null;
    log(reqId, "target_resolved", { target_email: targetEmail, lookup_error: tgtErr?.message });
    if (!targetEmail && action !== "wipe_onboarding" && action !== "signout_all") {
      return json({ error: "Target user has no email on file" }, 400, reqId);
    }

    const { data: ownerRow } = await admin
      .from("app_settings_owner")
      .select("owner_email").limit(1).maybeSingle();
    if (ownerRow?.owner_email && targetEmail &&
        targetEmail.toLowerCase() === ownerRow.owner_email.toLowerCase() &&
        caller.id !== user_id && !roleSet.has("owner") && !roleSet.has("super_admin")) {
      log(reqId, "owner_protected_block");
      return json({ error: "Only the platform owner can reset the platform owner account" }, 403, reqId);
    }

    const result: Record<string, unknown> = { action, user_id };

    if (action === "password_reset") {
      const redirectTo = (body?.redirect_to as string) || `${new URL(req.url).origin}/reset-password`;
      const { data, error } = await admin.auth.admin.generateLink({
        type: "recovery",
        email: targetEmail!,
        options: { redirectTo },
      });
      if (error) {
        log(reqId, "password_reset_link_failed", { error: error.message });
        throw error;
      }
      result.action_link = data?.properties?.action_link ?? null;
      log(reqId, "password_reset_link_minted");
    } else if (action === "signout_all") {
      const rpcStarted = performance.now();
      const { data: removed, error: rpcErr } = await admin.rpc(
        "admin_force_signout_user",
        { target_user: user_id },
      );
      const rpcMs = Math.round(performance.now() - rpcStarted);
      log(reqId, "signout_rpc_complete", {
        ms: rpcMs,
        sessions_removed: removed ?? 0,
        error: rpcErr?.message,
        error_code: (rpcErr as any)?.code,
        error_details: (rpcErr as any)?.details,
      });
      if (rpcErr) throw new Error(`signout failed: ${rpcErr.message}`);
      result.signed_out = true;
      result.sessions_removed = removed ?? 0;

      const { error: notifErr } = await admin.from("notifications").insert({
        user_id,
        type: "system",
        title: "You were signed out by an administrator",
        message: `Your active sessions were ended by ${caller.email ?? "an admin"} on ${new Date().toUTCString()}. If this wasn't expected, contact support.`,
        action_url: "/auth",
      });
      if (notifErr) {
        result.notification_error = notifErr.message;
        log(reqId, "signout_notification_failed", { error: notifErr.message });
      }

      if (targetEmail) {
        try {
          // Resolve the target user's tenant so the email From: header carries
          // that tenant's brand (e.g. "Mogul Maker Academy") instead of the
          // platform-wide default.
          const { data: targetProfile } = await admin
            .from("profiles")
            .select("active_tenant_id")
            .eq("user_id", user_id)
            .maybeSingle();
          const targetTenantId = targetProfile?.active_tenant_id ?? null;

          await admin.functions.invoke("send-transactional-email", {
            body: {
              templateName: "security-signed-out",
              recipientEmail: targetEmail,
              idempotencyKey: `signout-${user_id}-${Date.now()}`,
              tenantId: targetTenantId,
              templateData: {
                actor_email: caller.email ?? "an administrator",
                signed_out_at: new Date().toISOString(),
              },
            },
          });
          log(reqId, "signout_email_queued", { tenant_id: targetTenantId });
        } catch (mailErr: any) {
          result.email_error = mailErr?.message ?? String(mailErr);
          log(reqId, "signout_email_failed", { error: result.email_error });
        }
      }
    } else if (action === "resend_invite") {
      const redirectTo = (body?.redirect_to as string) || `${new URL(req.url).origin}/`;
      const { data, error } = await admin.auth.admin.generateLink({
        type: "magiclink",
        email: targetEmail!,
        options: { redirectTo },
      });
      if (error) {
        log(reqId, "resend_invite_failed", { error: error.message });
        throw error;
      }
      result.action_link = data?.properties?.action_link ?? null;
      log(reqId, "resend_invite_minted");
    } else if (action === "wipe_onboarding") {
      const { error: pErr } = await admin
        .from("profiles")
        .update({
          onboarding_completed: false,
          intake_completed: false,
          updated_at: new Date().toISOString(),
        })
        .eq("user_id", user_id);
      if (pErr) result.profile_error = pErr.message;

      const { error: cErr } = await admin
        .from("clients")
        .update({ onboarding_stage: "welcome" })
        .eq("linked_user_id", user_id);
      if (cErr) result.client_error = cErr.message;

      const { error: lErr } = await admin
        .from("legal_acceptances")
        .delete()
        .eq("user_id", user_id);
      if (lErr) result.legal_error = lErr.message;

      result.wiped = true;
      log(reqId, "wipe_onboarding_complete", {
        profile_error: result.profile_error,
        client_error: result.client_error,
        legal_error: result.legal_error,
      });
    } else {
      log(reqId, "unknown_action", { action });
      return json({ error: `Unknown action: ${action}` }, 400, reqId);
    }

    const { error: auditErr } = await admin.from("audit_logs").insert({
      user_id: caller.id,
      entity: "user",
      action: `admin_account_action:${action}`,
      entity_id: user_id,
      data: { target_email: targetEmail, by: caller.email ?? caller.id, request_id: reqId },
    });
    if (auditErr) log(reqId, "audit_insert_failed", { error: auditErr.message });

    const totalMs = Math.round(performance.now() - started);
    log(reqId, "request_done", { status: 200, ms: totalMs, action });
    return json({ success: true, request_id: reqId, ...result }, 200);
  } catch (e: any) {
    const totalMs = Math.round(performance.now() - started);
    log(reqId, "request_error", {
      ms: totalMs,
      error: e?.message ?? String(e),
      stack: e?.stack?.split("\n").slice(0, 5).join(" | "),
    });
    console.error(`[${reqId}] admin-account-actions error:`, e);
    return json({ error: e?.message ?? String(e), request_id: reqId }, 500);
  }
});

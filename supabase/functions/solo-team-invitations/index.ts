import { createClient } from "npm:@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function json(body: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });
}

/**
 * `expectedTenantId` is the workspace the caller believes it is acting in — the Team screen sends
 * the `tenant_id` it rendered the roster and the workspace name from; Paige sends the tenant the
 * conversation is about. It is NOT trusted here and is not resolved here. It travels to
 * `solo_team_invite_authority`, which proves the actor's active owner/admin membership in that exact
 * workspace and refuses otherwise. A client can therefore use it to ABORT a call and can never use
 * it to select a workspace it has no authority in.
 *
 * It is deliberately not defaulted, not inferred, and not validated into something plausible here.
 * The whole defect this endpoint was repaired for was a server that filled in a workspace nobody
 * named, so a missing value must reach the database and be refused there, by the one authority.
 */
type InviteAction =
  | {
      action: "create";
      expectedTenantId?: string;
      email?: string;
      permission?: string;
      jobTitle?: string;
      responsibilities?: string;
    }
  | { action: "resend" | "revoke"; expectedTenantId?: string; inviteId?: string };

type PreparedInvite = {
  id?: string;
  token?: string;
  email?: string;
  expires_at?: string;
  tenant_id?: string;
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  if (req.method !== "POST") return json({ ok: false, error: "POST only" }, 405);

  const url = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const authorization = req.headers.get("Authorization") ?? "";
  if (!url || !anonKey || !serviceKey || !authorization.startsWith("Bearer ")) {
    return json({ ok: false, error: "Unauthorized" }, 401);
  }

  const authed = createClient(url, anonKey, {
    global: { headers: { Authorization: authorization } },
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data: { user }, error: userError } = await authed.auth.getUser();
  if (userError || !user) return json({ ok: false, error: "Unauthorized" }, 401);

  let body: InviteAction;
  try { body = await req.json(); } catch { return json({ ok: false, error: "Invalid request" }, 400); }
  const admin = createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });

  // Passed through untouched, including when absent. `?? null` rather than a fallback: the database
  // is the only thing entitled to decide that a workspace was not named.
  const expectedTenantId = typeof body.expectedTenantId === "string" ? body.expectedTenantId : null;

  // A DEPLOY-WINDOW REFUSAL, not an authorization one. Migrations, edge functions and the
  // frontend ship as three independent pipelines off one merge, so an operator holding an
  // already-loaded Team page across the deploy sends the pre-merge body, with no workspace in
  // it. Without this they would hit the database's authority refusal and be told they may not
  // manage invitations — false, and the exact class of false statement this endpoint was just
  // repaired to stop making. Say what actually happened and what fixes it.
  //
  // This does NOT weaken the server-side proof: the database refuses a missing workspace
  // independently, and a caller still cannot select a workspace it has no authority in.
  if (!expectedTenantId) {
    return json({
      ok: false,
      error: "This page is out of date, so it could not say which workspace to invite into. Reload Team and try again.",
    }, 400);
  }

  try {
    if (body.action === "revoke") {
      if (!body.inviteId) return json({ ok: false, error: "Invitation is required" }, 400);
      const { error } = await admin.rpc("revoke_solo_team_invite", {
        _actor: user.id,
        _expected_tenant_id: expectedTenantId,
        _invite_id: body.inviteId,
      });
      if (error) throw error;
      return json({ ok: true, state: "revoked" });
    }

    let invite: PreparedInvite | null = null;
    if (body.action === "create") {
      const { data, error } = await admin.rpc("create_solo_team_invite", {
        _actor: user.id,
        _expected_tenant_id: expectedTenantId,
        _email: String(body.email ?? ""),
        _permission: String(body.permission ?? "member"),
        _job_title: body.jobTitle ?? null,
        _responsibilities: body.responsibilities ?? null,
      });
      if (error) throw error;
      invite = data as PreparedInvite | null;
    } else if (body.action === "resend") {
      if (!body.inviteId) return json({ ok: false, error: "Invitation is required" }, 400);
      const { data, error } = await admin.rpc("resend_solo_team_invite", {
        _actor: user.id,
        _expected_tenant_id: expectedTenantId,
        _invite_id: body.inviteId,
      });
      if (error) throw error;
      invite = data as PreparedInvite | null;
    } else {
      return json({ ok: false, error: "Unsupported action" }, 400);
    }

    if (!invite?.token || !invite.email) throw new Error("Invitation could not be prepared");
    // The database now returns the workspace it actually acted in. Checking it here costs one
    // comparison and means a reintroduced fallback surfaces as a refusal instead of as a token in a
    // stranger's inbox. Checked BEFORE the send, because an email cannot be recalled.
    if (expectedTenantId && invite.tenant_id && invite.tenant_id !== expectedTenantId) {
      throw new Error("not authorized: this invitation resolved to a different workspace than the one requested");
    }
    const { data: sendData, error: sendError } = await admin.functions.invoke("send-portal-invite", {
      body: { token: invite.token, email: invite.email },
    });
    const emailed = !sendError && sendData?.emailed === true;
    return json({
      ok: true,
      invitationId: invite.id,
      expiresAt: invite.expires_at,
      tenantId: invite.tenant_id ?? null,
      emailed,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Team invitation failed";
    // An authority refusal is a 403, not a generic 400. `was not named` is listed explicitly: it is
    // an authorization refusal from the same resolver, but its wording contains none of the older
    // phrases, and a §37 response-consumer miss here would silently downgrade it to a 400.
    const denied = /only an owner|only an owner or admin|not authorized|was not named/i.test(message);
    return json({ ok: false, error: message }, denied ? 403 : 400);
  }
});

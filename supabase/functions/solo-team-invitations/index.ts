import { createClient } from "npm:@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function json(body: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });
}

type InviteAction =
  | { action: "create"; email?: string; permission?: string; jobTitle?: string; responsibilities?: string }
  | { action: "resend" | "revoke"; inviteId?: string };

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

  try {
    if (body.action === "revoke") {
      if (!body.inviteId) return json({ ok: false, error: "Invitation is required" }, 400);
      const { error } = await admin.rpc("revoke_solo_team_invite", { _actor: user.id, _invite_id: body.inviteId });
      if (error) throw error;
      return json({ ok: true, state: "revoked" });
    }

    let invite: { id?: string; token?: string; email?: string; expires_at?: string } | null = null;
    if (body.action === "create") {
      const { data, error } = await admin.rpc("create_solo_team_invite", {
        _actor: user.id,
        _email: String(body.email ?? ""),
        _permission: String(body.permission ?? "member"),
        _job_title: body.jobTitle ?? null,
        _responsibilities: body.responsibilities ?? null,
      });
      if (error) throw error;
      invite = data as typeof invite;
    } else if (body.action === "resend") {
      if (!body.inviteId) return json({ ok: false, error: "Invitation is required" }, 400);
      const { data, error } = await admin.rpc("resend_solo_team_invite", { _actor: user.id, _invite_id: body.inviteId });
      if (error) throw error;
      invite = data as typeof invite;
    } else {
      return json({ ok: false, error: "Unsupported action" }, 400);
    }

    if (!invite?.token || !invite.email) throw new Error("Invitation could not be prepared");
    const { data: sendData, error: sendError } = await admin.functions.invoke("send-portal-invite", {
      body: { token: invite.token, email: invite.email },
    });
    const emailed = !sendError && sendData?.emailed === true;
    return json({ ok: true, invitationId: invite.id, expiresAt: invite.expires_at, emailed });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Team invitation failed";
    const denied = /only an owner|only an owner or admin|not authorized/i.test(message);
    return json({ ok: false, error: message }, denied ? 403 : 400);
  }
});

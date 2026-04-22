// send-broker-team-invite — issues a 7-day invite token to a broker team member
// row, then dispatches the broker-team-invitation transactional email.
// Caller must be the broker that owns the team member row, or an admin.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

interface InviteBody {
  broker_id?: string;
  team_member_id?: string;
  invitee_email?: string;
  invitee_first_name?: string;
  invitee_last_name?: string;
  role?: "lead_broker" | "advisor" | "assistant";
  resend?: boolean;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return json({ error: "Missing Authorization header" }, 401);
    }

    const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userData?.user) return json({ error: "Unauthenticated" }, 401);
    const callerId = userData.user.id;

    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const body = (await req.json().catch(() => ({}))) as InviteBody;

    // Authorize: caller must own the broker_profile or be admin.
    let brokerId = body.broker_id || null;
    if (body.team_member_id && !brokerId) {
      const { data: tm } = await admin
        .from("broker_team_members")
        .select("broker_id")
        .eq("id", body.team_member_id)
        .maybeSingle();
      brokerId = (tm as any)?.broker_id || null;
    }
    if (!brokerId) return json({ error: "broker_id required" }, 400);

    const { data: brokerProfile } = await admin
      .from("broker_profiles")
      .select("id, user_id, business_name, firm_description")
      .eq("id", brokerId)
      .maybeSingle();
    if (!brokerProfile) return json({ error: "Broker not found" }, 404);

    const { data: roles } = await admin
      .from("user_roles")
      .select("role")
      .eq("user_id", callerId);
    const isAdmin = (roles || []).some((r: any) => r.role === "admin");
    if (!isAdmin && brokerProfile.user_id !== callerId) {
      // Allow team member with can_manage_team
      const { data: tmCaller } = await admin
        .from("broker_team_members")
        .select("permissions")
        .eq("auth_user_id", callerId)
        .eq("broker_id", brokerId)
        .eq("status", "active")
        .maybeSingle();
      const canManage = !!(tmCaller as any)?.permissions?.can_manage_team;
      if (!canManage) return json({ error: "Forbidden" }, 403);
    }

    // Generate token + expiry
    const token = crypto.randomUUID() + "-" + crypto.randomUUID();
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

    let memberRow: any;
    if (body.team_member_id) {
      const { data, error } = await admin
        .from("broker_team_members")
        .update({
          invitation_token: token,
          invitation_expires_at: expiresAt,
          status: "invited",
          invited_at: new Date().toISOString(),
        })
        .eq("id", body.team_member_id)
        .select("id, email, first_name, last_name, role, broker_id")
        .single();
      if (error) return json({ error: error.message }, 400);
      memberRow = data;
    } else {
      if (!body.invitee_email || !body.role) {
        return json({ error: "invitee_email and role required" }, 400);
      }
      const { data, error } = await admin
        .from("broker_team_members")
        .insert({
          broker_id: brokerId,
          email: body.invitee_email.toLowerCase().trim(),
          first_name: body.invitee_first_name?.trim() || null,
          last_name: body.invitee_last_name?.trim() || null,
          role: body.role,
          status: "invited",
          invitation_token: token,
          invitation_expires_at: expiresAt,
        })
        .select("id, email, first_name, last_name, role, broker_id")
        .single();
      if (error) return json({ error: error.message }, 400);
      memberRow = data;
    }

    const signupLink = `https://paigeagent.ai/broker/accept-invite?token=${token}`;
    const roleLabel =
      memberRow.role === "lead_broker"
        ? "Lead Broker"
        : memberRow.role === "advisor"
        ? "Advisor"
        : "Assistant";

    // Fire transactional email (best-effort)
    try {
      await admin.functions.invoke("send-transactional-email", {
        body: {
          templateName: "broker-team-invitation",
          recipientEmail: memberRow.email,
          idempotencyKey: `broker-team-invite-${memberRow.id}-${token.slice(0, 8)}`,
          templateData: {
            firstName: memberRow.first_name || "there",
            brokerBusinessName: brokerProfile.business_name,
            roleLabel,
            signupLink,
            expiresInDays: 7,
          },
        },
      });
    } catch (e) {
      console.warn("[send-broker-team-invite] email dispatch failed", (e as Error).message);
    }

    // Analytics
    try {
      await admin.from("analytics_events").insert({
        user_id: callerId,
        event_name: "broker_team_member_invited",
        event_category: "broker_team",
        properties: {
          broker_id: brokerId,
          team_member_id: memberRow.id,
          role: memberRow.role,
          resend: !!body.resend,
        },
        page_path: "edge:send-broker-team-invite",
      });
    } catch (_) {}

    return json({ success: true, team_member_id: memberRow.id, signupLink });
  } catch (err: any) {
    console.error("[send-broker-team-invite] error", err);
    return json({ error: err?.message || "Server error" }, 500);
  }
});

function json(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

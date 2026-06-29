// supabase/functions/invite-btf-client/index.ts
//
// White-labeled BUILD-to-FUND workspace invite endpoint.
//
// Auth modes:
//   1. MMA OS service call: `Authorization: Bearer ${PAIGE_BTF_INVITE_KEY}`
//   2. Coach/admin dashboard call: standard Supabase JWT (role admin/coach)
//
// Behavior:
//   - Resolve client by paige_client_id OR contact_email (create if missing).
//   - Mint signed opaque token, store hash in btf_workspace_invites (7-day TTL).
//   - Send white-labeled `btf-welcome-invite` email via send-transactional-email.
//   - Log a paige_audit_log + communication_log touchpoint.
//
// Response (success):
//   { ok, paige_client_id, invite_url, expires_at, email_sent }
// Response (error):
//   { ok:false, error, error_code }

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const PORTAL_BASE = "https://portal.mogulmakeracademy.com";
const INVITE_TTL_DAYS = 7;

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const PAIGE_BTF_INVITE_KEY = Deno.env.get("PAIGE_BTF_INVITE_KEY") ?? "";

function err(status: number, error_code: string, error: string) {
  return new Response(JSON.stringify({ ok: false, error, error_code }), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function generateToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

async function sha256(input: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, "0")).join("");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return err(405, "METHOD_NOT_ALLOWED", "POST required");

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });

  // ----- Auth -----
  const authHeader = req.headers.get("Authorization") ?? "";
  const bearer = authHeader.replace(/^Bearer\s+/i, "").trim();
  let authMode: "mma_os" | "user" = "mma_os";
  let actingUserId: string | null = null;

  if (PAIGE_BTF_INVITE_KEY && bearer === PAIGE_BTF_INVITE_KEY) {
    authMode = "mma_os";
  } else if (bearer) {
    // Try as a Supabase user JWT (coach/admin via dashboard).
    const { data: userRes, error: userErr } = await admin.auth.getUser(bearer);
    if (userErr || !userRes?.user) {
      return err(401, "UNAUTHORIZED", "Invalid credentials");
    }
    actingUserId = userRes.user.id;
    const { data: roles } = await admin
      .from("user_roles")
      .select("role")
      .eq("user_id", actingUserId);
    const allowed = (roles ?? []).some((r: any) =>
      ["admin", "coach", "super_admin", "ops", "csm"].includes(r.role),
    );
    if (!allowed) return err(403, "FORBIDDEN", "Admin or coach role required");
    authMode = "user";
  } else {
    return err(401, "UNAUTHORIZED", "Missing credentials");
  }

  // ----- Tenant feature gate -----
  // BTF is exclusive to tenants where features.btf_enabled = true (Mogul Maker Academy).
  // MMA OS service calls bypass this — that integration IS the MMA tenant.
  if (authMode === "user" && actingUserId) {
    const { data: profile } = await admin
      .from("profiles")
      .select("active_tenant_id")
      .eq("user_id", actingUserId)
      .maybeSingle();
    const tenantId = profile?.active_tenant_id;
    if (tenantId) {
      const { data: tenant } = await admin
        .from("tenants")
        .select("features")
        .eq("id", tenantId)
        .maybeSingle();
      const btfEnabled = (tenant?.features as Record<string, unknown> | null)?.btf_enabled === true;
      if (!btfEnabled) {
        return err(403, "BTF_NOT_ENABLED", "BTF program is not enabled for this workspace");
      }
    }
  }

  // ----- Parse body -----
  let body: any;
  try { body = await req.json(); } catch { return err(400, "INVALID_BODY", "Invalid JSON"); }

  const contact_email: string = (body?.contact_email ?? "").trim().toLowerCase();
  const full_name: string | null = body?.full_name ?? null;
  const preferred_name: string | null = body?.preferred_name ?? null;
  const btf_deal_id: string | null = body?.btf_deal_id ?? null;
  let paige_client_id: string | null = body?.paige_client_id ?? null;

  if (!contact_email || !/^\S+@\S+\.\S+$/.test(contact_email)) {
    return err(400, "INVALID_CONFIG", "contact_email is required and must be valid");
  }

  // ----- Resolve / create client -----
  let client: any = null;
  if (paige_client_id) {
    const { data } = await admin.from("clients").select("*").eq("id", paige_client_id).maybeSingle();
    if (!data) return err(404, "CLIENT_NOT_FOUND", "paige_client_id not found");
    client = data;
  } else {
    const { data: existing } = await admin
      .from("clients")
      .select("*")
      .ilike("email", contact_email)
      .maybeSingle();
    if (existing) {
      client = existing;
    } else {
      const [firstName, ...rest] = (full_name ?? preferred_name ?? contact_email.split("@")[0]).split(" ");
      const { data: created, error: insErr } = await admin
        .from("clients")
        .insert({
          first_name: firstName || preferred_name || "Client",
          last_name: rest.join(" ") || "",
          email: contact_email,
          status: "active",
          lifecycle_stage: "customer",
          source: authMode === "mma_os" ? "mma_os_btf" : "paige_coach_invite",
          tier: "btf_dfy",
          tags: ["btf"],
          assigned_coach_user_id: authMode === "user" ? actingUserId : null,
        })
        .select("*")
        .single();
      if (insErr || !created) {
        return err(500, "CLIENT_CREATE_FAILED", insErr?.message ?? "Could not create client");
      }
      client = created;
    }
    paige_client_id = client.id;
  }

  // ----- Mint invite token -----
  const token = generateToken();
  const token_hash = await sha256(token);
  const expires_at = new Date(Date.now() + INVITE_TTL_DAYS * 24 * 3600 * 1000).toISOString();

  const { error: invErr } = await admin.from("btf_workspace_invites").insert({
    client_id: paige_client_id,
    email: contact_email,
    token_hash,
    btf_deal_id,
    expires_at,
    created_by_user_id: actingUserId,
    created_via: authMode,
    metadata: { full_name, preferred_name },
  });
  if (invErr) return err(500, "INVITE_PERSIST_FAILED", invErr.message);

  const invite_url = `${PORTAL_BASE}/workspace/accept-invite?token=${token}`;

  // ----- Send white-labeled email -----
  let email_sent = false;
  try {
    const sendRes = await fetch(`${SUPABASE_URL}/functions/v1/send-transactional-email`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
      },
      body: JSON.stringify({
        templateName: "btf-welcome-invite",
        recipientEmail: contact_email,
        idempotencyKey: `btf-invite-${paige_client_id}-${Date.now()}`,
        purpose: "transactional",
        from: "Antonio Cook <antonio@mogulmakeracademy.com>",
        replyTo: "antonio@mogulmakeracademy.com",
        templateData: {
          preferredName: preferred_name ?? full_name?.split(" ")[0] ?? null,
          fullName: full_name,
          inviteUrl: invite_url,
          coachName: "Antonio",
        },
      }),
    });
    email_sent = sendRes.ok;
    if (!sendRes.ok) {
      const detail = await sendRes.text().catch(() => "");
      console.error("[invite-btf-client] email send failed", sendRes.status, detail);
    }
  } catch (e) {
    console.error("[invite-btf-client] email exception", e);
  }

  // ----- Audit / touchpoint -----
  await admin.from("paige_audit_log").insert({
    actor_user_id: actingUserId,
    action: "btf_invite_sent",
    target_type: "client",
    target_id: paige_client_id,
    metadata: { email: contact_email, btf_deal_id, via: authMode, email_sent },
  }).then(() => {}, () => {});

  if (client?.linked_user_id) {
    await admin.from("communication_log").insert({
      user_id: client.linked_user_id,
      direction: "outbound",
      channel: "email",
      subject: "BTF Workspace Invite",
      content: `White-labeled BTF workspace invite sent to ${contact_email}`,
      metadata: { invite_url, email_sent },
    }).then(() => {}, () => {});
  }

  return new Response(
    JSON.stringify({
      ok: true,
      paige_client_id,
      invite_url,
      expires_at,
      email_sent,
    }),
    { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
  );
});

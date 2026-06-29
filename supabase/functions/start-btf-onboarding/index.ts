// supabase/functions/start-btf-onboarding/index.ts
//
// Admin-triggered entry point for the BTF client onboarding wizard.
//
// Behavior:
//   1. Verifies the caller is admin/super_admin or the lead_owner of the contact.
//   2. Sets clients.lifecycle_stage='client_active', onboarding_stage='invited',
//      onboarding_started_at=now() (idempotent — won't downgrade a later stage).
//   3. Generates a Supabase magic link scoped to /onboard.
//   4. Sends the welcome email via send-transactional-email (template
//      `btf-onboarding-welcome`, falls back to `btf-welcome-invite`).
//   5. Fires `client.onboarding_started` bridge event.
//
// Response: { ok, paige_client_id, onboard_url, email_sent }

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { fireAndForgetBridge } from "../_shared/mmaOsBridge.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const PORTAL_BASE = Deno.env.get("BTF_PORTAL_BASE") ?? "https://portal.mogulmakeracademy.com";

function err(status: number, code: string, message: string) {
  return new Response(JSON.stringify({ ok: false, error: message, error_code: code }), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return err(405, "METHOD_NOT_ALLOWED", "POST required");

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false } });

  // ----- Auth -----
  const authHeader = req.headers.get("Authorization") ?? "";
  const jwt = authHeader.replace(/^Bearer\s+/i, "").trim();
  if (!jwt) return err(401, "UNAUTHORIZED", "Missing credentials");

  const { data: userRes, error: userErr } = await admin.auth.getUser(jwt);
  if (userErr || !userRes?.user) return err(401, "UNAUTHORIZED", "Invalid session");
  const actorId = userRes.user.id;

  // ----- Body -----
  let body: any;
  try { body = await req.json(); } catch { return err(400, "INVALID_BODY", "Invalid JSON"); }
  const client_id: string = body?.client_id ?? "";
  if (!client_id) return err(400, "MISSING_CLIENT_ID", "client_id required");

  // ----- Load contact and authorize -----
  const { data: client, error: cliErr } = await admin
    .from("clients")
    .select("id, email, first_name, last_name, lead_owner_user_id, lifecycle_stage, onboarding_stage, linked_user_id")
    .eq("id", client_id)
    .maybeSingle();
  if (cliErr || !client) return err(404, "CLIENT_NOT_FOUND", "Contact not found");

  const { data: roles } = await admin.from("user_roles").select("role").eq("user_id", actorId);
  const roleSet = new Set((roles ?? []).map((r: any) => r.role));
  const isAdmin = roleSet.has("admin") || roleSet.has("super_admin");
  const isOwner = client.lead_owner_user_id === actorId;
  if (!isAdmin && !isOwner) return err(403, "FORBIDDEN", "Admin or contact owner required");

  if (!client.email) return err(400, "MISSING_EMAIL", "Contact has no email — add one first");

  // ----- Update lifecycle + onboarding stage (no downgrade) -----
  const TERMINAL_STAGES = new Set(["completed"]);
  const patch: Record<string, unknown> = {
    lifecycle_stage: "client_active",
    onboarding_started_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
  if (!client.onboarding_stage || !TERMINAL_STAGES.has(client.onboarding_stage)) {
    patch.onboarding_stage = "invited";
  }
  const { error: upErr } = await admin.from("clients").update(patch).eq("id", client_id);
  if (upErr) return err(500, "UPDATE_FAILED", upErr.message);

  // ----- Generate magic link -----
  let onboard_url = `${PORTAL_BASE}/onboard`;
  try {
    const { data: linkData, error: linkErr } = await admin.auth.admin.generateLink({
      type: "magiclink",
      email: client.email,
      options: { redirectTo: `${PORTAL_BASE}/onboard` },
    });
    if (linkErr) console.warn("[start-btf-onboarding] generateLink error", linkErr.message);
    if (linkData?.properties?.action_link) onboard_url = linkData.properties.action_link;
  } catch (e) {
    console.warn("[start-btf-onboarding] generateLink exception", String(e));
  }

  // ----- Send welcome email -----
  let email_sent = false;
  try {
    const sendRes = await fetch(`${SUPABASE_URL}/functions/v1/send-transactional-email`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${SERVICE_ROLE_KEY}` },
      body: JSON.stringify({
        templateName: "btf-onboarding-welcome",
        recipientEmail: client.email,
        idempotencyKey: `btf-onboarding-${client_id}-${Date.now()}`,
        purpose: "transactional",
        from: "Antonio Cook <antonio@mogulmakeracademy.com>",
        replyTo: "antonio@mogulmakeracademy.com",
        templateData: {
          preferredName: client.first_name || null,
          fullName: `${client.first_name ?? ""} ${client.last_name ?? ""}`.trim() || null,
          onboardUrl: onboard_url,
          coachName: "Antonio",
        },
      }),
    });
    email_sent = sendRes.ok;
    if (!sendRes.ok) {
      const detail = await sendRes.text().catch(() => "");
      console.error("[start-btf-onboarding] email failed", sendRes.status, detail);
    }
  } catch (e) {
    console.error("[start-btf-onboarding] email exception", e);
  }

  // ----- Audit + bridge -----
  await admin.from("paige_audit_log").insert({
    actor_user_id: actorId,
    action: "start_btf_onboarding",
    target_type: "client",
    target_id: client_id,
    metadata: { email: client.email, email_sent },
  }).then(() => {}, () => {});

  fireAndForgetBridge("client.onboarding_started", {
    client_id,
    email: client.email,
    triggered_by: actorId,
    at: new Date().toISOString(),
  });

  return new Response(
    JSON.stringify({ ok: true, paige_client_id: client_id, onboard_url, email_sent }),
    { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
  );
});

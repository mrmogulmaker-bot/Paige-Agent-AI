// Resend inbound email webhook receiver.
// Parses inbound email, upserts contact by email, inserts into paige_conversations,
// then fires customer_support_intake bridge verb so n8n CS Triage can draft a reply.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { fireAndForgetBridge } from "../_shared/mmaOsBridge.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, svix-id, svix-timestamp, svix-signature",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return new Response("method_not_allowed", { status: 405 });

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const admin = createClient(supabaseUrl, serviceKey);

  // Resend uses Svix signing. If RESEND_WEBHOOK_SECRET is set, verify; otherwise log a warning
  // and accept (so the wiring can be tested before the secret is provisioned).
  const secret = Deno.env.get("RESEND_WEBHOOK_SECRET");
  const rawBody = await req.text();
  if (secret) {
    try {
      const svixId = req.headers.get("svix-id") ?? "";
      const svixTs = req.headers.get("svix-timestamp") ?? "";
      const svixSig = req.headers.get("svix-signature") ?? "";
      const signedContent = `${svixId}.${svixTs}.${rawBody}`;
      const secretBytes = secret.startsWith("whsec_")
        ? Uint8Array.from(atob(secret.slice(6)), (c) => c.charCodeAt(0))
        : new TextEncoder().encode(secret);
      const key = await crypto.subtle.importKey(
        "raw", secretBytes, { name: "HMAC", hash: "SHA-256" }, false, ["sign"],
      );
      const sigBuf = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(signedContent));
      const sigB64 = btoa(String.fromCharCode(...new Uint8Array(sigBuf)));
      const passed = svixSig.split(" ").some((s) => s.split(",")[1] === sigB64);
      if (!passed) {
        console.warn("[handle-inbound-email] svix_signature_invalid");
        return new Response("invalid_signature", { status: 401 });
      }
    } catch (e) {
      console.error("[handle-inbound-email] signature_check_error", (e as Error).message);
    }
  } else {
    console.warn("[handle-inbound-email] RESEND_WEBHOOK_SECRET not set — accepting unsigned");
  }

  let evt: any;
  try { evt = JSON.parse(rawBody); } catch {
    return new Response("invalid_json", { status: 400 });
  }

  // Resend inbound payload (best-effort field extraction)
  const data = evt?.data ?? evt;
  const fromEmail: string = (data.from?.email || data.from || "").toString().toLowerCase();
  const subject: string = data.subject ?? "";
  const bodyText: string = data.text ?? data.html ?? data.body ?? "";
  const messageId: string = data.message_id ?? data.id ?? evt?.id ?? crypto.randomUUID();

  if (!fromEmail || !bodyText) {
    return new Response(JSON.stringify({ ok: false, reason: "missing_fields" }), { status: 200 });
  }

  // Look up or create contact
  let contactId: string | null = null;
  const { data: existing } = await admin
    .from("clients")
    .select("id")
    .ilike("email", fromEmail)
    .maybeSingle();
  if (existing?.id) {
    contactId = existing.id;
  } else {
    // Need a created_by for clients NOT NULL; use platform owner
    const { data: owner } = await admin
      .from("app_settings_owner")
      .select("owner_email")
      .maybeSingle();
    let createdBy: string | null = null;
    if (owner?.owner_email) {
      const { data: ownerUser } = await admin.auth.admin.listUsers();
      const match = ownerUser?.users?.find((u: any) => (u.email ?? "").toLowerCase() === owner.owner_email.toLowerCase());
      createdBy = match?.id ?? null;
    }
    if (createdBy) {
      const localPart = fromEmail.split("@")[0];
      const { data: created } = await admin
        .from("clients")
        .insert({
          created_by: createdBy,
          first_name: localPart || "Inbound",
          last_name: "",
          email: fromEmail,
          lifecycle_stage: "lead",
          source: "inbound_email",
          status: "active",
        })
        .select("id")
        .single();
      contactId = created?.id ?? null;
    }
  }

  // Insert conversation row (idempotent via unique source_message_id)
  const { data: convo, error: insertErr } = await admin
    .from("paige_conversations")
    .insert({
      channel: "email",
      contact_id: contactId,
      direction: "inbound",
      subject,
      body: bodyText,
      source_message_id: messageId,
      status: "new",
      metadata: { from: fromEmail, to: data.to ?? null },
    })
    .select("id")
    .single();

  if (insertErr) {
    // unique violation = already processed
    if (insertErr.code === "23505") {
      return new Response(JSON.stringify({ ok: true, deduped: true }), { status: 200 });
    }
    console.error("[handle-inbound-email] insert_error", insertErr);
    return new Response(JSON.stringify({ ok: false, error: insertErr.message }), { status: 500 });
  }

  fireAndForgetBridge("record_cross_system_event" as any, {
    verb_override: "customer_support_intake",
    conversation_id: convo.id,
    contact_email: fromEmail,
    channel: "email",
    subject,
    body: bodyText,
  });

  return new Response(JSON.stringify({ ok: true, conversation_id: convo.id }), {
    status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});

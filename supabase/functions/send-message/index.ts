// Unified send dispatcher — routes email via Resend, SMS via Twilio.
// SMS is a tenant-configurable channel: it sends only when the tenant's Twilio
// A2P registration is approved (config.twilio_a2p_status). Email is the default.
// Writes every send to paige_messages_audit and mirrors outbound to paige_conversations.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface SendBody {
  channel: "email" | "sms";
  to: string;
  subject?: string;
  body: string;
  contact_id?: string;
  conversation_id?: string;
  in_reply_to?: string;
  approval_id?: string;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const admin = createClient(supabaseUrl, serviceKey);

  // Caller identity from JWT (verify_jwt=true on this fn).
  const auth = req.headers.get("Authorization") ?? "";
  const userClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: auth } },
  });
  const { data: { user } } = await userClient.auth.getUser();
  if (!user) {
    return new Response(JSON.stringify({ error: "unauthorized" }), {
      status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const { data: isAdmin } = await admin.rpc("has_role", { _user_id: user.id, _role: "admin" });
  const { data: isCoach } = await admin.rpc("has_role", { _user_id: user.id, _role: "coach" });
  if (!isAdmin && !isCoach) {
    return new Response(JSON.stringify({ error: "forbidden" }), {
      status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  let body: SendBody;
  try { body = await req.json(); } catch {
    return new Response(JSON.stringify({ error: "invalid_json" }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  if (!body?.channel || !body?.to || !body?.body) {
    return new Response(JSON.stringify({ error: "missing_fields" }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const { data: config } = await admin.from("paige_config").select("*").eq("id", 1).maybeSingle();

  let pipe_used: "resend" | "twilio" = "resend";
  let vendor_message_id: string | null = null;
  let status: "sent" | "failed" = "failed";
  let errorText: string | null = null;
  let fromAddress: string | null = null;

  try {
    if (body.channel === "email") {
      const resendKey = Deno.env.get("RESEND_API_KEY");
      if (!resendKey) throw new Error("RESEND_API_KEY missing");

      // Resolve tenant-aware sender. Look up contact's tenant when provided.
      let tenantId: string | null = null;
      if (body.contact_id) {
        const { data: contactRow } = await admin
          .from("clients")
          .select("tenant_id")
          .eq("id", body.contact_id)
          .maybeSingle();
        tenantId = contactRow?.tenant_id ?? null;
      }
      const { data: sender } = await admin.rpc("get_tenant_sender", { _tenant_id: tenantId });
      const senderRow = Array.isArray(sender) ? sender[0] : sender;
      const senderName = senderRow?.from_name || "Paige Agent";
      // Last-resort fallback on the VERIFIED sending subdomain (Tier 1 #64) — the
      // bare apex is not a confirmed Resend sending domain. Post-migration
      // get_tenant_sender always returns the tenant's <slug>@mail.paigeagent.ai,
      // so this only fires on an RPC miss; keep it verified so it can still deliver.
      const senderEmail = senderRow?.from_email || config?.default_from_email || "no-reply@mail.paigeagent.ai";
      fromAddress = `${senderName} <${senderEmail}>`;

      const headers: Record<string, string> = {};
      if (body.in_reply_to) headers["In-Reply-To"] = body.in_reply_to;
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${resendKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: fromAddress,
          to: [body.to],
          subject: body.subject || "(no subject)",
          html: body.body,
          headers: Object.keys(headers).length ? headers : undefined,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(`resend_${res.status}: ${JSON.stringify(json).slice(0, 300)}`);
      pipe_used = "resend";
      vendor_message_id = json?.id ?? null;
      status = "sent";
    } else {
      // SMS
      const useTwilio = config?.twilio_a2p_status === "approved";
      if (useTwilio) {
        const sid = Deno.env.get("TWILIO_ACCOUNT_SID");
        const tok = Deno.env.get("TWILIO_AUTH_TOKEN");
        const from = config?.default_from_sms_number || Deno.env.get("TWILIO_PHONE_NUMBER");
        if (!sid || !tok || !from) throw new Error("twilio_env_incomplete");
        fromAddress = from;
        const params = new URLSearchParams({ To: body.to, From: from, Body: body.body });
        const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
          method: "POST",
          headers: {
            Authorization: "Basic " + btoa(`${sid}:${tok}`),
            "Content-Type": "application/x-www-form-urlencoded",
          },
          body: params,
        });
        const json = await res.json();
        if (!res.ok) throw new Error(`twilio_${res.status}: ${JSON.stringify(json).slice(0, 300)}`);
        pipe_used = "twilio";
        vendor_message_id = json?.sid ?? null;
        status = "sent";
      } else {
        // SMS not yet available for this tenant (Twilio A2P not approved).
        throw new Error("no_sms_pipe_available");
      }
    }
  } catch (e) {
    errorText = (e as Error).message.slice(0, 500);
    status = "failed";
  }

  const { data: auditRow } = await admin
    .from("paige_messages_audit")
    .insert({
      channel: body.channel,
      pipe_used,
      to_address: body.to,
      from_address: fromAddress,
      subject: body.subject,
      body: body.body,
      status,
      vendor_message_id,
      error: errorText,
      contact_id: body.contact_id ?? null,
      conversation_id: body.conversation_id ?? null,
      sent_at: status === "sent" ? new Date().toISOString() : null,
    })
    .select("id")
    .single();

  if (status === "sent" && body.conversation_id) {
    await admin.from("paige_conversations").insert({
      channel: body.channel,
      contact_id: body.contact_id ?? null,
      direction: "outbound",
      subject: body.subject,
      body: body.body,
      source_message_id: vendor_message_id,
      status: "replied",
      metadata: { audit_id: auditRow?.id, in_reply_to: body.conversation_id },
    });
    await admin.from("paige_conversations")
      .update({ status: "replied" })
      .eq("id", body.conversation_id);
  }

  if (body.approval_id) {
    await admin.from("paige_pending_approvals")
      .update({
        status: status === "sent" ? "approved" : "pending",
        reviewed_by_user_id: user.id,
        reviewed_at: new Date().toISOString(),
        sent_at: status === "sent" ? new Date().toISOString() : null,
        sent_message_audit_id: auditRow?.id ?? null,
      })
      .eq("id", body.approval_id);
  }

  return new Response(
    JSON.stringify({
      audit_id: auditRow?.id,
      vendor_message_id,
      pipe_used,
      status,
      error: errorText,
    }),
    {
      // Always 200 so the client surfaces our structured { status, error } payload
      // instead of getting a generic "Edge Function returned non-2xx" error.
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    },
  );
});

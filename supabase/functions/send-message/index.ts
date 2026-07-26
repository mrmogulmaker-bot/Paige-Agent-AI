// Unified send dispatcher — routes email via Resend, SMS via Twilio.
// SMS is a tenant-configurable channel: it sends only when the tenant's Twilio
// A2P registration is approved (config.twilio_a2p_status). Email is the default.
// Writes every send to paige_messages_audit and mirrors outbound to paige_conversations.
//
// Comms C-1 (§18/§32): email now routes THROUGH the shared channel-adapter registry
// (_shared/channel-adapters.ts) — an email OutboundChannelAdapter is registered here
// and invoked via getOutboundAdapter("email"), so the abstraction is exercised live,
// not merely compiled. On a successful send this also writes/patches the tenant-isolated
// public.messages row (the NormalizedMessage unified-inbox substrate) to status='sent'
// + provider_message_id — INSERT a fresh outbound row for a direct send, or UPDATE the
// existing draft row when an approved draft (message_id) is being sent. Idempotent on
// provider_message_id. The legacy paige_messages_audit write + paige_conversations
// mirror + JWT gate + SMS path are all preserved unchanged (§37 additive-only).
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  getOutboundAdapter,
  registerOutboundAdapter,
  type NormalizedMessage,
  type OutboundChannelAdapter,
  type OutboundSendContext,
} from "../_shared/channel-adapters.ts";

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
  // ── Comms C-1 additive fields (all optional; legacy callers omit them) ──
  // When present, patch this existing draft messages row to 'sent' instead of
  // inserting a fresh outbound row (the one-click Approve → send flow).
  message_id?: string;
  // Unified-inbox linkage for a fresh outbound row (tenant is still server-derived
  // by the messages trigger from connector_id/contact_id — never from the body, §9).
  connector_id?: string;
  thread_key?: string;
}

// -----------------------------------------------------------------------------
// §32 — register the EMAIL outbound adapter (Resend) into the shared registry, then
// send THROUGH it. C-2..C-5 register sms/whatsapp/etc. against the same contract.
// -----------------------------------------------------------------------------
const emailOutboundAdapter: OutboundChannelAdapter = {
  channel_type: "email",
  // Email has no session window / template / quiet-hours constraints.
  getSendConstraints() {
    return null;
  },
  async send(msg: NormalizedMessage, ctx: OutboundSendContext) {
    const resendKey = ctx.providerApiKey;
    if (!resendKey) {
      return { ok: false, status: "failed" as const, error: "RESEND_API_KEY missing" };
    }
    const name = ctx.from.display_name?.replace(/[<>",\r\n]/g, " ").replace(/\s+/g, " ").trim();
    const fromHeader = name ? `${name} <${ctx.from.address}>` : ctx.from.address;

    const headers: Record<string, string> = {};
    if (msg.in_reply_to_provider_id) headers["In-Reply-To"] = msg.in_reply_to_provider_id;

    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${resendKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: fromHeader,
        to: [ctx.to],
        reply_to: ctx.replyTo || undefined,
        subject: msg.subject || "(no subject)",
        html: msg.body_html || msg.body_text || "",
        headers: Object.keys(headers).length ? headers : undefined,
      }),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      return {
        ok: false,
        status: "failed" as const,
        error: `resend_${res.status}: ${JSON.stringify(json).slice(0, 300)}`,
      };
    }
    return { ok: true, status: "sent" as const, provider_message_id: json?.id ?? null };
  },
};
registerOutboundAdapter(emailOutboundAdapter);

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

  // ── Resolve the tenant + connector + sender identity (§9/§38) BEFORE the send ──
  // Tenant is derived from known, tenant-scoped rows in priority order:
  //   1. the existing draft messages row (message_id), 2. the contact (contact_id),
  //   3. the connector (connector_id). Never from the request body directly.
  // Sender identity: tenant_sender_identity() RPC is PRIMARY (§38 tenant-owned);
  // the channel_connectors row (from_address/from_name/reply_to) is the fallback;
  // the platform default sender is the last resort. This never forks §38.
  let tenantId: string | null = null;
  let draftRow: { status?: string | null; connector_id?: string | null; contact_id?: string | null; thread_key?: string | null; channel_type?: string | null } | null = null;
  let connectorRow:
    | { tenant_id?: string | null; from_address?: string | null; from_name?: string | null; reply_to?: string | null }
    | null = null;
  let replyTo: string | null = null;

  if (body.message_id) {
    const { data } = await admin
      .from("messages")
      .select("tenant_id, status, connector_id, contact_id, thread_key, channel_type")
      .eq("id", body.message_id)
      .maybeSingle();
    if (data) {
      draftRow = data;
      tenantId = data.tenant_id ?? null;
    }
  }
  const effectiveContactId = body.contact_id ?? draftRow?.contact_id ?? null;
  const effectiveConnectorId = body.connector_id ?? draftRow?.connector_id ?? null;

  if (!tenantId && effectiveContactId) {
    const { data: contactRow } = await admin
      .from("clients")
      .select("tenant_id")
      .eq("id", effectiveContactId)
      .maybeSingle();
    tenantId = contactRow?.tenant_id ?? null;
  }
  if (effectiveConnectorId) {
    const { data } = await admin
      .from("channel_connectors")
      .select("tenant_id, from_address, from_name, reply_to")
      .eq("id", effectiveConnectorId)
      .maybeSingle();
    connectorRow = data ?? null;
    if (!tenantId) tenantId = connectorRow?.tenant_id ?? null;
  }

  // ── §9 caller-tenant gate — BEFORE any send ──────────────────────────────────
  // tenantId above is resolved from body-referenced rows via the SERVICE-ROLE client
  // (RLS bypassed), and has_role (L116-118) is GLOBAL — so without this bind a
  // tenant-A admin/coach could pass a tenant-B message_id / contact_id / connector_id
  // and send UNDER TENANT B's verified sender identity (tenant_sender_identity below)
  // and write into B's inbox. Require the resolved tenant to equal the caller's own
  // (JWT-scoped current_user_tenant_id); the platform owner (God) may act cross-tenant
  // (§17). This is the same gate the comms.outbound rail block already applies — hoisted
  // to cover the actual SEND, not just telemetry.
  const { data: callerTenant } = await userClient.rpc("current_user_tenant_id");
  const { data: isOwner } = await userClient.rpc("is_platform_owner");
  if (tenantId && !isOwner && tenantId !== callerTenant) {
    return new Response(JSON.stringify({ error: "forbidden_cross_tenant" }), {
      status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  // Pin a context-free send (no tenant-bearing ref) to the caller's own tenant so its
  // sender identity is the caller's — never a blank that widens. A platform owner with
  // no active tenant keeps null → platform default sender.
  if (!tenantId && !isOwner) tenantId = callerTenant ?? null;

  // ── §5 double-submit guard ───────────────────────────────────────────────────
  // Approving an already sent/queued draft (second tab, stale realtime, network retry)
  // must NOT re-fire the provider — each provider send mints a fresh provider_message_id
  // so the unique index cannot dedupe a true double-delivery. Short-circuit idempotently.
  if (body.message_id && draftRow &&
      (draftRow.status === "sent" || draftRow.status === "queued")) {
    return new Response(
      JSON.stringify({ status: "sent", message_id: body.message_id, deduped: true }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  try {
    if (body.channel === "email") {
      const resendKey = Deno.env.get("RESEND_API_KEY");
      if (!resendKey) throw new Error("RESEND_API_KEY missing");

      // §38 PRIMARY: tenant-owned sender identity via the shared RPC (service role =>
      // auth.uid() NULL => trusted cross-tenant resolve of the passed tenant).
      let senderName: string | null = null;
      let senderEmail: string | null = null;
      const { data: ident } = await admin.rpc("tenant_sender_identity", { _tenant_id: tenantId });
      const identRow = (ident ?? null) as
        | { from_name?: string | null; from_address?: string | null; reply_to?: string | null }
        | null;
      if (identRow) {
        senderName = identRow.from_name ?? null;
        senderEmail = identRow.from_address ?? null;
        replyTo = identRow.reply_to ?? null;
      }
      // Fallback/override: the connector's own sender identity, then the platform default.
      senderName = senderName || connectorRow?.from_name || config?.default_from_name || "Paige Agent";
      // Last-resort fallback on the VERIFIED sending subdomain (Tier 1 #64) — the bare
      // apex is not a confirmed Resend sending domain. Post-migration the RPC always
      // returns the tenant's <slug>@mail.paigeagent.ai, so a hardcoded fallback only
      // fires on an RPC miss; keep it verified so it can still deliver.
      senderEmail = senderEmail || connectorRow?.from_address || config?.default_from_email || "no-reply@mail.paigeagent.ai";
      replyTo = replyTo || connectorRow?.reply_to || null;
      fromAddress = senderName ? `${senderName} <${senderEmail}>` : senderEmail;

      // §32 — build the NormalizedMessage and send THROUGH the registry adapter.
      const adapter = getOutboundAdapter("email");
      if (!adapter) throw new Error("no_email_adapter_registered");
      const outMsg: NormalizedMessage = {
        thread_key: body.thread_key || draftRow?.thread_key || `email:${body.to}`,
        channel_type: "email",
        direction: "outbound",
        status: "queued",
        contact_id: effectiveContactId,
        connector_id: effectiveConnectorId,
        sender: { address: senderEmail, display_name: senderName ?? undefined },
        recipients: [{ address: body.to }],
        subject: body.subject ?? null,
        body_html: body.body,
        in_reply_to_provider_id: body.in_reply_to ?? null,
      };
      const ctx: OutboundSendContext = {
        from: { address: senderEmail, display_name: senderName ?? undefined },
        to: body.to,
        replyTo,
        providerApiKey: resendKey,
        connectorConfig: null,
      };
      const delivery = await adapter.send(outMsg, ctx);
      pipe_used = "resend";
      if (!delivery.ok) throw new Error(delivery.error || "resend_send_failed");
      vendor_message_id = delivery.provider_message_id ?? null;
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

  // ── Comms C-1 (§10) — write/patch the tenant-isolated public.messages row so the
  // unified inbox reflects the send. On success: UPDATE the draft (message_id) → sent,
  // or INSERT a fresh outbound sent row (tenant server-derived by the messages trigger
  // from connector_id/contact_id — the body is never trusted, §9). Idempotent on
  // provider_message_id. On failure with a known draft, mark it failed so the queue
  // (§36) surfaces the miss. Telemetry-safe: wrapped so a messages-write hiccup can
  // NEVER change the { status, error } payload this function returns to existing callers.
  let messageRowId: string | null = null;
  try {
    if (status === "sent") {
      if (body.message_id) {
        const { data: updated } = await admin
          .from("messages")
          .update({
            status: "sent",
            provider_message_id: vendor_message_id,
            in_reply_to_provider_id: body.in_reply_to ?? undefined,
            error: null,
            sent_at: new Date().toISOString(),
          })
          .eq("id", body.message_id)
          .select("id")
          .maybeSingle();
        messageRowId = updated?.id ?? body.message_id;
      } else if (effectiveContactId || effectiveConnectorId) {
        // Idempotency guard: a retried send with the same provider id must not double-insert.
        let existingId: string | null = null;
        if (vendor_message_id) {
          const { data: existing } = await admin
            .from("messages")
            .select("id")
            .eq("provider_message_id", vendor_message_id)
            .maybeSingle();
          existingId = existing?.id ?? null;
        }
        if (existingId) {
          messageRowId = existingId;
        } else {
          const { data: inserted } = await admin
            .from("messages")
            .insert({
              // tenant_id intentionally OMITTED — set_message_tenant() derives it from
              // connector_id → contact_id (§9). Requires one of them to be present,
              // which the branch condition guarantees.
              thread_key: body.thread_key || `${body.channel}:${body.to}`,
              contact_id: effectiveContactId,
              connector_id: effectiveConnectorId,
              channel_type: body.channel,
              direction: "outbound",
              status: "sent",
              sender: fromAddress
                ? { address: (fromAddress.match(/<([^>]+)>/)?.[1] ?? fromAddress) }
                : null,
              recipients: [{ address: body.to }],
              subject: body.subject ?? null,
              body_html: body.channel === "email" ? body.body : null,
              body_text: body.channel === "email" ? null : body.body,
              provider_message_id: vendor_message_id,
              in_reply_to_provider_id: body.in_reply_to ?? null,
              sent_at: new Date().toISOString(),
              meta: { source: "send-message", pipe_used },
            })
            .select("id")
            .maybeSingle();
          messageRowId = inserted?.id ?? null;
        }
      }
    } else if (body.message_id) {
      const { data: failed } = await admin
        .from("messages")
        .update({ status: "failed", error: errorText })
        .eq("id", body.message_id)
        .select("id")
        .maybeSingle();
      messageRowId = failed?.id ?? body.message_id;
    }
  } catch (e) {
    console.warn("[send-message] messages row write skipped:", (e as Error)?.message);
  }

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

  // ── Paige Context Rail — COMMS emitter: file 'comms.outbound' after a message
  // actually SENDS to a client, so the OWNER rail AND the client's OWN live feed
  // both reflect the two-way conversation in real time (§7/§8). comms.outbound is a
  // client_visible kind → record_rail_event reaches both the client feed and the
  // owner rail. Truthful (§13): gated on status === "sent" only — a fire is not a
  // delivery, and a failed send never files a comms event. Telemetry ONLY: the whole
  // block is wrapped so a rail failure can NEVER affect message delivery or the
  // structured { status, error } payload this function returns. Contact resolution:
  // an explicit body.contact_id wins; otherwise we resolve the to-address WITHIN THE
  // CALLER'S TENANT via the JWT-scoped resolver (userClient carries the caller's JWT,
  // so auth.uid() is set and resolve_contact_id scopes to current_user_tenant_id() —
  // no cross-tenant match, §9). If no contact resolves we SKIP rather than fabricate
  // one (§13). We then read that contact's tenant to pass p_tenant_id on the
  // service-role record_rail_event call (auth.uid() is NULL there).
  if (status === "sent") {
    try {
      // Resolve the caller's own tenant once (JWT-scoped). An explicitly-supplied
      // body.contact_id is only trusted if it belongs to THIS tenant — otherwise a
      // caller in tenant A could pass tenant B's contact id and file comms.outbound
      // onto B's owner rail AND B's client-visible feed (§9). The resolver-fallback
      // path below is already scoped to the caller via userClient's JWT, so it can
      // only ever return an in-tenant contact. (callerTenant is resolved once above,
      // at the pre-send §9 gate, and reused here.)
      let railContactId: string | null = body.contact_id ?? null;
      if (!railContactId) {
        const { data: resolved } = await userClient.rpc("resolve_contact_id", {
          p_tenant: null,
          p_phone: body.channel === "sms" ? body.to : null,
          p_email: body.channel === "email" ? body.to : null,
          p_user_id: null,
        });
        railContactId = (typeof resolved === "string" && resolved) ? resolved : null;
      }
      if (railContactId) {
        const { data: contactRow } = await admin
          .from("clients")
          .select("tenant_id")
          .eq("id", railContactId)
          .maybeSingle();
        const tenantId = contactRow?.tenant_id ?? null;
        // §9 gate: the contact's tenant must match the caller's own tenant. This
        // catches a foreign explicit body.contact_id; the resolver path trivially
        // passes (same tenant). Skip (don't mis-file) on mismatch or unknown caller.
        if (tenantId && callerTenant && tenantId === callerTenant) {
          // Build a clean, jargon-free preview for BOTH channels: email bodies are
          // HTML, so strip tags (prefer the subject) before truncating so no markup
          // leaks into the feed summary (§3); SMS bodies are already plain text.
          const rawPreview = body.channel === "email" ? (body.subject || body.body) : body.body;
          const text = (rawPreview || "").replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
          const preview = text.length > 140 ? text.slice(0, 137) + "…" : text;
          await admin.rpc("record_rail_event", {
            p_contact_id: railContactId,
            p_event_kind: "comms.outbound",
            p_surface: "client_portal",
            p_actor_type: "paige_agent",
            p_title: "Message sent",
            p_summary: preview || null,
            p_ref_table: "paige_messages_audit",
            p_ref_id: auditRow?.id ?? null,
            p_from_department: "client_experience",
            p_tenant_id: tenantId,
          });
        }
      }
    } catch (e) {
      console.warn("[send-message] comms.outbound rail emit skipped:", (e as Error)?.message);
    }
  }

  return new Response(
    JSON.stringify({
      audit_id: auditRow?.id,
      vendor_message_id,
      pipe_used,
      status,
      error: errorText,
      // Additive (§37): the unified-inbox messages row id, when one was written/patched.
      message_id: messageRowId,
    }),
    {
      // Always 200 so the client surfaces our structured { status, error } payload
      // instead of getting a generic "Edge Function returned non-2xx" error.
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    },
  );
});

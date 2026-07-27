// =============================================================================
// Comms C-2s-C — TENANT email unsubscribe handler (List-Unsubscribe one-click + link).
// =============================================================================
// EXTENDS the pattern of handle-email-unsubscribe, but writes to the TENANT-scoped
// public.paige_suppressions (the C-2 suppression store the pre-send gate reads),
// NOT the legacy GLOBAL public.suppressed_emails. This is the WRITER that closes the
// tenant email opt-out loop: send-message advertises a per-recipient one-click URL in
// the List-Unsubscribe header; when the recipient (or Gmail's RFC 8058 one-click POST)
// hits this endpoint, we record a real tenant-scoped suppression row.
//
// §9  Tenant is SERVER-AUTHORITATIVE and derived from the TOKEN RECORD, never from a
//     query param. The paige_suppressions BEFORE-INSERT trigger (set_contact_scoped_tenant)
//     resolves tenant_id from the row's contact_id -> clients.tenant_id. So we insert WITH
//     the token's contact_id and let the trigger set the tenant — the recipient can never
//     steer which tenant they are suppressed for.
// §13 Honesty: a POST writes a REAL suppression row (or reports why it could not); we never
//     mark the token used unless the suppression actually landed, and never claim an opt-out
//     that did not persist. Idempotent — a repeat one-click is a success, not an error (§37).
// §2  Coaching-generic recipient copy. Zero finance/credit vocabulary. reason='unsubscribe_link'.
// §18 One suppression store (paige_suppressions); one token store (email_unsubscribe_tokens) —
//     no second store invented.
//
// AUTH: verify_jwt=false (recipients are unauthenticated). This endpoint is NOT a Twilio
// webhook, so no x-twilio-signature applies — the security control is the single-use,
// unguessable 32-byte hashed token (same model as handle-email-unsubscribe). State the
// exact config.toml entry in the report; do NOT edit config.toml here.
// =============================================================================

import { createClient } from "npm:@supabase/supabase-js@2";
// §18 one home: reuse the SAME address normalizer the pre-send gate keys on, so a
// suppression written here matches what runPreSend looks up (verifier F3 — a raw
// toLowerCase() left "jane+news@x.com" un-folded and the gate never matched it).
import { normalizeEmail } from "../_shared/pre-send-pipeline.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function jsonResponse(data: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// Minimal coaching-generic confirm page (§2). Shown when a human opens the one-click URL
// directly in a browser (GET, Accept: text/html). The button self-POSTs the token back.
function htmlPage(title: string, message: string, form?: string): Response {
  const body = `<!doctype html><html lang="en"><head><meta charset="utf-8">` +
    `<meta name="viewport" content="width=device-width, initial-scale=1">` +
    `<title>${title}</title></head>` +
    `<body style="font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;` +
    `background:#0f0f1a;color:#e8e8f0;display:flex;min-height:100vh;margin:0;` +
    `align-items:center;justify-content:center;padding:24px">` +
    `<div style="max-width:440px;text-align:center">` +
    `<h1 style="font-size:1.25rem;font-weight:650;margin:0 0 12px">${title}</h1>` +
    `<p style="line-height:1.55;color:#b8b8c8;margin:0 0 20px">${message}</p>` +
    (form ?? "") +
    `</div></body></html>`;
  return new Response(body, {
    status: 200,
    headers: { ...corsHeaders, "Content-Type": "text/html; charset=utf-8" },
  });
}

async function sha256Hex(input: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

// Token record shape. contact_id/tenant_id are the C-2s-C additive columns the send-message
// mint side writes so tenant is derivable server-side (§9). Selected defensively so this
// function does not hard-fail if a legacy row predates the columns.
interface TokenRecord {
  id?: string;
  email: string;
  used_at: string | null;
  contact_id?: string | null;
  tenant_id?: string | null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "GET" && req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !supabaseServiceKey) {
    return jsonResponse({ error: "Server configuration error" }, 500);
  }

  const url = new URL(req.url);
  let token: string | null = url.searchParams.get("token");

  // RFC 8058 one-click: Gmail POSTs `List-Unsubscribe=One-Click` (form-encoded) with the
  // token still on the query string. A browser-form POST from the confirm page carries the
  // token in the form body. A JSON caller (SPA) carries it in the JSON body.
  if (req.method === "POST") {
    const contentType = req.headers.get("content-type") ?? "";
    if (contentType.includes("application/x-www-form-urlencoded")) {
      const params = new URLSearchParams(await req.text());
      const formToken = params.get("token");
      if (formToken) token = formToken;
    } else if (contentType.includes("application/json")) {
      try {
        const b = await req.json();
        if (b?.token) token = String(b.token);
      } catch { /* ignore */ }
    }
  }

  if (!token) return jsonResponse({ error: "Token is required" }, 400);

  const wantsHtml = (req.headers.get("accept") ?? "").includes("text/html");
  const supabase = createClient(supabaseUrl, supabaseServiceKey);
  const tokenHash = await sha256Hex(token);

  const { data: rec, error: lookupError } = await supabase
    .from("email_unsubscribe_tokens")
    .select("id, email, used_at, contact_id, tenant_id")
    .eq("token_hash", tokenHash)
    .maybeSingle();

  if (lookupError || !rec) {
    if (wantsHtml && req.method === "GET") {
      return htmlPage("Link expired", "This unsubscribe link is invalid or has expired.");
    }
    return jsonResponse({ error: "Invalid or expired token" }, 404);
  }
  const tokenRecord = rec as TokenRecord;

  if (tokenRecord.used_at) {
    if (wantsHtml && req.method === "GET") {
      return htmlPage("Already unsubscribed", "You're already unsubscribed from these emails. No further action is needed.");
    }
    return jsonResponse({ valid: false, reason: "already_unsubscribed" });
  }

  // GET → validate + confirm (no state change).
  if (req.method === "GET") {
    if (wantsHtml) {
      const action = `${supabaseUrl}/functions/v1/comms-email-unsubscribe?token=${encodeURIComponent(token)}`;
      const form =
        `<form method="POST" action="${action}">` +
        // Neutral indigo, NOT gold — opting out is not an act/approve/on moment (§11 gold budget).
        // Standalone email-client page outside the design system, so a literal hex is acceptable here.
        `<button type="submit" style="background:#4f46e5;color:#ffffff;border:0;` +
        `border-radius:10px;padding:12px 22px;font-size:1rem;font-weight:650;cursor:pointer">` +
        `Unsubscribe</button></form>`;
      return htmlPage("Unsubscribe", "Click below to stop receiving these emails.", form);
    }
    return jsonResponse({ valid: true });
  }

  // POST → suppress THEN mark used (§13: never consume the token unless the opt-out landed).
  // Key on the SAME normalizer the pre-send gate uses (folds +tag) so the write matches (F3).
  const normalizedEmail = normalizeEmail(tokenRecord.email);

  // §9: insert WITH contact_id so the BEFORE-INSERT trigger (set_contact_scoped_tenant)
  // derives tenant_id from clients — tenant is authoritative from the token record, never a
  // param. We ALSO pass the token's tenant_id explicitly: for a CONTACTLESS token (no
  // contact_id) the trigger's contact/session lookups are both null under service-role, so
  // the explicit tenant_id is the only way the row lands (F2 — the trigger now honors it as
  // its final fallback). address_normalized is set so the pre-send gate matches a contactless send.
  const suppressionRow: Record<string, unknown> = {
    channel: "email",
    reason: "unsubscribe_link",
    // Closest existing source enum value. The recipient/one-click POST is an external
    // request hitting our endpoint (RFC 8058), so 'webhook' is the nearest fit; the enum
    // has no 'unsubscribe_link'/'recipient' source. Reported as an imperfect match.
    source: "webhook",
    address_normalized: normalizedEmail,
    contact_id: tokenRecord.contact_id ?? null,
    tenant_id: tokenRecord.tenant_id ?? null,
  };

  const { error: suppressError } = await supabase
    .from("paige_suppressions")
    .insert(suppressionRow);

  // Idempotent: a repeat one-click hits the unique (tenant, channel, recipient) index — that
  // is a SUCCESS (already opted out), never an error (§37 — the writer must not throw on repeat).
  const isDuplicate = suppressError?.code === "23505";

  if (suppressError && !isDuplicate) {
    // The one contactless-service-role failure mode: no contact_id on the token means the
    // trigger cannot derive a tenant (session tenant is null under service role) and RAISES.
    // Report it honestly and leave the token UNUSED so the opt-out is not silently lost.
    console.error("comms-email-unsubscribe: suppression insert failed (token left unused)", {
      code: suppressError.code,
      message: suppressError.message,
      has_contact_id: Boolean(tokenRecord.contact_id),
    });
    if (wantsHtml) {
      return htmlPage("Something went wrong", "We couldn't process your request just now. Please try again shortly.");
    }
    return jsonResponse({ error: "Failed to process unsubscribe", reason: "suppression_not_recorded" }, 500);
  }

  // Suppression landed (or already existed) → now consume the token.
  const { error: markError } = await supabase
    .from("email_unsubscribe_tokens")
    .update({ used_at: new Date().toISOString() })
    .eq("token_hash", tokenHash)
    .is("used_at", null);

  if (markError) {
    // The suppression IS recorded (the compliance-critical write). Failing to stamp the token
    // is non-fatal and self-heals on the next hit (already_unsubscribed / duplicate). Log only.
    console.warn("comms-email-unsubscribe: suppression recorded but token mark-used failed", {
      code: markError.code,
      message: markError.message,
    });
  }

  if (wantsHtml) {
    return htmlPage("You're unsubscribed", "You've been unsubscribed and will no longer receive these emails.");
  }
  return jsonResponse({ success: true, already: isDuplicate });
});

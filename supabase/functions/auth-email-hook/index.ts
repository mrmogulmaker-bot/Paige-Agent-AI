// Supabase Auth "Send Email Hook" — native + tenant-aware.
//
// Fires for every transactional auth email (signup confirm, magic link,
// password recovery, team invite, email change). Resolves the signing-up
// user's TENANT, loads that tenant's branding + sending identity + email
// provider, renders the generic branded shell, and sends it. No tenant is
// hardcoded (Doctrine §200); an unresolved/unbranded tenant falls back to the
// neutral platform default on the platform Resend account (master tenant).
//
// Replaces the previous Lovable-coupled hook (@lovable.dev/* + Lovable email
// API). Verification is now Standard Webhooks; sending is the pluggable
// provider layer in _shared/email/.
//
// Enable: Supabase Dashboard → Authentication → Hooks → "Send Email" →
//   URI  = https://<ref>.supabase.co/functions/v1/auth-email-hook
//   Secret → set as function secret SEND_EMAIL_HOOK_SECRET (format v1,whsec_…)
// Required secrets: SEND_EMAIL_HOOK_SECRET, RESEND_API_KEY.

import { Webhook } from "https://esm.sh/standardwebhooks@1.0.0";
import { createClient } from "npm:@supabase/supabase-js@2";
import { resolveTenantEmailContext } from "../_shared/email/branding.ts";
import { authEmailContent, renderAuthEmail } from "../_shared/email/shell.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const HOOK_SECRET = Deno.env.get("SEND_EMAIL_HOOK_SECRET") ?? "";

const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

type SendEmailPayload = {
  user: { id: string; email: string; user_metadata?: Record<string, unknown> | null };
  email_data: {
    token: string;
    token_hash: string;
    redirect_to: string;
    email_action_type: string;
    site_url: string;
    token_hash_new?: string;
    email_action_type_new?: string;
  };
};

// Build the Supabase verify URL from the hook payload (per Supabase docs).
function confirmationUrl(d: SendEmailPayload["email_data"]): string {
  const base = `${SUPABASE_URL}/auth/v1/verify`;
  const params = new URLSearchParams({
    token: d.token_hash,
    type: d.email_action_type,
    redirect_to: d.redirect_to,
  });
  return `${base}?${params.toString()}`;
}

// Resolve the signing-up user's tenant WITHOUT hardcoding anything:
//   1. signup metadata (set by the tenant's signup surface, when present)
//   2. the user's primary tenant membership
//   3. the tenant stamped on their auto-created clients row (covers fresh
//      signups that don't yet have a tenant_members row)
// Returns null → neutral platform default branding.
async function resolveTenantId(user: SendEmailPayload["user"]): Promise<string | null> {
  const metaTenant = (user.user_metadata?.tenant_id as string | undefined) ?? null;
  if (metaTenant) return metaTenant;

  const { data: primary } = await admin.rpc("get_user_primary_tenant", { _user_id: user.id });
  const ctx = Array.isArray(primary) ? primary[0] : primary;
  if (ctx?.tenant_id) return ctx.tenant_id as string;

  const { data: client } = await admin
    .from("clients")
    .select("tenant_id")
    .eq("linked_user_id", user.id)
    .not("tenant_id", "is", null)
    .maybeSingle();
  return (client?.tenant_id as string | null) ?? null;
}

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "method_not_allowed" }), { status: 405 });
  }

  const raw = await req.text();

  // ---- Verify the Standard Webhooks signature ----
  if (!HOOK_SECRET) {
    console.error("[auth-email-hook] SEND_EMAIL_HOOK_SECRET not set");
    return new Response(JSON.stringify({ error: "hook_secret_not_configured" }), { status: 500 });
  }
  let payload: SendEmailPayload;
  try {
    // Supabase presents the secret as "v1,whsec_<base64>"; standardwebhooks
    // wants the "whsec_<base64>" portion.
    const secret = HOOK_SECRET.replace(/^v1,/, "");
    const wh = new Webhook(secret);
    payload = wh.verify(raw, Object.fromEntries(req.headers)) as SendEmailPayload;
  } catch (e) {
    console.error("[auth-email-hook] signature verification failed", (e as Error).message);
    return new Response(JSON.stringify({ error: "invalid_signature" }), { status: 401 });
  }

  const actionType = payload.email_data.email_action_type;
  const recipient = payload.user.email;

  try {
    const tenantId = await resolveTenantId(payload.user);
    const { branding, provider } = await resolveTenantEmailContext(admin, tenantId);

    const content = authEmailContent(actionType, branding.brandName, recipient);
    const html = renderAuthEmail(branding, content, confirmationUrl(payload.email_data));

    const result = await provider.send({
      from: branding.from,
      to: recipient,
      subject: content.subject,
      html,
      replyTo: branding.supportEmail ?? undefined,
      headers: { "X-Entity-Ref-ID": crypto.randomUUID() },
    });

    // Best-effort delivery log (table may not exist on every tenant DB).
    try {
      await admin.from("email_send_log").insert({
        message_id: result.id ?? crypto.randomUUID(),
        template_name: `auth_${actionType}`,
        recipient_email: recipient,
        status: result.ok ? "sent" : "failed",
        error_message: result.ok ? null : result.error,
      });
    } catch { /* logging is non-critical */ }

    if (!result.ok) {
      console.error("[auth-email-hook] send failed", { actionType, error: result.error });
      return new Response(JSON.stringify({ error: result.error ?? "send_failed" }), { status: 500 });
    }

    return new Response(JSON.stringify({ success: true, provider: result.provider }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("[auth-email-hook] handler error", (e as Error).message);
    return new Response(JSON.stringify({ error: (e as Error).message }), { status: 500 });
  }
});

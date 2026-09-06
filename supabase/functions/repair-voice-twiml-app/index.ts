// Staged hotfix helper: repair exactly one explicitly targeted TwiML Application
// before voice-twiml begins requiring cryptographic webhook proof. Internal callers
// only; responses never include tenant ids, phone numbers, URLs, secrets, or payloads.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { deriveOperatorVoiceWebhookSecret } from "../_shared/operator-twilio.ts";
import {
  ensureTwimlApp,
  masterCreds,
  resolveTwilioCreds,
  twilioRequest,
  voiceTwimlUrl,
  type SupabaseAdminLike,
} from "../_shared/twilio.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

async function isInternal(req: Request): Promise<boolean> {
  const bearer = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
  if (bearer && bearer === SERVICE_ROLE_KEY) return true;
  const cronToken = req.headers.get("x-cron-token") ?? "";
  if (!cronToken) return false;
  const { data, error } = await admin.rpc("verify_cron_token", { _token: cronToken });
  return !error && data === true;
}

type IncomingVoiceRepairResult = { ok: true } | { ok: false; status: number; error: string };

async function repairTenantIncomingVoiceNumbers(
  tenantId: string,
  applicationSid: string,
): Promise<IncomingVoiceRepairResult> {
  const creds = await resolveTwilioCreds(admin as unknown as SupabaseAdminLike, tenantId);
  if (!creds.ok || !creds.data) return { ok: false, status: creds.status, error: "credentials_unavailable" };

  const { data, error } = await admin
    .from("tenant_phone_numbers")
    .select("twilio_sid,capabilities")
    .eq("tenant_id", tenantId)
    .eq("status", "active");
  if (error) return { ok: false, status: 0, error: "number_lookup_failed" };

  const { data: subaccount, error: secretError } = await admin
    .from("tenant_twilio_subaccounts")
    .select("inbound_webhook_secret")
    .eq("tenant_id", tenantId)
    .maybeSingle();
  const bareUrl = voiceTwimlUrl(null);
  const stampedUrl = voiceTwimlUrl(subaccount?.inbound_webhook_secret ?? null);
  if (secretError || !bareUrl || !stampedUrl) {
    return { ok: false, status: 0, error: "voice_url_unavailable" };
  }

  for (const row of data ?? []) {
    if (row?.capabilities?.voice !== true) continue;
    if (!/^PN[0-9A-Za-z]{16,}$/.test(row.twilio_sid ?? "")) {
      return { ok: false, status: 409, error: "number_provider_binding_missing" };
    }
    const path = `/2010-04-01/Accounts/${encodeURIComponent(creds.data.accountSid)}/IncomingPhoneNumbers/${encodeURIComponent(row.twilio_sid)}.json`;
    const current = await twilioRequest(
      creds.data.accountSid, creds.data.authToken, path, "GET", undefined, creds.data.apiKeySid,
    );
    if (!current.ok) return { ok: false, status: current.status, error: "number_read_failed" };
    const provider = (current.data ?? {}) as Record<string, unknown>;
    const currentApplication = typeof provider.voice_application_sid === "string" ? provider.voice_application_sid : "";
    const currentUrl = typeof provider.voice_url === "string" ? provider.voice_url : "";
    if (currentApplication === applicationSid) continue;
    if (currentApplication) return { ok: false, status: 409, error: "custom_voice_application" };
    if (!currentUrl) continue;
    let currentBase = "";
    try {
      const parsed = new URL(currentUrl);
      parsed.searchParams.delete("t");
      currentBase = parsed.toString();
    } catch {
      return { ok: false, status: 409, error: "custom_voice_url" };
    }
    if (currentBase !== new URL(bareUrl).toString()) {
      return { ok: false, status: 409, error: "custom_voice_url" };
    }
    const updated = await twilioRequest(
      creds.data.accountSid,
      creds.data.authToken,
      path,
      "POST",
      { VoiceUrl: stampedUrl, VoiceMethod: "POST", VoiceApplicationSid: "" },
      creds.data.apiKeySid,
    );
    if (!updated.ok) return { ok: false, status: updated.status, error: "number_repair_failed" };
  }
  return { ok: true };
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);
  if (!(await isInternal(req))) return json({ error: "unauthorized" }, 401);
  const body = await req.json().catch(() => ({})) as { scope?: unknown; tenant_id?: unknown };

  if (body.scope === "tenant") {
    const tenantId = typeof body.tenant_id === "string" ? body.tenant_id : "";
    if (!/^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(tenantId)) return json({ error: "invalid_target" }, 400);
    const result = await ensureTwimlApp(admin as unknown as SupabaseAdminLike, tenantId, { forceRepair: true });
    if (!result.ok || !result.data) {
      console.error("[repair-voice-twiml-app] tenant repair failed", {
        status: result.status,
        needsConfig: result.needs_config === true,
      });
      return json({ ok: false, scope: "tenant", error: "repair_failed" }, 502);
    }
    const incoming = await repairTenantIncomingVoiceNumbers(tenantId, result.data.applicationSid);
    if (!incoming.ok) {
      console.error("[repair-voice-twiml-app] tenant incoming-number repair failed", {
        status: incoming.status,
        category: incoming.error,
      });
      return json({ ok: false, scope: "tenant", error: "repair_failed" }, incoming.status === 409 ? 409 : 502);
    }
    return json({ ok: true, scope: "tenant", repaired: true });
  }

  if (body.scope === "operator") {
    const appSid = Deno.env.get("TWILIO_OPERATOR_TWIML_APP_SID") ?? "";
    const master = masterCreds();
    const proof = await deriveOperatorVoiceWebhookSecret();
    if (!appSid || !master || !proof) return json({ ok: false, scope: "operator", error: "not_configured" }, 409);
    const url = voiceTwimlUrl(proof);
    if (!url) return json({ ok: false, scope: "operator", error: "not_configured" }, 409);
    const result = await twilioRequest(
      master.accountSid,
      master.authToken,
      `/2010-04-01/Accounts/${encodeURIComponent(master.accountSid)}/Applications/${encodeURIComponent(appSid)}.json`,
      "POST",
      { VoiceUrl: url, VoiceMethod: "POST" },
      master.apiKeySid,
    );
    if (!result.ok) {
      console.error("[repair-voice-twiml-app] operator repair failed", { status: result.status });
      return json({ ok: false, scope: "operator", error: "repair_failed" }, 502);
    }
    return json({ ok: true, scope: "operator", repaired: true });
  }

  return json({ error: "invalid_scope" }, 400);
});

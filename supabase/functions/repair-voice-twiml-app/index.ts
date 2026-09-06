// Staged hotfix helper: repair exactly one explicitly targeted TwiML Application
// before voice-twiml begins requiring cryptographic webhook proof. Internal callers
// only; responses never include tenant ids, phone numbers, URLs, secrets, or payloads.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { deriveOperatorVoiceWebhookSecret } from "../_shared/operator-twilio.ts";
import {
  ensureTwimlApp,
  masterCreds,
  twilioRequest,
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

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);
  if (!(await isInternal(req))) return json({ error: "unauthorized" }, 401);
  const body = await req.json().catch(() => ({})) as { scope?: unknown; tenant_id?: unknown };

  if (body.scope === "tenant") {
    const tenantId = typeof body.tenant_id === "string" ? body.tenant_id : "";
    if (!/^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(tenantId)) return json({ error: "invalid_target" }, 400);
    const result = await ensureTwimlApp(admin as unknown as SupabaseAdminLike, tenantId, { forceRepair: true });
    if (!result.ok) {
      console.error("[repair-voice-twiml-app] tenant repair failed", {
        status: result.status,
        needsConfig: result.needs_config === true,
      });
      return json({ ok: false, scope: "tenant", error: "repair_failed" }, 502);
    }
    return json({ ok: true, scope: "tenant", repaired: true });
  }

  if (body.scope === "operator") {
    const appSid = Deno.env.get("TWILIO_OPERATOR_TWIML_APP_SID") ?? "";
    const master = masterCreds();
    const proof = await deriveOperatorVoiceWebhookSecret();
    if (!appSid || !master || !proof) return json({ ok: false, scope: "operator", error: "not_configured" }, 409);
    const url = new URL(`${SUPABASE_URL.replace(/\/+$/, "")}/functions/v1/voice-twiml`);
    url.searchParams.set("t", proof);
    const result = await twilioRequest(
      master.accountSid,
      master.authToken,
      `/2010-04-01/Accounts/${encodeURIComponent(master.accountSid)}/Applications/${encodeURIComponent(appSid)}.json`,
      "POST",
      { VoiceUrl: url.toString(), VoiceMethod: "POST" },
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

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.75.0";

const url = Deno.env.get("SUPABASE_URL")!;
const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const headers = { "Content-Type": "application/json" };
const reply = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers });
const rec = (value: unknown): Record<string, unknown> =>
  value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
const txt = (value: unknown) => typeof value === "string" ? value.trim() : "";
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const sid = (prefix: string, value: unknown) => new RegExp("^" + prefix + "[0-9a-f]{32}$", "i").test(txt(value));
const NUMBER_EVENT_STATUS: Record<string, "failed" | "pending" | "registered"> = {
  "com.twilio.messaging.compliance.number-registration.failed": "failed",
  "com.twilio.messaging.compliance.number-registration.pending": "pending",
  "com.twilio.messaging.compliance.number-registration.successful": "registered",
};
const safeFailure = (value: unknown) => txt(value)
  .replace(/\b(?:AC|SK|BU|BN|MG|PN)[0-9a-f]{32}\b/gi, "provider resource")
  .replace(/\+?\d[\d(). -]{7,}\d/g, "sensitive value").slice(0, 500);

async function digest(value: string) {
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(bytes)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}
function secureEqual(left: string, right: string) {
  if (left.length !== right.length) return false;
  let mismatch = 0;
  for (let index = 0; index < left.length; index += 1) mismatch |= left.charCodeAt(index) ^ right.charCodeAt(index);
  return mismatch === 0;
}

function basic(request: Request) {
  const raw = request.headers.get("Authorization") || "";
  if (!raw.startsWith("Basic ")) return null;
  try {
    const decoded = atob(raw.slice(6));
    const split = decoded.indexOf(":");
    if (split < 1) return null;
    return { registrationId: decoded.slice(0, split), secret: decoded.slice(split + 1) };
  } catch {
    return null;
  }
}

Deno.serve(async (request) => {
  if (request.method !== "POST") return reply(405, { error: "POST only" });
  const credentials = basic(request);
  if (!credentials || !uuid.test(credentials.registrationId) || credentials.secret.length < 32) {
    return reply(401, { error: "Unauthorized" });
  }

  const admin = createClient(url, serviceKey);
  const { data: registration } = await admin.from("tenant_a2p_registrations")
    .select("id,tenant_id,selected_phone_number_id,event_webhook_secret_hash")
    .eq("id", credentials.registrationId).maybeSingle();
  if (!registration?.event_webhook_secret_hash ||
      !secureEqual(await digest(credentials.secret), registration.event_webhook_secret_hash)) {
    return reply(401, { error: "Unauthorized" });
  }

  let payload: unknown;
  try { payload = await request.json(); } catch { return reply(400, { error: "Invalid JSON" }); }
  const events = Array.isArray(payload) ? payload.map(rec).slice(0, 100) : [];
  const [{ data: subaccount }, { data: number }] = await Promise.all([
    admin.from("tenant_twilio_subaccounts").select("twilio_subaccount_sid").eq("tenant_id", registration.tenant_id).eq("status", "active").maybeSingle(),
    admin.from("tenant_phone_numbers").select("id,twilio_sid").eq("id", registration.selected_phone_number_id).eq("tenant_id", registration.tenant_id).maybeSingle(),
  ]);
  if (!subaccount || !number || !sid("AC", subaccount.twilio_subaccount_sid) || !sid("PN", number.twilio_sid)) {
    return reply(409, { error: "Workspace sender is not configured" });
  }

  let accepted = 0;
  for (const event of events) {
    const eventId = txt(event.id);
    const eventType = txt(event.type);
    const data = rec(event.data);
    const status = NUMBER_EVENT_STATUS[eventType];
    if (!eventId || !status) continue;
    if (txt(data.accountsid) !== subaccount.twilio_subaccount_sid || txt(data.phonenumbersid) !== number.twilio_sid) continue;

    const occurred = Date.parse(txt(event.time));
    const { data: applied, error: applyError } = await admin.rpc("apply_tenant_a2p_number_event", {
      _registration_id: registration.id,
      _event_id: eventId,
      _event_type: eventType,
      _status: status,
      _failure_reason: status === "failed" ? safeFailure(data.failurereason || data.failureReason) : "",
      _occurred_at: Number.isNaN(occurred) ? null : new Date(occurred).toISOString(),
    });
    if (applyError) return reply(500, { error: "Event could not be recorded" });
    if (rec(applied).applied === true) accepted += 1;
  }
  return reply(200, { accepted });
});

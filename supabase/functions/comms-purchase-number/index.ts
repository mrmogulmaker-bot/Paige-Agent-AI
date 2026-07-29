// Comms C-2s-B — number MARKETPLACE purchase. JWT-gated; a tenant admin/coach buys a
// specific number into the tenant's OWN Twilio subaccount, then records it as a
// tenant_phone_numbers row (source='marketplace'). The tenant never touches Twilio (§36):
// they click Buy in the marketplace UI and get a working number.
//
// DOCTRINE
//  §9  tenant is server-DERIVED from the caller JWT (current_user_tenant_id()), NEVER a
//      body value. Only the phone_number to buy comes from the body. The purchase
//      authenticates as the tenant's OWN subaccount (resolveTwilioCreds via Vault under
//      service role). The inserted tenant_phone_numbers.tenant_id is set by the
//      set_tenant_phone_number_tenant trigger FROM the subaccount parent — the body can
//      never widen scope.
//  §37 NEW PRODUCER of tenant_phone_numbers, alongside import_tenant_phone_number (the
//      §10 import RPC, source='imported') and provision-tenant-twilio's subaccount rows.
//      This is the source='marketplace' producer. Both producers set subaccount_id +
//      let the trigger derive tenant_id; both are idempotent on the global phone_number
//      UNIQUE. No third numbers home (§18).
//  §38 Paige-HELD rail, LOCKED at pure carrier passthrough (#150). The number is bought
//      into the tenant's subaccount under the platform master account — Paige pays Twilio,
//      the tenant pays Paige the SAME carrier passthrough cost with ZERO platform markup
//      (margin comes from §17 L1 subs / L3 usage / L2 marketplace, never the number). This
//      is NOT Stripe Connect. §13 HONESTY: the CHARGE leg (billing the tenant the carrier
//      passthrough for this purchase) is NOT wired in this slice — this fn does the Twilio
//      buy + records the number; the money settlement is a later Money-Spine concern. The
//      response says so (`charge_wired: false`) so no caller mistakes "bought" for "billed".
//  §18 Reuses the ONE Twilio seam (_shared/twilio.ts purchaseNumber) — no inline REST.
//  §13 Reports the REAL Twilio PN SID from the purchase response only; on any failure it
//      returns the real error, never a fabricated number/SID. needs_config when the
//      tenant has no subaccount.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { purchaseNumber, resolveTwilioCreds, type SupabaseAdminLike } from "../_shared/twilio.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

/**
 * Request body — the number to buy + an optional label. Tenant is NEVER read here (§9).
 * §37 dual-contract: the marketplace UI (NumbersTab.buy) sends { phone_number }; a
 * Paige-headless caller may send { phoneNumber }. Both are accepted.
 */
interface PurchaseBody {
  /** E.164 number the tenant chose from comms-search-numbers (e.g. +14155550123). */
  phoneNumber?: string;
  phone_number?: string;
  /** Optional human label for the number. */
  friendly_name?: string;
}

const E164 = /^\+[1-9][0-9]{7,14}$/;

/**
 * The webhook URLs stamped on the purchased number. These point at the C-2 SMS handlers:
 *   • inbound (SmsUrl)        → twilio-sms-webhook        (inbound + STOP; C-2s-C)
 *   • status  (StatusCallback)→ twilio-sms-status-webhook (DLR delivery receipts; C-2s-C)
 * §13 HONEST: those two handler fns land in the C-2s-C compliance/DLR slice. Stamping the
 * URL at purchase time is forward-correct — Twilio simply holds the URL until the handler
 * is live; wiring it now avoids a later per-number reconfigure of every bought number.
 */
function webhookUrls(supabaseUrl: string): { smsUrl: string; statusCallback: string } {
  const base = `${supabaseUrl.replace(/\/+$/, "")}/functions/v1`;
  return {
    smsUrl: `${base}/twilio-sms-webhook`,
    statusCallback: `${base}/twilio-sms-status-webhook`,
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const json = (b: unknown, s = 200) =>
    new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });

  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  // ── AuthN + admin/coach gate (§9). Tenant is derived from the JWT, never the body. ──
  const auth = req.headers.get("Authorization") ?? "";
  if (!auth) return json({ error: "unauthorized" }, 401);
  const userClient = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: auth } } });
  const { data: { user } } = await userClient.auth.getUser();
  if (!user) return json({ error: "unauthorized" }, 401);

  const admin = createClient(supabaseUrl, serviceKey);

  const { data: isOwner } = await userClient.rpc("is_platform_owner");
  const { data: isAdmin } = await admin.rpc("has_role", { _user_id: user.id, _role: "admin" });
  const { data: isCoach } = await admin.rpc("has_role", { _user_id: user.id, _role: "coach" });
  if (isOwner !== true && isAdmin !== true && isCoach !== true) {
    return json({ error: "forbidden" }, 403);
  }

  const { data: tenantId } = await userClient.rpc("current_user_tenant_id");
  if (!tenantId || typeof tenantId !== "string") {
    return json({ needs_config: true, error: "tenant_not_resolved" });
  }

  let body: PurchaseBody = {};
  try { body = (await req.json()) as PurchaseBody; } catch { body = {}; }
  const phoneNumber = (body.phoneNumber ?? body.phone_number ?? "").trim();
  if (!E164.test(phoneNumber)) {
    return json({ error: "phone_number must be E.164 (e.g. +14155550123)" }, 400);
  }
  const friendlyName = (body.friendly_name ?? "").trim() || null;

  // ── Idempotency (pre-purchase): if the tenant already owns this number, return it and
  //    DO NOT re-buy at Twilio. A number held by ANOTHER tenant is a conflict (§9 no-leak). ──
  const { data: existing } = await admin
    .from("tenant_phone_numbers")
    .select("id, tenant_id, twilio_sid, phone_number")
    .eq("phone_number", phoneNumber)
    .maybeSingle();
  if (existing) {
    if (existing.tenant_id !== tenantId) {
      // Do not reveal whose it is (§9). Just refuse.
      return json({ error: "number_unavailable" }, 409);
    }
    return json({
      already_owned: true,
      id: existing.id,
      phone_number: existing.phone_number,
      // §37: the UI reads `sid`. Mirror the real PN SID into both keys (null if this is an
      // imported/master number with no recorded SID — the UI treats null-sid as "didn't go
      // through", acceptable for the rare re-buy-an-owned-number path; §13 no fabrication).
      sid: existing.twilio_sid ?? null,
      twilio_sid: existing.twilio_sid ?? null,
      charge_wired: false,
    });
  }

  // ── Resolve the tenant's subaccount: creds (Vault) + the subaccount ROW id for the FK. ──
  const creds = await resolveTwilioCreds(admin as unknown as SupabaseAdminLike, tenantId);
  if (!creds.ok || !creds.data) {
    return json({
      needs_config: true,
      error: creds.needs_config ? "twilio_subaccount_not_provisioned" : (creds.error ?? "twilio_creds_unavailable"),
      message: creds.needs_config
        ? "This practice isn't set up to buy numbers yet. Once provisioning is complete you'll be able to buy."
        : "Number purchase is temporarily unavailable.",
    });
  }

  const { data: subRow, error: subErr } = await admin
    .from("tenant_twilio_subaccounts")
    .select("id")
    .eq("tenant_id", tenantId)
    .maybeSingle();
  if (subErr || !subRow?.id) {
    return json({ needs_config: true, error: "twilio_subaccount_row_missing" });
  }

  // ── Buy the number into the tenant's subaccount through the ONE seam (§18). ──
  const { smsUrl, statusCallback } = webhookUrls(supabaseUrl);
  const bought = await purchaseNumber(creds.data.accountSid, creds.data.authToken, phoneNumber, {
    smsUrl,
    statusCallback,
    friendlyName: friendlyName ?? undefined,
  }, creds.data.apiKeySid); // C-2a: SK… as the Basic-auth username (API-Key auth)
  if (!bought.ok || !bought.data) {
    return json({
      needs_config: bought.needs_config === true,
      error: bought.error ?? "number_purchase_failed",
    }, bought.needs_config ? 200 : 502);
  }

  const pnSid = (bought.data as Record<string, unknown>).sid as string | undefined; // REAL PNxxx
  const boughtNumber = ((bought.data as Record<string, unknown>).phone_number as string | undefined) ?? phoneNumber;
  const capabilities = ((bought.data as Record<string, unknown>).capabilities as Record<string, unknown> | undefined) ?? {};
  const twilioFriendly = (bought.data as Record<string, unknown>).friendly_name as string | undefined;

  if (!pnSid) {
    // The buy succeeded HTTP-wise but the response carried no SID — do not fabricate one.
    return json({ error: "twilio_purchase_missing_sid", phone_number: boughtNumber }, 502);
  }

  // ── Record the number. subaccount_id set → the trigger derives tenant_id from the
  //    subaccount parent (§9). source='marketplace' (§37 this producer). Idempotent on
  //    the global phone_number UNIQUE (a race returns the existing row). ──
  const { data: inserted, error: insErr } = await admin
    .from("tenant_phone_numbers")
    .insert({
      subaccount_id: subRow.id,               // trigger derives tenant_id from this (§9)
      phone_number: boughtNumber,
      twilio_sid: pnSid,                        // REAL PNxxx from the purchase response
      capabilities,                             // from Twilio's response
      status: "active",
      source: "marketplace",                    // §37: this is the marketplace producer
      friendly_name: friendlyName ?? (twilioFriendly ?? null),
      purchased_at: new Date().toISOString(),
    })
    .select("id")
    .maybeSingle();

  if (insErr) {
    const code = (insErr as { code?: string }).code;
    if (code === "23505") {
      // Race: the row appeared between the pre-check and the insert. Return it idempotently.
      const { data: raced } = await admin
        .from("tenant_phone_numbers")
        .select("id")
        .eq("phone_number", boughtNumber)
        .maybeSingle();
      return json({
        purchased: true,
        id: raced?.id ?? null,
        phone_number: boughtNumber,
        sid: pnSid,                            // §37: UI reads `sid`
        twilio_sid: pnSid,
        charge_wired: false,
        note: "Number bought at Twilio and already recorded (idempotent).",
      });
    }
    // The number IS bought at Twilio but we failed to record it — report BOTH honestly so
    // an operator can reconcile (§13). The real PN SID is included for that reconcile.
    return json({
      error: `number_bought_but_record_failed: ${insErr.message}`,
      phone_number: boughtNumber,
      twilio_sid: pnSid,
      charge_wired: false,
    }, 500);
  }

  return json({
    purchased: true,
    id: inserted?.id ?? null,
    phone_number: boughtNumber,
    sid: pnSid,                                 // §37: the UI reads `sid`. REAL PN SID (§13).
    twilio_sid: pnSid,                          // REAL PN SID only (§13)
    // §38 HONEST: the number is bought + recorded; billing the tenant the carrier
    // passthrough (zero markup, #150) for it is NOT wired in this slice (later Money-Spine).
    charge_wired: false,
  });
});

// Comms C-2s-B — number MARKETPLACE search. JWT-gated; a tenant admin/coach searches
// Twilio's Available Phone Numbers by area code + capabilities, and each result is
// tagged with the Paige RETAIL price (Twilio wholesale + operator markup) from
// platform_number_pricing. The tenant never sees the word "Twilio" (§36) — they search
// an area code, see numbers with a price, and (via comms-purchase-number) click Buy.
//
// DOCTRINE
//  §9  tenant is server-DERIVED from the caller JWT (current_user_tenant_id()), NEVER a
//      body-supplied tenant/subaccount. The search authenticates as the tenant's OWN
//      Twilio subaccount, resolved via resolveTwilioCreds (Vault) under the service-role
//      client. A body cannot widen scope or point at another tenant's subaccount.
//  §38 The retail price shown = wholesale + operator markup from platform_number_pricing
//      (§7 operator-authored). Paige-held rail — this fn only READS the price to display;
//      the charge leg is not here (see comms-purchase-number's honest note).
//  §36 5-min test: filters are area code + capability toggles, results carry a plain
//      dollar price. No Twilio vocabulary leaks to the caller.
//  §18 Reuses the ONE Twilio seam (_shared/twilio.ts listAvailableNumbers) — no inline
//      Twilio REST, no second client.
//  §13 needs_config (not a fake list) when the tenant has no subaccount provisioned or
//      master/subaccount creds are missing. A missing price row degrades to a null
//      retail_price on that result (honest), never a guessed number.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { listAvailableNumbers, resolveTwilioCreds, type SupabaseAdminLike } from "../_shared/twilio.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

/**
 * Request body — ONLY search filters. Tenant/subaccount are NEVER read from here (§9).
 * §37 dual-contract: the marketplace UI (NumbersTab) sends the camelCase shape
 * { areaCode, sms, mms, voice }; a Paige-headless caller may send the snake_case shape
 * { area_code, contains, country, number_type, sms_enabled }. Both are accepted so the
 * one seam serves both producers without either breaking.
 */
interface SearchBody {
  /** UI shape: 3-digit area code. */
  areaCode?: string;
  /** UI capability toggles — require SMS / MMS / voice on the returned numbers. */
  sms?: boolean;
  mms?: boolean;
  voice?: boolean;
  /** Headless shape (aliases + extra filters). */
  area_code?: string;
  contains?: string;
  /** ISO-3166 alpha-2 country. Defaults to US. */
  country?: string;
  /** Marketplace number type. Defaults to local. */
  number_type?: "local" | "tollfree" | "mobile";
  /** Require SMS-capable numbers (default true — this is a messaging product). */
  sms_enabled?: boolean;
}

/** Case-tolerant read of a Twilio capability flag (Available numbers use {SMS}/{MMS}/{voice}). */
function hasCap(caps: Record<string, unknown>, cap: "sms" | "mms" | "voice"): boolean {
  const lower = caps[cap];
  const upper = caps[cap.toUpperCase()];
  return Boolean(lower ?? upper);
}

/** Map our marketplace vocabulary onto Twilio's AvailablePhoneNumbers path segment. */
function toTwilioType(t: SearchBody["number_type"]): "Local" | "TollFree" | "Mobile" {
  if (t === "tollfree") return "TollFree";
  if (t === "mobile") return "Mobile";
  return "Local";
}

/** The retail price attached to each result (§38). null when no operator price row exists. */
interface RetailPrice {
  monthly_cents: number;
  onetime_cents: number | null;
  currency: string;
}

interface NumberOption {
  phone_number: string;
  friendly_name: string | null;
  locality: string | null;
  region: string | null;
  capabilities: Record<string, boolean>;
  /**
   * §37: ONE canonical shape — the {monthly_cents, onetime_cents, currency} object the
   * NumbersTab UI reads (fmtPrice). null only when no operator price row exists for this
   * (type, country); the row still returns (numbers are NOT hidden), the UI shows "—" and
   * a "pricing pending" note (§13 honest — a missing price never fabricates a number).
   */
  retail_price: RetailPrice | null;
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

  // Platform owner OR a tenant admin/coach may search (same authority that may buy).
  const { data: isOwner } = await userClient.rpc("is_platform_owner");
  const { data: isAdmin } = await admin.rpc("has_role", { _user_id: user.id, _role: "admin" });
  const { data: isCoach } = await admin.rpc("has_role", { _user_id: user.id, _role: "coach" });
  if (isOwner !== true && isAdmin !== true && isCoach !== true) {
    return json({ error: "forbidden" }, 403);
  }

  // §9: the tenant is the caller's OWN tenant (JWT-scoped), never a body value.
  const { data: tenantId } = await userClient.rpc("current_user_tenant_id");
  if (!tenantId || typeof tenantId !== "string") {
    return json({ needs_config: true, error: "tenant_not_resolved", numbers: [] });
  }

  let body: SearchBody = {};
  try { body = (await req.json()) as SearchBody; } catch { body = {}; }

  const country = (body.country && body.country.trim()) ? body.country.trim().toUpperCase() : "US";
  const numberType: SearchBody["number_type"] = body.number_type ?? "local";
  const areaCode = (body.areaCode ?? body.area_code ?? "").trim() || undefined;
  // SMS is required unless the caller explicitly toggled it off (UI `sms`, headless
  // `sms_enabled`). This is a messaging product, so the default is SMS-capable.
  const smsFlag = body.sms ?? body.sms_enabled;
  const smsEnabled = smsFlag === undefined ? true : smsFlag === true;
  // MMS/voice are post-filters over Twilio's returned capabilities (the shared search seam
  // only parameterizes SmsEnabled); when the toggle is on we KEEP only matching numbers.
  const requireMms = body.mms === true;
  const requireVoice = body.voice === true;

  // ── Resolve the tenant's OWN Twilio subaccount creds (Vault). needs_config if unprovisioned. ──
  const creds = await resolveTwilioCreds(admin as unknown as SupabaseAdminLike, tenantId);
  if (!creds.ok || !creds.data) {
    return json({
      needs_config: true,
      error: creds.needs_config ? "twilio_subaccount_not_provisioned" : (creds.error ?? "twilio_creds_unavailable"),
      message: creds.needs_config
        ? "This practice isn't set up to buy numbers yet. Once provisioning is complete you'll be able to search and buy."
        : "Number search is temporarily unavailable.",
      numbers: [],
    });
  }

  // ── Search Twilio's Available Phone Numbers as the subaccount (§18 one seam). ──
  const search = await listAvailableNumbers(creds.data.accountSid, creds.data.authToken, {
    areaCode,
    contains: body.contains,
    country,
    type: toTwilioType(numberType),
    smsEnabled,
  }, creds.data.apiKeySid); // C-2a: SK… as the Basic-auth username (API-Key auth)
  if (!search.ok || !search.data) {
    return json({
      needs_config: search.needs_config === true,
      error: search.error ?? "number_search_failed",
      numbers: [],
    }, search.needs_config ? 200 : 502);
  }

  // ── Look up the operator retail price for this (type, country). One row or none (§38). ──
  const { data: priceRow } = await admin
    .from("platform_number_pricing")
    .select("retail_monthly_cents, retail_onetime_cents, currency, active")
    .eq("number_type", numberType)
    .eq("country", country)
    .eq("active", true)
    .maybeSingle();

  const retailDetail: RetailPrice | null = priceRow
    ? {
      monthly_cents: priceRow.retail_monthly_cents as number,
      onetime_cents: (priceRow.retail_onetime_cents as number | null) ?? null,
      currency: (priceRow.currency as string) ?? "usd",
    }
    : null;

  // Twilio returns available_phone_numbers[]. Attach the retail price object to each (same
  // price for every result of this type/country), then apply the MMS/voice capability filters.
  const raw = (search.data as { available_phone_numbers?: unknown[] }).available_phone_numbers ?? [];
  const numbers: NumberOption[] = raw.map((n) => {
    const r = n as Record<string, unknown>;
    return {
      phone_number: String(r.phone_number ?? ""),
      friendly_name: (r.friendly_name as string | undefined) ?? null,
      locality: (r.locality as string | undefined) ?? null,
      region: (r.region as string | undefined) ?? null,
      capabilities: (r.capabilities as Record<string, boolean> | undefined) ?? {},
      retail_price: retailDetail,
    };
  }).filter((n) => {
    if (n.phone_number.length === 0) return false;
    if (requireMms && !hasCap(n.capabilities, "mms")) return false;
    if (requireVoice && !hasCap(n.capabilities, "voice")) return false;
    return true;
  });

  // §13 (S1 fix): needs_config means "this practice CAN'T buy yet" (no subaccount) — that
  // path already returned above. A subaccount EXISTS here, so a missing price row does NOT
  // set needs_config (that wrongly hid real numbers behind "set up messaging"). We return
  // the numbers with a null retail_price + price_configured:false so the UI shows them with
  // a "—" price + an operator nudge, never a fabricated price.
  return json({
    numbers,
    needs_config: false,
    price_configured: retailDetail !== null,
  });
});

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";
import {
  SOLO_BETA_CURRENCY,
  SOLO_BETA_INTERVAL,
  SOLO_BETA_INTERVAL_COUNT,
  SOLO_BETA_OFFER_CODE,
  SOLO_BETA_TRIAL_DAYS,
  SOLO_BETA_UNIT_AMOUNT_CENTS,
} from "../_shared/solo-beta-offer.ts";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  if (req.method !== "POST") return json(405, { available: false });

  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  if (!supabaseUrl || !serviceKey) return json(503, { available: false });

  const admin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });
  const { data: offer, error } = await admin.from("platform_subscription_offers")
    .select("offer_code,status,provider_mode,stripe_product_id,stripe_price_id,unit_amount_cents,currency,billing_interval,interval_count,trial_days,account_type")
    .eq("offer_code", SOLO_BETA_OFFER_CODE)
    .maybeSingle();

  if (error) return json(503, { available: false });
  const available = Boolean(
    offer
    && offer.status === "test_ready"
    && offer.provider_mode === "test"
    && offer.stripe_product_id
    && offer.stripe_price_id
    && offer.unit_amount_cents === SOLO_BETA_UNIT_AMOUNT_CENTS
    && offer.currency === SOLO_BETA_CURRENCY
    && offer.billing_interval === SOLO_BETA_INTERVAL
    && offer.interval_count === SOLO_BETA_INTERVAL_COUNT
    && offer.trial_days === SOLO_BETA_TRIAL_DAYS
    && offer.account_type === "standalone"
  );

  return json(200, {
    available,
    offer: {
      name: "Paige Solo Beta",
      unit_amount_cents: SOLO_BETA_UNIT_AMOUNT_CENTS,
      currency: SOLO_BETA_CURRENCY,
      interval: SOLO_BETA_INTERVAL,
      interval_count: SOLO_BETA_INTERVAL_COUNT,
      trial_days: SOLO_BETA_TRIAL_DAYS,
    },
  });
});

// create-trial-checkout — broker-aware.
// Default: $49 Starter with 14-day trial.
// If the user signed up with a BROK-XXXX referral code AND that broker has a
// per-broker $10 forever Stripe coupon on file, we route them to the $27
// Beta Starter price with the coupon attached → net $17/mo for life.
// We also fall back to the shared coupon code STRIPE_BROKER_CLIENT_COUPON_CODE
// if the per-broker one is missing.

import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const DEFAULT_STARTER_PRICE_ID = "price_1TNQjuKPsmWO0z4OdXmm1eKe"; // $49 Starter

const logStep = (step: string, details?: any) => {
  const detailsStr = details ? ` - ${JSON.stringify(details)}` : "";
  console.log(`[CREATE-TRIAL-CHECKOUT] ${step}${detailsStr}`);
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const anonClient = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_ANON_KEY") ?? "",
  );
  const adminClient = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    { auth: { persistSession: false } },
  );

  try {
    logStep("Function started");

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("No authorization header provided");

    const token = authHeader.replace("Bearer ", "");
    const { data: userData, error: userError } = await anonClient.auth.getUser(token);
    if (userError) throw new Error(`Authentication error: ${userError.message}`);
    const user = userData.user;
    if (!user?.email) throw new Error("User not authenticated or email not available");
    logStep("User authenticated", { userId: user.id, email: user.email });

    // ── Detect broker referral on the user's profile ──────────────
    const { data: profileRow } = await adminClient
      .from("profiles")
      .select("referral_code")
      .eq("user_id", user.id)
      .maybeSingle();

    const refCode = (profileRow?.referral_code || "").toString().trim().toUpperCase();
    const isBrokerReferral = refCode.startsWith("BROK-");
    let brokerCouponId: string | null = null;
    let brokerReferralCode: string | null = null;

    if (isBrokerReferral) {
      const { data: broker } = await adminClient
        .from("broker_profiles")
        .select("id, referral_code, broker_client_discount_code")
        .eq("referral_code", refCode)
        .maybeSingle();
      if (broker) {
        brokerReferralCode = broker.referral_code;
        brokerCouponId =
          broker.broker_client_discount_code ||
          Deno.env.get("STRIPE_BROKER_CLIENT_COUPON_CODE") ||
          null;
        logStep("Broker referral detected", {
          brokerReferralCode,
          hasCoupon: !!brokerCouponId,
        });
      }
    }

    // Beta Starter price ($27) is reserved for broker-referred clients.
    const useBetaStarter = isBrokerReferral && !!brokerCouponId;
    const priceId = useBetaStarter
      ? Deno.env.get("STRIPE_BROKER_BETA_STARTER_PRICE_ID") || DEFAULT_STARTER_PRICE_ID
      : DEFAULT_STARTER_PRICE_ID;
    const planSlug = useBetaStarter ? "broker_beta_starter" : "starter";

    const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY") || "", {
      apiVersion: "2024-12-18",
    });

    const customers = await stripe.customers.list({ email: user.email, limit: 1 });
    const customerId: string | undefined = customers.data[0]?.id;
    if (customerId) logStep("Existing customer found", { customerId });

    const sessionParams: Stripe.Checkout.SessionCreateParams = {
      customer: customerId,
      customer_email: customerId ? undefined : user.email,
      line_items: [{ price: priceId, quantity: 1 }],
      mode: "subscription",
      subscription_data: {
        trial_period_days: 14,
        metadata: {
          user_id: user.id,
          plan_slug: planSlug,
          broker_referral_code: brokerReferralCode || "",
        },
      },
      success_url: `${req.headers.get("origin")}/app?trial=started`,
      cancel_url: `${req.headers.get("origin")}/auth?signup=cancelled`,
      metadata: {
        user_id: user.id,
        plan_slug: planSlug,
        broker_referral_code: brokerReferralCode || "",
      },
    };

    if (useBetaStarter && brokerCouponId) {
      sessionParams.discounts = [{ coupon: brokerCouponId }];
    } else {
      sessionParams.allow_promotion_codes = true;
    }

    const session = await stripe.checkout.sessions.create(sessionParams);

    logStep("Trial checkout session created", {
      sessionId: session.id,
      planSlug,
      priceId,
      brokerCouponApplied: useBetaStarter,
    });

    return new Response(
      JSON.stringify({ url: session.url, planSlug, brokerRate: useBetaStarter }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 },
    );
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    logStep("ERROR", { message: errorMessage });
    return new Response(JSON.stringify({ error: errorMessage }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});

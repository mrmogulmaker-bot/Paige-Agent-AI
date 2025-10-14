import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Map Stripe product IDs to plan slugs
const PRODUCT_TO_PLAN = {
  "prod_TEkkzqf6jscnks": "starter",
  "prod_TEkk3Vr0rtOzrW": "professional",
  "prod_TEkk1OV31G4sSk": "premium",
  "prod_TEkkY2JB9BWsth": "enterprise",
};

const logStep = (step: string, details?: any) => {
  const detailsStr = details ? ` - ${JSON.stringify(details)}` : '';
  console.log(`[CHECK-SUBSCRIPTION] ${step}${detailsStr}`);
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseClient = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_ANON_KEY") ?? ""
  );

  try {
    logStep("Function started");

    const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
    if (!stripeKey) throw new Error("STRIPE_SECRET_KEY is not set");

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("No authorization header provided");

    const token = authHeader.replace("Bearer ", "");
    const { data: userData, error: userError } = await supabaseClient.auth.getUser(token);
    if (userError) throw new Error(`Authentication error: ${userError.message}`);
    const user = userData.user;
    if (!user?.email) throw new Error("User not authenticated or email not available");
    
    logStep("User authenticated", { userId: user.id, email: user.email });

    const stripe = new Stripe(stripeKey, { apiVersion: "2025-08-27.basil" });
    const customers = await stripe.customers.list({ email: user.email, limit: 1 });
    
    if (customers.data.length === 0) {
      logStep("No customer found");
      
      // Update user_subscriptions to free plan
      const { error: updateError } = await supabaseClient
        .from("user_subscriptions")
        .update({ 
          plan_slug: "free",
          status: "trial",
          stripe_subscription_id: null,
        })
        .eq("user_id", user.id);

      if (updateError) {
        logStep("Error updating subscription", { error: updateError });
      }

      return new Response(JSON.stringify({ 
        subscribed: false,
        plan_slug: "free",
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      });
    }

    const customerId = customers.data[0].id;
    logStep("Found Stripe customer", { customerId });

    const subscriptions = await stripe.subscriptions.list({
      customer: customerId,
      status: "active",
      limit: 1,
    });
    
    const hasActiveSub = subscriptions.data.length > 0;
    let planSlug = "free";
    let subscriptionEnd = null;
    let stripeSubscriptionId = null;

    if (hasActiveSub) {
      const subscription = subscriptions.data[0];
      stripeSubscriptionId = subscription.id;
      subscriptionEnd = new Date(subscription.current_period_end * 1000).toISOString();
      const productId = subscription.items.data[0].price.product as string;
      planSlug = PRODUCT_TO_PLAN[productId as keyof typeof PRODUCT_TO_PLAN] || "free";
      
      logStep("Active subscription found", { 
        subscriptionId: subscription.id, 
        planSlug,
        endDate: subscriptionEnd 
      });

      // Update user_subscriptions table
      const { error: updateError } = await supabaseClient
        .from("user_subscriptions")
        .update({
          plan_slug: planSlug,
          status: "active",
          stripe_subscription_id: stripeSubscriptionId,
          current_period_end: subscriptionEnd,
        })
        .eq("user_id", user.id);

      if (updateError) {
        logStep("Error updating subscription", { error: updateError });
      }
    } else {
      logStep("No active subscription found");
      
      // Update to free plan
      const { error: updateError } = await supabaseClient
        .from("user_subscriptions")
        .update({
          plan_slug: "free",
          status: "trial",
          stripe_subscription_id: null,
        })
        .eq("user_id", user.id);

      if (updateError) {
        logStep("Error updating subscription", { error: updateError });
      }
    }

    return new Response(JSON.stringify({
      subscribed: hasActiveSub,
      plan_slug: planSlug,
      subscription_end: subscriptionEnd,
      stripe_subscription_id: stripeSubscriptionId,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logStep("ERROR in check-subscription", { message: errorMessage });
    return new Response(JSON.stringify({ error: errorMessage }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});

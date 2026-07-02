// Layer 4 Consumer checkout — creates a Stripe Checkout session for
// Founder / Growth / Scale plans (see consumer_subscription_plans).
// TEST MODE ONLY until Antonio verifies 5 flows and manually promotes to live.
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

const ALLOWED = new Set(["founder", "growth", "scale"]);

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
    if (!stripeKey) throw new Error("STRIPE_SECRET_KEY missing");

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { persistSession: false } },
    );

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("no_auth_header");
    const { data: userRes, error: userErr } = await supabase.auth.getUser(
      authHeader.replace("Bearer ", "").trim(),
    );
    if (userErr || !userRes?.user?.email) throw new Error("unauthenticated");
    const user = userRes.user;

    const body = await req.json().catch(() => ({}));
    const planSlug = String(body?.plan_slug ?? "").trim().toLowerCase();
    if (!ALLOWED.has(planSlug)) {
      return new Response(JSON.stringify({ error: "invalid_plan" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Look up the plan and its Stripe price. If no stripe_price_id is stored
    // yet (test prices not spun up), fail loudly rather than silently.
    const { data: plan, error: planErr } = await supabase
      .from("consumer_subscription_plans")
      .select("id, slug, name, monthly_price_cents, stripe_price_id")
      .eq("slug", planSlug)
      .eq("is_active", true)
      .maybeSingle();
    if (planErr || !plan) throw new Error("plan_not_found");
    if (!plan.stripe_price_id) {
      return new Response(
        JSON.stringify({
          error: "test_prices_not_configured",
          hint: "Consumer test-mode Stripe prices have not been created yet. Contact support@paigeagent.ai.",
        }),
        { status: 424, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const stripe = new Stripe(stripeKey, { apiVersion: "2025-08-27.basil" });

    // Reuse an existing customer if we can find one by email.
    const existing = await stripe.customers.list({ email: user.email, limit: 1 });
    const customerId = existing.data[0]?.id;

    const origin = req.headers.get("origin") ?? "https://paigeagent.ai";

    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      customer_email: customerId ? undefined : user.email,
      mode: "subscription",
      line_items: [{ price: plan.stripe_price_id, quantity: 1 }],
      success_url: `${origin}/workspace/paige?consumer_subscribed=1&plan=${plan.slug}`,
      cancel_url: `${origin}/for-owners?checkout=cancelled`,
      subscription_data: {
        metadata: {
          user_id: user.id,
          plan_slug: plan.slug,
          plan_id: plan.id,
          layer: "L4_consumer",
        },
      },
      metadata: {
        user_id: user.id,
        plan_slug: plan.slug,
        plan_id: plan.id,
      },
    });

    return new Response(JSON.stringify({ url: session.url, session_id: session.id }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown_error";
    console.error("[create-consumer-checkout]", message);
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

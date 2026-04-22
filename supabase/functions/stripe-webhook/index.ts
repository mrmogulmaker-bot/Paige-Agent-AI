import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY") || "", {
  apiVersion: "2025-08-27.basil",
});

const webhookSecret = Deno.env.get("STRIPE_WEBHOOK_SECRET") || "";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, stripe-signature",
};

const logStep = (step: string, details?: any) => {
  const detailsStr = details ? ` - ${JSON.stringify(details)}` : '';
  console.log(`[STRIPE-WEBHOOK] ${step}${detailsStr}`);
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    logStep("Webhook received");

    const signature = req.headers.get("stripe-signature");
    if (!signature) {
      throw new Error("No stripe-signature header found");
    }

    const body = await req.text();
    
    // Verify webhook signature
    let event: Stripe.Event;
    try {
      event = stripe.webhooks.constructEvent(body, signature, webhookSecret);
      logStep("Webhook signature verified", { type: event.type });
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      logStep("Webhook signature verification failed", { error: errorMessage });
      return new Response(JSON.stringify({ error: "Invalid signature" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    // Handle different event types
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        logStep("Processing checkout.session.completed", { sessionId: session.id });

        if (session.mode === "subscription") {
          const customerId = session.customer as string;
          const subscriptionId = session.subscription as string;

          // Get customer email
          const customer = await stripe.customers.retrieve(customerId);
          const email = (customer as Stripe.Customer).email;

          if (!email) {
            throw new Error("No customer email found");
          }

          // Find user by email
          const { data: userData } = await supabaseAdmin.auth.admin.listUsers();
          const user = userData.users.find(u => u.email === email);

          if (!user) {
            logStep("User not found for email", { email });
            break;
          }

          // Get subscription details
          const subscription = await stripe.subscriptions.retrieve(subscriptionId);
          const productId = subscription.items.data[0].price.product as string;

          // Update or insert subscription
          const { error: upsertError } = await supabaseAdmin
            .from("user_subscriptions")
            .upsert({
              user_id: user.id,
              stripe_subscription_id: subscriptionId,
              plan_slug: productId,
              status: "active",
              current_period_start: new Date(subscription.current_period_start * 1000).toISOString(),
              current_period_end: new Date(subscription.current_period_end * 1000).toISOString(),
              updated_at: new Date().toISOString(),
            }, {
              onConflict: "user_id",
            });

          if (upsertError) {
            logStep("Error upserting subscription", { error: upsertError });
          } else {
            logStep("Subscription created/updated successfully");
          }

          // Attribute referral conversion (initial subscription payment)
          try {
            const amountCents = session.amount_total || 0;
            if (amountCents > 0) {
              const { data: convId, error: attrError } = await supabaseAdmin.rpc(
                "attribute_conversion",
                {
                  p_user_id: user.id,
                  p_stripe_customer_id: customerId,
                  p_stripe_sub_id: subscriptionId,
                  p_amount_cents: amountCents,
                  p_event_type: "initial",
                },
              );
              if (attrError) {
                logStep("Referral attribution error", { error: attrError.message });
              } else if (convId) {
                logStep("Referral conversion attributed", { convId });
                // Fire affiliate-conversion-earned email to the affiliate
                try {
                  await sendAffiliateConversionEmail(supabaseAdmin, convId as string, productId);
                } catch (e) {
                  logStep("Affiliate conversion email error", { error: String(e) });
                }
              }
            }
          } catch (attrErr) {
            logStep("Referral attribution exception", { error: String(attrErr) });
          }

          // Send payment confirmation email
          try {
            const { data: profile } = await supabaseAdmin
              .from("profiles")
              .select("full_name")
              .eq("user_id", user.id)
              .single();

            await supabaseAdmin.functions.invoke("send-payment-confirmation-email", {
              body: {
                planName: productId,
                amount: session.amount_total || 0,
                subscriptionEnd: new Date(subscription.current_period_end * 1000).toISOString(),
              },
              headers: {
                Authorization: `Bearer ${Deno.env.get("SUPABASE_ANON_KEY")}`,
              },
            });
            logStep("Payment confirmation email sent");
          } catch (emailError) {
            logStep("Error sending payment confirmation email", { error: emailError });
          }
        }
        break;
      }

      case "customer.subscription.updated": {
        const subscription = event.data.object as Stripe.Subscription;
        logStep("Processing customer.subscription.updated", { subscriptionId: subscription.id });

        const { error } = await supabaseAdmin
          .from("user_subscriptions")
          .update({
            status: subscription.status,
            current_period_start: new Date(subscription.current_period_start * 1000).toISOString(),
            current_period_end: new Date(subscription.current_period_end * 1000).toISOString(),
            updated_at: new Date().toISOString(),
          })
          .eq("stripe_subscription_id", subscription.id);

        if (error) {
          logStep("Error updating subscription", { error });
        } else {
          logStep("Subscription updated successfully");
        }
        break;
      }

      case "customer.subscription.deleted": {
        const subscription = event.data.object as Stripe.Subscription;
        logStep("Processing customer.subscription.deleted", { subscriptionId: subscription.id });

        const { error } = await supabaseAdmin
          .from("user_subscriptions")
          .update({
            status: "canceled",
            updated_at: new Date().toISOString(),
          })
          .eq("stripe_subscription_id", subscription.id);

        if (error) {
          logStep("Error canceling subscription", { error });
        } else {
          logStep("Subscription canceled successfully");
        }
        break;
      }

      case "invoice.payment_succeeded": {
        const invoice = event.data.object as Stripe.Invoice;
        logStep("Processing invoice.payment_succeeded", { invoiceId: invoice.id });

        // Update subscription status to active on successful payment
        if (invoice.subscription) {
          const { error } = await supabaseAdmin
            .from("user_subscriptions")
            .update({
              status: "active",
              updated_at: new Date().toISOString(),
            })
            .eq("stripe_subscription_id", invoice.subscription as string);

          if (error) {
            logStep("Error updating subscription after payment", { error });
          } else {
            logStep("Subscription marked as active after payment");
          }

          // Attribute recurring referral commission (skip the very first invoice — handled by checkout.session.completed)
          try {
            const billingReason = (invoice as any).billing_reason as string | undefined;
            const isRecurring = billingReason === "subscription_cycle";
            const amountCents = invoice.amount_paid || 0;
            if (isRecurring && amountCents > 0) {
              const customerId = invoice.customer as string;
              const customer = await stripe.customers.retrieve(customerId);
              const email = (customer as Stripe.Customer).email;
              if (email) {
                const { data: userData } = await supabaseAdmin.auth.admin.listUsers();
                const user = userData.users.find((u) => u.email === email);
                if (user) {
                  const { data: convId, error: attrError } = await supabaseAdmin.rpc(
                    "attribute_conversion",
                    {
                      p_user_id: user.id,
                      p_stripe_customer_id: customerId,
                      p_stripe_sub_id: invoice.subscription as string,
                      p_amount_cents: amountCents,
                      p_event_type: "recurring",
                    },
                  );
                  if (attrError) {
                    logStep("Recurring attribution error", { error: attrError.message });
                  } else if (convId) {
                    logStep("Recurring referral conversion attributed", { convId });
                    try {
                      // Best-effort plan name from subscription
                      let planName: string | undefined = undefined;
                      try {
                        const sub = await stripe.subscriptions.retrieve(invoice.subscription as string);
                        planName = sub.items.data[0]?.price?.product as string | undefined;
                      } catch (_) { /* ignore */ }
                      await sendAffiliateConversionEmail(supabaseAdmin, convId as string, planName);
                    } catch (e) {
                      logStep("Affiliate conversion email error (recurring)", { error: String(e) });
                    }
                  }
                }
              }
            }
          } catch (attrErr) {
            logStep("Recurring attribution exception", { error: String(attrErr) });
          }
        }
        break;
      }

      case "invoice.payment_failed": {
        const invoice = event.data.object as Stripe.Invoice;
        logStep("Processing invoice.payment_failed", { invoiceId: invoice.id });

        // Update subscription status to past_due on failed payment
        if (invoice.subscription) {
          const { error } = await supabaseAdmin
            .from("user_subscriptions")
            .update({
              status: "past_due",
              updated_at: new Date().toISOString(),
            })
            .eq("stripe_subscription_id", invoice.subscription as string);

          if (error) {
            logStep("Error updating subscription after failed payment", { error });
          } else {
            logStep("Subscription marked as past_due");
          }
        }
        break;
      }

      default:
        logStep("Unhandled event type", { type: event.type });
    }

    return new Response(JSON.stringify({ received: true }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: any) {
    logStep("ERROR in webhook handler", { message: error.message });
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});

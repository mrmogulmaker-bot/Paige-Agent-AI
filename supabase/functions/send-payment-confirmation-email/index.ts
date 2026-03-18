import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { Resend } from "npm:resend@4.0.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

const resend = new Resend(Deno.env.get("RESEND_API_KEY"));

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface PaymentConfirmationRequest {
  planName: string;
  amount: number;
  subscriptionEnd?: string;
}

const handler = async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    console.log("Payment confirmation email function invoked");

    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("No authorization header");

    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: userError } = await supabaseClient.auth.getUser(token);
    
    if (userError || !user) {
      console.error("Authentication error:", userError);
      throw new Error("User not authenticated");
    }

    const { planName, amount, subscriptionEnd }: PaymentConfirmationRequest = await req.json();
    console.log("Sending payment confirmation to:", user.email);

    // Get user profile
    const { data: profile } = await supabaseClient
      .from("profiles")
      .select("full_name")
      .eq("user_id", user.id)
      .single();

    const formattedAmount = new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD'
    }).format(amount / 100);

    const emailResponse = await resend.emails.send({
      from: "PaigeAgent.ai <billing@resend.dev>",
      to: [user.email!],
      subject: "Payment Confirmed - PaigeAgent.ai",
      html: `
        <!DOCTYPE html>
        <html>
          <head>
            <meta charset="utf-8">
            <style>
              body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; }
              .container { max-width: 600px; margin: 0 auto; padding: 20px; }
              .header { background: linear-gradient(135deg, #CFAE70 0%, #B8944D 100%); color: white; padding: 30px; text-align: center; border-radius: 8px 8px 0 0; }
              .content { background: #ffffff; padding: 30px; border: 1px solid #e5e5e5; border-top: none; }
              .payment-summary { background: #f9f9f9; padding: 20px; border-radius: 8px; margin: 20px 0; }
              .amount { font-size: 32px; font-weight: bold; color: #22c55e; text-align: center; margin: 20px 0; }
              .cta { text-align: center; margin: 30px 0; }
              .button { background: linear-gradient(135deg, #CFAE70 0%, #B8944D 100%); color: white; padding: 12px 30px; text-decoration: none; border-radius: 6px; display: inline-block; font-weight: bold; }
              .footer { text-align: center; padding: 20px; color: #666; font-size: 12px; }
              .checkmark { width: 60px; height: 60px; background: #22c55e; border-radius: 50%; display: flex; align-items: center; justify-content: center; margin: 0 auto 20px; }
            </style>
          </head>
          <body>
            <div class="container">
              <div class="header">
                <h1 style="margin: 0;">Payment Successful!</h1>
              </div>
              <div class="content">
                <div class="checkmark">
                  <span style="color: white; font-size: 36px;">✓</span>
                </div>

                <h2 style="text-align: center;">Thank you for your payment</h2>
                <p style="text-align: center;">Hi ${profile?.full_name || 'there'}, your subscription has been confirmed.</p>
                
                <div class="amount">${formattedAmount}</div>

                <div class="payment-summary">
                  <p style="margin: 0 0 10px 0;"><strong>Plan:</strong> ${planName}</p>
                  <p style="margin: 0 0 10px 0;"><strong>Amount:</strong> ${formattedAmount}</p>
                  ${subscriptionEnd ? `<p style="margin: 0;"><strong>Next billing date:</strong> ${new Date(subscriptionEnd).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}</p>` : ''}
                </div>

                <div style="background: #e0f2fe; border-left: 4px solid #3b82f6; padding: 15px; margin: 20px 0; border-radius: 4px;">
                  <p style="margin: 0; color: #1e40af;"><strong>What's included:</strong></p>
                  <ul style="margin: 10px 0 0 0; color: #1e40af;">
                    <li>Full access to A.C.C.E.L. credit repair program</li>
                    <li>B.U.I.L.D. business credit building tools</li>
                    <li>Unlimited AI chat with PaigeAgent</li>
                    <li>Bank account integration & insights</li>
                    <li>Document management & storage</li>
                  </ul>
                </div>

                <div class="cta">
                  <a href="${Deno.env.get('SUPABASE_URL')?.replace('supabase.co', 'lovable.app') || 'https://paige-ai.lovable.app'}/dashboard" class="button">
                    Go to Dashboard
                  </a>
                </div>

                <p style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #e5e5e5; font-size: 14px; color: #666;">
                  You can manage your subscription anytime from your account settings. Need help? Contact our support team.
                </p>
              </div>
              <div class="footer">
                <p>© 2025 PaigeAgent.ai - Mogul Maker Academy<br/>
                This email confirms your payment. Keep it for your records.</p>
              </div>
            </div>
          </body>
        </html>
      `,
    });

    console.log("Payment confirmation email sent successfully:", emailResponse);

    return new Response(JSON.stringify({ success: true, data: emailResponse }), {
      status: 200,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  } catch (error: any) {
    console.error("Error in send-payment-confirmation-email function:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        status: 500,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      }
    );
  }
};

serve(handler);

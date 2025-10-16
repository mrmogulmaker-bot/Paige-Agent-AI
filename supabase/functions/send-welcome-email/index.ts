import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { Resend } from "https://esm.sh/resend@4.0.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

const resend = new Resend(Deno.env.get("RESEND_API_KEY"));

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface WelcomeEmailRequest {
  fullName: string;
  email: string;
  goals: string[];
}

const handler = async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    console.log("Welcome email function invoked");

    // Authenticate user
    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? ""
    );

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("No authorization header");

    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: userError } = await supabaseClient.auth.getUser(token);
    
    if (userError || !user) {
      console.error("Authentication error:", userError);
      throw new Error("User not authenticated");
    }

    const { fullName, email, goals }: WelcomeEmailRequest = await req.json();
    console.log("Sending welcome email to:", email);

    const goalsText = goals.map(g => {
      switch(g) {
        case 'repair': return '🎯 Repair & Optimize Personal Credit';
        case 'build': return '📈 Build Business Credit';
        case 'funding': return '💰 Access Funding & Financing';
        default: return g;
      }
    }).join('<br/>');

    const emailResponse = await resend.emails.send({
      from: "PaigeAgent.ai <onboarding@resend.dev>",
      to: [email],
      subject: "Welcome to PaigeAgent.ai! 🎉",
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
              .goals { background: #f9f9f9; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #CFAE70; }
              .cta { text-align: center; margin: 30px 0; }
              .button { background: linear-gradient(135deg, #CFAE70 0%, #B8944D 100%); color: white; padding: 12px 30px; text-decoration: none; border-radius: 6px; display: inline-block; font-weight: bold; }
              .footer { text-align: center; padding: 20px; color: #666; font-size: 12px; }
            </style>
          </head>
          <body>
            <div class="container">
              <div class="header">
                <h1 style="margin: 0;">Welcome to PaigeAgent.ai!</h1>
                <p style="margin: 10px 0 0 0; opacity: 0.9;">Your AI-Powered Credit & Business Finance Companion</p>
              </div>
              <div class="content">
                <h2>Hi ${fullName},</h2>
                <p>Thank you for joining PaigeAgent.ai! We're excited to help you achieve your financial goals.</p>
                
                <div class="goals">
                  <h3 style="margin-top: 0;">Your Selected Goals:</h3>
                  <p style="margin: 0;">${goalsText}</p>
                </div>

                <h3>What's Next?</h3>
                <ul>
                  <li><strong>Connect Your Bank Accounts</strong> - Link your accounts for personalized insights</li>
                  <li><strong>Review Your Credit</strong> - Get started with our A.C.C.E.L. credit repair program</li>
                  <li><strong>Explore B.U.I.L.D.</strong> - Begin building your business credit profile</li>
                  <li><strong>Chat with PaigeAgent</strong> - Get AI-powered guidance anytime</li>
                </ul>

                <div class="cta">
                  <a href="${Deno.env.get('SUPABASE_URL')?.replace('supabase.co', 'lovable.app') || 'https://paige-ai.lovable.app'}/dashboard" class="button">
                    Go to Dashboard
                  </a>
                </div>

                <p style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #e5e5e5;">
                  Need help? Reply to this email or visit our Learning Vault for guides and resources.
                </p>
              </div>
              <div class="footer">
                <p>© 2025 PaigeAgent.ai - Mogul Maker Academy<br/>
                Empowering your credit and business success</p>
              </div>
            </div>
          </body>
        </html>
      `,
    });

    console.log("Email sent successfully:", emailResponse);

    return new Response(JSON.stringify({ success: true, data: emailResponse }), {
      status: 200,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  } catch (error: any) {
    console.error("Error in send-welcome-email function:", error);
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

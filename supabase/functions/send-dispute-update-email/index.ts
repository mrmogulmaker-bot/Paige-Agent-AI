import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { Resend } from "https://esm.sh/resend@4.0.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

const resend = new Resend(Deno.env.get("RESEND_API_KEY"));

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface DisputeUpdateEmailRequest {
  disputeId: string;
  status: string;
  bureau: string;
  creditorName: string;
}

const handler = async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    console.log("Dispute update email function invoked");

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

    const { disputeId, status, bureau, creditorName }: DisputeUpdateEmailRequest = await req.json();
    console.log("Sending dispute update email for:", disputeId);

    // Get user profile for email
    const { data: profile } = await supabaseClient
      .from("profiles")
      .select("full_name")
      .eq("user_id", user.id)
      .single();

    const statusColor = status === 'resolved' ? '#22c55e' : 
                        status === 'in_progress' ? '#eab308' : '#3b82f6';
    
    const statusEmoji = status === 'resolved' ? '✅' : 
                        status === 'in_progress' ? '⏳' : '📝';

    const emailResponse = await resend.emails.send({
      from: "PaigeAgent.ai <disputes@resend.dev>",
      to: [user.email!],
      subject: `${statusEmoji} Dispute Status Update - ${creditorName}`,
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
              .status-badge { display: inline-block; padding: 8px 16px; border-radius: 20px; font-weight: bold; text-transform: uppercase; font-size: 12px; }
              .dispute-details { background: #f9f9f9; padding: 20px; border-radius: 8px; margin: 20px 0; }
              .cta { text-align: center; margin: 30px 0; }
              .button { background: linear-gradient(135deg, #CFAE70 0%, #B8944D 100%); color: white; padding: 12px 30px; text-decoration: none; border-radius: 6px; display: inline-block; font-weight: bold; }
              .footer { text-align: center; padding: 20px; color: #666; font-size: 12px; }
            </style>
          </head>
          <body>
            <div class="container">
              <div class="header">
                <h1 style="margin: 0;">Dispute Status Update</h1>
              </div>
              <div class="content">
                <h2>Hi ${profile?.full_name || 'there'},</h2>
                <p>There's an update on your credit dispute.</p>
                
                <div class="dispute-details">
                  <p style="margin: 0 0 10px 0;"><strong>Creditor:</strong> ${creditorName}</p>
                  <p style="margin: 0 0 10px 0;"><strong>Bureau:</strong> ${bureau}</p>
                  <p style="margin: 0;">
                    <strong>Status:</strong> 
                    <span class="status-badge" style="background-color: ${statusColor}; color: white;">
                      ${status.replace('_', ' ')}
                    </span>
                  </p>
                </div>

                ${status === 'resolved' ? `
                  <div style="background: #dcfce7; border-left: 4px solid #22c55e; padding: 15px; margin: 20px 0; border-radius: 4px;">
                    <p style="margin: 0; color: #166534;"><strong>Great news!</strong> This dispute has been resolved. Check your updated credit report in your dashboard.</p>
                  </div>
                ` : status === 'in_progress' ? `
                  <p>Your dispute is currently being processed. We'll notify you of any updates.</p>
                ` : `
                  <p>Your dispute has been submitted and is awaiting review.</p>
                `}

                <div class="cta">
                  <a href="${Deno.env.get('SUPABASE_URL')?.replace('supabase.co', 'lovable.app') || 'https://paige-ai.lovable.app'}/dashboard?section=personal" class="button">
                    View Dispute Details
                  </a>
                </div>

                <p style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #e5e5e5; font-size: 14px; color: #666;">
                  Questions? Chat with PaigeAgent or contact our support team.
                </p>
              </div>
              <div class="footer">
                <p>© 2025 PaigeAgent.ai - Mogul Maker Academy</p>
              </div>
            </div>
          </body>
        </html>
      `,
    });

    console.log("Dispute update email sent successfully:", emailResponse);

    // Create in-app notification
    const { error: notifError } = await supabaseClient
      .from("notifications")
      .insert({
        user_id: user.id,
        type: "dispute_update",
        title: `Dispute Update: ${creditorName}`,
        message: `Your dispute with ${creditorName} status changed to ${status.replace('_', ' ')}`,
        action_url: "/dashboard?section=personal",
        metadata: { disputeId, bureau, creditorName, status },
      });

    if (notifError) {
      console.error("Error creating notification:", notifError);
    }

    return new Response(JSON.stringify({ success: true, data: emailResponse }), {
      status: 200,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  } catch (error: any) {
    console.error("Error in send-dispute-update-email function:", error);
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

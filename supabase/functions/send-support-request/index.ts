import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { Resend } from "https://esm.sh/resend@4.0.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.75.0";

const resend = new Resend(Deno.env.get("RESEND_API_KEY"));

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const logStep = (step: string, details?: any) => {
  const detailsStr = details ? ` - ${JSON.stringify(details)}` : '';
  console.log(`[SUPPORT-REQUEST] ${step}${detailsStr}`);
};

interface SupportRequest {
  subject: string;
  category: string;
  message: string;
  preferredContact: string;
  requestConsultation: boolean;
  planSlug: string;
  userEmail: string;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    logStep("Function started");

    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? ""
    );

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("No authorization header");

    const token = authHeader.replace("Bearer ", "");
    const { data: userData, error: userError } = await supabaseClient.auth.getUser(token);
    if (userError || !userData.user) throw new Error("Unauthorized");

    const user = userData.user;
    logStep("User authenticated", { userId: user.id, email: user.email });

    const requestData: SupportRequest = await req.json();
    logStep("Request received", { 
      category: requestData.category, 
      planSlug: requestData.planSlug,
      consultation: requestData.requestConsultation 
    });

    // Get user profile for additional context
    const { data: profile } = await supabaseClient
      .from("profiles")
      .select("full_name, phone")
      .eq("user_id", user.id)
      .single();

    const userName = profile?.full_name || user.email;

    // Determine priority and routing based on plan
    const priorityLabels: Record<string, string> = {
      enterprise: "🔴 ENTERPRISE - 2 HOUR SLA",
      premium: "🟠 PREMIUM - 24 HOUR SLA",
      professional: "🟡 PROFESSIONAL - 48 HOUR SLA",
      starter: "🟢 STARTER - 72 HOUR SLA",
    };

    const priority = priorityLabels[requestData.planSlug] || "🔵 STANDARD";
    const isEnterprise = requestData.planSlug === "enterprise";
    const is3MConsultation = requestData.category === "3m_framework" || 
                            (requestData.requestConsultation && isEnterprise);

    // Send notification to support team
    const supportEmail = await resend.emails.send({
      from: "PaigeAgent.ai Support <support@paigeagent.ai>",
      to: isEnterprise ? ["enterprise@paigeagent.ai"] : ["support@paigeagent.ai"],
      subject: `${priority} | ${requestData.category.toUpperCase()} | ${requestData.subject}`,
      html: `
        <!DOCTYPE html>
        <html>
          <head>
            <style>
              body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; }
              .container { max-width: 700px; margin: 0 auto; padding: 20px; }
              .priority { 
                display: inline-block; 
                padding: 8px 16px; 
                border-radius: 6px; 
                font-weight: bold;
                margin-bottom: 20px;
                background: ${isEnterprise ? '#DC2626' : requestData.planSlug === 'premium' ? '#F59E0B' : '#10B981'};
                color: white;
              }
              .info-grid { 
                display: grid; 
                grid-template-columns: 150px 1fr; 
                gap: 12px; 
                background: #f9fafb; 
                padding: 20px; 
                border-radius: 8px;
                margin: 20px 0;
              }
              .info-label { font-weight: 600; color: #6b7280; }
              .message-box { 
                background: white; 
                border: 2px solid #e5e7eb; 
                border-radius: 8px; 
                padding: 20px; 
                margin: 20px 0;
              }
              .consultation-badge {
                display: inline-block;
                background: #CFAE70;
                color: white;
                padding: 4px 12px;
                border-radius: 4px;
                font-size: 12px;
                font-weight: bold;
                margin-left: 8px;
              }
            </style>
          </head>
          <body>
            <div class="container">
              <h1>New Support Request</h1>
              <div class="priority">${priority}</div>
              ${is3MConsultation ? '<span class="consultation-badge">3M FRAMEWORK CONSULTATION</span>' : ''}
              
              <div class="info-grid">
                <div class="info-label">User:</div>
                <div>${userName}</div>
                
                <div class="info-label">Email:</div>
                <div>${user.email}</div>
                
                ${profile?.phone ? `
                <div class="info-label">Phone:</div>
                <div>${profile.phone}</div>
                ` : ''}
                
                <div class="info-label">Plan:</div>
                <div><strong>${requestData.planSlug.toUpperCase()}</strong></div>
                
                <div class="info-label">Category:</div>
                <div>${requestData.category.replace(/_/g, ' ').toUpperCase()}</div>
                
                <div class="info-label">Preferred Contact:</div>
                <div>${requestData.preferredContact}</div>
                
                ${requestData.requestConsultation ? `
                <div class="info-label">Consultation:</div>
                <div><strong>✅ REQUESTED</strong></div>
                ` : ''}
              </div>
              
              <h3>Subject: ${requestData.subject}</h3>
              
              <div class="message-box">
                <h4>Message:</h4>
                <p>${requestData.message.replace(/\n/g, '<br>')}</p>
              </div>
              
              ${isEnterprise ? `
              <div style="background: #FEF3C7; border-left: 4px solid #F59E0B; padding: 16px; margin-top: 20px;">
                <strong>⚠️ ENTERPRISE SLA:</strong> Response required within 2 hours
                ${is3MConsultation ? '<br><strong>📞 3M Framework consultation requested - coordinate with Success Manager</strong>' : ''}
              </div>
              ` : ''}
            </div>
          </body>
        </html>
      `,
    });

    logStep("Support team notified", { messageId: supportEmail.data?.id });

    // Send confirmation to user
    const userConfirmation = await resend.emails.send({
      from: "PaigeAgent.ai Support <support@paigeagent.ai>",
      to: [user.email!],
      subject: `Support Request Received: ${requestData.subject}`,
      html: `
        <!DOCTYPE html>
        <html>
          <head>
            <style>
              body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; }
              .container { max-width: 600px; margin: 0 auto; padding: 20px; }
              .header { background: linear-gradient(135deg, #CFAE70, #B8935A); color: white; padding: 30px; text-align: center; border-radius: 8px 8px 0 0; }
              .content { background: #ffffff; padding: 30px; border: 1px solid #e5e7eb; border-top: none; }
              .badge { display: inline-block; background: #10B981; color: white; padding: 6px 12px; border-radius: 4px; font-size: 12px; margin-top: 8px; }
              .response-time { background: #f3f4f6; padding: 16px; border-radius: 6px; margin: 20px 0; }
            </style>
          </head>
          <body>
            <div class="container">
              <div class="header">
                <h1 style="margin: 0;">Support Request Received</h1>
                <span class="badge">${requestData.planSlug.toUpperCase()} PLAN</span>
              </div>
              <div class="content">
                <p>Hi ${userName},</p>
                
                <p>We've received your support request and ${isEnterprise ? 'your dedicated success manager' : 'our team'} will respond shortly.</p>
                
                <div class="response-time">
                  <strong>Expected Response Time:</strong><br>
                  ${isEnterprise 
                    ? '⏱️ Within 2 hours (Enterprise SLA)' 
                    : requestData.planSlug === 'premium'
                    ? '⏱️ Within 24 hours (Priority Support)'
                    : requestData.planSlug === 'professional'
                    ? '⏱️ Within 48 hours'
                    : '⏱️ Within 72 hours'}
                </div>
                
                <p><strong>Request Category:</strong> ${requestData.category.replace(/_/g, ' ')}</p>
                <p><strong>Subject:</strong> ${requestData.subject}</p>
                
                ${is3MConsultation ? `
                <div style="background: #FEF3C7; padding: 16px; border-radius: 6px; margin: 20px 0;">
                  <strong>📅 3M Framework Consultation</strong><br>
                  Your dedicated success manager will reach out to schedule your strategy session for the Make, Manage, Multiply framework.
                </div>
                ` : ''}
                
                <p style="margin-top: 24px;">Thank you for being a valued ${requestData.planSlug} member!</p>
                
                <p style="color: #6b7280; font-size: 14px; margin-top: 24px;">
                  Best regards,<br>
                  The PaigeAgent.ai Team
                </p>
              </div>
            </div>
          </body>
        </html>
      `,
    });

    logStep("User confirmation sent", { messageId: userConfirmation.data?.id });

    // Log the support request in audit trail
    await supabaseClient
      .from("audit_logs")
      .insert({
        user_id: user.id,
        entity: "support_request",
        action: "created",
        data: {
          category: requestData.category,
          plan_slug: requestData.planSlug,
          consultation_requested: requestData.requestConsultation,
          is_3m_framework: is3MConsultation,
        },
      });

    return new Response(
      JSON.stringify({ 
        success: true,
        message: "Support request submitted successfully" 
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      }
    );
  } catch (error: any) {
    logStep("ERROR", { message: error.message });
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 500,
      }
    );
  }
});

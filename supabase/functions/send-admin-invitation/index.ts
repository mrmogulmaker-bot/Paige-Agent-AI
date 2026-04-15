import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.75.0";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const VALID_ROLES = ["user", "coach", "moderator", "admin", "affiliate"] as const;
type InviteRole = typeof VALID_ROLES[number];

interface InvitationRequest {
  email: string;
  role: InviteRole;
}

const handler = async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("No authorization header");

    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: userError } = await supabase.auth.getUser(token);
    if (userError || !user) throw new Error("Unauthorized");

    const { data: roleData } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id)
      .eq("role", "admin")
      .single();

    if (!roleData) throw new Error("Insufficient permissions");

    const { email, role }: InvitationRequest = await req.json();

    if (!email || !role) throw new Error("Email and role are required");
    if (!VALID_ROLES.includes(role)) throw new Error(`Invalid role: ${role}`);

    console.log(`Creating invitation for ${email} with role ${role}`);

    const rawToken = Array.from(crypto.getRandomValues(new Uint8Array(32)))
      .map(b => b.toString(16).padStart(2, '0')).join('');

    const { data: invitation, error: inviteError } = await supabase
      .from("invitations")
      .insert({ email, role, invited_by: user.id, token: rawToken })
      .select()
      .single();

    if (inviteError) throw inviteError;

    console.log("Invitation created:", invitation.id);

    // Build invite URL
    const appUrl = "https://paigeagent.ai";
    const inviteUrl = `${appUrl}/auth?invite=${rawToken}`;

    const roleLabels: Record<string, string> = {
      admin: "Administrator",
      coach: "Coach",
      moderator: "Moderator",
      affiliate: "Affiliate Partner",
      user: "Client",
    };
    const roleLabel = roleLabels[role] || role;

    // Send via Resend through connector gateway
    const GATEWAY_URL = 'https://connector-gateway.lovable.dev/resend';
    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY');

    if (!LOVABLE_API_KEY || !RESEND_API_KEY) {
      console.warn("Email keys not configured, invitation created but email not sent");
      return new Response(
        JSON.stringify({ success: true, invitation, emailSent: false }),
        { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    const emailResponse = await fetch(`${GATEWAY_URL}/emails`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${LOVABLE_API_KEY}`,
        'X-Connection-Api-Key': RESEND_API_KEY,
      },
      body: JSON.stringify({
        from: 'PaigeAgent.ai <onboarding@resend.dev>',
        to: [email],
        subject: `You're invited to join PaigeAgent.ai as ${roleLabel}`,
        html: `
          <!DOCTYPE html>
          <html>
            <head>
              <meta charset="utf-8">
              <style>
                body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; }
                .container { max-width: 600px; margin: 0 auto; padding: 20px; }
                .header { background: linear-gradient(135deg, #CFAE70, #B8935A); color: white; padding: 30px; text-align: center; border-radius: 8px 8px 0 0; }
                .content { background: #ffffff; padding: 30px; border: 1px solid #e5e7eb; border-top: none; }
                .button { display: inline-block; background: #CFAE70; color: white; padding: 12px 30px; text-decoration: none; border-radius: 6px; margin: 20px 0; }
                .footer { text-align: center; padding: 20px; color: #6b7280; font-size: 14px; }
                .role-badge { display: inline-block; background: #f3f4f6; color: #1f2937; padding: 4px 12px; border-radius: 4px; font-size: 14px; font-weight: 600; }
              </style>
            </head>
            <body>
              <div class="container">
                <div class="header">
                  <h1 style="margin: 0; font-size: 28px;">PaigeAgent.ai</h1>
                  <p style="margin: 10px 0 0; opacity: 0.9;">Mogul Maker Academy</p>
                </div>
                <div class="content">
                  <h2>You've Been Invited!</h2>
                  <p>You've been invited to join PaigeAgent.ai with the role:</p>
                  <p style="text-align: center;">
                    <span class="role-badge">${roleLabel.toUpperCase()}</span>
                  </p>
                  <p>Click the button below to accept your invitation and create your account:</p>
                  <p style="text-align: center;">
                    <a href="${inviteUrl}" class="button">Accept Invitation</a>
                  </p>
                  <p style="color: #6b7280; font-size: 14px;">
                    This invitation will expire in 7 days. If you didn't expect this invitation, you can safely ignore this email.
                  </p>
                  <p style="color: #6b7280; font-size: 12px; margin-top: 20px;">
                    Or copy and paste this link in your browser:<br>
                    <code style="background: #f3f4f6; padding: 8px; display: block; margin-top: 8px; word-break: break-all;">${inviteUrl}</code>
                  </p>
                </div>
                <div class="footer">
                  <p>&copy; ${new Date().getFullYear()} PaigeAgent.ai. All rights reserved.</p>
                </div>
              </div>
            </body>
          </html>
        `,
      }),
    });

    const emailResult = await emailResponse.json();
    console.log("Email sent:", emailResult);

    return new Response(
      JSON.stringify({ success: true, invitation, emailSent: true }),
      { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  } catch (error: any) {
    console.error("Error in send-admin-invitation:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  }
};

serve(handler);

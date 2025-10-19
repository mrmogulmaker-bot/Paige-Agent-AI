import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { Resend } from "https://esm.sh/resend@4.0.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.75.0";

const resend = new Resend(Deno.env.get("RESEND_API_KEY"));
const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface InvitationRequest {
  email: string;
  role: "admin" | "moderator" | "user";
}

const handler = async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Verify admin access
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      throw new Error("No authorization header");
    }

    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: userError } = await supabase.auth.getUser(token);
    
    if (userError || !user) {
      throw new Error("Unauthorized");
    }

    // Check if user is admin
    const { data: roleData } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id)
      .eq("role", "admin")
      .single();

    if (!roleData) {
      throw new Error("Insufficient permissions");
    }

    const { email, role }: InvitationRequest = await req.json();

    console.log(`Creating invitation for ${email} with role ${role}`);

    // Create invitation
    const { data: invitation, error: inviteError } = await supabase
      .from("invitations")
      .insert({
        email,
        role,
        invited_by: user.id,
      })
      .select()
      .single();

    if (inviteError) {
      throw inviteError;
    }

    console.log("Invitation created:", invitation.id);

    // Get app URL for the invitation link
    const appUrl = Deno.env.get("SUPABASE_URL")?.replace(
      "supabase.co",
      "lovableproject.com"
    ) || "https://your-app.lovableproject.com";
    
    const inviteUrl = `${appUrl}/auth?invite=${invitation.token}`;

    // Send invitation email
    const emailResponse = await resend.emails.send({
      from: "PaigeAgent.ai <onboarding@resend.dev>",
      to: [email],
      subject: `You're invited to join PaigeAgent.ai as ${role}`,
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
                <p>You've been invited to join the PaigeAgent.ai admin team with the role:</p>
                <p style="text-align: center;">
                  <span class="role-badge">${role.toUpperCase()}</span>
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
    });

    console.log("Email sent successfully:", emailResponse);

    return new Response(
      JSON.stringify({ 
        success: true, 
        invitation: invitation,
        emailSent: true 
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      }
    );
  } catch (error: any) {
    console.error("Error in send-admin-invitation:", error);
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

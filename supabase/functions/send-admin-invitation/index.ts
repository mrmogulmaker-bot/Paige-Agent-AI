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

    const roleLabels: Record<string, string> = {
      admin: "Administrator", coach: "Coach", moderator: "Moderator",
      affiliate: "Affiliate Partner", user: "Client",
    };
    const roleLabel = roleLabels[role] || role;
    const inviteUrl = `https://paigeagent.ai/auth?invite=${rawToken}`;

    // Send via transactional email system (uses verified notify.paigeagent.ai domain)
    const { error: emailError } = await supabase.functions.invoke("send-transactional-email", {
      body: {
        templateName: "role-invitation",
        recipientEmail: email,
        idempotencyKey: `invite-${invitation.id}`,
        templateData: { role: roleLabel, inviteUrl },
      },
    });

    const emailSent = !emailError;
    if (emailError) {
      console.error("Failed to send invitation email:", emailError);
    } else {
      console.log("Invitation email queued successfully");
    }

    return new Response(
      JSON.stringify({ success: true, invitation, emailSent }),
      { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  } catch (error: any) {
    console.error("Error in send-admin-invitation:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  }
};

serve(handler);

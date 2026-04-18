// supabase/functions/invite-affiliate/index.ts
// Admin-only: directly enrolls an external affiliate.
// - Creates auth user if missing (pre-confirmed)
// - Creates affiliate_profiles row + referral_codes row
// - Generates a recovery link so the invitee can set a password
// - Sends a branded email with their referral link

import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.75.0";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface InviteBody {
  email: string;
  full_name: string;
  tier_key?: "external" | "coach" | "admin";
  notes?: string;
}

const VALID_TIERS = ["external", "coach", "admin"] as const;

const handler = async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Verify caller is admin
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("No authorization header");
    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: userErr } = await supabase.auth.getUser(token);
    if (userErr || !user) throw new Error("Unauthorized");

    const { data: roleData } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id)
      .eq("role", "admin")
      .maybeSingle();
    if (!roleData) throw new Error("Insufficient permissions");

    const body: InviteBody = await req.json();
    const email = (body.email || "").trim().toLowerCase();
    const fullName = (body.full_name || "").trim();
    const tierKey = body.tier_key && VALID_TIERS.includes(body.tier_key) ? body.tier_key : "external";

    if (!email || !fullName) throw new Error("email and full_name are required");

    // Get inviter name
    const { data: inviterProfile } = await supabase
      .from("profiles").select("full_name").eq("user_id", user.id).maybeSingle();
    const inviterName = inviterProfile?.full_name || user.email || "PaigeAgent admin";

    // 1. Find or create the auth user
    let targetUserId: string | null = null;
    const { data: existingUsers } = await supabase.auth.admin.listUsers();
    const existing = existingUsers?.users?.find((u) => u.email?.toLowerCase() === email);
    if (existing) {
      targetUserId = existing.id;
    } else {
      const tempPassword = crypto.randomUUID() + "Aa1!";
      const { data: newUser, error: createErr } = await supabase.auth.admin.createUser({
        email,
        password: tempPassword,
        email_confirm: true,
        user_metadata: { full_name: fullName, invited_as: "affiliate" },
      });
      if (createErr) throw new Error(`Failed to create user: ${createErr.message}`);
      targetUserId = newUser.user.id;

      // Ensure profile row has the name
      await supabase
        .from("profiles")
        .upsert({ user_id: targetUserId, full_name: fullName }, { onConflict: "user_id" });
    }

    // 2. Look up tier
    const { data: tierRow, error: tierErr } = await supabase
      .from("affiliate_commission_tiers")
      .select("id")
      .eq("tier_key", tierKey)
      .maybeSingle();
    if (tierErr || !tierRow) throw new Error(`Unknown commission tier: ${tierKey}`);

    // 3. Find or create affiliate profile
    let affiliateId: string | null = null;
    let referralCode: string | null = null;
    const { data: existingAffiliate } = await supabase
      .from("affiliate_profiles")
      .select("id, referral_code")
      .eq("user_id", targetUserId)
      .maybeSingle();

    if (existingAffiliate) {
      affiliateId = existingAffiliate.id;
      referralCode = existingAffiliate.referral_code;
    } else {
      // Generate a unique code
      const seed = (fullName.replace(/[^a-zA-Z0-9]/g, "").slice(0, 4) || "PAIG").toUpperCase();
      let code = seed + Math.random().toString(36).slice(2, 6).toUpperCase();
      for (let i = 0; i < 5; i++) {
        const { data: clash } = await supabase
          .from("referral_codes").select("code").eq("code", code).maybeSingle();
        if (!clash) break;
        code = seed + Math.random().toString(36).slice(2, 6).toUpperCase();
      }

      const { data: newAffiliate, error: affErr } = await supabase
        .from("affiliate_profiles")
        .insert({
          user_id: targetUserId,
          referral_code: code,
          commission_tier_id: tierRow.id,
          enrolled_from: `admin_invite_${tierKey}`,
          active: true,
        })
        .select("id, referral_code")
        .single();
      if (affErr) throw new Error(`Failed to create affiliate profile: ${affErr.message}`);
      affiliateId = newAffiliate.id;
      referralCode = newAffiliate.referral_code;

      await supabase
        .from("referral_codes")
        .insert({ code, affiliate_id: affiliateId, active: true });
    }

    // 4. Generate recovery link so the invitee can set their own password
    const { data: linkData } = await supabase.auth.admin.generateLink({
      type: "recovery",
      email,
      options: { redirectTo: "https://paigeagent.ai/auth" },
    });
    const setPasswordUrl = linkData?.properties?.action_link || "https://paigeagent.ai/auth?mode=login";

    const referralLink = `https://paigeagent.ai/?ref=${encodeURIComponent(referralCode!)}#pricing`;

    // 5. Send branded invitation email (best-effort)
    let emailSent = false;
    try {
      const { error: emailErr } = await supabase.functions.invoke("send-transactional-email", {
        body: {
          templateName: "affiliate-invitation",
          recipientEmail: email,
          idempotencyKey: `affiliate-invite-${affiliateId}`,
          templateData: {
            name: fullName,
            referralCode,
            referralLink,
            setPasswordUrl,
            invitedBy: inviterName,
            tier: tierKey,
          },
        },
      });
      emailSent = !emailErr;
      if (emailErr) console.error("affiliate invite email error:", emailErr);
    } catch (e) {
      console.error("affiliate invite email exception:", e);
    }

    // 6. Audit log
    await supabase.from("audit_logs").insert({
      user_id: user.id,
      entity: "affiliate_profile",
      action: "affiliate_invited",
      entity_id: affiliateId,
      data: { email, full_name: fullName, tier_key: tierKey, target_user_id: targetUserId },
    });

    return new Response(
      JSON.stringify({
        success: true,
        affiliate_id: affiliateId,
        referral_code: referralCode,
        referral_link: referralLink,
        email_sent: emailSent,
      }),
      { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } },
    );
  } catch (error: any) {
    console.error("invite-affiliate error:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } },
    );
  }
};

serve(handler);

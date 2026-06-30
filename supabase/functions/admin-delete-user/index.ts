import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.75.0";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const handler = async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const admin = createClient(supabaseUrl, supabaseServiceKey);

    // Verify caller is admin
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("No authorization header");

    const token = authHeader.replace("Bearer ", "");
    const { data: { user: caller }, error: authErr } = await admin.auth.getUser(token);
    if (authErr || !caller) throw new Error("Unauthorized");

    const { data: callerRole } = await admin
      .from("user_roles")
      .select("role")
      .eq("user_id", caller.id)
      .eq("role", "admin")
      .single();

    if (!callerRole) throw new Error("Admin privileges required");

    // Accept both `user_id` (snake) and `userId` (camel) — clients drifted.
    const body = await req.json();
    const user_id: string | undefined = body?.user_id ?? body?.userId;
    if (!user_id || typeof user_id !== "string") throw new Error("Missing user_id");

    // Prevent self-deletion
    if (user_id === caller.id) throw new Error("Cannot delete your own account");

    // Check if target is the platform owner
    const { data: ownerRow } = await admin
      .from("app_settings_owner")
      .select("owner_email")
      .limit(1)
      .single();

    if (ownerRow) {
      const { data: targetUser } = await admin.auth.admin.getUserById(user_id);
      if (targetUser?.user?.email === ownerRow.owner_email) {
        throw new Error("Cannot delete the platform owner");
      }
    }

    // Clean up related data in order
    const cleanups = [
      admin.from("user_roles").delete().eq("user_id", user_id),
      admin.from("profiles").delete().eq("user_id", user_id),
      admin.from("user_subscriptions").delete().eq("user_id", user_id),
      admin.from("user_usage").delete().eq("user_id", user_id),
      admin.from("chat_messages").delete().eq("user_id", user_id),
      admin.from("credit_accounts").delete().eq("user_id", user_id),
      admin.from("credit_negative_items").delete().eq("user_id", user_id),
      admin.from("credit_inquiries").delete().eq("user_id", user_id),
      admin.from("disputes").delete().eq("user_id", user_id),
      admin.from("dispute_letters").delete().eq("user_id", user_id),
      admin.from("dispute_outcomes").delete().eq("user_id", user_id),
      admin.from("credit_factor_scores").delete().eq("user_id", user_id),
      admin.from("credit_report_personal_info").delete().eq("user_id", user_id),
      admin.from("tasks").delete().eq("user_id", user_id),
      admin.from("documents").delete().eq("user_id", user_id),
      admin.from("consent_events").delete().eq("user_id", user_id),
    ];

    await Promise.allSettled(cleanups);

    // Delete the auth user
    const { error: deleteErr } = await admin.auth.admin.deleteUser(user_id);
    if (deleteErr) throw deleteErr;

    // Audit log
    await admin.from("audit_logs").insert({
      user_id: caller.id,
      entity: "user",
      action: "admin_delete_user",
      entity_id: user_id,
      data: { deleted_by: caller.id },
    });

    return new Response(
      JSON.stringify({ success: true }),
      { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  } catch (error: any) {
    console.error("Error in admin-delete-user:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: error.message?.includes("Unauthorized") || error.message?.includes("Admin") ? 403 : 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  }
};

serve(handler);

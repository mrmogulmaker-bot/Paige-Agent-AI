import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.75.0";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const handler = async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const admin = createClient(supabaseUrl, supabaseServiceKey);

    // 1. Verify caller is authenticated and has admin role.
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("Unauthorized: missing token");

    const token = authHeader.replace("Bearer ", "");
    const { data: { user: caller }, error: authErr } = await admin.auth.getUser(
      token,
    );
    if (authErr || !caller) throw new Error("Unauthorized");

    const { data: callerRole } = await admin
      .from("user_roles")
      .select("role")
      .eq("user_id", caller.id)
      .eq("role", "admin")
      .maybeSingle();

    if (!callerRole) throw new Error("Admin privileges required");

    // 2. Validate input.
    const body = await req.json().catch(() => ({}));
    const userId = body?.user_id;
    const scope: "global" | "local" | "others" = body?.scope === "others"
      ? "others"
      : body?.scope === "local"
      ? "local"
      : "global";

    if (!userId || typeof userId !== "string") {
      throw new Error("Missing user_id");
    }

    // 3. Force sign-out: revokes refresh tokens and invalidates sessions.
    const { error: signOutErr } = await admin.auth.admin.signOut(userId, scope);
    if (signOutErr) throw signOutErr;

    // 4. Audit log so this action is traceable.
    await admin.from("audit_logs").insert({
      user_id: caller.id,
      entity: "auth.user",
      action: "admin_force_signout",
      entity_id: userId,
      data: {
        forced_by: caller.id,
        scope,
        forced_at: new Date().toISOString(),
      },
    });

    return new Response(
      JSON.stringify({ success: true, scope }),
      {
        status: 200,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      },
    );
  } catch (error: any) {
    console.error("admin-force-signout error:", error);
    const message = error?.message ?? "Internal error";
    const status = message.toLowerCase().includes("unauthorized") ||
        message.toLowerCase().includes("admin")
      ? 403
      : 500;

    return new Response(
      JSON.stringify({ error: message }),
      {
        status,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      },
    );
  }
};

serve(handler);

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.75.0";
import { z } from "https://esm.sh/zod@3.22.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Whitelist of allowed field paths
const ALLOWED_FIELDS: Record<string, { table: string; column: string; type: "string" | "boolean" | "number" | "date" }> = {
  // Foundation fields (businesses table)
  "foundation.entity_type": { table: "businesses", column: "entity_type", type: "string" },
  "foundation.state_of_formation": { table: "businesses", column: "state_of_formation", type: "string" },
  "foundation.formation_date": { table: "businesses", column: "formation_date", type: "date" },
  "foundation.registered_agent_name": { table: "businesses", column: "registered_agent_name", type: "string" },
  "foundation.registered_agent_address": { table: "businesses", column: "registered_agent_address", type: "string" },
  "foundation.registered_agent_state": { table: "businesses", column: "registered_agent_state", type: "string" },
  "foundation.ein": { table: "businesses", column: "ein", type: "string" },
  "foundation.business_address_type": { table: "businesses", column: "business_address_type", type: "string" },
  "foundation.street_address": { table: "businesses", column: "business_street_address", type: "string" },
  "foundation.city": { table: "businesses", column: "business_city", type: "string" },
  "foundation.state": { table: "businesses", column: "business_state", type: "string" },
  "foundation.zip": { table: "businesses", column: "business_zip", type: "string" },
  "foundation.business_phone": { table: "businesses", column: "business_phone", type: "string" },
  "foundation.phone_411_listed": { table: "businesses", column: "phone_411_listed", type: "boolean" },
  "foundation.bank_name": { table: "businesses", column: "bank_name", type: "string" },
  "foundation.bank_account_opened": { table: "businesses", column: "bank_account_opened_date", type: "date" },
  "foundation.has_bank_account": { table: "businesses", column: "has_bank_account", type: "boolean" },
  "foundation.legal_name": { table: "businesses", column: "legal_name", type: "string" },
  "foundation.dba": { table: "businesses", column: "dba", type: "string" },
  "foundation.naics": { table: "businesses", column: "naics", type: "string" },
  // Public presence fields (business_public_presence table)
  "public_presence.website_url": { table: "business_public_presence", column: "website_url", type: "string" },
  "public_presence.google_business_url": { table: "business_public_presence", column: "google_business_url", type: "string" },
  "public_presence.yelp_url": { table: "business_public_presence", column: "yelp_url", type: "string" },
  "public_presence.linkedin_url": { table: "business_public_presence", column: "linkedin_url", type: "string" },
  "public_presence.facebook_url": { table: "business_public_presence", column: "facebook_url", type: "string" },
  "public_presence.website_live": { table: "business_public_presence", column: "website_live", type: "boolean" },
  "public_presence.google_business_claimed": { table: "business_public_presence", column: "google_business_claimed", type: "boolean" },
  // Personal info audit fields (credit_report_personal_info table)
  "personal_info.status": { table: "credit_report_personal_info", column: "status", type: "string" },
  // Profile fields
  "profile.full_name": { table: "profiles", column: "full_name", type: "string" },
  "profile.city": { table: "profiles", column: "city", type: "string" },
  "profile.state": { table: "profiles", column: "state", type: "string" },
  // Funding goal fields (funding_profiles table)
  "funding.objective": { table: "funding_profiles", column: "funding_objective", type: "string" },
  "funding.target_amount": { table: "funding_profiles", column: "target_amount", type: "number" },
  "funding.timeline": { table: "funding_profiles", column: "timeline", type: "string" },
};

const writeBackSchema = z.object({
  updates: z.array(z.object({
    field_path: z.string().min(1).max(100),
    field_value: z.union([z.string(), z.number(), z.boolean(), z.null()]),
    record_id: z.string().uuid().optional(),
  })).min(1).max(10),
  target_user_id: z.string().uuid().optional(),
});

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    // Authenticate caller
    const authClient = createClient(supabaseUrl, supabaseKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: authError } = await authClient.auth.getUser();
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Invalid token" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Parse and validate input
    const rawData = await req.json();
    let validated;
    try {
      validated = writeBackSchema.parse(rawData);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return new Response(JSON.stringify({ error: "Invalid input", details: err.issues }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      throw err;
    }

    const targetUserId = validated.target_user_id || user.id;

    // Check authorization: user can update own data, admins/coaches can update assigned clients
    if (targetUserId !== user.id) {
      const { data: roles } = await supabase.from("user_roles").select("role").eq("user_id", user.id);
      const userRoles = (roles || []).map((r: any) => r.role);
      const isAdmin = userRoles.includes("admin");
      const isCoach = userRoles.includes("coach");

      if (!isAdmin && !isCoach) {
        return new Response(JSON.stringify({ error: "Not authorized to update this user's data" }), {
          status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      if (isCoach && !isAdmin) {
        const { data: assignment } = await supabase
          .from("coach_clients")
          .select("id")
          .eq("coach_user_id", user.id)
          .eq("client_user_id", targetUserId)
          .eq("status", "active")
          .maybeSingle();
        if (!assignment) {
          return new Response(JSON.stringify({ error: "Not assigned to this client" }), {
            status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
      }
    }

    const results: any[] = [];

    for (const update of validated.updates) {
      const fieldDef = ALLOWED_FIELDS[update.field_path];
      if (!fieldDef) {
        results.push({ field_path: update.field_path, success: false, error: "Field not in whitelist" });
        continue;
      }

      try {
        const { table, column } = fieldDef;

        if (table === "businesses") {
          // Find the user's primary business
          const { data: biz } = await supabase
            .from("businesses")
            .select("id")
            .eq("owner_user_id", targetUserId)
            .order("created_at", { ascending: true })
            .limit(1)
            .maybeSingle();
          if (!biz) {
            results.push({ field_path: update.field_path, success: false, error: "No business found" });
            continue;
          }
          await supabase.from("businesses").update({ [column]: update.field_value }).eq("id", biz.id);
          results.push({ field_path: update.field_path, success: true });
        } else if (table === "business_public_presence") {
          const { data: biz } = await supabase
            .from("businesses")
            .select("id")
            .eq("owner_user_id", targetUserId)
            .order("created_at", { ascending: true })
            .limit(1)
            .maybeSingle();
          if (!biz) {
            results.push({ field_path: update.field_path, success: false, error: "No business found" });
            continue;
          }
          // Upsert public presence
          const { data: existing } = await supabase
            .from("business_public_presence")
            .select("id")
            .eq("business_id", biz.id)
            .maybeSingle();
          if (existing) {
            await supabase.from("business_public_presence").update({ [column]: update.field_value }).eq("id", existing.id);
          } else {
            await supabase.from("business_public_presence").insert({
              business_id: biz.id,
              user_id: targetUserId,
              [column]: update.field_value,
            });
          }
          results.push({ field_path: update.field_path, success: true });
        } else if (table === "credit_report_personal_info") {
          if (!update.record_id) {
            results.push({ field_path: update.field_path, success: false, error: "record_id required for personal_info updates" });
            continue;
          }
          await supabase.from("credit_report_personal_info").update({ [column]: update.field_value }).eq("id", update.record_id).eq("user_id", targetUserId);
          results.push({ field_path: update.field_path, success: true });
        } else if (table === "profiles") {
          await supabase.from("profiles").update({ [column]: update.field_value }).eq("user_id", targetUserId);
          results.push({ field_path: update.field_path, success: true });
        } else if (table === "funding_profiles") {
          const { data: fp } = await supabase
            .from("funding_profiles")
            .select("id")
            .eq("user_id", targetUserId)
            .maybeSingle();
          if (fp) {
            await supabase.from("funding_profiles").update({ [column]: update.field_value }).eq("id", fp.id);
          } else {
            await supabase.from("funding_profiles").insert({ user_id: targetUserId, [column]: update.field_value });
          }
          results.push({ field_path: update.field_path, success: true });
        } else {
          results.push({ field_path: update.field_path, success: false, error: "Unknown table" });
        }
      } catch (err) {
        console.error(`Write-back error for ${update.field_path}:`, err);
        results.push({ field_path: update.field_path, success: false, error: err instanceof Error ? err.message : "Unknown error" });
      }
    }

    // Audit log
    await supabase.from("audit_logs").insert({
      user_id: user.id,
      entity: "write_back",
      action: "paige_write_back",
      data: {
        target_user_id: targetUserId,
        updates: validated.updates.map(u => ({ field_path: u.field_path, success: results.find(r => r.field_path === u.field_path)?.success })),
        timestamp: new Date().toISOString(),
      },
    });

    return new Response(JSON.stringify({ success: true, results }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Write-back error:", error);
    return new Response(JSON.stringify({ error: "Internal error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

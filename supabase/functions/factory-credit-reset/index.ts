import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.75.0";
import { z } from "https://esm.sh/zod@3.22.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const bodySchema = z.object({
  source: z.string().min(1).max(100).optional(),
});

function ensureNoError(error: { message?: string } | null, label: string) {
  if (error) {
    throw new Error(`${label}: ${error.message || "Unknown error"}`);
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let parsedBody = { source: "client_ui" };
    if (req.method !== "GET") {
      const json = await req.json().catch(() => ({}));
      const result = bodySchema.safeParse(json);
      if (!result.success) {
        return new Response(JSON.stringify({ error: result.error.flatten() }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      parsedBody = { source: result.data.source || "client_ui" };
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const supabaseServiceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const supabaseClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const {
      data: { user },
      error: authError,
    } = await supabaseClient.auth.getUser();
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Invalid authentication token" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const admin = createClient(supabaseUrl, supabaseServiceRoleKey);

    const { data: linkedClients, error: linkedClientsError } = await admin
      .from("clients")
      .select("id")
      .eq("linked_user_id", user.id);
    ensureNoError(linkedClientsError, "Load linked clients");

    const linkedClientIds = (linkedClients || []).map((client) => client.id);
    const startedAt = new Date().toISOString();

    const clearedTables: string[] = [];

    const deletions = [
      ["credit_accounts", admin.from("credit_accounts").delete().eq("user_id", user.id)],
      ["credit_negative_items_user", admin.from("credit_negative_items").delete().eq("user_id", user.id)],
      ["credit_report_personal_info_user", admin.from("credit_report_personal_info").delete().eq("user_id", user.id)],
      ["credit_alerts", admin.from("credit_alerts").delete().eq("client_id", user.id)],
      ["credit_factor_scores_user", admin.from("credit_factor_scores").delete().eq("user_id", user.id)],
      ["credit_inquiries", admin.from("credit_inquiries").delete().eq("user_id", user.id)],
      // [§194] dispute_outcomes / dispute_letters / disputes tables removed.
      ["funding_readiness_scores", admin.from("funding_readiness_scores").delete().eq("user_id", user.id)],
      ["funding_secured_user", admin.from("funding_secured").delete().eq("user_id", user.id)],
      ["funding_secured_client_user", admin.from("funding_secured").delete().eq("client_user_id", user.id)],
      ["funding_projections", admin.from("funding_projections").delete().eq("user_id", user.id)],
      ["funding_application_outcomes_user", admin.from("funding_application_outcomes").delete().eq("user_id", user.id)],
      ["funding_plans", admin.from("funding_plans").delete().eq("user_id", user.id)],
      ["build_scores", admin.from("build_scores").delete().eq("user_id", user.id)],
      ["client_memory_user", admin.from("client_memory").delete().eq("client_user_id", user.id)],
      ["chat_messages", admin.from("chat_messages").delete().eq("user_id", user.id)],
      ["conversation_context", admin.from("conversation_context").delete().eq("user_id", user.id)],
      ["extraction_quality_log_user", admin.from("extraction_quality_log").delete().eq("user_id", user.id)],
    ] as const;

    const deletionResults = await Promise.all(deletions.map(([, query]) => query));
    deletionResults.forEach((result, index) => {
      const [label] = deletions[index];
      ensureNoError(result.error, `Delete ${label}`);
      clearedTables.push(label);
    });

    if (linkedClientIds.length > 0) {
      const linkedDeletes = [
        ["credit_negative_items_client", admin.from("credit_negative_items").delete().in("client_id", linkedClientIds)],
        ["credit_report_personal_info_client", admin.from("credit_report_personal_info").delete().in("client_id", linkedClientIds)],
        ["credit_factor_scores_client", admin.from("credit_factor_scores").delete().in("client_id", linkedClientIds)],
        ["client_memory_client", admin.from("client_memory").delete().in("client_id", linkedClientIds)],
        ["extraction_quality_log_client", admin.from("extraction_quality_log").delete().in("client_id", linkedClientIds)],
        // [§194] dispute_outcomes / disputes removed.
        ["funding_application_outcomes_client", admin.from("funding_application_outcomes").delete().in("client_id", linkedClientIds)],
      ] as const;

      const linkedResults = await Promise.all(linkedDeletes.map(([, query]) => query));
      linkedResults.forEach((result, index) => {
        const [label] = linkedDeletes[index];
        ensureNoError(result.error, `Delete ${label}`);
        clearedTables.push(label);
      });
    }

    const { error: uploadsError } = await admin
      .from("credit_report_uploads")
      .update({
        analysis_status: "pending",
        analysis_result: null,
        negative_items_extracted: null,
        positive_accounts_extracted: null,
        profile_summary: null,
        estimated_score_impact: null,
        last_analyzed_at: null,
        bureau_detected: null,
        backfill_status: null,
        backfill_completed_at: null,
        backfill_fields_updated: null,
        error_message: null,
      })
      .eq("user_id", user.id);
    ensureNoError(uploadsError, "Reset credit_report_uploads");
    clearedTables.push("credit_report_uploads_reset");

    const { error: profileError } = await admin
      .from("profiles")
      .update({
        estimated_fico_eq: null,
        estimated_fico_ex: null,
        estimated_fico_tu: null,
        score_model: null,
        last_report_analyzed_at: null,
        last_report_source: null,
        has_discrepancies: null,
        cross_bureau_discrepancies: null,
      })
      .eq("user_id", user.id);
    ensureNoError(profileError, "Reset profiles credit fields");
    clearedTables.push("profiles_credit_fields_reset");

    const { error: auditError } = await admin.from("audit_logs").insert({
      user_id: user.id,
      entity: "credit_file",
      action: "factory_reset",
      data: {
        source: parsedBody.source,
        triggered_by: user.id,
        timestamp: startedAt,
        cleared_tables: clearedTables,
      },
    });
    ensureNoError(auditError, "Write audit log");

    return new Response(JSON.stringify({ success: true, user_id: user.id, cleared_tables: clearedTables }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("factory-credit-reset error", error);
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : "Reset failed" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

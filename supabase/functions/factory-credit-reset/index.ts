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

    const { data: { user }, error: authError } = await supabaseClient.auth.getUser();
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

    const deletions = [
      admin.from("credit_accounts").delete().eq("user_id", user.id),
      admin.from("credit_negative_items").delete().eq("user_id", user.id),
      admin.from("credit_report_personal_info").delete().eq("user_id", user.id),
      admin.from("credit_alerts").delete().eq("client_id", user.id),
      admin.from("credit_factor_scores").delete().eq("user_id", user.id),
      admin.from("client_memory").delete().eq("client_user_id", user.id),
      admin.from("chat_messages").delete().eq("user_id", user.id),
      admin.from("conversation_context").delete().eq("user_id", user.id),
      admin.from("extraction_quality_log").delete().eq("user_id", user.id),
    ];

    const deletionResults = await Promise.all(deletions);
    const deletionLabels = [
      "credit_accounts",
      "credit_negative_items",
      "credit_report_personal_info",
      "credit_alerts",
      "credit_factor_scores",
      "client_memory",
      "chat_messages",
      "conversation_context",
      "extraction_quality_log",
    ];

    deletionResults.forEach((result, index) => ensureNoError(result.error, `Delete ${deletionLabels[index]}`));

    if (linkedClientIds.length > 0) {
      const linkedDeletes = await Promise.all([
        admin.from("client_memory").delete().in("client_id", linkedClientIds),
        admin.from("extraction_quality_log").delete().in("client_id", linkedClientIds),
      ]);
      ensureNoError(linkedDeletes[0].error, "Delete linked client_memory");
      ensureNoError(linkedDeletes[1].error, "Delete linked extraction_quality_log");
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

    const { error: auditError } = await admin.from("audit_logs").insert({
      user_id: user.id,
      entity: "credit_file",
      action: "factory_reset",
      data: {
        source: parsedBody.source,
        triggered_by: user.id,
        timestamp: startedAt,
        cleared_tables: [
          "credit_accounts",
          "credit_negative_items",
          "credit_report_personal_info",
          "credit_alerts",
          "credit_factor_scores",
          "client_memory",
          "chat_messages",
          "conversation_context",
          "extraction_quality_log",
        ],
      },
    });
    ensureNoError(auditError, "Write audit log");

    return new Response(JSON.stringify({ success: true, user_id: user.id }), {
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

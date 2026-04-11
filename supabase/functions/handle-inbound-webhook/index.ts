import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, serviceKey);

  try {
    // Validate API key
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ success: false, message: "Missing or invalid Authorization header" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const apiKey = authHeader.replace("Bearer ", "");
    
    // Hash the key and check against stored hashes
    const encoder = new TextEncoder();
    const data = encoder.encode(apiKey);
    const hashBuffer = await crypto.subtle.digest("SHA-256", data);
    const keyHash = Array.from(new Uint8Array(hashBuffer)).map(b => b.toString(16).padStart(2, "0")).join("");

    const { data: keyRecord, error: keyError } = await supabase
      .from("platform_api_keys")
      .select("id, is_active")
      .eq("key_hash", keyHash)
      .eq("is_active", true)
      .maybeSingle();

    if (keyError || !keyRecord) {
      return new Response(JSON.stringify({ success: false, message: "Invalid API key" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Parse body
    const body = await req.json();
    const { action, data: actionData } = body;

    if (!action) {
      return new Response(JSON.stringify({ success: false, message: "Missing 'action' field" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let result: Record<string, unknown>;

    switch (action) {
      case "create_client": {
        const { first_name, last_name, email, phone, entity_name, entity_type, funding_goal, notes } = actionData || {};
        if (!email || !first_name || !last_name) {
          return res(400, { success: false, message: "first_name, last_name, and email are required" });
        }

        // Create auth user
        const { data: authUser, error: authErr } = await supabase.auth.admin.createUser({
          email,
          email_confirm: true,
          user_metadata: { full_name: `${first_name} ${last_name}` },
        });

        if (authErr) {
          return res(400, { success: false, message: `Failed to create user: ${authErr.message}` });
        }

        // Update profile with extra fields
        const userId = authUser.user.id;
        await supabase.from("profiles").update({
          full_name: `${first_name} ${last_name}`,
          phone: phone || null,
        }).eq("user_id", userId);

        // If entity info provided, create a business
        if (entity_name) {
          await supabase.from("businesses").insert({
            legal_name: entity_name,
            entity_type: entity_type || null,
            owner_user_id: userId,
          });
        }

        // Log activity
        await supabase.from("audit_logs").insert({
          user_id: userId,
          entity: "client",
          action: "created_via_webhook",
          data: { funding_goal, notes, source: "inbound_webhook" },
        });

        result = { success: true, message: "Client created", client_id: userId };
        break;
      }

      case "update_client_profile": {
        const { client_id, ...profileFields } = actionData || {};
        if (!client_id) return res(400, { success: false, message: "client_id is required" });

        const updateData: Record<string, unknown> = {};
        if (profileFields.full_name) updateData.full_name = profileFields.full_name;
        if (profileFields.phone) updateData.phone = profileFields.phone;
        if (profileFields.address) updateData.address = profileFields.address;

        const { error } = await supabase.from("profiles").update(updateData).eq("user_id", client_id);
        if (error) return res(400, { success: false, message: error.message });

        result = { success: true, message: "Client profile updated" };
        break;
      }

      case "complete_milestone": {
        const { client_id, milestone_name } = actionData || {};
        if (!client_id || !milestone_name) return res(400, { success: false, message: "client_id and milestone_name required" });

        await supabase.from("audit_logs").insert({
          user_id: client_id,
          entity: "milestone",
          action: "completed_via_webhook",
          data: { milestone_name, completed_at: new Date().toISOString() },
        });

        result = { success: true, message: `Milestone '${milestone_name}' completed` };
        break;
      }

      case "add_activity_note": {
        const { client_id, note } = actionData || {};
        if (!client_id || !note) return res(400, { success: false, message: "client_id and note required" });

        await supabase.from("audit_logs").insert({
          user_id: client_id,
          entity: "activity",
          action: "note_added_via_webhook",
          data: { note, added_at: new Date().toISOString() },
        });

        result = { success: true, message: "Activity note added" };
        break;
      }

      case "log_funding": {
        const { client_id, amount, lender_name, product_type, date_secured } = actionData || {};
        if (!client_id || !amount || !lender_name || !product_type || !date_secured) {
          return res(400, { success: false, message: "client_id, amount, lender_name, product_type, and date_secured required" });
        }

        const { error } = await supabase.from("funding_secured").insert({
          user_id: client_id,
          amount,
          lender_name,
          product_type,
          date_secured,
        });

        if (error) return res(400, { success: false, message: error.message });

        // Fire outbound webhook
        try {
          await supabase.functions.invoke("fire-outbound-webhooks", {
            body: {
              event_type: "funding_logged",
              data: { client_id, lender_name, amount, product_type },
            },
          });
        } catch (_) { /* best effort */ }

        result = { success: true, message: "Funding event logged" };
        break;
      }

      case "trigger_score_recalculation": {
        const { client_id } = actionData || {};
        if (!client_id) return res(400, { success: false, message: "client_id required" });

        await supabase.from("audit_logs").insert({
          user_id: client_id,
          entity: "pme_score",
          action: "recalculation_triggered_via_webhook",
          data: { triggered_at: new Date().toISOString() },
        });

        result = { success: true, message: "Score recalculation triggered" };
        break;
      }

      default:
        return res(400, { success: false, message: `Unknown action: ${action}` });
    }

    // Log inbound event
    await supabase.from("webhook_event_log").insert({
      direction: "inbound",
      event_type: action,
      payload_summary: { action, has_data: !!actionData },
      request_payload: body,
      http_status: 200,
      status: "success",
    });

    return res(200, result);
  } catch (error) {
    console.error("Inbound webhook error:", error);

    // Log failure
    try {
      await supabase.from("webhook_event_log").insert({
        direction: "inbound",
        event_type: "unknown",
        payload_summary: { error: error.message },
        http_status: 500,
        status: "failed",
      });
    } catch (_) {}

    return res(500, { success: false, message: "Internal server error" });
  }
});

function res(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
      "Content-Type": "application/json",
    },
  });
}

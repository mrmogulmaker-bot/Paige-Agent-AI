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
    const { event_type, data } = await req.json();

    if (!event_type) {
      return new Response(JSON.stringify({ error: "event_type required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get all active webhook configs subscribed to this event
    const { data: configs, error } = await supabase
      .from("outbound_webhook_configs")
      .select("*")
      .eq("is_active", true)
      .contains("subscribed_events", [event_type]);

    if (error) {
      console.error("Error fetching webhook configs:", error);
      return new Response(JSON.stringify({ error: "Failed to fetch configs" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!configs || configs.length === 0) {
      return new Response(JSON.stringify({ message: "No webhooks subscribed to this event" }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const payload = {
      event: event_type,
      timestamp: new Date().toISOString(),
      platform: "paige_agent",
      data,
    };

    const results = [];

    for (const config of configs) {
      let lastStatus = "failed";
      let lastHttpCode: number | null = null;
      let lastResponseBody = "";

      // Retry up to 3 times with exponential backoff
      for (let attempt = 0; attempt < 3; attempt++) {
        if (attempt > 0) {
          await new Promise(r => setTimeout(r, Math.pow(2, attempt) * 1000));
        }

        try {
          const response = await fetch(config.url, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          });

          lastHttpCode = response.status;
          lastResponseBody = await response.text();

          if (response.ok) {
            lastStatus = "success";
            break;
          }
        } catch (fetchError) {
          lastResponseBody = fetchError.message;
          lastHttpCode = 0;
        }
      }

      // Log the attempt
      await supabase.from("webhook_event_log").insert({
        direction: "outbound",
        event_type,
        target_url: config.url,
        payload_summary: { event: event_type, data_keys: data ? Object.keys(data) : [] },
        request_payload: payload,
        response_body: lastResponseBody.substring(0, 2000),
        http_status: lastHttpCode,
        status: lastStatus,
        retry_count: lastStatus === "success" ? 0 : 3,
      });

      results.push({ url: config.url, status: lastStatus, http_status: lastHttpCode });
    }

    return new Response(JSON.stringify({ success: true, results }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Outbound webhook error:", error);
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

// deno-lint-ignore-file no-explicit-any
// Browserbase-powered headless Chrome agent. Inert until BROWSERBASE_API_KEY + BROWSERBASE_PROJECT_ID are set.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const body = await req.json();
    const { goal, start_url, steps, related_contact_id, related_business_id, invoker_user_id, invoker_kind } = body;
    if (!goal || !start_url) {
      return new Response(JSON.stringify({ error: "goal + start_url required" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const admin = createClient(SUPABASE_URL, SERVICE_KEY);
    const { data: session } = await admin.from("browser_use_sessions").insert({
      goal, start_url, steps: steps ?? [],
      related_contact_id: related_contact_id ?? null,
      related_business_id: related_business_id ?? null,
      invoker_user_id: invoker_user_id ?? null,
      invoker_kind: invoker_kind ?? "admin",
      status: "running",
    }).select().single();

    const bbKey = Deno.env.get("BROWSERBASE_API_KEY");
    const bbProject = Deno.env.get("BROWSERBASE_PROJECT_ID");

    if (!bbKey || !bbProject) {
      await admin.from("browser_use_sessions")
        .update({ status: "failed", error: "Browserbase credentials not configured. Add BROWSERBASE_API_KEY and BROWSERBASE_PROJECT_ID.", completed_at: new Date().toISOString() })
        .eq("id", session!.id);
      return new Response(JSON.stringify({
        session_id: session!.id,
        status: "unavailable",
        message: "Browser Use is wired but inactive. Add BROWSERBASE_API_KEY + BROWSERBASE_PROJECT_ID secrets to activate.",
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const start = Date.now();
    try {
      // Create Browserbase session
      const sessRes = await fetch("https://api.browserbase.com/v1/sessions", {
        method: "POST",
        headers: { "X-BB-API-Key": bbKey, "Content-Type": "application/json" },
        body: JSON.stringify({ projectId: bbProject }),
      });
      const sessData = await sessRes.json();
      if (!sessRes.ok) throw new Error(`Browserbase session create failed: ${JSON.stringify(sessData)}`);

      // NOTE: Real Playwright control would happen here (open WS connection, navigate, run steps).
      // Edge functions can't import Playwright. For deeper flows, route through a longer-running task
      // or call Browserbase's Stagehand API. For now we log session + replay URL so the operator can watch.
      const replayUrl = `https://www.browserbase.com/sessions/${sessData.id}`;

      await admin.from("browser_use_sessions")
        .update({
          status: "succeeded",
          session_replay_url: replayUrl,
          result: { browserbase_session_id: sessData.id, note: "Session opened. Use Stagehand or Playwright client for full automation." },
          duration_ms: Date.now() - start,
          cost_cents: 5,
          completed_at: new Date().toISOString(),
        })
        .eq("id", session!.id);

      return new Response(
        JSON.stringify({ session_id: session!.id, browserbase_session_id: sessData.id, replay_url: replayUrl }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    } catch (err) {
      await admin.from("browser_use_sessions")
        .update({ status: "failed", error: (err as Error).message, duration_ms: Date.now() - start, completed_at: new Date().toISOString() })
        .eq("id", session!.id);
      throw err;
    }
  } catch (err) {
    console.error("browser-use error", err);
    return new Response(JSON.stringify({ error: (err as Error).message }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});

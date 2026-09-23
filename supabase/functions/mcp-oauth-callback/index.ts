// mcp-oauth-callback — the provider redirect target for the Connected MCP Gateway OAuth flow.
//
// WHY A SEPARATE FUNCTION, NOT AN ACTION ON mcp-gateway (§18 answered honestly). The gateway door
// (mcp-gateway) is JWT-gated (verify_jwt=true) and every action reads a JSON `action` body from an
// authenticated POST. An OAuth authorization-code flow does NOT complete that way: the provider
// redirects the HOST'S BROWSER straight here with a top-level GET carrying ?code=&state= and NO
// Supabase JWT. That request cannot satisfy the gateway's verify_jwt, so it must land on a
// verify_jwt=false function — exactly as zoom-oauth-callback / tenant-n8n-oauth / paige-social-callback
// already do. This is the repo's settled callback-door convention, not a new pattern.
//
// WHY code/state NEVER LEAK (the #1355 structural resolution). #1355 is that the React SPA's analytics
// (usePageView → track-event; PostHog capture_pageview/autocapture) write the current URL — INCLUDING
// its query string — into the analytics store on first render. Routing the OAuth redirect through the
// SPA would therefore commit ?code=&state= to analytics before any React effect could clear it. This
// function is NOT the SPA: it is a Deno edge endpoint that receives the GET, does its work, and answers
// with a 302 to a CLEAN app URL (no code/state). The authorization code and state never enter an
// analytics-instrumented surface — a structural guarantee, not a redaction that has to be maintained.
//
// This wrapper is deliberately thin: it reads env, builds the service-role client, and hands the GET
// query to runOauthCallback (the headless-provable core, _shared/mcp-gateway/oauth-callback.ts), which
// owns state redemption, the token exchange, the grant write, and the redirect that must never carry
// code/state. AUTHORITY / SECRET DISCIPLINE / §9 are documented there.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { runOauthCallback } from "../_shared/mcp-gateway/oauth-callback.ts";

// The app origin the browser is sent back to. A route is an address, never authorization — the mounted
// shell still resolves the session + tenant server-side (canonical-app-url contract).
const APP_ORIGIN = (Deno.env.get("PUBLIC_SITE_URL") ?? "https://paigeagent.ai").replace(/\/$/, "");

Deno.serve(async (req) => {
  const reqUrl = new URL(req.url);
  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const result = await runOauthCallback(
    { admin },
    {
      code: reqUrl.searchParams.get("code"),
      state: reqUrl.searchParams.get("state"),
      error: reqUrl.searchParams.get("error"),
    },
    { appOrigin: APP_ORIGIN },
  );

  return new Response(null, { status: result.status, headers: { Location: result.location } });
});

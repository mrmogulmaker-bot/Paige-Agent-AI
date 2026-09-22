// mcp-gateway — the runtime HTTP surface for the Connected MCP Gateway (the provider-agnostic
// `mcp_connections` registry). This is the first deployed caller of the new gateway, so importing
// `_shared/mcp-gateway/*` here is also what puts the whole gateway library into the deploy
// affected-set (INT-105 / edge-affected.py import closure) — until now those modules shipped to
// nothing.
//
// SLICE ①: action `verify` only. `create`, `oauth_begin`/`oauth_callback`, `approve` and `execute`
// land in the following slices and extend this same function (§18: one gateway door, many actions).
//
// AUTHORITY / SECRETS / SSRF: see `_shared/mcp-gateway/verify.ts`. This wrapper does the minimum a
// Deno edge entry must — CORS, build the two Supabase clients, authenticate the caller — then hands
// the fully-typed request to `runVerify`, which owns the §9 tenant gates, the loader, the read-only
// intake, and the service-role probe write. The wrapper never sees a decrypted secret.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders, jsonResponse } from "../_shared/adminAuth.ts";
import { runVerify } from "../_shared/mcp-gateway/verify.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse({ error: "method_not_allowed" }, 405);

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const anon = Deno.env.get("SUPABASE_ANON_KEY")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const authHeader = req.headers.get("Authorization") ?? "";

  // RLS-scoped as the caller — every authority gate resolves through THIS client.
  const userClient = createClient(supabaseUrl, anon, { global: { headers: { Authorization: authHeader } } });
  const { data: { user } } = await userClient.auth.getUser();
  if (!user) return jsonResponse({ error: "unauthorized" }, 401);

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const action = typeof body.action === "string" ? body.action : "";
  if (action !== "verify") return jsonResponse({ error: "unsupported_action" }, 400);

  const connectionId = typeof body.connection_id === "string" ? body.connection_id : "";
  const expectedTenantId = typeof body.expected_tenant_id === "string" ? body.expected_tenant_id : null;

  // service-role client: the ONLY holder of the decrypted-secret read and the probe write.
  const admin = createClient(supabaseUrl, serviceKey);

  const result = await runVerify({ userClient, admin }, { connectionId, expectedTenantId });
  return jsonResponse(result.body, result.httpStatus);
});

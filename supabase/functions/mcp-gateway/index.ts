// mcp-gateway — the runtime HTTP surface for the Connected MCP Gateway (the provider-agnostic
// `mcp_connections` registry). This is the first deployed caller of the new gateway, so importing
// `_shared/mcp-gateway/*` here is also what puts the whole gateway library into the deploy
// affected-set (INT-105 / edge-affected.py import closure) — until now those modules shipped to
// nothing.
//
// ACTIONS: `verify` (Slice ①) + `create` (Slice ②). `oauth_begin`/`oauth_callback`, `approve` and
// `execute` land in the following slices and extend this same function (§18: one gateway door, many
// actions).
//
// AUTHORITY / SECRETS / SSRF: see `_shared/mcp-gateway/verify.ts` and `create.ts`. This wrapper does
// the minimum a Deno edge entry must — CORS, authenticate the caller, dispatch on the action — then
// hands the fully-typed request to the action handler. `verify` needs a service-role client (secret
// decrypt + probe write), built INSIDE its branch; `create` takes only the caller-scoped client (§59),
// so the wrapper never puts the service-role client in create's scope, and never sees a secret itself.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders, jsonResponse } from "../_shared/adminAuth.ts";
import { runVerify } from "../_shared/mcp-gateway/verify.ts";
import { readCreateInput, runCreate } from "../_shared/mcp-gateway/create.ts";

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
  const expectedTenantId = typeof body.expected_tenant_id === "string" ? body.expected_tenant_id : null;

  if (action === "verify") {
    const connectionId = typeof body.connection_id === "string" ? body.connection_id : "";
    // service-role client: the ONLY holder of the decrypted-secret read and the probe write. Built
    // HERE, inside the verify branch, so it is never in lexical scope for `create` — which must not
    // touch it (§59): create reads no secret and writes no probe, so its authority is the writer
    // RPC's own in-body §9 gate, resolved through the caller's userClient.
    const admin = createClient(supabaseUrl, serviceKey);
    const result = await runVerify({ userClient, admin }, { connectionId, expectedTenantId });
    return jsonResponse(result.body, result.httpStatus);
  }

  if (action === "create") {
    // Thin JWT-scoped pass-through onto the G1a-1 writer RPCs — { userClient } only (§59); the RPC's
    // in-body §9 authority + credential/SSRF validation is the authority.
    const result = await runCreate({ userClient }, readCreateInput(body, expectedTenantId));
    return jsonResponse(result.body, result.httpStatus);
  }

  return jsonResponse({ error: "unsupported_action" }, 400);
});

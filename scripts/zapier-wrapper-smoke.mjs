// scripts/zapier-wrapper-smoke.mjs — headless smoke test for the PURE glue of the
// Paige-as-MCP-CLIENT Zapier wrapper tools (Wave 1 #253).
//
// WHY THIS EXISTS (§32): a green `deno check` proves the wrapper TYPE-CHECKS; it proves
// nothing about the arg-parsing, needs_config, and result-shaping logic actually being
// correct. That pure logic lives across two Deno files (paige-ai-chat dispatch +
// call-zapier-action edge fn) that import Deno/esm chains and can't be plain-Node
// imported — so the pure logic is copied VERBATIM below and asserted. Keep in sync with:
//   • supabase/functions/paige-ai-chat/index.ts  (the zapier_* dispatch else-if)
//   • supabase/functions/call-zapier-action/index.ts (isList / rpc / extractActions)
//
// Run:  node scripts/zapier-wrapper-smoke.mjs
// Exit: 0 = all glue holds; non-zero = a mismatch (fix before shipping).
//
// What it does NOT cover (§32/§4 honesty — OWED to a capable session): a live
// authenticated round-trip against a real tenant's connected Zapier MCP server
// (a real tools/list + a real tools/call). That cannot run headless.

let failures = 0;
function ok(name, cond) {
  if (cond) { console.log(`  ok  ${name}`); }
  else { console.error(`FAIL  ${name}`); failures++; }
}
function eq(name, a, b) { ok(`${name} (got ${JSON.stringify(a)})`, JSON.stringify(a) === JSON.stringify(b)); }

// ─── VERBATIM from paige-ai-chat/index.ts: the zapier_* dispatch body-shaping ───────
// The dispatch NEVER puts a tenant_id in the body — the tenant is resolved server-side
// inside the edge fn from the caller's JWT (§9). This is the foreign-tenant-impossible
// property, asserted below.
function buildZapBody(toolName, args) {
  return toolName === "zapier_list_actions"
    ? { action: "list" }
    : { tool_name: args.tool_name, arguments: args.arguments ?? {} };
}
// VERBATIM: the result shaping after the edge call.
function shapeResult(zapData) {
  return zapData?.ok === false || zapData?.error
    ? { success: false, ...zapData }
    : { success: true, ...zapData };
}

// ─── VERBATIM from call-zapier-action/index.ts: request validation + rpc + extract ──
function validateAndRpc(body) {
  const isList = body?.action === "list";
  if (!isList && !body?.tool_name) return { status: 400, error: "missing_tool_name" };
  const rpc = isList
    ? { method: "tools/list", params: {} }
    : { method: "tools/call", params: { name: body.tool_name, arguments: body.arguments ?? {} } };
  return { status: 200, rpc, isList };
}
function extractActions(parsed) {
  const p = parsed;
  const tools = p?.result?.tools ?? p?.tools;
  if (!Array.isArray(tools)) return [];
  return tools
    .filter((t) => t && typeof t.name === "string")
    .map((t) => ({ name: t.name, description: typeof t.description === "string" ? t.description : "" }));
}
// VERBATIM shape of the honest needs_config response the edge fn returns when the
// tenant has no configured connection (secret.configured === false).
function needsConfigResponse() {
  return { ok: false, error: "not_connected", detail: "This workspace hasn't connected a Zapier/MCP account yet. Connect one in Settings → Integrations → Zapier." };
}

console.log("Zapier wrapper glue smoke (#253)\n");

// 1. Arg-shaping: list tool → {action:"list"}, no tool_name, NO tenant field.
{
  const body = buildZapBody("zapier_list_actions", {});
  eq("list → body", body, { action: "list" });
  ok("list body carries NO tenant_id (§9 foreign-tenant impossible)", !("tenant_id" in body) && !("tenantId" in body));
}

// 2. Arg-shaping: run tool → {tool_name, arguments}, arguments defaults to {}.
{
  const body = buildZapBody("zapier_run_action", { tool_name: "slack_send_message", arguments: { channel: "#g", text: "hi" } });
  eq("run → body", body, { tool_name: "slack_send_message", arguments: { channel: "#g", text: "hi" } });
  const bodyNoArgs = buildZapBody("zapier_run_action", { tool_name: "gmail_send" });
  eq("run without arguments → arguments defaults {}", bodyNoArgs, { tool_name: "gmail_send", arguments: {} });
  ok("run body carries NO tenant_id (§9)", !("tenant_id" in body) && !("tenantId" in body));
}

// 3. Edge validation: list needs no tool_name; run without tool_name is 400.
{
  eq("edge: {action:list} → tools/list rpc", validateAndRpc({ action: "list" }).rpc, { method: "tools/list", params: {} });
  eq("edge: {tool_name} → tools/call rpc", validateAndRpc({ tool_name: "x", arguments: { a: 1 } }).rpc,
    { method: "tools/call", params: { name: "x", arguments: { a: 1 } } });
  eq("edge: {} (no action, no tool_name) → 400 missing_tool_name", validateAndRpc({}), { status: 400, error: "missing_tool_name" });
  eq("edge: run without arguments → arguments {}", validateAndRpc({ tool_name: "x" }).rpc.params.arguments, {});
}

// 4. extractActions tolerates JSON-RPC envelope, bare {tools}, and garbage → [].
{
  eq("extract: JSON-RPC envelope",
    extractActions({ result: { tools: [{ name: "a", description: "A" }, { name: "b" }] } }),
    [{ name: "a", description: "A" }, { name: "b", description: "" }]);
  eq("extract: bare {tools}",
    extractActions({ tools: [{ name: "c", description: "C" }] }),
    [{ name: "c", description: "C" }]);
  eq("extract: garbage → []", extractActions({ nope: true }), []);
  eq("extract: null → []", extractActions(null), []);
  eq("extract: string → []", extractActions("oops"), []);
  eq("extract: drops nameless tools", extractActions({ tools: [{ description: "no name" }, { name: "ok" }] }), [{ name: "ok", description: "" }]);
}

// 5. needs_config path: the honest not_connected response shapes to success:false,
//    never a fabricated success (§13). No fetch/rpc is attempted upstream of it.
{
  const shaped = shapeResult(needsConfigResponse());
  ok("needs_config → success:false", shaped.success === false);
  ok("needs_config → error preserved", shaped.error === "not_connected");
  ok("needs_config → detail preserved", typeof shaped.detail === "string" && shaped.detail.includes("Settings"));
}

// 6. Result shaping: an ok:true tools/list result → success:true + actions passthrough.
{
  const shaped = shapeResult({ ok: true, actions: [{ name: "a", description: "A" }] });
  ok("ok list → success:true", shaped.success === true);
  eq("ok list → actions passthrough", shaped.actions, [{ name: "a", description: "A" }]);
}

// 7. Result shaping: an ok:true tools/call result → success:true + result passthrough.
{
  const shaped = shapeResult({ ok: true, result: { echoed: 1 } });
  ok("ok run → success:true", shaped.success === true);
  eq("ok run → result passthrough", shaped.result, { echoed: 1 });
}

// 8. Result shaping: an error envelope (e.g. connection_disabled) → success:false.
{
  const shaped = shapeResult({ ok: false, error: "connection_disabled", detail: "turned off" });
  ok("disabled → success:false", shaped.success === false && shaped.error === "connection_disabled");
}

console.log("");
if (failures) { console.error(`${failures} assertion(s) failed.`); process.exit(1); }
console.log("All Zapier wrapper glue assertions passed.");

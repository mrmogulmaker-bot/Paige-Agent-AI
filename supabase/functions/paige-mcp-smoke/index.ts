// Internal one-shot smoke test for paige-mcp.
// GET this endpoint and it will call paige-mcp using PAIGE_MCP_PLATFORM_KEY,
// run initialize + tools/list, and return the raw transcript. Safe to delete after verification.
const KEY = Deno.env.get("PAIGE_MCP_PLATFORM_KEY") ?? "";
const URL_ = `${Deno.env.get("SUPABASE_URL")}/functions/v1/paige-mcp`;

async function call(body: unknown) {
  const res = await fetch(URL_, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${KEY}`,
      "Content-Type": "application/json",
      "Accept": "application/json, text/event-stream",
    },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  return { status: res.status, headers: Object.fromEntries(res.headers), body: text };
}

Deno.serve(async () => {
  const init = await call({
    jsonrpc: "2.0", id: 1, method: "initialize",
    params: { protocolVersion: "2024-11-05", capabilities: {}, clientInfo: { name: "smoke", version: "0" } },
  });
  const list = await call({ jsonrpc: "2.0", id: 2, method: "tools/list" });
  return new Response(JSON.stringify({ has_key: KEY.length > 0, url: URL_, init, list }, null, 2), {
    headers: { "content-type": "application/json" },
  });
});

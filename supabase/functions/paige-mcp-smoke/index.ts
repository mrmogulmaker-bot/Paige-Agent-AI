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

  // CONTAINED 2026-09-02 (issue #784). This block used to call `create_contact` and then clean up
  // with `bulk_delete_contacts` + `confirm: true` — creating and then HARD-DELETING a real
  // production `clients` row on a GET. It was the only non-model producer of that destructive
  // branch (§37 producer inventory), and it is being removed rather than exempted, because an
  // exemption keyed on "the platform key may delete" would leave the hole open for the god-tier
  // actor and would be exactly the MCP-specific approval architecture the owner ruled out.
  //
  // The lane was opt-in (`?create_contact=1`), had no cron, workflow, or scheduled caller anywhere
  // in the repo, and this function is not deployed to production — so nothing operational depends
  // on it. What remains is what this file's own header says it is: initialize + tools/list, which
  // is a genuinely read-only reachability smoke.

  return new Response(JSON.stringify({ has_key: KEY.length > 0, url: URL_, init, list }, null, 2), {
    headers: { "content-type": "application/json" },
  });
});

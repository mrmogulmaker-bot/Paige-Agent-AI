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

function parseMcpPayload(rawBody: string | undefined) {
  if (!rawBody) return null;
  const line = rawBody.split("\n").find((part) => part.startsWith("data: "));
  const jsonText = line ? line.slice(6) : rawBody;
  const envelope = JSON.parse(jsonText);
  const text = envelope?.result?.content?.[0]?.text;
  return text ? JSON.parse(text) : null;
}

Deno.serve(async (req) => {
  const url = new URL(req.url);
  const init = await call({
    jsonrpc: "2.0", id: 1, method: "initialize",
    params: { protocolVersion: "2024-11-05", capabilities: {}, clientInfo: { name: "smoke", version: "0" } },
  });
  const list = await call({ jsonrpc: "2.0", id: 2, method: "tools/list" });

  let create_contact: unknown = null;
  let cleanup: unknown = null;
  if (url.searchParams.get("create_contact") === "1") {
    const firstName = url.searchParams.get("first_name") || "Schema";
    const lastName = url.searchParams.get("last_name") || "Smoke";
    create_contact = await call({
      jsonrpc: "2.0",
      id: 3,
      method: "tools/call",
      params: {
        name: "create_contact",
        arguments: {
          first_name: firstName,
          last_name: lastName,
          lifecycle_stage: url.searchParams.get("lifecycle_stage") || "client_active",
          source: "mcp_smoke",
          notes: "Temporary Doctrine §120 smoke test row; safe to remove.",
        },
      },
    });

    try {
      const payload = parseMcpPayload((create_contact as { body?: string }).body);
      if (payload?.contact_id) {
        cleanup = await call({
          jsonrpc: "2.0",
          id: 4,
          method: "tools/call",
          params: {
            name: "bulk_delete_contacts",
            arguments: { ids: [payload.contact_id], confirm: true, reason: "Doctrine §120 smoke cleanup" },
          },
        });
      }
    } catch (e) {
      cleanup = { parse_error: (e as Error).message };
    }
  }

  return new Response(JSON.stringify({ has_key: KEY.length > 0, url: URL_, init, list, create_contact, cleanup }, null, 2), {
    headers: { "content-type": "application/json" },
  });
});

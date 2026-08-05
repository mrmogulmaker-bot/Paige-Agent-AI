// scripts/n8n-mcp-client-smoke.mts — headless §32 smoke for the REAL outbound MCP
// session client (#267). Runs the ACTUAL _shared/mcp-session-client.ts (pure, no Deno)
// against an in-process Node mock MCP server that speaks BOTH transports:
//   • Streamable HTTP (initialize → Mcp-Session-Id → notifications/initialized → tools/*)
//   • legacy HTTP+SSE (endpoint event → message POST → reply on the stream, by id)
//
// It asserts: the initialize handshake happens, the session id is captured and FORWARDED
// on later requests, a JSON response AND an event-stream response are both parsed, tools/
// list + tools/call round-trip, stdio is refused, and the pure SSE/JSON-RPC helpers hold.
//
// Run:  node scripts/n8n-mcp-client-smoke.mts
// Exit: 0 = client logic holds; non-zero = a defect (fix before shipping).
//
// HONEST SCOPE (§13/§32): this proves the client's framing/handshake/parse logic against a
// SPEC-FAITHFUL mock. It does NOT prove a live round-trip against a real tenant's n8n MCP
// Server Trigger — that is auth-gated and n8n-hosted, and is OWED to the owner's live
// confirm. A green here means "the client speaks MCP correctly," not "n8n answered."
import http from "node:http";
import {
  McpSessionClient, parseSseEvents, extractTools, jsonRpcRequest, MCP_PROTOCOL_VERSION,
} from "../supabase/functions/_shared/mcp-session-client.ts";

let failures = 0;
function ok(name: string, cond: boolean) {
  if (cond) console.log(`  ok  ${name}`);
  else { console.error(`FAIL  ${name}`); failures++; }
}
function eq(name: string, a: unknown, b: unknown) {
  ok(`${name} (got ${JSON.stringify(a)})`, JSON.stringify(a) === JSON.stringify(b));
}

const SESSION_ID = "sess-abc-123";
const TOOLS = [
  { name: "send_slack_message", description: "Post a message to Slack" },
  { name: "create_sheet_row", description: "Append a row to a Google Sheet" },
];

// Records what the server actually observed, so we can assert handshake behavior.
const observed = {
  httpInitialized: false,
  httpSessionOnList: null as string | null,
  httpInitializedNotice: false,
  sseInitialized: false,
  sseToolCallArgs: null as unknown,
};

function readBody(req: http.IncomingMessage): Promise<any> {
  return new Promise((resolve) => {
    let b = "";
    req.on("data", (c) => (b += c));
    req.on("end", () => { try { resolve(JSON.parse(b || "{}")); } catch { resolve({}); } });
  });
}

// One SSE stream we hold open to push replies to (legacy transport).
let sseRes: http.ServerResponse | null = null;

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", "http://localhost");

  // ── Streamable HTTP endpoint ──────────────────────────────────────────────────
  if (url.pathname === "/http" && req.method === "POST") {
    const msg = await readBody(req);
    if (msg.method === "initialize") {
      observed.httpInitialized = true;
      res.writeHead(200, { "Content-Type": "application/json", "Mcp-Session-Id": SESSION_ID });
      res.end(JSON.stringify({ jsonrpc: "2.0", id: msg.id, result: { protocolVersion: MCP_PROTOCOL_VERSION, capabilities: {}, serverInfo: { name: "mock-n8n", version: "1" } } }));
      return;
    }
    if (msg.method === "notifications/initialized") {
      observed.httpInitializedNotice = true;
      res.writeHead(202); res.end(); return;
    }
    if (msg.method === "tools/list") {
      observed.httpSessionOnList = req.headers["mcp-session-id"] as string ?? null;
      // Respond as an EVENT STREAM to exercise the http-path SSE parsing branch.
      res.writeHead(200, { "Content-Type": "text/event-stream" });
      res.write(`event: message\ndata: ${JSON.stringify({ jsonrpc: "2.0", id: msg.id, result: { tools: TOOLS } })}\n\n`);
      res.end();
      return;
    }
    if (msg.method === "tools/call") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ jsonrpc: "2.0", id: msg.id, result: { echoed: msg.params } }));
      return;
    }
    res.writeHead(400); res.end(); return;
  }

  // ── Legacy HTTP + SSE endpoint ────────────────────────────────────────────────
  if (url.pathname === "/sse" && req.method === "GET") {
    res.writeHead(200, { "Content-Type": "text/event-stream", "Cache-Control": "no-cache", Connection: "keep-alive" });
    sseRes = res;
    // Tell the client where to POST messages (relative → resolved against serverUrl).
    res.write(`event: endpoint\ndata: /sse/messages\n\n`);
    return;
  }
  if (url.pathname === "/sse/messages" && req.method === "POST") {
    const msg = await readBody(req);
    res.writeHead(202); res.end();
    if (!sseRes) return;
    if (msg.method === "initialize") {
      observed.sseInitialized = true;
      sseRes.write(`event: message\ndata: ${JSON.stringify({ jsonrpc: "2.0", id: msg.id, result: { protocolVersion: MCP_PROTOCOL_VERSION, capabilities: {} } })}\n\n`);
    } else if (msg.method === "tools/list") {
      sseRes.write(`event: message\ndata: ${JSON.stringify({ jsonrpc: "2.0", id: msg.id, result: { tools: TOOLS } })}\n\n`);
    } else if (msg.method === "tools/call") {
      observed.sseToolCallArgs = msg.params;
      sseRes.write(`event: message\ndata: ${JSON.stringify({ jsonrpc: "2.0", id: msg.id, result: { ran: msg.params?.name } })}\n\n`);
    }
    // notifications/initialized (no id) → nothing to reply.
    return;
  }

  res.writeHead(404); res.end();
});

async function main() {
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const port = (server.address() as any).port;
  const base = `http://127.0.0.1:${port}`;
  console.log(`n8n MCP client smoke (#267) — mock @ ${base}\n`);

  // ── Pure helpers ───────────────────────────────────────────────────────────────
  eq("jsonRpcRequest shape", jsonRpcRequest("1", "tools/list", { a: 1 }), { jsonrpc: "2.0", id: "1", method: "tools/list", params: { a: 1 } });
  eq("jsonRpcRequest omits absent params", jsonRpcRequest("2", "ping"), { jsonrpc: "2.0", id: "2", method: "ping" });
  {
    const { events, rest } = parseSseEvents("event: endpoint\ndata: /m\n\nevent: message\ndata: {\"id\":\"x\"}\n\nevent: mess");
    eq("parseSseEvents splits complete events", events, [{ event: "endpoint", data: "/m" }, { event: "message", data: '{"id":"x"}' }]);
    ok("parseSseEvents keeps the unterminated tail", rest.includes("event: mess"));
  }
  {
    const multi = parseSseEvents("data: line1\ndata: line2\n\n").events;
    eq("parseSseEvents joins multi-line data", multi, [{ event: "message", data: "line1\nline2" }]);
  }
  eq("extractTools reads enveloped result", extractTools({ result: { tools: TOOLS } }), TOOLS.map((t) => ({ ...t, inputSchema: undefined })));
  eq("extractTools reads bare tools", extractTools({ tools: [{ name: "a" }] }), [{ name: "a", description: "", inputSchema: undefined }]);
  eq("extractTools garbage → []", extractTools({ nope: 1 }), []);

  // ── Streamable HTTP transport ───────────────────────────────────────────────────
  {
    const client = new McpSessionClient({ serverUrl: `${base}/http`, token: "tok-http", transport: "http", timeoutMs: 5000 });
    const tools = await client.listTools();
    eq("http: tools/list → 2 tools parsed (from an event-stream response)", tools.map((t) => t.name), TOOLS.map((t) => t.name));
    ok("http: initialize handshake happened", observed.httpInitialized);
    ok("http: notifications/initialized sent", observed.httpInitializedNotice);
    ok(`http: Mcp-Session-Id captured + FORWARDED on tools/list (got ${observed.httpSessionOnList})`, observed.httpSessionOnList === SESSION_ID);

    const called = await client.callTool("send_slack_message", { channel: "#g", text: "hi" });
    eq("http: tools/call → server echo", called, { echoed: { name: "send_slack_message", arguments: { channel: "#g", text: "hi" } } });
  }

  // ── Legacy HTTP + SSE transport ─────────────────────────────────────────────────
  {
    const client = new McpSessionClient({ serverUrl: `${base}/sse`, token: "tok-sse", transport: "sse", timeoutMs: 5000 });
    const tools = await client.listTools();
    eq("sse: tools/list → 2 tools parsed off the stream", tools.map((t) => t.name), TOOLS.map((t) => t.name));
    ok("sse: initialize handshake happened over the message endpoint", observed.sseInitialized);

    const called = await client.callTool("create_sheet_row", { row: [1, 2] });
    eq("sse: tools/call → reply correlated by id off the stream", called, { ran: "create_sheet_row" });
    eq("sse: server saw the tool-call args", observed.sseToolCallArgs, { name: "create_sheet_row", arguments: { row: [1, 2] } });
  }

  // ── stdio is refused (can't be driven over HTTP) ─────────────────────────────────
  {
    const client = new McpSessionClient({ serverUrl: `${base}/http`, token: "t", transport: "stdio", timeoutMs: 2000 });
    let threw = false;
    try { await client.listTools(); } catch { threw = true; }
    ok("stdio transport is refused with a clear throw", threw);
  }

  server.close();
  console.log("");
  if (failures) { console.error(`${failures} assertion(s) failed.`); process.exit(1); }
  console.log("All n8n MCP client assertions passed.");
}

main().catch((e) => { console.error("smoke crashed:", e); process.exit(1); });

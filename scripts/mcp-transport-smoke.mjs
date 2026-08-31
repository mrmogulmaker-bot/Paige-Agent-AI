#!/usr/bin/env node
/**
 * The hardened outbound transport — driven, not described.
 *
 * WHY THIS EXISTS
 *
 * Four copies of the SSRF validator shipped, and every one of them was missing the same
 * three protections: credentials in the URL, a bounded wait, a bounded body. Prose in a
 * header comment is what let that happen four times. So this runs the REAL
 * `_shared/ssrfGuard.ts` and `_shared/mcp-client.ts` against a REAL HTTP server and
 * asserts on what they actually do.
 *
 * WHAT IS SUBSTITUTED, AND WHAT IS NOT
 *
 *   - `Deno.resolveDns` is shimmed, because this runs under Node. The shim returns the
 *     addresses each case is about; the numeric validation being tested is the shipped
 *     code, untouched.
 *   - Address translation is shimmed: the guard sees the real hostname and runs in full,
 *     and only afterwards is the connection pointed at the local server. Everything the
 *     transport cases are about — redirect status, byte counting, the abort, the SSE
 *     framing — happens against a genuine server over a genuine socket.
 *
 * Nothing else is stubbed. The guard, the client, the JSON-RPC handling and the error
 * mapping are the shipped code.
 */
import assert from "node:assert/strict";
import http from "node:http";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { build } from "esbuild";

// ── DNS shim ──────────────────────────────────────────────────────────────────
// Hostnames each case needs. Anything unlisted throws, which is what a real
// unresolvable host does, so the fail-closed branch is exercised for real.
const DNS = {
  "public.example": { A: ["93.184.216.34"] },
  "rebind.example": { A: ["10.0.0.7"] },            // resolves inside — must be refused
  "mixed.example": { A: ["93.184.216.34", "127.0.0.1"] }, // one bad address is enough
  "v6-ula.example": { AAAA: ["fd00::1"] },
  "mapped.example": { AAAA: ["::ffff:169.254.169.254"] }, // metadata via mapped v6
};
globalThis.Deno = {
  resolveDns: async (host, kind) => {
    const rec = DNS[host]?.[kind];
    if (!rec) throw new Error("no records");
    return rec;
  },
  env: { get: () => undefined },
};

// ── The local server every transport case runs against ────────────────────────
let server, PORT;
const routes = new Map();
await new Promise((resolve) => {
  server = http.createServer((req, res) => {
    const handler = routes.get(req.url.split("?")[0]);
    if (!handler) { res.writeHead(404).end("no route"); return; }
    handler(req, res);
  });
  server.listen(0, "127.0.0.1", () => { PORT = server.address().port; resolve(); });
});

// The guard has already run by the time this is reached; only the destination moves.
const realFetch = globalThis.fetch;
globalThis.fetch = (url, init) => {
  const u = new URL(url);
  return realFetch(`http://127.0.0.1:${PORT}${u.pathname}${u.search}`, init);
};

const outDir = path.join(process.cwd(), "node_modules", ".cache", "mcp-transport-smoke");
const bundle = async (entry, name) => {
  const outfile = path.join(outDir, name);
  await build({ entryPoints: [entry], outfile, bundle: true, format: "esm", platform: "node", logLevel: "silent" });
  return import(pathToFileURL(outfile).href);
};
const guard = await bundle("supabase/functions/_shared/ssrfGuard.ts", "guard.mjs");
const mcp = await bundle("supabase/functions/_shared/mcp-client.ts", "client.mjs");

let passed = 0;
const failures = [];
function check(label, cond, detail = "") {
  if (cond) { passed += 1; console.log(`  ok  ${label}`); }
  else { failures.push(`${label}${detail ? " — " + detail : ""}`); console.log(`  FAIL ${label} ${detail}`); }
}
async function reasonOf(fn) {
  try { await fn(); return null; } catch (e) { return e.reason ?? e.code ?? e.message; }
}

console.log("\nhardened outbound transport smoke\n");
console.log("— URL validation —");

// Scheme, credentials, shape.
check("http:// is refused", await reasonOf(() => guard.assertPublicHttpUrl("http://public.example/x")) === "url_must_be_https");
check("a malformed URL is refused", await reasonOf(() => guard.assertPublicHttpUrl("not a url")) === "invalid_url");
check("credentials embedded in the URL are refused",
  await reasonOf(() => guard.assertPublicHttpUrl("https://user:pw@public.example/x")) === "url_has_embedded_credentials");
check("a username alone is still refused",
  await reasonOf(() => guard.assertPublicHttpUrl("https://user@public.example/x")) === "url_has_embedded_credentials");
// This is the parser-confusion case: the real host is the one after the @.
check("the good.com@evil.com shape is refused rather than silently retargeted",
  await reasonOf(() => guard.assertPublicHttpUrl("https://public.example@rebind.example/x")) === "url_has_embedded_credentials");

// Hosts and addresses.
check("localhost is refused", await reasonOf(() => guard.assertPublicHttpUrl("https://localhost/x")) === "url_host_not_allowed");
check(".internal is refused", await reasonOf(() => guard.assertPublicHttpUrl("https://api.internal/x")) === "url_host_not_allowed");
check("a loopback literal is refused", await reasonOf(() => guard.assertPublicHttpUrl("https://127.0.0.1/x")) === "url_host_not_allowed");
check("the cloud metadata address is refused", await reasonOf(() => guard.assertPublicHttpUrl("https://169.254.169.254/x")) === "url_host_not_allowed");
check("an RFC1918 literal is refused", await reasonOf(() => guard.assertPublicHttpUrl("https://10.1.2.3/x")) === "url_host_not_allowed");
check("a DNS rebind onto a private address is refused",
  await reasonOf(() => guard.assertPublicHttpUrl("https://rebind.example/x")) === "url_resolves_to_private_address");
check("one private address among several is enough to refuse",
  await reasonOf(() => guard.assertPublicHttpUrl("https://mixed.example/x")) === "url_resolves_to_private_address");
check("an IPv6 ULA is refused", await reasonOf(() => guard.assertPublicHttpUrl("https://v6-ula.example/x")) === "url_resolves_to_private_address");
check("metadata reached through a mapped IPv6 address is refused",
  await reasonOf(() => guard.assertPublicHttpUrl("https://mapped.example/x")) === "url_resolves_to_private_address");
check("an unresolvable host fails closed",
  await reasonOf(() => guard.assertPublicHttpUrl("https://nowhere.example/x")) === "url_host_unresolvable");
check("a public host is allowed", await reasonOf(() => guard.assertPublicHttpUrl("https://public.example/x")) === null);

console.log("\n— transport —");

routes.set("/redirect", (_q, res) => { res.writeHead(302, { Location: "http://169.254.169.254/" }).end(); });
check("a redirect is refused, not followed",
  await reasonOf(() => guard.safeFetch("https://public.example/redirect")) === "url_redirect_refused");

routes.set("/huge", (_q, res) => {
  res.writeHead(200, { "Content-Type": "application/json" });
  // Deliberately far larger than the cap, sent in chunks, so the cap has to hold
  // during the read rather than after it.
  for (let i = 0; i < 300; i++) res.write("x".repeat(10_000));
  res.end();
});
{
  const r = await guard.safeFetch("https://public.example/huge", {}, { maxBytes: 4096 });
  check("an oversized body is capped, not buffered", r.body.length === 4096, `got ${r.body.length}`);
  check("...and the truncation is reported rather than hidden", r.truncated === true);
}

routes.set("/slow", (_q, res) => { res.writeHead(200, { "Content-Type": "application/json" }); /* never ends */ });
{
  const started = Date.now();
  const reason = await reasonOf(() => guard.safeFetch("https://public.example/slow", {}, { timeoutMs: 400 }));
  const elapsed = Date.now() - started;
  check("a hung server aborts on the deadline", reason === "request_timed_out", String(reason));
  check("...and it actually stops near the deadline", elapsed < 3000, `${elapsed}ms`);
}

routes.set("/ok", (_q, res) => {
  res.writeHead(200, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ ok: true }));
});
{
  const r = await guard.safeFetch("https://public.example/ok");
  check("a normal response is returned whole", r.status === 200 && !r.truncated && JSON.parse(r.body).ok === true);
}

console.log("\n— MCP client —");

const TOOLS = [
  { name: "send_email", description: "Send an email", inputSchema: { type: "object", properties: { to: {} } } },
  { name: "no_name_here" },
  { description: "nameless, must be dropped" },
];
routes.set("/mcp-json", (req, res) => {
  let raw = "";
  req.on("data", (c) => { raw += c; });
  req.on("end", () => {
    lastRequest = { headers: req.headers, body: JSON.parse(raw) };
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ jsonrpc: "2.0", id: lastRequest.body.id, result: { tools: TOOLS } }));
  });
});
let lastRequest = null;

const bearer = { kind: "bearer", token: "super-secret-token-1234" };
{
  const tools = await mcp.mcpListTools({ serverUrl: "https://public.example/mcp-json", auth: bearer });
  check("tools/list returns the named tools", tools.length === 2 && tools[0].name === "send_email");
  check("a tool with no name is dropped rather than half-read", tools.every((t) => typeof t.name === "string" && t.name));
  check("no input schema crosses the boundary",
    !JSON.stringify(tools).includes("inputSchema") && !JSON.stringify(tools).includes("properties"));
  check("the credential is sent as a Bearer header", lastRequest.headers.authorization === `Bearer ${bearer.token}`);
  check("the protocol version is declared", !!lastRequest.headers["mcp-protocol-version"]);
  check("both response framings are advertised",
    lastRequest.headers.accept.includes("application/json") && lastRequest.headers.accept.includes("text/event-stream"));
  check("the method is chosen by us, not the caller", lastRequest.body.method === "tools/list");
}

// A provider may answer the same request as an event stream.
routes.set("/mcp-sse", (req, res) => {
  let raw = "";
  req.on("data", (c) => { raw += c; });
  req.on("end", () => {
    const id = JSON.parse(raw).id;
    res.writeHead(200, { "Content-Type": "text/event-stream" });
    res.write("event: message\ndata: {\"jsonrpc\":\"2.0\",\"method\":\"notifications/progress\"}\n\n");
    res.write(`data: ${JSON.stringify({ jsonrpc: "2.0", id, result: { tools: [{ name: "sse_tool", description: "d" }] } })}\n\n`);
    res.end();
  });
});
{
  const tools = await mcp.mcpListTools({ serverUrl: "https://public.example/mcp-sse", auth: bearer });
  check("an SSE-framed response is read as the same result", tools.length === 1 && tools[0].name === "sse_tool");
}

routes.set("/mcp-error", (_q, res) => {
  res.writeHead(200, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ jsonrpc: "2.0", id: 1, error: { code: -32601, message: "Method not found" } }));
});
routes.set("/mcp-401", (_q, res) => { res.writeHead(401, { "Content-Type": "text/plain" }).end("bad token"); });
routes.set("/mcp-garbage", (_q, res) => { res.writeHead(200, { "Content-Type": "application/json" }).end("<html>not json</html>"); });
{
  const asError = async (p) => { try { await p; return null; } catch (e) { return e; } };
  const rpcErr = await asError(mcp.mcpListTools({ serverUrl: "https://public.example/mcp-error", auth: bearer }));
  check("a JSON-RPC error is raised, never returned as an empty list", rpcErr?.code === "mcp_protocol_error");

  const httpErr = await asError(mcp.mcpListTools({ serverUrl: "https://public.example/mcp-401", auth: bearer }));
  check("a rejected credential surfaces as an HTTP error with its status",
    httpErr?.code === "mcp_http_error" && httpErr?.httpStatus === 401);

  const junkErr = await asError(mcp.mcpListTools({ serverUrl: "https://public.example/mcp-garbage", auth: bearer }));
  check("a non-MCP endpoint is refused rather than half-parsed", junkErr?.code === "mcp_malformed_response");

  // The single most important property of this whole layer.
  const everything = [rpcErr, httpErr, junkErr]
    .map((e) => `${e?.message}|${e?.detail}|${e?.stack}`).join("|");
  check("no error carries the credential", !everything.includes(bearer.token));
}

{
  // A tenant supplies the header NAME for header auth, so it is a header-injection
  // surface until it is constrained.
  const asError = async (p) => { try { await p; return null; } catch (e) { return e; } };
  const injected = await asError(mcp.mcpListTools({
    serverUrl: "https://public.example/mcp-json",
    auth: { kind: "header", name: "X-Bad\r\nX-Injected: yes", token: "t" },
  }));
  check("a header name carrying CRLF is refused", injected?.code === "mcp_protocol_error");

  await mcp.mcpListTools({
    serverUrl: "https://public.example/mcp-json",
    auth: { kind: "header", name: "X-N8N-Api-Key", token: "hdr-secret" },
  });
  check("a valid custom header name is used verbatim", lastRequest.headers["x-n8n-api-key"] === "hdr-secret");
  check("...and no Bearer header is sent alongside it", lastRequest.headers.authorization === undefined);
}

{
  // The probe is what earns `connected`; a failure must report failure.
  const good = await mcp.mcpProbe({ serverUrl: "https://public.example/mcp-json", auth: bearer });
  check("a probe against a real MCP server succeeds", good.ok === true && good.toolCount === 2);
  const bad = await mcp.mcpProbe({ serverUrl: "https://public.example/mcp-401", auth: bearer });
  check("a probe with a rejected credential fails rather than passing quietly",
    bad.ok === false && bad.code === "mcp_http_error");
  const unsafe = await mcp.mcpProbe({ serverUrl: "https://10.0.0.9/mcp", auth: bearer });
  check("a probe at a private address never leaves the process", unsafe.ok === false && unsafe.code === "url_host_not_allowed");
}

{
  // Every code the client can produce must have owner-facing words, or some surface
  // will end up rendering a raw code.
  const codes = ["invalid_url", "url_must_be_https", "url_has_embedded_credentials", "url_host_not_allowed",
    "url_host_unresolvable", "url_resolves_to_private_address", "url_redirect_refused", "request_timed_out",
    "response_too_large", "request_failed", "mcp_http_error", "mcp_malformed_response", "mcp_protocol_error"];
  const described = codes.map((c) => mcp.describeMcpError(c));
  check("every failure code has owner-facing words",
    described.every((d) => typeof d === "string" && d.length > 10 && !/_/.test(d)));
  check("no two unrelated failures read identically",
    new Set(described).size >= codes.length - 3);
}

server.close();
console.log(`\n${passed} assertions passed.`);
if (failures.length) { console.error(`\n${failures.length} FAILURE(S):\n- ${failures.join("\n- ")}`); process.exit(1); }

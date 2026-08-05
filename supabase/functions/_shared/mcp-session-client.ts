// mcp-session-client.ts — a transport-aware, handshake-COMPLIANT outbound MCP client (#267).
//
// WHY THIS EXISTS: the existing outbound MCP client (call-zapier-action) is a stateless
// single-shot JSON-RPC POST — it works for Zapier's remote MCP server, but it has NO
// `initialize` handshake, NO session, and it ignores the transport. That will NOT drive
// an n8n MCP Server Trigger, which is session-based (Streamable-HTTP with an initialize/
// session handshake, or legacy HTTP+SSE). This module is the compliant runtime for that.
//
// PURITY (so §32 can smoke-test the REAL code headless): this file uses ONLY web-standard
// globals (`fetch`, `TextDecoder`, `crypto.randomUUID`) — NO Deno.* and NO esm.sh imports.
// So it runs identically under Deno (the edge function) and Node 22 (the smoke test), and
// the smoke drives THIS code against a mock server, not a copy of it. The SSRF guard (which
// needs Deno.resolveDns) is deliberately NOT here — the edge function runs it on the URL
// BEFORE constructing a client (see call-n8n-mcp/index.ts).
//
// Transports:
//   • "http"  — Streamable HTTP (current MCP spec): POST initialize → capture Mcp-Session-Id
//               header → POST notifications/initialized → POST tools/list / tools/call. Each
//               POST response is either application/json or a text/event-stream carrying the
//               JSON-RPC reply; both are parsed.
//   • "sse"   — legacy HTTP+SSE: open a long-lived GET event stream, read the `endpoint`
//               event to learn the message-POST URL, then POST JSON-RPC requests whose
//               replies arrive back on the stream (correlated by id).
//   • "stdio" — not reachable over HTTP from an edge function → explicit, honest throw.

export const MCP_PROTOCOL_VERSION = "2025-06-18";

export type McpTransport = "http" | "sse" | "stdio";

export interface McpTool {
  name: string;
  description: string;
  inputSchema?: unknown;
}

export interface McpClientOptions {
  serverUrl: string;
  token: string;
  transport: McpTransport;
  /** Injected for tests; defaults to global fetch. */
  fetchImpl?: typeof fetch;
  /** Per-request timeout (ms). Default 20000. */
  timeoutMs?: number;
  /** Loud, structured logging sink (§32 — degrade paths log, never blank). */
  log?: (msg: string, extra?: Record<string, unknown>) => void;
  clientName?: string;
}

// ── Pure JSON-RPC helpers ─────────────────────────────────────────────────────────
export function jsonRpcRequest(id: string, method: string, params?: unknown): Record<string, unknown> {
  return params === undefined
    ? { jsonrpc: "2.0", id, method }
    : { jsonrpc: "2.0", id, method, params };
}
export function jsonRpcNotification(method: string, params?: unknown): Record<string, unknown> {
  return params === undefined
    ? { jsonrpc: "2.0", method }
    : { jsonrpc: "2.0", method, params };
}

export function tryParseJson(s: string): unknown {
  try { return JSON.parse(s); } catch { return undefined; }
}

// Parse a run of Server-Sent-Events text into complete events + the unterminated tail.
// Events are separated by a blank line; `data:` lines are concatenated with "\n".
export function parseSseEvents(buffer: string): { events: Array<{ event: string; data: string }>; rest: string } {
  const norm = buffer.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const blocks = norm.split("\n\n");
  const rest = blocks.pop() ?? "";
  const events: Array<{ event: string; data: string }> = [];
  for (const block of blocks) {
    if (!block.trim()) continue;
    let ev = "message";
    const data: string[] = [];
    for (const line of block.split("\n")) {
      if (line.startsWith(":")) continue; // comment / keep-alive
      if (line.startsWith("event:")) ev = line.slice(6).trim();
      else if (line.startsWith("data:")) data.push(line.slice(5).replace(/^ /, ""));
    }
    events.push({ event: ev, data: data.join("\n") });
  }
  return { events, rest };
}

// Pull [{name, description, inputSchema}] out of a tools/list JSON-RPC reply, tolerating
// both the enveloped ({result:{tools:[…]}}) and bare ({tools:[…]}) shapes. Never throws.
export function extractTools(parsed: unknown): McpTool[] {
  const p = parsed as { result?: { tools?: unknown }; tools?: unknown } | null;
  const tools = p?.result?.tools ?? p?.tools;
  if (!Array.isArray(tools)) return [];
  return tools
    .filter((t): t is { name: string; description?: unknown; inputSchema?: unknown } =>
      !!t && typeof (t as { name?: unknown }).name === "string")
    .map((t) => ({
      name: t.name,
      description: typeof t.description === "string" ? t.description : "",
      inputSchema: t.inputSchema,
    }));
}

function rpcError(reply: unknown): string | null {
  const e = (reply as { error?: { message?: string; code?: number } } | null)?.error;
  if (!e) return null;
  return `MCP error ${e.code ?? ""}: ${e.message ?? "unknown"}`.trim();
}

class McpError extends Error {
  code: string;
  constructor(code: string, message: string) { super(message); this.code = code; }
}

// ── The client ────────────────────────────────────────────────────────────────────
export class McpSessionClient {
  private opts: Required<Pick<McpClientOptions, "serverUrl" | "token" | "transport">> & McpClientOptions;
  private fetchImpl: typeof fetch;
  private timeoutMs: number;
  private log: (msg: string, extra?: Record<string, unknown>) => void;

  constructor(opts: McpClientOptions) {
    this.opts = opts as typeof this.opts;
    this.fetchImpl = opts.fetchImpl ?? fetch;
    this.timeoutMs = opts.timeoutMs ?? 20000;
    this.log = opts.log ?? (() => {});
  }

  async listTools(): Promise<McpTool[]> {
    const reply = await this.run("tools/list", {});
    return extractTools(reply);
  }

  async callTool(name: string, args: Record<string, unknown>): Promise<unknown> {
    const reply = await this.run("tools/call", { name, arguments: args ?? {} });
    return (reply as { result?: unknown })?.result ?? reply;
  }

  // Do a full handshake + one request, transport-appropriately.
  private async run(method: string, params: unknown): Promise<unknown> {
    if (this.opts.transport === "stdio") {
      throw new McpError("unsupported_transport", "stdio transport cannot be driven over HTTP from the server");
    }
    return this.opts.transport === "sse"
      ? await this.runSse(method, params)
      : await this.runHttp(method, params);
  }

  private initializeParams() {
    return {
      protocolVersion: MCP_PROTOCOL_VERSION,
      capabilities: {},
      clientInfo: { name: this.opts.clientName ?? "paige-agent", version: "1.0.0" },
    };
  }

  private withTimeout(): { signal: AbortSignal; done: () => void } {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), this.timeoutMs);
    return { signal: ctrl.signal, done: () => clearTimeout(t) };
  }

  // ── Streamable HTTP ───────────────────────────────────────────────────────────
  private async runHttp(method: string, params: unknown): Promise<unknown> {
    // 1. initialize → capture Mcp-Session-Id
    const initId = crypto.randomUUID();
    const initRes = await this.httpPost(jsonRpcRequest(initId, "initialize", this.initializeParams()), undefined);
    const sessionId = initRes.sessionId;
    const initErr = rpcError(initRes.reply);
    if (initErr) { this.log("mcp.http.initialize_error", { initErr }); throw new McpError("mcp_initialize_failed", initErr); }
    this.log("mcp.http.initialized", { hasSession: Boolean(sessionId) });

    // 2. notifications/initialized (a notification: no id, no reply expected)
    try {
      await this.httpPost(jsonRpcNotification("notifications/initialized"), sessionId, /*expectReply*/ false);
    } catch (e) {
      // Non-fatal: many servers accept requests without it. Log loudly, continue.
      this.log("mcp.http.initialized_notice_failed", { error: String(e) });
    }

    // 3. the real request
    const reqId = crypto.randomUUID();
    const res = await this.httpPost(jsonRpcRequest(reqId, method, params), sessionId);
    const err = rpcError(res.reply);
    if (err) throw new McpError("mcp_request_error", err);
    return res.reply;
  }

  private async httpPost(
    message: Record<string, unknown>,
    sessionId: string | undefined,
    expectReply = true,
  ): Promise<{ reply: unknown; sessionId: string | undefined }> {
    const { signal, done } = this.withTimeout();
    try {
      const res = await this.fetchImpl(this.opts.serverUrl, {
        method: "POST",
        redirect: "manual",
        signal,
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json, text/event-stream",
          Authorization: `Bearer ${this.opts.token}`,
          "MCP-Protocol-Version": MCP_PROTOCOL_VERSION,
          ...(sessionId ? { "Mcp-Session-Id": sessionId } : {}),
        },
        body: JSON.stringify(message),
      });
      const newSession = res.headers.get("mcp-session-id") ?? sessionId;
      if (!res.ok) {
        const body = await res.text().catch(() => "");
        this.log("mcp.http.status_error", { status: res.status, body: body.slice(0, 300) });
        throw new McpError(`mcp_http_${res.status}`, `MCP server returned HTTP ${res.status}: ${body.slice(0, 300)}`);
      }
      if (!expectReply) { await res.text().catch(() => ""); return { reply: undefined, sessionId: newSession }; }
      const ct = (res.headers.get("content-type") ?? "").toLowerCase();
      const text = await res.text();
      if (ct.includes("text/event-stream")) {
        const { events } = parseSseEvents(text);
        // The reply is the last data event that parses to JSON carrying our message id
        // (or, failing an id match, the last JSON-RPC-shaped event).
        let fallback: unknown;
        for (const ev of events) {
          const j = tryParseJson(ev.data);
          if (j && typeof j === "object") {
            fallback = j;
            if ((j as { id?: unknown }).id === message.id) return { reply: j, sessionId: newSession };
          }
        }
        return { reply: fallback, sessionId: newSession };
      }
      return { reply: tryParseJson(text), sessionId: newSession };
    } finally {
      done();
    }
  }

  // ── Legacy HTTP + SSE ─────────────────────────────────────────────────────────
  // Open the event stream, learn the message endpoint from the `endpoint` event, then
  // POST each JSON-RPC request and await its reply off the stream (correlated by id).
  private async runSse(method: string, params: unknown): Promise<unknown> {
    const { signal, done } = this.withTimeout();
    const pending = new Map<string, { resolve: (v: unknown) => void; reject: (e: unknown) => void }>();
    let endpointUrl: string | null = null;
    let endpointResolve!: () => void;
    const endpointReady = new Promise<void>((r) => { endpointResolve = r; });
    let streamErr: unknown = null;

    const stream = await this.fetchImpl(this.opts.serverUrl, {
      method: "GET",
      redirect: "manual",
      signal,
      headers: { Accept: "text/event-stream", Authorization: `Bearer ${this.opts.token}` },
    });
    if (!stream.ok || !stream.body) {
      done();
      throw new McpError(`mcp_sse_${stream.status}`, `MCP SSE stream failed: HTTP ${stream.status}`);
    }

    // Reader loop — runs concurrently with our request POSTs.
    const reader = stream.body.getReader();
    const decoder = new TextDecoder();
    const readLoop = (async () => {
      let buf = "";
      try {
        for (;;) {
          const { value, done: rdone } = await reader.read();
          if (rdone) break;
          buf += decoder.decode(value, { stream: true });
          const { events, rest } = parseSseEvents(buf);
          buf = rest;
          for (const ev of events) {
            if (ev.event === "endpoint") {
              endpointUrl = new URL(ev.data, this.opts.serverUrl).toString();
              this.log("mcp.sse.endpoint", { hasEndpoint: true });
              endpointResolve();
            } else {
              const j = tryParseJson(ev.data) as { id?: string } | undefined;
              if (j && typeof j === "object" && j.id !== undefined) {
                const p = pending.get(String(j.id));
                if (p) { pending.delete(String(j.id)); p.resolve(j); }
              }
            }
          }
        }
      } catch (e) {
        streamErr = e;
        endpointResolve(); // unblock a waiter so it can fail fast
        for (const [, p] of pending) p.reject(e);
        pending.clear();
      }
    })();

    const post = (message: Record<string, unknown>, expectReply: boolean): Promise<unknown> => {
      return new Promise((resolve, reject) => {
        if (!endpointUrl) { reject(new McpError("mcp_sse_no_endpoint", "MCP SSE server never sent an endpoint event")); return; }
        const id = message.id as string | undefined;
        if (expectReply && id) pending.set(String(id), { resolve, reject });
        this.fetchImpl(endpointUrl, {
          method: "POST",
          redirect: "manual",
          signal,
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${this.opts.token}` },
          body: JSON.stringify(message),
        }).then(async (r) => {
          if (!r.ok) {
            const body = await r.text().catch(() => "");
            if (id) pending.delete(String(id));
            reject(new McpError(`mcp_sse_post_${r.status}`, `MCP message POST HTTP ${r.status}: ${body.slice(0, 200)}`));
          } else if (!expectReply) {
            await r.text().catch(() => "");
            resolve(undefined);
          }
          // when expectReply: resolution comes from the stream reader
        }).catch((e) => { if (id) pending.delete(String(id)); reject(e); });
      });
    };

    try {
      await Promise.race([
        endpointReady,
        new Promise((_, rej) => setTimeout(() => rej(new McpError("mcp_sse_timeout", "timed out waiting for MCP SSE endpoint")), this.timeoutMs)),
      ]);
      if (streamErr) throw new McpError("mcp_sse_stream_error", `MCP SSE stream errored: ${String(streamErr)}`);

      // initialize → initialized → request, all over the message endpoint.
      const initId = crypto.randomUUID();
      const initReply = await post(jsonRpcRequest(initId, "initialize", this.initializeParams()), true);
      const initErr = rpcError(initReply);
      if (initErr) throw new McpError("mcp_initialize_failed", initErr);
      try { await post(jsonRpcNotification("notifications/initialized"), false); }
      catch (e) { this.log("mcp.sse.initialized_notice_failed", { error: String(e) }); }

      const reqId = crypto.randomUUID();
      const reply = await post(jsonRpcRequest(reqId, method, params), true);
      const err = rpcError(reply);
      if (err) throw new McpError("mcp_request_error", err);
      return reply;
    } finally {
      done();
      try { await reader.cancel(); } catch { /* stream already closed */ }
      await readLoop.catch(() => {});
    }
  }
}

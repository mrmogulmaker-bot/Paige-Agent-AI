// _shared/mcp-client.ts — the ONE Model Context Protocol client (§18).
//
// Both tenant MCP providers speak the same wire protocol, so they share one client
// rather than one inline copy each. The provider differences that actually exist are
// narrow and expressed as arguments: how the request is authorised (a Bearer token, or
// a provider-named header), and how the response is framed (a JSON body, or a
// Server-Sent Events stream — Streamable HTTP allows either for the same call).
//
// Every outbound request goes through `safeFetch`, so the whole surface inherits the
// same guarantees at connect, at discovery and at call: https only, no embedded
// credentials, public addresses only, no redirects followed, bounded wall clock,
// bounded response size, and a stable reason on every failure.
//
// SECRET DISCIPLINE. The token is read here, put on a header, and dropped. It is never
// returned, never placed in an error, never logged, and never part of any value this
// module hands back to a caller. `describeMcpError` exists so callers have something
// safe to surface without reaching for the raw text themselves.
import { safeFetch, SsrfError, type SsrfReason } from "./ssrfGuard.ts";

/** How a provider expects the tenant's credential to be presented. */
export type McpAuth =
  | { kind: "bearer"; token: string }
  | { kind: "header"; name: string; token: string };

export type McpErrorCode =
  | SsrfReason
  | "mcp_http_error"
  | "mcp_malformed_response"
  | "mcp_protocol_error";

export class McpError extends Error {
  constructor(
    public readonly code: McpErrorCode,
    /** Bounded, provider-supplied text. Never contains our credential. */
    public readonly detail?: string,
    public readonly httpStatus?: number,
  ) {
    super(code);
    this.name = "McpError";
  }
}

/** MCP requires a protocol version on every request; this is the revision we speak. */
const PROTOCOL_VERSION = "2025-06-18";

/** Discovery and calls are cheap; a provider that cannot answer inside this is down. */
const DEFAULT_TIMEOUT_MS = 15_000;
const DEFAULT_MAX_BYTES = 1_048_576;

/**
 * Header names this transport sets itself, and which a tenant's custom header name may
 * therefore not be. The token-grammar check below stops a NEW header being injected; it
 * does nothing about an EXISTING one being replaced, and the auth headers are spread last,
 * so a workspace that named its header `Accept` silently decided this client's content
 * negotiation — or, worse, named it `Authorization` and decided its own credential was the
 * bearer token for a server that reads both.
 */
const RESERVED_HEADERS = new Set([
  "authorization", "content-type", "accept", "mcp-protocol-version",
  // Not set here, but set by the runtime, and a value that changes which virtual host
  // answers is not a thing a credential field gets to decide.
  "host", "content-length", "connection", "transfer-encoding",
]);

function authHeaders(auth: McpAuth): Record<string, string> {
  // A custom header name is tenant-supplied, so it is constrained to the RFC 9110 token
  // grammar. Without this a newline in the name would let a tenant inject headers.
  if (auth.kind === "header") {
    if (!/^[A-Za-z0-9!#$%&'*+.^_`|~-]+$/.test(auth.name)) {
      throw new McpError("mcp_protocol_error", "invalid header name");
    }
    if (RESERVED_HEADERS.has(auth.name.toLowerCase())) {
      throw new McpError("mcp_protocol_error", "reserved header name");
    }
    return { [auth.name]: auth.token };
  }
  return { Authorization: `Bearer ${auth.token}` };
}

export type McpRequestOptions = {
  serverUrl: string;
  auth: McpAuth;
  method: string;
  params?: Record<string, unknown>;
  timeoutMs?: number;
  maxBytes?: number;
};

/**
 * One MCP JSON-RPC request. The method and params are always chosen by OUR caller from a
 * validated shape — a tenant never supplies the method — and the tenant's only influence
 * on the destination is the server URL, which `safeFetch` has already vetted.
 *
 * The result is returned unwrapped and UNPROJECTED. It is untrusted provider output and
 * must not reach a model, a transcript, memory or Rail: `_shared/mcp-outcome.ts` is the
 * boundary that decides what may. Nothing here is a safe thing to forward.
 */
export async function mcpRequest(opts: McpRequestOptions): Promise<unknown> {
  let res: Awaited<ReturnType<typeof safeFetch>>;
  try {
    res = await safeFetch(
      opts.serverUrl,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          // Streamable HTTP lets the server answer with either framing for the same
          // request, so both are advertised and both are handled below.
          Accept: "application/json, text/event-stream",
          "MCP-Protocol-Version": PROTOCOL_VERSION,
          ...authHeaders(opts.auth),
        },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: crypto.randomUUID(),
          method: opts.method,
          params: opts.params ?? {},
        }),
      },
      {
        timeoutMs: opts.timeoutMs ?? DEFAULT_TIMEOUT_MS,
        maxBytes: opts.maxBytes ?? DEFAULT_MAX_BYTES,
      },
    );
  } catch (e) {
    if (e instanceof SsrfError) throw new McpError(e.reason);
    if (e instanceof McpError) throw e;
    throw new McpError("mcp_protocol_error");
  }

  if (res.status < 200 || res.status >= 300) {
    // The STATUS is carried and the body is not. Nothing reads the detail — every surface
    // words these failures from the code — so a bounded slice of provider text bought
    // nothing and put arbitrary third-party content into an Error message, which is the
    // one object in this path that gets logged, wrapped and stringified by code that never
    // asked what was in it.
    throw new McpError("mcp_http_error", undefined, res.status);
  }

  // A truncated envelope is not a short envelope: half a JSON-RPC response parses as
  // nothing, or worse, as something. This is the one place `response_too_large` was
  // declared and worded for and never actually raised, so an oversized answer arrived as
  // "that address answered, but not as an MCP server" — which reads as the workspace
  // having typed the wrong URL.
  if (res.truncated) throw new McpError("response_too_large");

  const envelope = parseEnvelope(res.body, res.headers.get("content-type") ?? "");
  if (envelope === null) throw new McpError("mcp_malformed_response");

  const e = envelope as { error?: { message?: unknown; code?: unknown }; result?: unknown };
  if (e.error) {
    const message = typeof e.error.message === "string" ? e.error.message.slice(0, 300) : undefined;
    throw new McpError("mcp_protocol_error", message);
  }
  if (!("result" in e)) throw new McpError("mcp_malformed_response");
  return e.result;
}

/**
 * Reads the JSON-RPC envelope out of either framing. For an SSE stream the last complete
 * `data:` payload that parses as an object wins, which is the JSON-RPC response — earlier
 * events on the stream are progress notifications.
 */
function parseEnvelope(body: string, contentType: string): unknown | null {
  if (contentType.includes("text/event-stream")) {
    let last: unknown = null;
    for (const line of body.split(/\r?\n/)) {
      if (!line.startsWith("data:")) continue;
      const payload = line.slice(5).trim();
      if (!payload || payload === "[DONE]") continue;
      try {
        const parsed = JSON.parse(payload);
        if (parsed && typeof parsed === "object") last = parsed;
      } catch { /* a partial or non-JSON event — keep the last good one */ }
    }
    return last;
  }
  try {
    const parsed = JSON.parse(body);
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
}

export type McpTool = { name: string; description: string };

/**
 * A discovered tool, with its input schema reduced to a fingerprint.
 *
 * The schema itself never leaves this module. What is kept is a hash, which is enough to
 * answer the only question anyone downstream needs: is this the same tool the workspace
 * approved, or has it changed since? A tool whose inputs changed after approval is not
 * the tool that was approved — the name is the same and the contract is not — and that is
 * exactly the substitution a pinned fingerprint exists to catch.
 *
 * `description` is provider-written text. It is bounded here and is safe to show a HUMAN
 * deciding what to approve; it must never reach a model. That distinction is the caller's
 * to keep, and `_shared/mcp-outcome.ts` is where it is kept.
 */
export type McpToolFingerprint = McpTool & { schemaHash: string };

/**
 * Discovery, reduced to identity and purpose. Input schemas are deliberately dropped
 * here: nothing downstream of this slice is allowed to act on an unpinned schema, and
 * not returning one is a stronger guarantee than returning one nobody reads.
 */
export async function mcpListTools(opts: {
  serverUrl: string;
  auth: McpAuth;
  timeoutMs?: number;
}): Promise<McpTool[]> {
  const result = await mcpRequest({ ...opts, method: "tools/list" });
  const tools = (result as { tools?: unknown })?.tools;
  if (!Array.isArray(tools)) return [];
  return tools
    .filter((t): t is Record<string, unknown> => !!t && typeof t === "object" && typeof (t as { name?: unknown }).name === "string")
    .map((t) => ({
      name: String(t.name).slice(0, 200),
      description: typeof t.description === "string" ? t.description.slice(0, 500) : "",
    }));
}

/**
 * Discovery that also fingerprints each tool's input schema.
 *
 * Used at approval time, so the workspace's decision can be pinned to a specific contract,
 * and at call time, so drift can be detected before anything runs.
 */
export async function mcpListToolFingerprints(opts: {
  serverUrl: string;
  auth: McpAuth;
  timeoutMs?: number;
}): Promise<McpToolFingerprint[]> {
  const result = await mcpRequest({ ...opts, method: "tools/list" });
  const tools = (result as { tools?: unknown })?.tools;
  if (!Array.isArray(tools)) return [];
  const out: McpToolFingerprint[] = [];
  for (const raw of tools) {
    if (!raw || typeof raw !== "object") continue;
    const t = raw as Record<string, unknown>;
    if (typeof t.name !== "string" || !t.name) continue;
    out.push({
      name: t.name.slice(0, 200),
      description: typeof t.description === "string" ? t.description.slice(0, 500) : "",
      schemaHash: await fingerprintSchema(t.inputSchema),
    });
  }
  return out;
}

/**
 * A stable hash of a tool's input schema.
 *
 * Canonicalised first — object keys sorted, so a provider that serialises the same schema
 * in a different key order does not read as drift and cause a working integration to fail
 * closed for no reason. Array order is preserved, because in a schema it is meaningful
 * (`required`, `enum`) and reordering it IS a contract change.
 *
 * An absent schema hashes the empty object rather than being skipped: "this tool declared
 * no inputs" is itself a contract, and a later tool that grows inputs must register as
 * changed.
 */
export async function fingerprintSchema(schema: unknown): Promise<string> {
  const canonical = canonicalJson(schema === undefined || schema === null ? {} : schema);
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(canonical));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value) ?? "null";
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonicalJson(v)}`).join(",")}}`;
}

/**
 * A connectivity probe, and the ONLY thing entitled to move a saved connection to
 * `connected`. It proves three things at once: the address is reachable under the SSRF
 * rules, the credential is accepted, and the endpoint actually speaks MCP. Saving a row
 * proves none of them, which is why the setter writes `pending_verification`.
 */
export async function mcpProbe(opts: {
  serverUrl: string;
  auth: McpAuth;
  timeoutMs?: number;
}): Promise<{ ok: true; toolCount: number } | { ok: false; code: McpErrorCode; httpStatus?: number }> {
  try {
    const tools = await mcpListTools(opts);
    return { ok: true, toolCount: tools.length };
  } catch (e) {
    if (e instanceof McpError) return { ok: false, code: e.code, httpStatus: e.httpStatus };
    return { ok: false, code: "mcp_protocol_error" };
  }
}

/**
 * Owner-facing language for every failure this client models. Keeping the mapping here
 * means no caller has to decide what is safe to show, and no raw provider text or
 * credential can reach a surface by way of an error message.
 */
export function describeMcpError(code: McpErrorCode): string {
  switch (code) {
    case "invalid_url": return "That address is not a valid URL.";
    case "url_must_be_https": return "The address has to start with https:// so the credential is never sent in the clear.";
    case "url_has_embedded_credentials": return "Remove the username and password from the address; the credential belongs in its own field.";
    case "url_host_not_allowed":
    case "url_resolves_to_private_address": return "That address points somewhere private, so it was not contacted.";
    case "url_host_unresolvable": return "That address could not be looked up.";
    case "url_redirect_refused": return "That address redirects somewhere else, which is not followed. Use the address it points at.";
    case "request_timed_out": return "The server did not answer in time.";
    case "response_too_large": return "The server sent more than can be read safely.";
    case "mcp_http_error": return "The server rejected the connection. Check the credential and the address.";
    case "mcp_malformed_response":
    case "mcp_protocol_error": return "That address answered, but not as an MCP server.";
    case "request_failed":
    default: return "The server could not be reached.";
  }
}

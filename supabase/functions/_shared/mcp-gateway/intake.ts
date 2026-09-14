// Safe read-only INTAKE for a connected MCP (Phase S).
//
// Intake is the first thing Paige does with a new connection: initialize + tools/list +
// fingerprint + a health read. It is DISCOVERY ONLY — it never issues a mutating tools/call,
// never executes a workflow, and never alters provider permissions. The result is persisted by
// the service-role probe RPC (`mcp_connection_probe`), which is the ONLY writer of
// status='connected' / health='healthy'.
//
// It reuses the hardened provider-agnostic client (`../mcp-client.ts`): the SSRF-guarded
// session lifecycle, cursor-paginated tools/list, and schema/authority fingerprint pins. Tool
// input schemas and provider descriptions never leave that module.

import { mcpListToolFingerprints, type McpAuth } from "../mcp-client.ts";
import type { IntakeResult } from "./types.ts";

function errorCodeOf(e: unknown): string {
  if (e && typeof e === "object" && typeof (e as { code?: unknown }).code === "string") {
    return (e as { code: string }).code;
  }
  return "intake_failed";
}

/**
 * Probe a connection read-only and return a typed result. NEVER throws through — a provider
 * that is down or refuses the credential is a health fact, not an exception the caller must
 * catch. It returns a closed `errorCode`; raw provider text is never surfaced.
 *
 * `execute`/`tools/call` is deliberately not reachable from here: intake cannot cause an
 * external effect no matter what the connection authorizes.
 */
export async function runReadOnlyIntake(opts: {
  serverUrl: string;
  auth: McpAuth;
  timeoutMs?: number;
}): Promise<IntakeResult> {
  try {
    const tools = await mcpListToolFingerprints({
      serverUrl: opts.serverUrl,
      auth: opts.auth,
      timeoutMs: opts.timeoutMs,
    });
    // A reachable server with a valid credential that returns its catalog is healthy. An empty
    // catalog is still "connected + healthy" — empty is not the same as unreachable, and the
    // truth boundary (§8 of the review) forbids reading "no tools" as "not connected".
    return { ok: true, health: "healthy", status: "connected", tools, errorCode: null };
  } catch (e) {
    const code = errorCodeOf(e);
    // A rejected credential or an unreachable/again-down provider both degrade to
    // needs_attention with an honest code — never a fabricated "connected", never raw text.
    return { ok: false, health: "needs_attention", status: "error", tools: [], errorCode: code };
  }
}

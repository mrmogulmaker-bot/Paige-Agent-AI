// Connected MCP Gateway — tool-call RESULT validation (#1262 finding 4).
//
// After a `tools/call` returns, the runner used to emit `executed`/`read_observed` without ever
// inspecting the result — so a provider that RAN the tool and answered `{ isError: true }` (a
// documented MCP failure shape), or answered in a shape we do not accept, was reported as a
// success. This is the boundary that stops that: a returned result is a success only when it is
// the recognized MCP result shape AND does not carry `isError`.
//
// WHY THE GATEWAY HAS ITS OWN COPY. `_shared/mcp-outcome.ts` has an equivalent private
// `validateResult`, but that module is the n8n|zapier-TYPED legacy wrapper the gateway
// deliberately does not import (see `types.ts` header). This is the gateway's provider-agnostic
// home for the same check — identity + shape only, never provider content. Reconciling the two
// into one shared primitive is a §18 follow-up deferred to Phase C precisely so this slice does
// not touch the live Chat/zapier/n8n lane (`mcp-outcome.ts` is imported transitively by
// `paige-ai-chat`, which is parked pending #1255).

export type ToolResultCheck = {
  /** Whether the result is the documented MCP `{ content: [...] }` shape at all. An unrecognized
   *  shape is NOT a success — the runner reports it as a tool error, never as executed. */
  recognized: boolean;
  /** Whether this result is an error, honoured only when the shape is recognized. `true` when the
   *  provider set `isError: true` OR when `isError` is PRESENT but not a boolean — a malformed flag
   *  from untrusted provider output fails CLOSED to an error, never a silent success (Codex P2). */
  isError: boolean;
};

/**
 * Validates a `tools/call` result. Accepts only `{ content: Array<{ type: string, ... }> }`; maps
 * nothing and echoes nothing (content is provider-controlled and stays server-side). `isError` is
 * read only from the recognized shape.
 */
export function validateToolResult(raw: unknown): ToolResultCheck {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return { recognized: false, isError: false };
  const r = raw as { content?: unknown; isError?: unknown };
  if (!Array.isArray(r.content)) return { recognized: false, isError: false };
  for (const block of r.content) {
    if (!block || typeof block !== "object" || typeof (block as { type?: unknown }).type !== "string") {
      return { recognized: false, isError: false };
    }
  }
  // `isError` must be a boolean per the MCP spec. A PRESENT non-boolean isError (e.g. the string
  // "true", `1`, `null`) is a malformed shape from untrusted provider output — treat it as an error
  // (fail closed), never let it fall through the strict `=== true` check as a silent success.
  const isError = r.isError === true || (r.isError !== undefined && typeof r.isError !== "boolean");
  return { recognized: true, isError };
}

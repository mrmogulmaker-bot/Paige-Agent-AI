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
  /** The provider's own `isError` flag, honoured only when the shape is recognized. */
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
  return { recognized: true, isError: r.isError === true };
}

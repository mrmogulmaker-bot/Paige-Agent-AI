// Generic, connection-parameterized capability RUNNER (Phase S foundation + Phase C hard-entry
// safeguards #1262 findings 1/2/4/5, still library-only).
//
// One runner for ANY connected MCP — no per-provider lane. It reuses the hardened
// `withApprovedCapabilitySession` from `../mcp-client.ts`, which lists the provider's tools and
// runs one, IN THE SAME SESSION, so what was verified and what runs are the same catalogue with
// no substitution window.
//
// The permission model (review §7 / owner ruling §2.2):
//   * The provider's LIVE tool catalog + granted scopes ARE Paige's surface. The runner imposes
//     NO separate capability allowlist and NO static read-only ceiling.
//   * read / prepare are always allowed on a provider-authorized tool.
//   * A consequential external effect EXECUTES after owner approval — the approval is the gate.
//     Lacking approval, it is `refused`, NEVER reported as unavailable for being a mutation.
//   * An uncertain result after dispatch is `outcome_unknown` and is NEVER auto-retried.
//
// THE PHASE C HARD-ENTRY SAFEGUARDS wired here (each proven against the in-process fake only):
//   1. Whether a tool needs approval is decided SERVER-AUTHORITATIVELY (`resolveEffectApproval`):
//      provider `_meta.effects` may raise the gate, never lower it below the mutation-verb name
//      floor. A mislabeled `["read"]` on a `send_*`/`delete_*` tool still requires approval.
//   2. Consent is DURABLE and server-verified (`deps.verifyApproval`, backed by
//      `verify_mcp_connection_approval`): a stored approval bound to the connection, endpoint
//      identity, live fingerprint, action shape and expiry. The runner NEVER infers consent from
//      a pin carried in its own request — there is no `approval` field any more.
//   4. A dispatched call whose result carries `isError` (or an unrecognized shape) is `tool_error`,
//      never dressed as `executed`/`read_observed` (`validateToolResult`).
//   5. Its `recordReceipt` dep routes the final outcome to the CANONICAL Rail (see rail-receipt.ts).
//
// PHASE S/C BOUNDARY: this module is wired into no deployed provider-calling endpoint. `execute`
// is proven only against an in-process fake MCP server in the smoke; a live invocation is Phase C,
// gated behind #1255 + owner go. The safeguards above are the gate it must pass first.

import { withApprovedCapabilitySession, type McpAuth } from "../mcp-client.ts";
import type { GatewayConnection, RunnerOutcome, RunnerResult } from "./types.ts";
import { resolveEffectApproval } from "./effect-policy.ts";
import { validateToolResult } from "./result.ts";
import { argsShapeHash, type ApprovalVerifier } from "./consent.ts";

function errorCodeOf(e: unknown): string {
  if (e && typeof e === "object" && typeof (e as { code?: unknown }).code === "string") {
    return (e as { code: string }).code;
  }
  return "runner_failed";
}

export type RunnerDeps = {
  /** Records the run's outcome. In production this is the CANONICAL-Rail receipt
   *  (`makeCanonicalRailReceipt`); the smoke injects a collector. Best-effort — a recording
   *  failure never turns a completed action into a reported failure. */
  recordReceipt?: (r: {
    connectionId: string;
    toolName: string;
    outcome: RunnerOutcome;
    runId: string;
    detail: Record<string, unknown>;
  }) => Promise<void> | void;
  /** Durable, server-side consent check (#1262 finding 2). In production backed by
   *  `verify_mcp_connection_approval`; the smoke injects a fixture-bound fake. When a tool requires
   *  approval and no verifier is wired, the run fails CLOSED. */
  verifyApproval?: ApprovalVerifier;
};

export type RunnerRequest = {
  connection: Pick<GatewayConnection, "connectionId" | "serverUrl" | "auth"> & { auth: McpAuth };
  toolName: string;
  args: Record<string, unknown>;
  mode: "prepare" | "execute";
  timeoutMs?: number;
};

export async function runConnectionCapability(
  req: RunnerRequest,
  deps: RunnerDeps = {},
): Promise<RunnerResult> {
  const runId = crypto.randomUUID();
  const emit = async (outcome: RunnerOutcome, code: string | null): Promise<RunnerResult> => {
    try {
      await deps.recordReceipt?.({
        connectionId: req.connection.connectionId,
        toolName: req.toolName,
        outcome,
        runId,
        detail: code ? { code } : {},
      });
    } catch { /* recording never turns a completed action into a reported failure */ }
    return { outcome, runId, code };
  };

  // prepare never opens a session or contacts the provider — it stages intent only.
  if (req.mode === "prepare") return await emit("prepared", null);

  let dispatched = false;
  try {
    return await withApprovedCapabilitySession<RunnerResult>(
      { serverUrl: req.connection.serverUrl, auth: req.connection.auth, timeoutMs: req.timeoutMs },
      async ({ tools, call }) => {
        // The provider's live catalog IS the surface. A tool the connection does not currently
        // offer is not runnable — that is the provider's authority speaking, not a Paige gate.
        const tool = tools.find((t) => t.name === req.toolName);
        if (!tool) return await emit("refused", "no_longer_offered");

        // PHASE C WIRING OBLIGATION (§39 adversarial note, tracked in #1262): `verifyApproval`
        // authorizes against the endpoint stored on the connection row, while this session
        // dispatches to `req.connection.serverUrl` supplied by the caller. Inert today (this runner
        // is imported by no deployed function), but when Phase C wires it live the dispatch URL and
        // the verified connection MUST be single-sourced from the SAME connection-row read (e.g. via
        // get_mcp_connection_secret) so a caller cannot verify against endpoint A and dispatch to B —
        // the exact endpoint-binding bypass the endpoint_hash binding exists to prevent.

        // (1) SERVER-AUTHORITATIVE effect decision — provider metadata may only RAISE the gate.
        const decision = resolveEffectApproval(tool.name, tool.effects);
        if (decision.requiresApproval) {
          // (2) DURABLE consent — verified against the stored, endpoint-bound approval, never a
          // pin in this request. No verifier wired ⇒ fail closed.
          const shapeHash = await argsShapeHash(req.args);
          const check = deps.verifyApproval
            ? await deps.verifyApproval({
              connectionId: req.connection.connectionId,
              toolName: tool.name,
              livePin: tool.pin,
              argsShapeHash: shapeHash,
            })
            : { authorized: false, reason: "approval_unavailable" };
          if (!check.authorized) {
            // A generic "approval_required" degrades to the precise basis when the store had no
            // opinion, so an operator learns WHY (undeclared effects vs. a missing approval).
            const code = check.reason && check.reason !== "approval_required"
              ? check.reason
              : (decision.basis === "effects_undeclared" ? "effects_undeclared" : "approval_required");
            return await emit("refused", code);
          }
        }

        dispatched = true;
        const result = await call(req.toolName, req.args);
        // (4) The provider RAN it — but a reported error or an unaccepted shape is not a success.
        const validated = validateToolResult(result);
        if (!validated.recognized) return await emit("tool_error", "unrecognized_result");
        if (validated.isError) return await emit("tool_error", "provider_reported_error");
        return await emit(decision.requiresApproval ? "executed" : "read_observed", null);
      },
    );
  } catch (e) {
    const code = errorCodeOf(e);
    // Before dispatch: the provider was unreachable / refused the session. After dispatch: the
    // effect may or may not have landed — report it honestly and NEVER auto-retry.
    return await emit(dispatched ? "outcome_unknown" : "provider_unavailable", code);
  }
}

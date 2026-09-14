// Generic, connection-parameterized capability RUNNER (Phase S).
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
//   * A consequential external effect (create/update/send/delete) EXECUTES after owner approval —
//     the approval is the gate. Lacking approval, it is `refused: approval_required`, NEVER
//     reported as unavailable for being a mutation.
//   * Approval is pinned to the tool's schema+authority; a drifted pin is refused (contract_changed).
//   * An uncertain result after dispatch is `outcome_unknown` and is NEVER auto-retried.
//
// PHASE S BOUNDARY: this module is not wired into paige-ai-chat or any deployed provider-calling
// endpoint. `execute` is proven only against an in-process fake MCP server in the smoke test; a
// live invocation (which contacts a provider) is Phase C and is gated behind #1255 + owner go.

import { withApprovedCapabilitySession, type McpAuth } from "../mcp-client.ts";
import type { GatewayConnection, RunnerOutcome, RunnerResult } from "./types.ts";

const MUTATING = new Set(["create", "update", "send", "delete"]);

function errorCodeOf(e: unknown): string {
  if (e && typeof e === "object" && typeof (e as { code?: unknown }).code === "string") {
    return (e as { code: string }).code;
  }
  return "runner_failed";
}

export type RunnerDeps = {
  /** Records a connection-scoped receipt. Best-effort — a recording failure never fails the run.
   *  In production this calls record_mcp_connection_receipt; the smoke injects a collector. */
  recordReceipt?: (r: {
    connectionId: string;
    toolName: string;
    outcome: RunnerOutcome;
    runId: string;
    detail: Record<string, unknown>;
  }) => Promise<void> | void;
};

export type RunnerRequest = {
  connection: Pick<GatewayConnection, "connectionId" | "serverUrl" | "auth"> & { auth: McpAuth };
  toolName: string;
  args: Record<string, unknown>;
  mode: "prepare" | "execute";
  /** Owner approval proof: the pin the operator approved this exact tool contract at. */
  approval?: { pin: string } | null;
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

        // FAIL CLOSED on undeclared effects. A tool the provider did not positively declare
        // read-only (empty effect set — e.g. a generic remote MCP that omits `_meta.effects`)
        // is treated as consequential and requires approval; it is NEVER auto-run as a read.
        // The effect set is only as trustworthy as the provider's self-declaration, so the
        // absence of a declaration is resolved in the safe direction, not the permissive one.
        const effectsKnown = tool.effects.length > 0;
        const requiresApproval = !effectsKnown || tool.effects.some((e) => MUTATING.has(e));
        if (requiresApproval) {
          // Approval is the execution gate — not a reason to hide the tool.
          if (!req.approval) return await emit("refused", effectsKnown ? "approval_required" : "effects_undeclared");
          // The approval was for a specific contract; if the tool's pin moved, it is a
          // different contract and must be re-approved.
          if (req.approval.pin !== tool.pin) return await emit("refused", "contract_changed");
        }

        dispatched = true;
        await call(req.toolName, req.args);
        return await emit(requiresApproval ? "executed" : "read_observed", null);
      },
    );
  } catch (e) {
    const code = errorCodeOf(e);
    // Before dispatch: the provider was unreachable / refused the session. After dispatch: the
    // effect may or may not have landed — report it honestly and NEVER auto-retry.
    return await emit(dispatched ? "outcome_unknown" : "provider_unavailable", code);
  }
}

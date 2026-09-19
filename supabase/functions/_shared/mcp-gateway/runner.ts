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
//   0. SINGLE SOURCE (MCP PR-1): the dispatch endpoint/auth AND the consent identity BOTH derive from
//      the ONE canonical connection row, loaded server-side by `connectionId`
//      (`deps.loadConnection` → `get_mcp_connection_secret`). The request carries NO url, so a caller
//      can never verify consent against endpoint A and dispatch to endpoint B; a row whose tenant is
//      not the caller's server-derived tenant is refused `foreign_tenant` (§9).
//   1. Whether a tool needs approval is decided SERVER-AUTHORITATIVELY (`resolveEffectApproval`):
//      provider `_meta.effects` may raise the gate, never lower it below the mutation-verb name
//      floor. A mislabeled `["read"]` on a `send_*`/`delete_*` tool still requires approval.
//   2. Consent is DURABLE and server-verified (`deps.verifyApproval`, backed by
//      `verify_mcp_connection_approval`): a stored approval bound to the connection, endpoint
//      identity, live fingerprint, action shape and expiry. The runner NEVER infers consent from
//      a pin carried in its own request — there is no `approval` field any more.
//   4. A dispatched call whose result carries `isError` (incl. a malformed non-boolean isError) or
//      an unrecognized shape is never dressed as `executed`/`read_observed` (`validateToolResult`).
//      For a READ it is `tool_error`; for a MUTATION it is `outcome_unknown` — the effect may have
//      landed, so it must never read as "nothing half-done" nor be auto-retried (Codex P2).
//   5. Its `recordReceipt` dep routes the final outcome to the CANONICAL Rail (see rail-receipt.ts),
//      and the runner carries back whether that row actually persisted (`RunnerResult.receipt`) so a
//      completed-but-unrecorded run is reported truthfully, never as a fully-recorded success.
//
// PHASE S/C BOUNDARY: this module is wired into no deployed provider-calling endpoint. `execute`
// is proven only against an in-process fake MCP server in the smoke; a live invocation is Phase C,
// gated behind #1255 + owner go. The safeguards above are the gate it must pass first.

import { withApprovedCapabilitySession } from "../mcp-client.ts";
import type { ReceiptFiling, RunnerOutcome, RunnerResult } from "./types.ts";
import { resolveEffectApproval } from "./effect-policy.ts";
import { validateToolResult } from "./result.ts";
import { argsShapeHash, type ApprovalVerifier } from "./consent.ts";
import type { ConnectionLoader } from "./connection.ts";

function errorCodeOf(e: unknown): string {
  if (e && typeof e === "object" && typeof (e as { code?: unknown }).code === "string") {
    return (e as { code: string }).code;
  }
  return "runner_failed";
}

export type RunnerDeps = {
  /** Records the run's outcome. In production this is the CANONICAL-Rail receipt
   *  (`makeCanonicalRailReceipt`); the smoke injects a collector. Best-effort — a recording
   *  failure never turns a completed action into a reported failure. It MAY return a
   *  `ReceiptFiling` saying whether the row actually persisted; the runner carries that on
   *  `RunnerResult.receipt` so a completed-but-unrecorded run is never reported as fully
   *  recorded (Codex R3). A writer that returns nothing makes no filing claim. */
  recordReceipt?: (r: {
    connectionId: string;
    toolName: string;
    outcome: RunnerOutcome;
    runId: string;
    detail: Record<string, unknown>;
  }) => Promise<ReceiptFiling | void> | ReceiptFiling | void;
  /** Durable, server-side consent check (#1262 finding 2). In production backed by
   *  `verify_mcp_connection_approval`; the smoke injects a fixture-bound fake. When a tool requires
   *  approval and no verifier is wired, the run fails CLOSED. */
  verifyApproval?: ApprovalVerifier;
  /** Resolves a `connection_id` to its CANONICAL endpoint + auth + tenant from the one server-side
   *  connection row (production: `makeRpcConnectionLoader` over `get_mcp_connection_secret`). The
   *  runner dispatches ONLY to what this returns — a caller never supplies a URL (MCP PR-1). When a
   *  run would dispatch and no loader is wired, the run fails CLOSED. */
  loadConnection?: ConnectionLoader;
};

export type RunnerRequest = {
  /** The immutable connection identity. It ALONE selects the row that supplies BOTH the dispatch
   *  endpoint (via `deps.loadConnection`) and the consent identity (via `deps.verifyApproval`) — the
   *  request carries no URL, so consent and dispatch can never derive from two different sources
   *  (MCP PR-1). */
  connectionId: string;
  /** The caller's SERVER-DERIVED tenant. The loaded connection row's tenant must match it or the run
   *  is refused `foreign_tenant` (§9); `get_mcp_connection_secret` is tenant-agnostic, so this is
   *  where cross-tenant use is caught. */
  tenantId: string;
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
    // The receipt is best-effort for the OUTCOME (a landed effect is never downgraded to a failure
    // because its Rail row did not persist — §13/§32) but TRUTHFUL for the RECORD: whatever the
    // writer reports about whether the row persisted is carried through, so a completed-but-
    // unrecorded run is never dressed as fully recorded (Codex R3). No writer, or one that returns
    // nothing → no filing claim (`null`); a writer that throws is itself a filing failure.
    let receipt: ReceiptFiling | null = null;
    try {
      const filing = await deps.recordReceipt?.({
        connectionId: req.connectionId,
        toolName: req.toolName,
        outcome,
        runId,
        detail: code ? { code } : {},
      });
      if (filing) receipt = filing;
    } catch { receipt = { filed: false, reason: "record_threw" }; }
    return { outcome, runId, code, receipt };
  };

  // prepare never opens a session or contacts the provider — it stages intent only.
  if (req.mode === "prepare") return await emit("prepared", null);

  // SINGLE SOURCE (MCP PR-1): the dispatch endpoint and auth derive from the ONE canonical connection
  // row, loaded server-side by `connectionId` — the same id that backs consent below. The request
  // carries no URL, so a caller can never verify consent against endpoint A and dispatch to endpoint B.
  // No loader wired ⇒ fail closed.
  const canon = deps.loadConnection
    ? await deps.loadConnection(req.connectionId)
    : { ok: false as const, reason: "no_connection" as const };
  if (!canon.ok) return await emit("refused", canon.reason);
  // §9 isolation: `get_mcp_connection_secret` is tenant-agnostic, so the runner enforces that the
  // row's tenant is the caller's server-derived tenant. A foreign-tenant connection never dispatches.
  if (canon.tenantId !== req.tenantId) return await emit("refused", "foreign_tenant");

  let dispatched = false;
  // The server-resolved effect decision, hoisted so the post-dispatch catch can classify a THROWN
  // transport failure by read-vs-mutation without re-deriving it from provider metadata (Codex P2).
  let consequential = false;
  try {
    return await withApprovedCapabilitySession<RunnerResult>(
      { serverUrl: canon.serverUrl, auth: canon.auth, timeoutMs: req.timeoutMs },
      async ({ tools, call }) => {
        // The provider's live catalog IS the surface. A tool the connection does not currently
        // offer is not runnable — that is the provider's authority speaking, not a Paige gate.
        const tool = tools.find((t) => t.name === req.toolName);
        if (!tool) return await emit("refused", "no_longer_offered");

        // (1) SERVER-AUTHORITATIVE effect decision — provider metadata may only RAISE the gate.
        const decision = resolveEffectApproval(tool.name, tool.effects);
        consequential = decision.requiresApproval; // carried into the catch for a post-dispatch throw
        if (decision.requiresApproval) {
          // (2) DURABLE consent — verified against the stored, endpoint-bound approval, never a
          // pin in this request. No verifier wired ⇒ fail closed.
          const shapeHash = await argsShapeHash(req.args);
          const check = deps.verifyApproval
            ? await deps.verifyApproval({
              connectionId: req.connectionId,
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
        // (4) The provider RAN it. A clean, recognized result with no error is the ONLY success.
        const validated = validateToolResult(result);
        if (validated.recognized && !validated.isError) {
          return await emit(decision.requiresApproval ? "executed" : "read_observed", null);
        }
        // Not a clean success. A CONSEQUENTIAL (approval-gated) call has already DISPATCHED, so its
        // effect may have landed fully or partially — a provider error / malformed / unaccepted
        // result does NOT prove rollback. Reporting `tool_error` (→ `capability_failed`, which the
        // Rail renders to the owner as "nothing was left half-done") would be catastrophically wrong
        // for a landed mutation and could prompt a DUPLICATING retry, so a mutation's post-dispatch
        // non-success is `outcome_unknown` (→ "may or may not have taken effect; check before running
        // again") and is NEVER auto-retried (Codex P2). A READ has no side effect, so a failed/errored
        // read is honestly `tool_error`.
        const code = validated.recognized ? "provider_reported_error" : "unrecognized_result";
        return await emit(decision.requiresApproval ? "outcome_unknown" : "tool_error", code);
      },
    );
  } catch (e) {
    const code = errorCodeOf(e);
    // Before dispatch: the provider was unreachable / refused the session → provider_unavailable.
    // After dispatch the tools/call itself threw (HTTP error, timeout, malformed envelope). The
    // read-vs-mutation distinction still holds and is carried from `consequential` (resolved BEFORE
    // dispatch — never re-derived from provider metadata here, Codex P2): a MUTATION may have landed,
    // so it is `outcome_unknown` and is never auto-retried; a READ has no side effect, so it is
    // `tool_error` (→ capability_failed), never a false "may have taken effect" warning.
    if (!dispatched) return await emit("provider_unavailable", code);
    return await emit(consequential ? "outcome_unknown" : "tool_error", code);
  }
}

/**
 * Bind a mutating tool's `confirm:true` to a SERVER-HELD proposal, not to the model's own flag.
 *
 * THE DEFECT THIS EXISTS TO CLOSE
 * -------------------------------
 * The autonomy gate in `paige-ai-chat` refuses whenever `gateArgs.confirm !== true`, which is a
 * real gate against a caller that just invokes the tool. But `gateArgs` is
 * `JSON.parse(tc.function.arguments)` — the MODEL'S OWN OUTPUT. Nothing tied that flag to the
 * `needs_confirm` that preceded it, or to anything a human said. Two consequences, both reachable:
 *
 *   1. A model emitting `confirm:true` on its FIRST call executed immediately.
 *   2. Worse, the bypass needed no human turn at all. The tool loop dedupes rounds on the exact
 *      argument string, and `{…}` vs `{…,"confirm":true}` are different signatures — so a model
 *      could call, receive `needs_confirm`, and re-call with `confirm:true` inside the SAME HTTP
 *      turn, up to MAX_ROUNDS, with no message from the operator in between.
 *
 * That made the flag *enforced but self-asserted*: real against a careless actor, worthless
 * against a deliberate one. This module supplies the missing half — a record only the SERVER can
 * mint, which must already exist, must match THIS action, and must predate the current turn.
 *
 * WHAT THIS PROVES, AND WHAT IT DOES NOT (§13 — the honest bound)
 * --------------------------------------------------------------
 * PROVES: the action was proposed by the server first; the operator's client took a turn in
 * between; the thing being executed is the thing that was proposed; and the approval is spent
 * once. A model can no longer act on a confirm-gated tool inside a single turn, nor swap the
 * action out from under an approval.
 *
 * DOES NOT PROVE: that the human said *yes*. The intervening turn is a human turn, not a grant —
 * a model could still read "no, don't" as approval. Binding to an authenticated approval CLICK is
 * the stronger step, and it needs per-surface UI work: today only `PaigeAIChat` renders
 * `PaigeConfirmCard`, and `useSoloChat` drops the confirm frame outright. That is tracked
 * separately rather than half-built here.
 *
 * WHY A SECOND HOME WAS NOT BUILT (§18)
 * -------------------------------------
 * `pipeline_archive_confirmations` (#709) already implements exactly this shape for ONE tool —
 * server-minted token, tenant + requester scoping, `expires_at`/`used_at`, a `for update` claim,
 * and a `created_at < turn start` check. This generalizes that pattern to every mutating tool
 * instead of forking a rival mechanism. The pipeline path keeps its own stricter checks on top
 * (an exact approval token echoed back from the confirmation card); nothing there is relaxed.
 *
 * Kept free of Deno globals on purpose so `src/**` vitest can exercise it directly.
 */

/** Arguments the model sent, minus the self-asserted flag, with keys deeply ordered. */
export function canonicalizeToolArgs(args: unknown): unknown {
  if (Array.isArray(args)) return args.map(canonicalizeToolArgs);
  if (args && typeof args === "object") {
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(args as Record<string, unknown>).sort()) {
      // `confirm` is the flag under test — it MUST NOT enter the hash, or the proposal
      // (confirm absent) could never match the confirmation (confirm true).
      if (key === "confirm") continue;
      out[key] = canonicalizeToolArgs((args as Record<string, unknown>)[key]);
    }
    return out;
  }
  return args;
}

/**
 * Stable identity for "this exact action". Binds the proposal to the confirmation so an approval
 * for one action cannot be spent on a different one.
 */
export async function toolArgsHash(toolKey: string, args: unknown): Promise<string> {
  const payload = JSON.stringify({ t: toolKey, a: canonicalizeToolArgs(args) });
  const digest = await globalThis.crypto.subtle.digest("SHA-256", new TextEncoder().encode(payload));
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** What the caller reports back from the atomic DB claim. */
export type ConfirmationClaim = {
  ok: boolean;
  /** Why the claim failed. Advisory only — every failure resolves the same way. */
  reason?: "no_open_confirmation" | "same_turn" | "expired" | "already_used" | "error";
};

export type ConfirmDecision =
  /** Run it. Either the workspace granted `auto`, or a real server-held proposal was consumed. */
  | { kind: "execute" }
  /** Do not run. Mint a proposal and return needs_confirm. `revalidate` = an approval was claimed
   *  but did not match, so the operator is being asked again about the action as it now stands. */
  | { kind: "propose"; revalidate: boolean }
  /** Turned off for this workspace. */
  | { kind: "disabled" };

/**
 * The whole gate decision, as one pure function so it can be tested without booting the runtime.
 *
 * The critical property: `claim` is the ONLY thing that can turn a `confirm` lane into `execute`.
 * `confirmFlag` alone never can — that is the defect. It only selects which branch runs.
 */
export function decideToolConfirmation(input: {
  autoMode: "auto" | "confirm" | "off" | string;
  /** `gateArgs.confirm` — the model's own output. Never trusted on its own. */
  confirmFlag: unknown;
  /** Result of the atomic server-side claim. Undefined when no claim was attempted. */
  claim?: ConfirmationClaim;
}): ConfirmDecision {
  if (input.autoMode === "off") return { kind: "disabled" };
  if (input.autoMode !== "confirm") return { kind: "execute" };

  if (input.confirmFlag !== true) return { kind: "propose", revalidate: false };

  // The model asserts approval. That assertion is worth nothing by itself: it is only a
  // request to spend a server-held proposal, and the server decides whether one exists.
  if (input.claim?.ok === true) return { kind: "execute" };

  // Fail CLOSED, but never into a dead end: the operator is asked again about this exact
  // action. A stale, spent, same-turn, or mismatched approval is not an error the operator
  // can act on — it is simply not an approval for what is now being attempted.
  return { kind: "propose", revalidate: true };
}

// THE ONE HOME for the approval-proposal fingerprint (§18).
//
// The fingerprint is a stable hash of the EXACT call a human was shown on a "Needs your OK" card.
// It is issued with the refusal, echoed back by the surface that rendered the card, and re-derived
// when the matching arguments are about to execute. They must match, or the gate refuses again —
// that is what stops the model substituting different arguments between the proposal and the
// execution (see 20261023000000_confirmations_bind_the_approval_to_the_call.sql).
//
// Extracted from `paige-ai-chat/index.ts` (was an inline closure) so it is PURE and unit-testable:
// a regression test can prove the fingerprint is invariant to the fields it must ignore and varies
// by the fields that define the action's identity. No behavioural change for identical inputs to a
// tool with no ignored args.
//
// ── WHY AN IGNORE-SET, AND WHY IT IS NARROW (§9/§13/§39) ─────────────────────────────────────────
// The fingerprint must be a property of the ACTION a person approved, not of how the model happened
// to phrase an internal note. `confirm` is dropped on every call (it is the handshake, not the
// action). Some tools also carry a MODEL-AUTHORED FREE-TEXT field that is not a consequential
// parameter and is not what executes — e.g. `action_advance`'s `decision_rationale` ("Why, when
// dismissing"). On the approval turn the model re-emits the call (its `confirm: true` tool
// description tells it "you do not need to reproduce the other arguments exactly — the exact call
// they were read is saved and is what runs"), so it rephrases or omits that note. If the note is in
// the fingerprint, the re-derived hash DRIFTS, the card's exact-match misses, and a batch of such
// actions can never be approved — it re-proposes forever (the P0 approval loop on dismissing three
// drafts). Excluding the note stabilises the identity so an approval for the same action set is not
// defeated by rationale drift.
//
// This is SAFE precisely because the seam executes the STORED proposal arguments, never the
// model's re-emission (`tc.function.arguments = JSON.stringify(approvedArgs)`), so the rationale
// that actually runs is the turn-1 value the operator was shown — the model cannot swap it. The
// set is therefore a NARROW, PER-TOOL, REVIEWED allowlist of non-identity model free-text. It must
// NEVER carry a consequential parameter — a recipient, an amount, a body, a target id, a status —
// because those DO define what the operator approved and a drift in them MUST refuse. Adding a tool
// here is a security-relevant act: state, per entry, why the field cannot change what runs.
export const NON_IDENTITY_ARGS: Readonly<Record<string, readonly string[]>> = Object.freeze({
  // `decision_rationale` is a human-readable note the model writes when dismissing an action. It is
  // not a parameter of the dismissal (the action_id + to_status are), it is stored but not acted on,
  // and it is exactly the field the model rephrases between proposal and approval. Excluding it lets
  // a batch dismissal's card match on re-emission. The action's identity stays in action_id +
  // to_status, which are NOT ignored.
  action_advance: ["decision_rationale"],
});

/**
 * A stable 16-hex-char fingerprint of `(tool, args)`. Keys are sorted, `confirm` is always dropped,
 * and any per-tool non-identity free-text (NON_IDENTITY_ARGS) is dropped — at every nesting level,
 * which is harmless because those fields only appear at the top level. Everything else — every
 * consequential parameter — is part of the hash, so a changed recipient/amount/target refuses.
 */
export async function confirmFingerprint(
  tool: string,
  args: Record<string, unknown>,
): Promise<string> {
  const ignored = new Set<string>(["confirm", ...(NON_IDENTITY_ARGS[tool] ?? [])]);
  const stable = (v: unknown): unknown => {
    if (Array.isArray(v)) return v.map(stable);
    if (v && typeof v === "object") {
      return Object.fromEntries(
        Object.keys(v as Record<string, unknown>).sort()
          .filter((k) => !ignored.has(k))
          .map((k) => [k, stable((v as Record<string, unknown>)[k])]),
      );
    }
    return v;
  };
  const bytes = new TextEncoder().encode(`${tool}\u0000${JSON.stringify(stable(args))}`);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].slice(0, 8).map((b) => b.toString(16).padStart(2, "0")).join("");
}

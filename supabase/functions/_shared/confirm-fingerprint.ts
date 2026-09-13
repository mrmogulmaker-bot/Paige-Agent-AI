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

// ── THE SUBJECT-ID FOR BATCH DISAMBIGUATION (§9/§13/§39) ─────────────────────────────────────────
// When the operator approves a BATCH of same-tool proposals (e.g. dismissing several actions at
// once), the runtime must map each re-emitted tool call back to the RIGHT already-approved proposal.
// It does that exactly by `confirmFingerprint` today — which breaks the moment the model drifts any
// hashed arg on the approval turn (its confirm-turn instructions tell it it need not reproduce the
// arguments), collapsing the batch into an un-disambiguatable set that re-proposes forever (the P0
// approval loop on dismissing several drafts; #1166 closed only the `decision_rationale` drift).
//
// The fix pins the mapping to the ONE field the model reproduces verbatim across the turn: a
// REQUIRED, STABLE subject id (for `action_advance`, the `paige_actions` id it moves). This is used
// ONLY to pick which of the operator's ALREADY-APPROVED proposals this re-emitted call corresponds
// to. It never widens WHICH proposals are claimable — that stays the operator's echoed fingerprint
// set — and the STORED proposal arguments are what execute, so a drift never reaches the write.
//
// Membership is security-relevant, like NON_IDENTITY_ARGS and TOOL_IDENTITY_FIELDS: the field MUST
// be (a) required, so it is always present to map on; (b) a stable identifier the model reproduces,
// not model-authored content; and (c) unable to change WHICH action runs on its own (the full
// identity — e.g. action_id + to_status — still lives in the approved proposal's stored args, and
// two approved proposals that share a subject but differ in effect stay ambiguous and refuse). State,
// per entry, why the field satisfies all three.
export const CONFIRM_IDENTITY_KEY: Readonly<Record<string, string>> = Object.freeze({
  // action_advance.action_id: REQUIRED in the tool schema; it is the opaque paige_actions id the
  // operator's card was about, which the model carries verbatim (it is the subject it is acting on,
  // unlike draft_content / decision_rationale, which it re-authors). It cannot change which action
  // runs on its own — the effect (to_status) is part of the stored proposal that executes, and two
  // approved proposals for the same action_id with different to_status stay ambiguous and refuse.
  action_advance: "action_id",
});

/**
 * The stable subject id of a call, for batch disambiguation — or null when the tool has no identity
 * key or the field is absent/non-string/blank. Read from the request-body call; used only to narrow
 * WITHIN the operator's already-approved proposal set, never to widen it.
 */
export function confirmIdentityValue(tool: string, args: Record<string, unknown>): string | null {
  const key = CONFIRM_IDENTITY_KEY[tool];
  if (!key) return null;
  const v = (args ?? {})[key];
  return typeof v === "string" && v.trim() !== "" ? v : null;
}

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

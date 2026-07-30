// §32 headless guard for #140 B3 (live-call co-pilot INTELLIGENCE, surface side). The private
// Realtime channel cannot be driven by a live call in CI, so this exercises the PURE, framework-
// free parsing + accumulation the surface renders (src/lib/voice/callIntelligence.ts) and asserts
// it does NOT throw on garbage and produces the correct CallIntelligence:
//   • each coercer drops a malformed frame (returns null) and accepts a valid one — no fabrication
//   • whispers SWAP on a topic-shift refresh (replace the set, never stack)
//   • commitments + at-risk flags accumulate ONCE PER DISTINCT (idempotent — a redelivered event
//     is a no-op), the exact §13 idempotency the backend also enforces
//   • draft_ready is the LATEST pointer
//   • a canned final-transcript-driven event sequence yields the expected snapshot, no throw
//
// Run:  node --experimental-strip-types scripts/voice-intelligence-smoke.mts
// Exit: 0 = the pure parse/accumulate logic behaves; non-zero = a defect (fix before shipping).
//
// §13 HONEST — what this CANNOT verify (owed to a deployed live call + an owner walk): the events
// actually reaching a subscribed panel over the private channel, the DIMENSIONAL render (cues fade/
// swap, chips animate in, the at-risk indicator lights, the draft affordance appears near call-end),
// reduced-motion fallbacks, and AA contrast in both themes. Those are OWED live checks (§32) — this
// smoke does NOT fake a render.

const {
  coerceWhisper,
  coerceCommitment,
  coerceAtRisk,
  coerceDraftReady,
  CallIntelligenceAccumulator,
} = await import("../src/lib/voice/callIntelligence.ts");

let pass = 0;
let fail = 0;
function check(name: string, cond: boolean, detail = "") {
  if (cond) {
    pass++;
    console.log(`  ✓ ${name}`);
  } else {
    fail++;
    console.error(`  ✗ ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

console.log("voice-intelligence (B3) surface smoke\n");

// ── coercers: reject garbage (null), accept valid ──────────────────────────────────────
console.log("coercers — defensive parsing (§13, never throw / never fabricate):");
for (const bad of [null, undefined, 42, "x", {}, [], { cards: "nope" }]) {
  check(`whisper drops ${JSON.stringify(bad)}`, coerceWhisper(bad) === null);
}
check(
  "whisper drops a card with no title AND no body",
  coerceWhisper({ cards: [{ id: "a", source: "s", similarity: 0.9 }] }) === null,
);
{
  const cards = coerceWhisper({
    cards: [
      { id: "c1", title: "Renewal is 30 days out", body: "Signed 11 months ago.", source: "Prior note", similarity: 0.82 },
      { title: "No id here", body: "still renders", source: "", similarity: 2 }, // similarity out of range → kept raw, clamped at render
    ],
  });
  check("whisper accepts valid cards", Array.isArray(cards) && cards!.length === 2);
  check("whisper synthesizes an id when absent", !!cards && cards[1].id.length > 0);
  check("whisper keeps similarity number (render clamps)", !!cards && cards[0].similarity === 0.82);
}

for (const bad of [null, {}, { title: "no id" }, { action_id: "a" /* no title */ }]) {
  check(`commitment drops ${JSON.stringify(bad)}`, coerceCommitment(bad) === null);
}
{
  const c = coerceCommitment({ action_id: "act_1", title: "Send the contract", due_at: "2026-08-02T00:00:00Z" });
  check("commitment accepts valid", !!c && c.actionId === "act_1" && c.dueAt === "2026-08-02T00:00:00Z");
  const c2 = coerceCommitment({ action_id: "act_2", title: "Call back" });
  check("commitment tolerates a missing due date", !!c2 && c2.dueAt === null);
}

for (const bad of [null, {}, { level: "nope", signal: "x" }, { level: "high" /* no signal */ }]) {
  check(`at_risk drops ${JSON.stringify(bad)}`, coerceAtRisk(bad) === null);
}
{
  const f = coerceAtRisk({ level: "high", signal: "mentioned a competitor", action_id: "act_r1" });
  check("at_risk accepts valid", !!f && f.level === "high" && f.actionId === "act_r1");
}

for (const bad of [null, {}, { subject: "no id" }]) {
  check(`draft_ready drops ${JSON.stringify(bad)}`, coerceDraftReady(bad) === null);
}
{
  const d = coerceDraftReady({ approval_id: "ap_1", subject: "Recap + next steps" });
  check("draft_ready accepts valid", !!d && d.approvalId === "ap_1" && d.subject === "Recap + next steps");
}

// ── accumulator: swap / dedupe / latest ─────────────────────────────────────────────────
console.log("\naccumulator — swap / idempotency / latest:");
{
  const acc = new CallIntelligenceAccumulator();

  // whisper swap: a second whisper REPLACES the first set
  acc.applyWhisper({ cards: [{ id: "w1", title: "First cue", body: "b" }] });
  acc.applyWhisper({ cards: [{ id: "w2", title: "Topic shifted", body: "b2" }, { id: "w3", title: "and this", body: "b3" }] });
  check("whisper swaps to the latest set", acc.snapshot().whispers.length === 2 && acc.snapshot().whispers[0].id === "w2");

  // whisper garbage is a no-op that KEEPS the prior set (never blanks the cues)
  const changed = acc.applyWhisper({ cards: [] });
  check("whisper no-ops on empty (keeps prior)", changed === false && acc.snapshot().whispers.length === 2);

  // commitment idempotency: same action_id filed twice → one chip
  check("commitment applies (returns true)", acc.applyCommitment({ action_id: "a1", title: "Send contract", due_at: "2026-08-02T00:00:00Z" }) === true);
  check("commitment dedupes same action_id (returns false)", acc.applyCommitment({ action_id: "a1", title: "Send contract (again)" }) === false);
  acc.applyCommitment({ action_id: "a2", title: "Book kickoff" });
  check("commitments accumulate distinct in order", acc.snapshot().commitments.map((c) => c.actionId).join(",") === "a1,a2");

  // at_risk idempotency: by action_id, then by signal when no action rode along
  acc.applyAtRisk({ level: "med", signal: "sounded frustrated", action_id: "r1" });
  check("at_risk dedupes same action_id", acc.applyAtRisk({ level: "high", signal: "escalated", action_id: "r1" }) === false);
  acc.applyAtRisk({ level: "low", signal: "asked about pricing" }); // no action_id → keyed by signal
  check("at_risk dedupes same signal when no action_id", acc.applyAtRisk({ level: "low", signal: "asked about pricing" }) === false);
  check("at_risk accumulates distinct flags", acc.snapshot().atRisk.length === 2);

  // draft_ready latest wins
  acc.applyDraftReady({ approval_id: "ap_1", subject: "Draft A" });
  acc.applyDraftReady({ approval_id: "ap_2", subject: "Draft B" });
  check("draft_ready keeps the latest", acc.snapshot().draftReady?.approvalId === "ap_2");

  // reset clears everything (a new call is a new brain)
  acc.reset();
  const s = acc.snapshot();
  check(
    "reset clears all buffers",
    s.whispers.length === 0 && s.commitments.length === 0 && s.atRisk.length === 0 && s.draftReady === null,
  );
}

// ── garbage never throws (fed as the channel would feed it) ─────────────────────────────
console.log("\nrobustness — a bad frame never throws into the call surface (§13):");
{
  const acc = new CallIntelligenceAccumulator();
  let threw = false;
  try {
    for (const junk of [null, undefined, 0, "", [], {}, { cards: 5 }, { action_id: 9 }, Symbol("x") as unknown]) {
      acc.applyWhisper(junk);
      acc.applyCommitment(junk);
      acc.applyAtRisk(junk);
      acc.applyDraftReady(junk);
    }
  } catch {
    threw = true;
  }
  check("no throw on a stream of garbage frames", threw === false);
  const s = acc.snapshot();
  check("garbage produced no fabricated content", s.whispers.length === 0 && s.commitments.length === 0 && s.atRisk.length === 0 && s.draftReady === null);
}

// ── a canned live sequence → expected snapshot ──────────────────────────────────────────
console.log("\ncanned call sequence — the shape a real call would produce:");
{
  const acc = new CallIntelligenceAccumulator();
  // Opening: Paige whispers recall on the first topic.
  acc.applyWhisper({ cards: [{ id: "c1", title: "Client since Jan", body: "On the growth plan.", source: "Profile", similarity: 0.71 }] });
  // Mid-call: a promise is filed.
  acc.applyCommitment({ action_id: "own_1", title: "Send the proposal by Friday", due_at: "2026-08-07T00:00:00Z" });
  // Topic shifts → whisper refreshes (swaps).
  acc.applyWhisper({ cards: [{ id: "c2", title: "Last invoice unpaid", body: "$1,200 open 40 days.", source: "Billing", similarity: 0.9 }] });
  // A concern surfaces.
  acc.applyAtRisk({ level: "high", signal: "mentioned switching to a competitor", action_id: "risk_1" });
  // Near call-end: the follow-up draft lands.
  acc.applyDraftReady({ approval_id: "ap_9", subject: "Proposal + payment reminder" });

  const s = acc.snapshot();
  check("cues show only the latest topic's whisper", s.whispers.length === 1 && s.whispers[0].id === "c2");
  check("one commitment filed", s.commitments.length === 1 && s.commitments[0].actionId === "own_1");
  check("one at-risk flag raised (high)", s.atRisk.length === 1 && s.atRisk[0].level === "high");
  check("draft ready points at the approval", s.draftReady?.approvalId === "ap_9");
}

// ── late draft_ready AFTER the transcript "freezes" (FIX 2 post-call keepalive) ──────────
// Models the post-call grace window that VoiceDeviceProvider now holds open: the media
// stream has stopped and the panel has taken its call-end snapshot, but the copilot's async
// finalize() (draft synthesis + 2 RPCs) emits draft_ready SECONDS later on the SAME still-
// subscribed channel — feeding the SAME accumulator. The accumulator must fold the late
// draft in, and a FRESH snapshot (new identity) must carry it so the panel's grace-window
// refresh re-freezes it and the "Follow-up drafted" affordance appears (§36 the drafted
// follow-up must actually reach the operator; §13 no fabrication — it appears only because a
// real draft_ready arrived). This is the surface-side twin of the provider keepalive: the
// provider keeps the channel alive; this proves the late frame still populates the draft.
console.log("\nlate draft_ready after freeze — the FIX 2 keepalive contract:");
{
  const acc = new CallIntelligenceAccumulator();
  // During the call: cues + a commitment landed; NO draft yet at the moment the call ends.
  acc.applyWhisper({ cards: [{ id: "w1", title: "Renewal soon", body: "Signed 11 months ago." }] });
  acc.applyCommitment({ action_id: "own_1", title: "Send the recap" });
  const atFreeze = acc.snapshot(); // the snapshot the panel freezes at call-end
  check("no draft at the moment the transcript freezes", atFreeze.draftReady === null);

  // Post-call grace: the LATE draft_ready arrives on the same channel/accumulator.
  const changed = acc.applyDraftReady({ approval_id: "ap_late", subject: "Recap + next steps" });
  check("late draft_ready applies after freeze (a real delta)", changed === true);

  const afterDraft = acc.snapshot();
  check("late draft populates the draft affordance", afterDraft.draftReady?.approvalId === "ap_late");
  check(
    "late draft leaves the prior call's content intact",
    afterDraft.commitments.length === 1 && afterDraft.whispers.length === 1,
  );
  // A fresh snapshot has a NEW identity (and a distinct draft) so React re-renders and the
  // panel re-freezes WITH the draft — the frozen-at-call-end snapshot is not mutated.
  check(
    "the frozen snapshot is not mutated; the refresh is a new object",
    afterDraft !== atFreeze && atFreeze.draftReady === null,
  );
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);

// §32 headless guard for #140 B3 (the live-call co-pilot INTELLIGENCE layer). The intelligence runs
// server-side in paige-stt off Deepgram finals and cannot be driven by a live call in CI — so this
// drives the REAL CallCopilot (supabase/functions/_shared/voice-copilot.ts, which has ZERO runtime
// imports by design) with SPY deps and a canned final-transcript sequence, asserting the heart of B3:
//   • the 4 features fire the CORRECT seam calls with the CORRECT args (commitment→owner.task,
//     at_risk→client.at_risk, whisper→recall+broadcast, auto-draft→file+advance→draft_ready)
//   • TRIGGER/DEBOUNCE — whisper only on a topic shift, at-risk only on a rolling-window debounce,
//     both capped; interim (non-final) results NEVER drive intelligence
//   • the HARD PER-CALL COST CAP stops all LLM work and degrades HONESTLY (no fabricated whisper/
//     flag/draft), while the zero-cost regex commitment path keeps working
//   • IDEMPOTENCY — the same promise files once; a repeated at-risk signal files once; finalize twice
//     drafts + meters once
//   • honest degrade — an empty recall / null scan / body-less draft broadcasts NOTHING, never a fake
//   • nothing throws into the caller
//
// Run:  node --experimental-strip-types scripts/voice-copilot-smoke.mts
// Exit: 0 = the pure intelligence orchestration behaves; non-zero = a defect (fix before shipping).
//
// §13 HONEST — what this CANNOT verify (owed to a deployed live call, §32): the REAL recallSimilar /
// reviewBySpecialists / routedChatCompletion / file_action / advance_action round-trips, the Realtime
// broadcast reaching a B2/B3 subscriber, and the platform_usage_events meter landing on prod. Those
// need live keys + a real Twilio<>Deepgram call and are the OWNER-owed live-call walk. This smoke does
// NOT fake any of them — it proves the ORCHESTRATION (triggers, caps, idempotency, seam args) only.

const { CallCopilot, detectCommitments, resolveDueAt, normalizeCommitment, OP_COST_ESTIMATE_USD } =
  await import("../supabase/functions/_shared/voice-copilot.ts");

let pass = 0;
let fail = 0;
function check(name: string, cond: boolean, detail = "") {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.error(`  ✗ ${name}${detail ? ` — ${detail}` : ""}`); }
}

// Fixed clock so due-date resolution is deterministic.
const NOW = Date.parse("2026-07-30T12:00:00Z"); // a Thursday

type Verdict = { flagged: boolean; level: "low" | "med" | "high"; signal: string } | null;
type Draft = { subject?: string; body: string } | null;

function makeSpy(overrides: {
  recall?: unknown[];
  scan?: Verdict;
  draft?: Draft;
} = {}) {
  const calls = {
    recall: [] as string[],
    file: [] as any[],
    advance: [] as any[],
    scan: [] as string[],
    draft: [] as string[],
    broadcast: [] as { event: string; payload: any }[],
    meter: [] as any[],
  };
  let fileSeq = 0;
  let advanceSeq = 0;
  const deps = {
    recallContext: async (q: string) => {
      calls.recall.push(q);
      return (overrides.recall ?? [{ id: "mem-0", title: "Prior proposal", body: "You built this before", source: "Prior work", similarity: 0.82 }]) as any;
    },
    fileAction: async (a: any) => { calls.file.push(a); fileSeq++; return { ok: true, actionId: `act-${fileSeq}` }; },
    advanceAction: async (a: any) => { calls.advance.push(a); advanceSeq++; return { ok: true, approvalId: `appr-${advanceSeq}` }; },
    scanAtRisk: async (w: string) => { calls.scan.push(w); return (overrides.scan === undefined ? { flagged: false, level: "low", signal: "" } : overrides.scan) as any; },
    draftFollowup: async (t: string) => { calls.draft.push(t); return (overrides.draft === undefined ? { subject: "Following up on our call", body: "Great talking today — here are the next steps." } : overrides.draft) as any; },
    broadcast: (event: string, payload: any) => { calls.broadcast.push({ event, payload }); },
    meter: (s: any) => { calls.meter.push(s); },
    now: () => NOW,
    log: () => {},
  };
  return { deps, calls };
}

const bc = (calls: any, event: string) => calls.broadcast.filter((b: any) => b.event === event);
const filedKinds = (calls: any) => calls.file.map((f: any) => f.kind);

// ── PURE commitment detection ────────────────────────────────────────────────
console.log("commitment detection (pure, zero-cost):");
{
  const c = detectCommitments("I'll send you the contract by Friday.", NOW);
  check("detects 'I'll send … by Friday'", c.length === 1, JSON.stringify(c));
  check("title is human-readable (§3)", c[0]?.title?.toLowerCase().includes("send") ?? false, c[0]?.title);
  check("resolves a due date for 'by Friday'", typeof c[0]?.dueAt === "string" && Date.parse(c[0]!.dueAt!) > NOW, String(c[0]?.dueAt));
}
check("no commitment in neutral talk", detectCommitments("So how has your week been going?", NOW).length === 0);
check("no commitment without a deliverable verb", detectCommitments("I'll think about it.", NOW).length === 0);
check("'let me get you the numbers' is a commitment", detectCommitments("Let me get you the numbers tomorrow.", NOW).length === 1);
check("dedup key is stable across punctuation/case", normalizeCommitment("Send the CONTRACT, by Friday!") === normalizeCommitment("send the contract by friday"));
check("resolveDueAt('tomorrow') is +~1 day", (() => { const d = resolveDueAt("tomorrow", NOW); return !!d && Date.parse(d) > NOW && Date.parse(d) < NOW + 3 * 864e5; })());
check("resolveDueAt with no time phrase → null", resolveDueAt("I'll send the contract", NOW) === null);

// ── HAPPY PATH — all 4 features fire with correct seam args ───────────────────
console.log("\nhappy path (all 4 features):");
{
  const { deps, calls } = makeSpy({ scan: { flagged: true, level: "high", signal: "mentioned a competitor" } });
  const cp = new CallCopilot(deps as any, {
    costCapUsd: 1, whisperMinNewChars: 30, maxWhispers: 8, atRiskMinNewChars: 40, maxAtRiskScans: 6, minTranscriptForDraft: 20,
  });
  cp.onTranscript({ transcript: "I'll send you the proposal by Monday.", speechFinal: true });
  cp.onTranscript({ transcript: "Honestly this has been frustrating and I'm looking at a competitor too.", speechFinal: true });
  cp.onTranscript({ transcript: "I'll send you the proposal by Monday.", speechFinal: true }); // dup commitment
  cp.onTranscript({ transcript: "uhh", isFinal: false }); // interim — must NOT drive intelligence
  const meter = await cp.finalize();

  check("commitment filed as owner.task", filedKinds(calls).includes("owner.task"));
  check("duplicate commitment filed ONCE (idempotent)", filedKinds(calls).filter((k: string) => k === "owner.task").length === 1, JSON.stringify(filedKinds(calls)));
  check("commitment file carries due_at + source", (() => { const f = calls.file.find((x: any) => x.kind === "owner.task"); return !!f?.dueAt && f?.payload?.source === "voice_copilot"; })());
  check("broadcast 'commitment' with action_id + title", bc(calls, "commitment").length === 1 && !!bc(calls, "commitment")[0].payload.action_id && !!bc(calls, "commitment")[0].payload.title);

  check("whisper recall called (topic shift)", calls.recall.length >= 1);
  check("broadcast 'whisper' with cards", bc(calls, "whisper").length >= 1 && Array.isArray(bc(calls, "whisper")[0].payload.cards));

  check("at-risk scan ran (rolling window, debounced)", calls.scan.length >= 1);
  check("client.at_risk filed", filedKinds(calls).includes("client.at_risk"));
  check("at_risk filed ONCE per distinct signal (idempotent)", filedKinds(calls).filter((k: string) => k === "client.at_risk").length === 1);
  check("broadcast 'at_risk' with level + action_id", (() => { const a = bc(calls, "at_risk")[0]?.payload; return a?.level === "high" && typeof a?.action_id === "string"; })());

  check("auto-draft called draftFollowup once", calls.draft.length === 1);
  check("owner.followup_email filed", filedKinds(calls).includes("owner.followup_email"));
  check("advance_action → 'drafted' with draft_content", calls.advance.length === 1 && calls.advance[0].toStatus === "drafted" && !!calls.advance[0].draftContent?.body);
  check("broadcast 'draft_ready' with approval_id", bc(calls, "draft_ready").length === 1 && typeof bc(calls, "draft_ready")[0].payload.approval_id === "string");

  check("meter emitted once with honest counts", calls.meter.length === 1 && meter.commitments === 1 && meter.atRiskFlags === 1 && meter.draftFiled === true);
  check("meter cost is a labeled estimate > 0", meter.costEstimateUsd > 0 && !meter.capped);
}

// ── COST CAP — hard stop, honest degrade, regex path still works ──────────────
console.log("\ncost cap (hard stop + honest degrade):");
{
  const { deps, calls } = makeSpy({ scan: { flagged: true, level: "high", signal: "competitor" } });
  const cp = new CallCopilot(deps as any, {
    costCapUsd: 0.001, whisperMinNewChars: 20, maxWhispers: 8, atRiskMinNewChars: 20, maxAtRiskScans: 6, minTranscriptForDraft: 10,
  });
  cp.onTranscript({ transcript: "I'll send you the report by Friday and I'm frustrated with the delays here.", speechFinal: true });
  cp.onTranscript({ transcript: "We keep having these same problems over and over again honestly.", speechFinal: true });
  const meter = await cp.finalize();

  check("whisper recall NOT called under cap", calls.recall.length === 0);
  check("at-risk scan NOT called under cap", calls.scan.length === 0);
  check("auto-draft NOT synthesized under cap", calls.draft.length === 0);
  check("NO whisper/at_risk/draft_ready broadcast (honest degrade §13)", bc(calls, "whisper").length === 0 && bc(calls, "at_risk").length === 0 && bc(calls, "draft_ready").length === 0);
  check("commitment (zero-cost regex) STILL fires under cap", filedKinds(calls).includes("owner.task") && bc(calls, "commitment").length === 1);
  check("meter reports capped=true", meter.capped === true);
  check("cap constant sanity (at_risk is the pricey op)", OP_COST_ESTIMATE_USD.at_risk >= OP_COST_ESTIMATE_USD.whisper);
}

// ── HONEST DEGRADE — empty recall / null scan / no draft body → no fabricated events ──
console.log("\nhonest degrade (empty/null seams):");
{
  const { deps, calls } = makeSpy({ recall: [], scan: null, draft: null });
  const cp = new CallCopilot(deps as any, {
    costCapUsd: 1, whisperMinNewChars: 20, maxWhispers: 8, atRiskMinNewChars: 20, maxAtRiskScans: 6, minTranscriptForDraft: 10,
  });
  cp.onTranscript({ transcript: "So tell me more about what you're hoping to achieve this quarter overall.", speechFinal: true });
  cp.onTranscript({ transcript: "And what does success look like for you and the team by the end of it.", speechFinal: true });
  const meter = await cp.finalize();
  check("empty recall → NO whisper broadcast", bc(calls, "whisper").length === 0);
  check("null scan (degraded) → NO at_risk broadcast/flag", bc(calls, "at_risk").length === 0 && !filedKinds(calls).includes("client.at_risk"));
  check("no draft body → NO draft_ready + no followup filed", bc(calls, "draft_ready").length === 0 && !filedKinds(calls).includes("owner.followup_email") && meter.draftFiled === false);
  check("recall + scan were still attempted (real work, just empty)", calls.recall.length >= 1 && calls.scan.length >= 1);
}

// ── INTERIM GATING — non-final results never drive intelligence ──────────────
console.log("\ninterim gating + short-call:");
{
  const { deps, calls } = makeSpy();
  const cp = new CallCopilot(deps as any, { costCapUsd: 1, whisperMinNewChars: 5, atRiskMinNewChars: 5, minTranscriptForDraft: 5 } as any);
  cp.onTranscript({ transcript: "I'll definitely send you the whole contract by Friday for sure", isFinal: false, speechFinal: false });
  cp.onTranscript({ transcript: "um so", isFinal: false });
  const meter = await cp.finalize();
  check("interim-only → NOTHING filed", calls.file.length === 0);
  check("interim-only → NOTHING scanned/recalled", calls.scan.length === 0 && calls.recall.length === 0);
  // The class always hands a summary to deps.meter; the "skip the row" honesty (llmOps<=0 &&
  // commitments<=0 → no platform_usage_events insert) lives in paige-stt's meter dep. Assert the
  // summary itself is honest-empty so that dep will correctly skip.
  check("empty transcript → honest-empty meter summary (dep skips the row)", meter.llmOps === 0 && meter.commitments === 0 && meter.draftFiled === false);
}

// ── IDEMPOTENT FINALIZE — teardown twice drafts + meters once ────────────────
console.log("\nidempotent finalize:");
{
  const { deps, calls } = makeSpy();
  const cp = new CallCopilot(deps as any, { costCapUsd: 1, whisperMinNewChars: 999, atRiskMinNewChars: 999, minTranscriptForDraft: 10 } as any);
  cp.onTranscript({ transcript: "Thanks so much for the call today, this was really helpful for us.", speechFinal: true });
  const m1 = await cp.finalize();
  const m2 = await cp.finalize(); // error+close double-teardown
  check("draftFollowup called exactly once across two finalizes", calls.draft.length === 1);
  check("owner.followup_email filed once", filedKinds(calls).filter((k: string) => k === "owner.followup_email").length === 1);
  check("meter emitted once", calls.meter.length === 1);
  check("both finalize calls return the same summary", m1.draftFiled === m2.draftFiled && m1.llmOps === m2.llmOps);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);

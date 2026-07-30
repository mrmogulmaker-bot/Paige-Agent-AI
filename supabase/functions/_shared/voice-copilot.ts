// _shared/voice-copilot.ts — #140 B3: the INTELLIGENCE layer of the live-call co-pilot.
//
// "Every other platform records your calls. Paige runs them with you." B1 streams Deepgram
// Nova-3 transcripts server-side from paige-stt and broadcasts them on a per-tenant PRIVATE
// Realtime topic; B3 (this module) makes Paige DO FOUR THINGS on the live call, each wired to an
// EXISTING seam (§18 — reuse recallSimilar / file_action / advance_action / reviewBySpecialists +
// the owner.task & client.at_risk action-kinds + the SAME private topic; never a second channel):
//
//   (1) WHISPER    — L6 semantic recall of prior interactions/artifacts/knowledge, refreshed on a
//                    topic shift, streamed as context cards to the human (broadcast event "whisper").
//   (2) COMMITMENT — cheap regex commitment detection per FINAL utterance → file_action("owner.task")
//                    (record_only, autonomy_lane="auto", no interruption); a chip ("commitment").
//   (3) AT_RISK    — reviewBySpecialists with a single churn/competitor/frustration lens on a rolling
//                    window, debounced+capped → file_action("client.at_risk"); a subtle flag ("at_risk").
//   (4) AUTO-DRAFT — ONCE near call-end: synthesize the follow-up, file an owner.followup_email action
//                    and advance_action → "drafted", which lands a cs_draft approval ("draft_ready").
//
// WHY THIS FILE IS PURE + DEPENDENCY-INJECTED (§13/§32): the heavy seams (recall, the action bus,
// the reasoning panel, the draft synthesizer, the Realtime broadcast, the §17 meter) all live behind
// a `CopilotDeps` the CALLER (paige-stt) wires to the real, already-tenant-scoped implementations.
// So this module carries ZERO runtime imports — it never touches esm.sh, Deno.env, or a provider —
// which lets scripts/voice-copilot-smoke.mts drive the REAL CallCopilot with spy deps in plain Node
// and assert the trigger/debounce/cost-cap/idempotency behavior WITHOUT a live call (a green build is
// not a working render, §32; this is the headless proof the seam calls fire with the right args).
//
// THE CORE ENGINEERING PROBLEM this module solves (§13/§17/§34): running heavy LLM intelligence on
// EVERY final utterance would be ruinously expensive (reviewBySpecialists = 3 Claude calls) and would
// spam duplicate actions. So every feature is TRIGGERED, DEBOUNCED, COST-CAPPED, and IDEMPOTENT:
//   • WHISPER   runs only on a topic shift (≥ whisperMinNewChars of NEW final text since the last
//               whisper), capped at maxWhispers/call.
//   • COMMIT    is regex-first (zero LLM cost), deduped by NORMALIZED commitment text within the call.
//   • AT_RISK   runs on a rolling window, debounced (≥ atRiskMinNewChars new text) + capped
//               (maxAtRiskScans), and each DISTINCT signal is filed at most once/call.
//   • AUTO-DRAFT runs exactly ONCE, at teardown, not per utterance.
//   • A HARD PER-CALL COST CAP (costCapUsd) bounds ALL B3 LLM work; once exceeded we STOP running
//     intelligence and degrade HONESTLY (§13 — no fabricated whispers/flags/draft). The cap is
//     enforced with a LABELED cost ESTIMATE (per-op constants), never a billed figure.
//
// §9 — this module never derives a tenant. paige-stt verified { tenantId, callSid } FROM the signed
// stream token and passes them in; every dep the caller wires is tenant-scoped to THAT tenant, and
// the broadcast goes to `voice-stt:<tenantId>:<callSid>` only. A tenant can never see another's
// intelligence — the reused private topic + #557 realtime.messages RLS is the gate.

// ─────────────────────────────────────────────────────────────────────────────────────────────
// The broadcast CONTRACT — payloads EXACTLY as the surface (B2 panel) subscriber expects, so
// backend and surface agree without a second round-trip. New events ride ALONGSIDE B1's "transcript".
// ─────────────────────────────────────────────────────────────────────────────────────────────
export type CopilotEvent = "whisper" | "commitment" | "at_risk" | "draft_ready";

/** One L6 context card streamed to the human on a topic shift (§36 one-glance). */
export interface WhisperCard {
  id: string;
  title: string;
  body: string;
  source: string;
  similarity: number;
}
export interface WhisperPayload { kind: "whisper"; cards: WhisperCard[]; at: string }
export interface CommitmentPayload { kind: "commitment"; action_id: string; title: string; due_at?: string; at: string }
export interface AtRiskPayload { kind: "at_risk"; level: "low" | "med" | "high"; signal: string; action_id?: string; at: string }
export interface DraftReadyPayload { kind: "draft_ready"; approval_id: string; subject?: string; at: string }

/** §17 meter summary emitted once at teardown (same platform_usage_events shape as B1). */
export interface CopilotMeter {
  llmOps: number;
  costEstimateUsd: number;
  whispers: number;
  atRiskScans: number;
  commitments: number;
  atRiskFlags: number;
  draftFiled: boolean;
  capped: boolean;
}

/** A verdict from the at-risk reasoning lens (the caller adapts reviewBySpecialists → this). */
export interface AtRiskVerdict { flagged: boolean; level: "low" | "med" | "high"; signal: string }

/** A synthesized follow-up draft (the caller produces this via routedChatCompletion). */
export interface FollowupDraft { subject?: string; body: string }

/**
 * The seams the CALLER (paige-stt) wires to the real, tenant-scoped implementations. Keeping them
 * injected is what makes this module headless-testable (§32) and keeps §9 in the caller's hands —
 * every function here is already bound to the verified tenant.
 */
export interface CopilotDeps {
  /** WHISPER — recall prior artifacts + tenant knowledge for the current topic (tenant-scoped). */
  recallContext: (query: string) => Promise<WhisperCard[]>;
  /** Bus — file a unit of work. Returns the new action id. */
  fileAction: (args: {
    kind: string;
    title: string;
    summary?: string;
    contactId?: string | null;
    payload?: Record<string, unknown>;
    priority?: string;
    dueAt?: string | null;
  }) => Promise<{ ok: boolean; actionId?: string }>;
  /** Bus — advance an action (e.g. → "drafted", which lands a cs_draft approval). */
  advanceAction: (args: {
    actionId: string;
    toStatus: string;
    draftContent?: Record<string, unknown>;
  }) => Promise<{ ok: boolean; approvalId?: string | null }>;
  /** AT_RISK — run the single-lens churn/competitor/frustration reviewer over a window. */
  scanAtRisk: (window: string) => Promise<AtRiskVerdict | null>;
  /** AUTO-DRAFT — synthesize the follow-up from the call transcript. */
  draftFollowup: (transcript: string) => Promise<FollowupDraft | null>;
  /** Broadcast a contract event on the SAME private topic B1 uses (fire-and-forget). */
  broadcast: (event: CopilotEvent, payload: Record<string, unknown>) => void;
  /** §17 — meter the call's B3 LLM usage once at teardown. */
  meter: (summary: CopilotMeter) => void;
  /** Injectable clock for deterministic tests. */
  now?: () => number;
  /** Injectable logger (defaults to console). */
  log?: (msg: string, extra?: Record<string, unknown>) => void;
}

export interface CopilotConfig {
  /** HARD per-call cost cap across ALL B3 LLM work (USD, estimate). <=0 disables (never for prod). */
  costCapUsd: number;
  /** Topic-shift threshold: min NEW final chars since the last whisper before re-recalling. */
  whisperMinNewChars: number;
  /** Max whispers per call. */
  maxWhispers: number;
  /** Debounce threshold: min NEW final chars since the last at-risk scan. */
  atRiskMinNewChars: number;
  /** Max at-risk scans per call. */
  maxAtRiskScans: number;
  /** Max DISTINCT commitments filed per call — a DB-write-amplification guard, parity with the LLM caps. */
  maxCommitments: number;
  /** Minimum accumulated transcript (chars) before an end-of-call follow-up draft is worth making. */
  minTranscriptForDraft: number;
}

export const DEFAULT_COPILOT_CONFIG: CopilotConfig = {
  costCapUsd: 0.5,
  whisperMinNewChars: 220,
  maxWhispers: 8,
  atRiskMinNewChars: 320,
  maxAtRiskScans: 6,
  maxCommitments: 12,
  minTranscriptForDraft: 120,
};

/**
 * Per-op LABELED cost ESTIMATES (USD) for the hard cap (§13 — an estimate, never a bill). Commitment
 * detection is regex-only (zero LLM), so it carries no cost and runs on every utterance. at_risk is the
 * expensive one (reviewBySpecialists ≈ 3 Claude reasoning calls). These are deliberately conservative
 * upper-ish estimates so the cap trips EARLY rather than overspending.
 */
export const OP_COST_ESTIMATE_USD = {
  whisper: 0.002, // voyage query embed + a KB embed; no generation
  at_risk: 0.02, // reviewBySpecialists with ONE custom churn lens → one Claude reasoning call
  auto_draft: 0.02, // one Claude reasoning call to synthesize the follow-up
} as const;

// ── Commitment detection (pure, zero-cost, per-utterance) ──────────────────────────────────────
export interface DetectedCommitment {
  /** A cleaned, human-readable task title (§3 — no jargon). */
  title: string;
  /** Normalized dedup key (lowercased, punctuation-stripped) so the same promise files once/call. */
  key: string;
  /** Resolved due date (ISO) when the utterance named one, else null. */
  dueAt: string | null;
}

const WEEKDAYS: Record<string, number> = {
  sunday: 0, monday: 1, tuesday: 2, wednesday: 3, thursday: 4, friday: 5, saturday: 6,
};

/** Resolve a spoken relative-time phrase to an ISO due date from `nowMs`. Null when none present. */
export function resolveDueAt(text: string, nowMs: number): string | null {
  const t = text.toLowerCase();
  const base = new Date(nowMs);
  const atEndOfDay = (d: Date) => {
    d.setHours(17, 0, 0, 0); // 5pm local of the runtime — a sane "by that day" default
    return d.toISOString();
  };
  // Explicit ISO date (rare in speech, but honor it).
  const iso = t.match(/\b(\d{4}-\d{2}-\d{2})\b/);
  if (iso) {
    const d = new Date(`${iso[1]}T17:00:00`);
    if (!isNaN(d.getTime())) return d.toISOString();
  }
  if (/\btomorrow\b/.test(t)) { const d = new Date(base); d.setDate(d.getDate() + 1); return atEndOfDay(d); }
  if (/\btoday\b|\bby end of (the )?day\b|\beod\b|\bthis afternoon\b|\btonight\b/.test(t)) {
    return atEndOfDay(new Date(base));
  }
  if (/\bend of (the )?week\b|\beow\b/.test(t)) {
    const d = new Date(base); const add = (5 - d.getDay() + 7) % 7; d.setDate(d.getDate() + (add === 0 ? 0 : add)); return atEndOfDay(d);
  }
  if (/\bnext week\b/.test(t)) { const d = new Date(base); d.setDate(d.getDate() + 7); return atEndOfDay(d); }
  // A named weekday ("by Friday", "on Monday") → the NEXT such day (today counts only if it's later — we
  // can't know the hour, so we take the next future occurrence; "monday" when today is monday → +7).
  for (const [name, dow] of Object.entries(WEEKDAYS)) {
    if (new RegExp(`\\b${name}\\b`).test(t)) {
      const d = new Date(base);
      let add = (dow - d.getDay() + 7) % 7;
      if (add === 0) add = 7; // same weekday named → next week's, never "already today"
      d.setDate(d.getDate() + add);
      return atEndOfDay(d);
    }
  }
  return null;
}

/** Normalize a commitment sentence into a stable dedup key (§13 idempotency). */
export function normalizeCommitment(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Title-case-ish a short task title, trimmed to a sane length (§3 — plain, no jargon). */
function toTitle(sentence: string): string {
  const s = sentence.replace(/\s+/g, " ").trim().replace(/^[,.;:\s-]+/, "");
  const capped = s.length > 90 ? `${s.slice(0, 87).trim()}…` : s;
  return capped.charAt(0).toUpperCase() + capped.slice(1);
}

// First-person future-deliverable cues. Deliberately conservative: it hunts a PROMISE the caller is
// making ("I'll send…", "let me get you…", "we'll have…by…"), not any future-tense sentence, so it
// doesn't file noise. Runs per-utterance on the utterance text (kept local, then deduped call-wide).
const COMMIT_CUES = [
  /\bi(?:'|’)?ll\b/, /\bi will\b/, /\bwe(?:'|’)?ll\b/, /\bwe will\b/,
  /\blet me (?:get|send|grab|pull|put together|send over|shoot)\b/,
  /\bi(?:'|’)?m going to\b/, /\bi(?:'|’)?m gonna\b/, /\bi can (?:send|get|have|put together)\b/,
  /\bi(?:'|’)?ll follow up\b/, /\byou(?:'|’)?ll have\b/,
];
const DELIVER_VERBS = /\b(send|get|send over|email|share|put together|draft|prepare|deliver|follow up|get back|have (?:it|that|the)|schedule|book|set up|sign|forward|shoot (?:you|over))\b/;

/**
 * Detect commitment(s) in a single utterance. Splits on sentence boundaries, keeps sentences that
 * carry BOTH a first-person-future cue AND a deliverable verb, and resolves a due date if named.
 * PURE + zero-cost — the cheap gate that runs before any bus write (§14 cost-low).
 */
export function detectCommitments(utterance: string, nowMs: number): DetectedCommitment[] {
  const text = (utterance ?? "").trim();
  if (text.length < 8) return [];
  const sentences = text.split(/(?<=[.!?])\s+|\n+/).map((s) => s.trim()).filter((s) => s.length >= 8);
  const found: DetectedCommitment[] = [];
  const seen = new Set<string>();
  for (const sentence of sentences.length ? sentences : [text]) {
    const low = sentence.toLowerCase();
    const hasCue = COMMIT_CUES.some((re) => re.test(low));
    if (!hasCue || !DELIVER_VERBS.test(low)) continue;
    const key = normalizeCommitment(sentence);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    found.push({ title: toTitle(sentence), key, dueAt: resolveDueAt(sentence, nowMs) });
  }
  return found;
}

// ── The per-call intelligence engine ────────────────────────────────────────────────────────────
/**
 * CallCopilot — one instance per live call. Fed each FINAL utterance from paige-stt's Deepgram
 * onmessage; it decides (trigger/debounce/cost-cap/idempotency) whether to whisper, file a
 * commitment, or scan for at-risk, and at teardown drafts the follow-up. Background work is fired
 * detached (the caller keeps the WS/audio path light); every path is guarded so a fault degrades
 * honestly and never throws into the caller (§13).
 */
export class CallCopilot {
  private readonly deps: CopilotDeps;
  private readonly cfg: CopilotConfig;
  private readonly contactId: string | null;

  // Rolling transcript of FINAL text only (interim results never drive intelligence).
  private accumulated = "";
  private lastWhisperAtChars = 0;
  private lastAtRiskAtChars = 0;
  private whisperCount = 0;
  private atRiskScanCount = 0;

  // Idempotency: a promise filed once never files again this call.
  private readonly filedCommitments = new Set<string>();
  private readonly firedAtRiskSignals = new Set<string>();

  // Cost accounting — a LABELED estimate, hard cap (§13/§17).
  private spentUsd = 0;
  private capped = false;
  private capLogged = false;
  private commitmentCapLogged = false;

  // Overlap + lifecycle guards.
  private whisperInFlight = false;
  private atRiskInFlight = false;
  private finalized = false;

  // Meter counters.
  private llmOps = 0;
  private commitmentsFiled = 0;
  private atRiskFlags = 0;
  private draftFiled = false;

  // Track detached background work so finalize() can settle it before the meter fires.
  private readonly pending = new Set<Promise<unknown>>();

  constructor(deps: CopilotDeps, config?: Partial<CopilotConfig>, opts?: { contactId?: string | null }) {
    this.deps = deps;
    this.cfg = { ...DEFAULT_COPILOT_CONFIG, ...(config ?? {}) };
    this.contactId = opts?.contactId ?? null;
  }

  private now(): number { return this.deps.now ? this.deps.now() : Date.now(); }
  private nowIso(): string { return new Date(this.now()).toISOString(); }
  private log(msg: string, extra?: Record<string, unknown>): void {
    if (this.deps.log) this.deps.log(msg, extra);
    else console.log(`[voice-copilot] ${msg}`, extra ?? {});
  }

  /**
   * Reserve budget for an op BEFORE it runs (optimistic, so two concurrent triggers can't both slip
   * under the cap). Returns false — and trips the cap once, loudly — when the op would exceed it.
   */
  private reserve(op: keyof typeof OP_COST_ESTIMATE_USD): boolean {
    if (this.capped) return false;
    if (this.cfg.costCapUsd <= 0) { this.spentUsd += OP_COST_ESTIMATE_USD[op]; return true; }
    if (this.spentUsd + OP_COST_ESTIMATE_USD[op] > this.cfg.costCapUsd) {
      this.capped = true;
      if (!this.capLogged) {
        this.capLogged = true;
        this.log("cost cap reached — stopping intelligence, degrading honestly (§13)", {
          spentUsd: Number(this.spentUsd.toFixed(4)), capUsd: this.cfg.costCapUsd, op,
        });
      }
      return false;
    }
    this.spentUsd += OP_COST_ESTIMATE_USD[op];
    return true;
  }

  /** Track a detached promise so finalize() can await outstanding work, and swallow its rejection. */
  private track(p: Promise<unknown>): void {
    const wrapped = p.catch((e) => this.log("background op failed (non-fatal)", { error: (e as Error)?.message }))
      .finally(() => { this.pending.delete(wrapped); });
    this.pending.add(wrapped);
  }

  /**
   * Feed one Deepgram result. Intelligence is gated on FINAL utterances only (speech_final preferred,
   * is_final accepted) — interim hypotheses never drive a bus write or an LLM call. Returns immediately;
   * heavy work is fired detached. NEVER throws (§13).
   */
  onTranscript(t: { transcript: string; isFinal?: boolean; speechFinal?: boolean }): void {
    try {
      const text = (t?.transcript ?? "").trim();
      // Gate on FINAL only. speech_final marks an end-of-utterance; is_final marks a stable segment.
      if (!text || !(t.speechFinal || t.isFinal)) return;

      this.accumulated = this.accumulated ? `${this.accumulated} ${text}` : text;

      // (2) COMMITMENT — cheap regex first, per utterance, deduped call-wide. Zero LLM cost.
      for (const c of detectCommitments(text, this.now())) {
        if (this.filedCommitments.has(c.key)) continue;
        // Hard per-call cap on DISTINCT commitments — a DB-write-amplification guard, parity with the
        // whisper/at-risk caps. A pathological transcript can't file unbounded owner.task rows (§13).
        if (this.filedCommitments.size >= this.cfg.maxCommitments) {
          if (!this.commitmentCapLogged) {
            this.commitmentCapLogged = true;
            this.log("commitment cap reached — not filing further commitments this call", {
              maxCommitments: this.cfg.maxCommitments,
            });
          }
          break;
        }
        this.filedCommitments.add(c.key); // reserve the key BEFORE the async file so a repeat within
        this.track(this.fileCommitment(c)); // the same tick can't double-file (idempotency).
      }

      // (1) WHISPER — on a topic shift (enough NEW final text since the last whisper), capped.
      const newSinceWhisper = this.accumulated.length - this.lastWhisperAtChars;
      if (
        !this.capped && !this.whisperInFlight &&
        this.whisperCount < this.cfg.maxWhispers &&
        newSinceWhisper >= this.cfg.whisperMinNewChars
      ) {
        this.track(this.runWhisper());
      }

      // (3) AT_RISK — rolling-window scan, debounced + capped. NOT per utterance.
      const newSinceAtRisk = this.accumulated.length - this.lastAtRiskAtChars;
      if (
        !this.capped && !this.atRiskInFlight &&
        this.atRiskScanCount < this.cfg.maxAtRiskScans &&
        newSinceAtRisk >= this.cfg.atRiskMinNewChars
      ) {
        this.track(this.runAtRisk());
      }
    } catch (e) {
      this.log("onTranscript error (non-fatal)", { error: (e as Error)?.message });
    }
  }

  private async fileCommitment(c: DetectedCommitment): Promise<void> {
    const res = await this.deps.fileAction({
      kind: "owner.task",
      title: c.title,
      summary: "Commitment captured live on a call.",
      contactId: this.contactId,
      dueAt: c.dueAt,
      payload: { source: "voice_copilot", captured: "commitment" },
    });
    if (!res.ok || !res.actionId) {
      this.log("commitment file_action did not return an id (skipping broadcast)", { title: c.title });
      return;
    }
    this.commitmentsFiled++;
    const payload: CommitmentPayload = {
      kind: "commitment",
      action_id: res.actionId,
      title: c.title,
      ...(c.dueAt ? { due_at: c.dueAt } : {}),
      at: this.nowIso(),
    };
    this.deps.broadcast("commitment", payload as unknown as Record<string, unknown>);
  }

  private async runWhisper(): Promise<void> {
    if (!this.reserve("whisper")) return;
    this.whisperInFlight = true;
    this.whisperCount++;
    this.lastWhisperAtChars = this.accumulated.length; // mark BEFORE await so a fresh shift re-arms cleanly
    this.llmOps++;
    try {
      const query = this.accumulated.slice(-600); // the current topic, not the whole call
      const cards = await this.deps.recallContext(query);
      if (!cards || cards.length === 0) return; // honest: nothing relevant → no whisper (§13)
      const payload: WhisperPayload = { kind: "whisper", cards: cards.slice(0, 3), at: this.nowIso() };
      this.deps.broadcast("whisper", payload as unknown as Record<string, unknown>);
    } finally {
      this.whisperInFlight = false;
    }
  }

  private async runAtRisk(): Promise<void> {
    if (!this.reserve("at_risk")) return;
    this.atRiskInFlight = true;
    this.atRiskScanCount++;
    this.lastAtRiskAtChars = this.accumulated.length;
    this.llmOps++;
    try {
      const window = this.accumulated.slice(-900);
      const verdict = await this.deps.scanAtRisk(window);
      if (!verdict || !verdict.flagged) return; // honest: no fabricated flag (§13)
      const signalKey = normalizeCommitment(verdict.signal).slice(0, 80);
      if (!signalKey || this.firedAtRiskSignals.has(signalKey)) return; // one distinct signal / call
      this.firedAtRiskSignals.add(signalKey);
      const res = await this.deps.fileAction({
        kind: "client.at_risk",
        title: `At-risk signal on live call: ${verdict.signal}`.slice(0, 120),
        summary: verdict.signal,
        contactId: this.contactId,
        priority: "high",
        payload: { source: "voice_copilot", captured: "at_risk", level: verdict.level },
      });
      // Only COUNT a filed flag when the action-bus write actually succeeded (§13 — the meter must not
      // claim a client.at_risk record that does not exist). The concern is still broadcast either way so
      // the human sees it; action_id is present ONLY on success, and the surface keys its "filed for the
      // team" copy on action_id so it never asserts a record that was never written.
      if (res.ok && res.actionId) this.atRiskFlags++;
      const payload: AtRiskPayload = {
        kind: "at_risk",
        level: verdict.level,
        signal: verdict.signal,
        ...(res.ok && res.actionId ? { action_id: res.actionId } : {}),
        at: this.nowIso(),
      };
      this.deps.broadcast("at_risk", payload as unknown as Record<string, unknown>);
    } finally {
      this.atRiskInFlight = false;
    }
  }

  /**
   * Teardown (call-end / speech-idle): settle outstanding background work, then — ONCE — synthesize
   * the follow-up, file+advance it into the cs_draft approval lane, broadcast draft_ready, and meter
   * the call's B3 usage (§17). Idempotent; NEVER throws (§13). Returns a small summary for logging.
   */
  async finalize(): Promise<CopilotMeter> {
    if (this.finalized) return this.meterSummary();
    this.finalized = true;

    // Let in-flight whispers/commitments/scans settle so their broadcasts + meter counts are included.
    try { await Promise.allSettled([...this.pending]); } catch { /* settled individually */ }

    // (4) AUTO-DRAFT — once, only when there's a real conversation to follow up on and budget remains.
    try {
      const transcript = this.accumulated.trim();
      const haveEnough = transcript.length >= this.cfg.minTranscriptForDraft;
      // reserve() has a side-effect (spentUsd += estimate), so only charge the budget when the draft
      // will actually run — short-circuit on haveEnough so a too-short call never over-reports (§13).
      const budgetOk = haveEnough && this.reserve("auto_draft"); // the hard cap binds the draft too
      if (haveEnough && budgetOk) {
        this.llmOps++;
        const draft = await this.deps.draftFollowup(transcript);
        if (draft && draft.body && draft.body.trim()) {
          const filed = await this.deps.fileAction({
            kind: "owner.followup_email",
            title: draft.subject?.trim() || "Follow-up from your call",
            summary: "Auto-drafted follow-up from a live call — review before sending.",
            contactId: this.contactId,
            payload: { source: "voice_copilot", captured: "auto_draft" },
          });
          if (filed.ok && filed.actionId) {
            const advanced = await this.deps.advanceAction({
              actionId: filed.actionId,
              toStatus: "drafted",
              draftContent: {
                subject: draft.subject ?? null,
                body: draft.body.trim(),
                channel: "email",
                source: "voice_copilot",
              },
            });
            if (advanced.ok && advanced.approvalId) {
              this.draftFiled = true;
              const payload: DraftReadyPayload = {
                kind: "draft_ready",
                approval_id: advanced.approvalId,
                ...(draft.subject?.trim() ? { subject: draft.subject.trim() } : {}),
                at: this.nowIso(),
              };
              this.deps.broadcast("draft_ready", payload as unknown as Record<string, unknown>);
            } else {
              this.log("auto-draft advance_action returned no approval id (no draft_ready)", { actionId: filed.actionId });
            }
          }
        } else {
          this.log("auto-draft produced no usable body — degrading honestly, no draft_ready (§13)");
        }
      } else if (haveEnough && !budgetOk) {
        this.log("auto-draft skipped — call cost cap already reached (§13 honest degrade)");
      }
    } catch (e) {
      this.log("finalize auto-draft error (non-fatal)", { error: (e as Error)?.message });
    }

    const summary = this.meterSummary();
    try { this.deps.meter(summary); } catch (e) { this.log("meter emit failed", { error: (e as Error)?.message }); }
    return summary;
  }

  private meterSummary(): CopilotMeter {
    return {
      llmOps: this.llmOps,
      costEstimateUsd: Number(this.spentUsd.toFixed(4)),
      whispers: this.whisperCount,
      atRiskScans: this.atRiskScanCount,
      commitments: this.commitmentsFiled,
      atRiskFlags: this.atRiskFlags,
      draftFiled: this.draftFiled,
      capped: this.capped,
    };
  }
}

// #140 B3 — pure parsing + accumulation of the live-call INTELLIGENCE broadcast contract.
//
// Extracted from the subscription hook (useLiveTranscript) so the crash-prone parsing of
// UNTRUSTED broadcast payloads and the swap/dedupe accumulation have ONE framework-free
// home (§18) that can be smoke-tested HEADLESS (§32) — no React, no Supabase. The hook is
// the only runtime caller; it feeds raw broadcast payloads in and renders the snapshot out.
//
// DOCTRINE
//  §13  Every coercer is defensive: a malformed frame returns null (dropped), never a
//       fabricated card/chip/flag/draft. A bad frame can never throw into the call surface.
//  §18  The event shapes ARE the B3 broadcast contract the backend emits on the SAME
//       private topic as the transcript — the surface only receives and renders.

/** One L6-recall context card whispered to the operator (event "whisper"). */
export interface WhisperCard {
  id: string;
  title: string;
  body: string;
  /** Where the recall came from (a prior interaction, an artifact, the knowledge base). */
  source: string;
  /** Cosine similarity 0..1 from the recall, or null when the server omits it. */
  similarity: number | null;
}
/** A promised deliverable filed as an owner task in real time (event "commitment"). */
export interface CommitmentChip {
  actionId: string;
  title: string;
  /** ISO due date if the commitment named one, else null. */
  dueAt: string | null;
  at: string;
}
export type AtRiskLevel = "low" | "med" | "high";
/** A churn/competitor/frustration signal flagged live (event "at_risk"). */
export interface AtRiskFlag {
  level: AtRiskLevel;
  signal: string;
  actionId: string | null;
  at: string;
}
/** The auto-drafted follow-up that landed in the approval queue (event "draft_ready"). */
export interface DraftReady {
  approvalId: string;
  subject: string | null;
  at: string;
}
/** The accumulated intelligence for the current (or just-ended, frozen) call. */
export interface CallIntelligence {
  /** The latest whisper card SET — REPLACED on a topic shift (a swap, not a stack). */
  whispers: WhisperCard[];
  /** Every distinct commitment filed this call, in arrival order. */
  commitments: CommitmentChip[];
  /** Every distinct at-risk flag raised this call, in arrival order. */
  atRisk: AtRiskFlag[];
  /** The follow-up draft that landed in approvals (latest), or null. */
  draftReady: DraftReady | null;
}

/** The zero-value intelligence — the honest empty state (no fabricated content). */
export const EMPTY_CALL_INTELLIGENCE: CallIntelligence = {
  whispers: [],
  commitments: [],
  atRisk: [],
  draftReady: null,
};

/** Default cap on accumulated commitments/flags per call (the server debounces already). */
export const DEFAULT_MAX_INTEL = 50;

/**
 * Coerce a "whisper" payload → the renderable card set, or null when there's nothing to
 * show. A malformed card is skipped, not fabricated (§13). Returns null (→ ignore, keep
 * the prior set) when zero cards survive, so a bad frame never blanks the cues.
 */
export function coerceWhisper(raw: unknown): WhisperCard[] | null {
  if (!raw || typeof raw !== "object") return null;
  const p = raw as Record<string, unknown>;
  if (!Array.isArray(p.cards)) return null;
  const cards: WhisperCard[] = [];
  for (const c of p.cards) {
    if (!c || typeof c !== "object") continue;
    const cc = c as Record<string, unknown>;
    const title = typeof cc.title === "string" ? cc.title.trim() : "";
    const body = typeof cc.body === "string" ? cc.body.trim() : "";
    if (!title && !body) continue; // nothing legible — skip, never a blank card
    const sim =
      typeof cc.similarity === "number" && Number.isFinite(cc.similarity) ? cc.similarity : null;
    cards.push({
      id: typeof cc.id === "string" && cc.id.length > 0 ? cc.id : `${title}#${cards.length}`,
      title: title || "Context",
      body,
      source: typeof cc.source === "string" ? cc.source.trim() : "",
      similarity: sim,
    });
  }
  return cards.length ? cards : null;
}

/** Coerce a "commitment" payload → a chip, or null when it can't be rendered honestly. */
export function coerceCommitment(raw: unknown): CommitmentChip | null {
  if (!raw || typeof raw !== "object") return null;
  const p = raw as Record<string, unknown>;
  const actionId = typeof p.action_id === "string" && p.action_id.length > 0 ? p.action_id : null;
  const title = typeof p.title === "string" ? p.title.trim() : "";
  if (!actionId || !title) return null;
  return {
    actionId,
    title,
    dueAt: typeof p.due_at === "string" && p.due_at.length > 0 ? p.due_at : null,
    at: typeof p.at === "string" ? p.at : new Date().toISOString(),
  };
}

/** Coerce an "at_risk" payload → a flag, or null when level/signal is missing. */
export function coerceAtRisk(raw: unknown): AtRiskFlag | null {
  if (!raw || typeof raw !== "object") return null;
  const p = raw as Record<string, unknown>;
  const level: AtRiskLevel | null =
    p.level === "high" || p.level === "med" || p.level === "low" ? p.level : null;
  const signal = typeof p.signal === "string" ? p.signal.trim() : "";
  if (!level || !signal) return null;
  return {
    level,
    signal,
    actionId: typeof p.action_id === "string" && p.action_id.length > 0 ? p.action_id : null,
    at: typeof p.at === "string" ? p.at : new Date().toISOString(),
  };
}

/** Coerce a "draft_ready" payload → the approval pointer, or null without an approval id. */
export function coerceDraftReady(raw: unknown): DraftReady | null {
  if (!raw || typeof raw !== "object") return null;
  const p = raw as Record<string, unknown>;
  const approvalId =
    typeof p.approval_id === "string" && p.approval_id.length > 0 ? p.approval_id : null;
  if (!approvalId) return null;
  return {
    approvalId,
    subject: typeof p.subject === "string" && p.subject.trim().length > 0 ? p.subject.trim() : null,
    at: typeof p.at === "string" ? p.at : new Date().toISOString(),
  };
}

/**
 * Accumulates the four intelligence event streams for a SINGLE call, holding the exact
 * swap/dedupe semantics the surface renders: whispers REPLACE (a topic-shift refresh),
 * commitments + flags APPEND once-per-distinct (idempotent — a redelivered event is a
 * no-op, belt-and-suspenders to the backend's own idempotency), and the draft is the
 * latest pointer. Each `apply*` returns true only when state actually changed, so the
 * caller re-renders on real deltas and no-ops on duplicates.
 */
export class CallIntelligenceAccumulator {
  private whispers: WhisperCard[] = [];
  private commitments: CommitmentChip[] = [];
  private atRisk: AtRiskFlag[] = [];
  private draftReady: DraftReady | null = null;
  private seen = new Set<string>();
  private readonly maxIntel: number;

  constructor(maxIntel: number = DEFAULT_MAX_INTEL) {
    this.maxIntel = maxIntel;
  }

  /** Clear every buffer — a new call is a new brain (§13, never leak the prior call). */
  reset(): void {
    this.whispers = [];
    this.commitments = [];
    this.atRisk = [];
    this.draftReady = null;
    this.seen = new Set();
  }

  applyWhisper(raw: unknown): boolean {
    const cards = coerceWhisper(raw);
    if (!cards) return false;
    this.whispers = cards; // SWAP — a topic-shift refresh replaces the set
    return true;
  }

  applyCommitment(raw: unknown): boolean {
    const c = coerceCommitment(raw);
    if (!c) return false;
    const key = `commitment:${c.actionId}`;
    if (this.seen.has(key)) return false; // same task filed once — no dupe chip
    this.seen.add(key);
    this.commitments = [...this.commitments, c].slice(-this.maxIntel);
    return true;
  }

  applyAtRisk(raw: unknown): boolean {
    const f = coerceAtRisk(raw);
    if (!f) return false;
    // De-dupe by the filed action, or by the signal text when no action rode along.
    const key = `at_risk:${f.actionId ?? f.signal.toLowerCase()}`;
    if (this.seen.has(key)) return false;
    this.seen.add(key);
    this.atRisk = [...this.atRisk, f].slice(-this.maxIntel);
    return true;
  }

  applyDraftReady(raw: unknown): boolean {
    const d = coerceDraftReady(raw);
    if (!d) return false;
    this.draftReady = d; // the latest draft pointer
    return true;
  }

  /** A fresh immutable snapshot (new array identities so React sees the change). */
  snapshot(): CallIntelligence {
    return {
      whispers: [...this.whispers],
      commitments: [...this.commitments],
      atRisk: [...this.atRisk],
      draftReady: this.draftReady,
    };
  }
}

// _shared/reasoning/review.ts — §34 Layer 4, PHASE 3: Multi-Specialist Review (the panel pattern).
//
// After phase-1 sets the STRATEGY (strategize.ts), phase-2 pre-mortems it (reflect.ts), and Paige has
// actually PRODUCED a draft, she does NOT ship on her own say-so. N frontier reasoning LENSES — each a
// sharp, single-minded specialist — independently judge the draft against the strategy's success
// criteria and the reflection's self-checks, and their verdicts aggregate to one SHIP / ITERATE / BLOCK.
// This is the "hire her whole team" moment made real in the pipeline (§8/§14): three reviewers who each
// look for a different failure, not one generalist rubber-stamp.
//
//   - correctness   — is the draft actually right/accurate, does it do what the task asked?
//   - completeness  — does it cover EVERY success criterion + sub-step, or is something half-done?
//   - risk          — adversarial: what could go wrong, what did the reflection's blind-spots warn about?
//
// It composes with phase-1/2 (it reviews OVER their criteria) and is distinct from them (strategy =
// decompose; reflection = pre-mortem; review = post-mortem the produced draft). It sits beside
// strategize.ts / reflect.ts / engine.ts as one home (§18), and `reviewToVerdict` maps its output onto
// engine.ts's ReasoningVerdict so phase-3 is a drop-in `evaluate` for runReasoning's bounded loop.
//
// Mirrors the SHIP'd phase-1/2 contract exactly:
//   §13 — an ENHANCEMENT that NEVER throws into, blocks, or breaks the caller. A broken panel must never
//         BLOCK a real artifact: every failure path (empty input, LLM throw, unparseable reply, a
//         rejected settle) yields a `degraded` verdict, and a fully-degraded review fails OPEN to SHIP.
//         Request assembly lives INSIDE the try; no lens ever throws out of runLens.
//   §17 — routedChatCompletion("plan") → Claude reasoning tier, never an open model. This is explicitly
//         NOT tool_invoke (which is open-model-eligible AND side-effecting) — a design JUDGMENT is
//         frontier-only and pure.
//   §34-L1 — each lens call self-traces ONE paige_llm_trace row; this module wires NO second trace (no
//            double-count). It threads parent_trace_id so the N lenses are sibling children of one review
//            node, job_kind "reason:review:<lens>".
//   §34 — pure in-repo (model-router only). No vendor reasoning/eval SDK, no orchestrator call, no
//         open-model path.
import { routedChatCompletion } from "../model-router.ts";
import type { TraceCtx } from "../llm-trace.ts";
import type { StrategyPlan } from "./strategize.ts";
import type { ReflectionNotes } from "./reflect.ts";
import type { ReasoningVerdict } from "./engine.ts";

export type ReviewCall = "SHIP" | "ITERATE" | "BLOCK";

/** One specialist reviewer — a single-minded system prompt + its trace identity. */
export interface SpecialistLens {
  id: string;
  systemPrompt: string;
  agentId: string;
}

export interface SpecialistVerdict {
  /** Which lens produced this (the lens id, e.g. "correctness"). */
  lens: string;
  verdict: ReviewCall;
  /** Must-fix defects that block a SHIP. */
  blockers: string[];
  /** Non-blocking sharpenings that would make the draft better. */
  improvements: string[];
  rationale: string;
  /** True when this is a safe fallback (LLM/parse degraded) — it carries no real judgment (§13). */
  degraded: boolean;
}

export interface SpecialistReview {
  verdicts: SpecialistVerdict[];
  /** The aggregate call — BLOCK > ITERATE > SHIP over the NON-degraded verdicts. */
  consensus: ReviewCall;
  /** Dedup union of every non-degraded verdict's blockers. */
  blockers: string[];
  /** One-paragraph actionable step synthesized from the union of blockers + improvements (empty on a
   *  clean SHIP). Feeds engine.ts's regenerate step as the refined instruction. */
  refinedInstruction: string;
  /** How many lenses actually returned a verdict (honest count, §13). */
  lensesRun: number;
  /** True when EVERY verdict degraded — the whole panel added no real judgment; caller ships (§13). */
  degraded: boolean;
}

export interface ReviewOpts {
  /** The original task/brief the draft was produced for. */
  task: string;
  /** The produced draft to review. */
  artifact: string;
  /** Phase-1 strategy — its successCriteria + risks become the standards the panel judges against. */
  strategy?: StrategyPlan | null;
  /** Phase-2 reflection — its selfChecks + blindSpots sharpen what the panel looks for. */
  reflection?: ReflectionNotes | null;
  /** Override the panel (defaults to CORE_PANEL). */
  lenses?: SpecialistLens[];
  /** §9 — EXPLICIT resolved tenant id, for the L1 trace correlation only. Never body-derived. */
  tenantId?: string | null;
  agentId?: string | null;
  taskId?: string | null;
  /** Correlation parent so the N lens traces are sibling children of one review node (§34-L1). */
  parentTraceId?: string | null;
}

/** The shared instruction tail every lens ends with — locks the STRICT-JSON output shape. */
const JSON_TAIL =
  'Return STRICT JSON with exactly these keys: {"verdict": "SHIP" | "ITERATE" | "BLOCK", ' +
  '"blockers": string[], "improvements": string[], "rationale": string}. verdict = SHIP only if it is ' +
  "genuinely ready, ITERATE if it needs work but is salvageable, BLOCK if it is fundamentally wrong. " +
  "blockers = the must-fix defects that stop a SHIP. improvements = non-blocking ways to make it better. " +
  "rationale = one or two sentences on your call. Output ONLY the JSON object, no prose, no code fence.";

/** The default 3-lens panel — each hunts a DIFFERENT failure, never one generalist rubber-stamp. */
const CORE_PANEL: SpecialistLens[] = [
  {
    id: "correctness",
    agentId: "paige-reviewer-correctness",
    systemPrompt:
      "You are Paige's CORRECTNESS reviewer. Judge one thing only: is this draft actually correct and " +
      "accurate, and does it do what the task asked? Hunt logic errors, factual mistakes, wrong claims, " +
      "instructions that don't follow the brief, and anything that would simply be WRONG in front of a " +
      "client. You are not judging polish or scope — only whether it is right. " + JSON_TAIL,
  },
  {
    id: "completeness",
    agentId: "paige-reviewer-completeness",
    systemPrompt:
      "You are Paige's COMPLETENESS reviewer. Judge one thing only: does this draft cover EVERY success " +
      "criterion and every sub-step the task requires? Hunt what is missing, half-done, stubbed, or " +
      "quietly dropped — a criterion left unaddressed, a step skipped, a placeholder left in. You are not " +
      "judging correctness of what IS there — only whether anything asked for is absent. " + JSON_TAIL,
  },
  {
    id: "risk",
    agentId: "paige-reviewer-risk",
    systemPrompt:
      "You are Paige's RISK reviewer, and you are adversarial. Judge one thing only: what could go wrong " +
      "with this draft in the real world? Assume the reflection's blind-spots came true and hunt the " +
      "failure modes — how it lands badly on the client, where it breaks under an edge case, what it " +
      "exposes, what a hostile reader would seize on. Be the pessimist the rest of the team isn't. " + JSON_TAIL,
  },
];

/** A safe, non-null review that lets the caller SHIP unblocked when this pass can't add judgment (§13).
 *  Fail-open by construction: a broken panel must NEVER block a real artifact (mirrors the visual-critic rule). */
function fallback(): SpecialistReview {
  return { verdicts: [], consensus: "SHIP", blockers: [], refinedInstruction: "", lensesRun: 0, degraded: true };
}

/** A degraded per-lens verdict — carries no judgment and cannot swing the consensus (it's filtered out). */
function degradedVerdict(id: string): SpecialistVerdict {
  return { lens: id, verdict: "SHIP", blockers: [], improvements: [], rationale: "", degraded: true };
}

/** Extract the first JSON object from a model reply that may be fenced or prose-wrapped.
 *  NOTE: the pure logic here is mirrored in scripts/reasoning-review-smoke.mjs for a headless smoke
 *  test (the Deno import chain blocks a plain-Node import) — keep the two in sync. */
function parseVerdict(raw: string): Omit<SpecialistVerdict, "lens" | "degraded"> | null {
  if (!raw || typeof raw !== "string") return null;
  const fenced = raw.replace(/```(?:json)?/gi, "").trim();
  const start = fenced.indexOf("{");
  const end = fenced.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) return null;
  let obj: unknown;
  try { obj = JSON.parse(fenced.slice(start, end + 1)); } catch { return null; }
  if (!obj || typeof obj !== "object") return null;
  const o = obj as Record<string, unknown>;
  const arr = (v: unknown): string[] =>
    Array.isArray(v) ? v.filter((x) => typeof x === "string" && x.trim()).map((x) => (x as string).trim()) : [];
  const verdict = typeof o.verdict === "string" ? o.verdict.trim().toUpperCase() : "";
  // The verdict is the load-bearing field — an unknown value carried no real review, treat as unparseable.
  if (verdict !== "SHIP" && verdict !== "ITERATE" && verdict !== "BLOCK") return null;
  const rationale = typeof o.rationale === "string" ? o.rationale.trim() : "";
  return { verdict: verdict as ReviewCall, blockers: arr(o.blockers), improvements: arr(o.improvements), rationale };
}

/** Render the phase-1/2 standards into the review prompt (empty string when there are neither). */
function criteriaBlock(strategy?: StrategyPlan | null, reflection?: ReflectionNotes | null): string {
  const list = (label: string, xs: unknown) =>
    Array.isArray(xs) && xs.length ? `\n${label}: ${xs.filter((x) => typeof x === "string").join("; ")}` : "";
  const s = strategy ? `${list("Success criteria", strategy.successCriteria)}${list("Known risks", strategy.risks)}` : "";
  const r = reflection ? `${list("Self-checks", reflection.selfChecks)}${list("Watch for (blind spots)", reflection.blindSpots)}` : "";
  if (!s && !r) return "";
  return `\n\nJudge the draft against the standards set before the work:${s}${r}`;
}

/** Aggregate the panel's verdicts into one call. PURE (no LLM) so the smoke test covers it fully.
 *  NOTE: mirrored in scripts/reasoning-review-smoke.mjs — keep the two in sync. */
function aggregate(verdicts: SpecialistVerdict[]): { consensus: ReviewCall; blockers: string[]; refinedInstruction: string } {
  // Only NON-degraded verdicts carry judgment; a degraded verdict must never swing the consensus.
  const live = verdicts.filter((v) => !v.degraded);
  // Precedence BLOCK > ITERATE > SHIP. No live verdicts (or all SHIP) → SHIP (fail-open, §13).
  let consensus: ReviewCall = "SHIP";
  if (live.some((v) => v.verdict === "BLOCK")) consensus = "BLOCK";
  else if (live.some((v) => v.verdict === "ITERATE")) consensus = "ITERATE";

  const dedup = (pick: (v: SpecialistVerdict) => string[]): string[] => {
    const seen = new Set<string>();
    const out: string[] = [];
    for (const v of live) for (const raw of pick(v)) {
      const k = raw.trim();
      if (k && !seen.has(k)) { seen.add(k); out.push(k); }
    }
    return out;
  };
  const blockers = dedup((v) => v.blockers);
  const improvements = dedup((v) => v.improvements);

  // A clean SHIP with no blockers needs no refinement — an empty instruction tells engine.ts to stop.
  let refinedInstruction = "";
  if (!(consensus === "SHIP" && blockers.length === 0)) {
    const parts: string[] = [];
    if (blockers.length) parts.push(`Resolve these blockers before shipping: ${blockers.join("; ")}.`);
    if (improvements.length) parts.push(`Then strengthen the draft: ${improvements.join("; ")}.`);
    refinedInstruction = parts.join(" ");
  }
  return { consensus, blockers, refinedInstruction };
}

/**
 * Run the multi-specialist panel over a produced draft. Never throws; on any degrade the offending lens
 * yields a safe verdict and a fully-degraded panel fails OPEN to SHIP (§13). Each lens call self-traces to
 * L1 as a sibling child of the review node (§34).
 */
export async function reviewBySpecialists(opts: ReviewOpts): Promise<SpecialistReview> {
  const task = (opts.task ?? "").trim();
  const artifact = (opts.artifact ?? "").trim();
  if (!task || !artifact) return fallback();

  const lenses = opts.lenses ?? CORE_PANEL;

  // One reasoning call per lens. routedChatCompletion("plan") → Claude reasoning tier (§17) and writes its
  // OWN paige_llm_trace row (L1) — we thread parent_trace_id so the lenses are siblings, we do NOT trace
  // again (no double-count). runLens NEVER throws: any failure degrades to a safe verdict (§13).
  const runLens = async (lens: SpecialistLens): Promise<SpecialistVerdict> => {
    const trace: TraceCtx = {
      tenant_id: opts.tenantId ?? null,
      agent_id: lens.agentId,
      task_id: opts.taskId ?? null,
      parent_trace_id: opts.parentTraceId ?? null,
      job_kind: `reason:review:${lens.id}`,
    };
    let content = "";
    try {
      // Assemble INSIDE the try so even a criteriaBlock/assembly throw degrades safely (§13 airtight).
      const body = {
        messages: [
          { role: "system", content: lens.systemPrompt },
          {
            role: "user",
            content: `Task:\n${task}\n\nDraft to review:\n${artifact}${criteriaBlock(opts.strategy, opts.reflection)}`,
          },
        ],
        temperature: 0.3,
        max_tokens: 1000,
      };
      const resp = await routedChatCompletion("plan", body, trace);
      content = resp?.choices?.[0]?.message?.content ?? "";
    } catch (e) {
      console.error(`[review] lens "${lens.id}" reasoning call failed (non-fatal):`, (e as Error)?.message);
      return degradedVerdict(lens.id);
    }
    const parsed = parseVerdict(content);
    if (!parsed) return degradedVerdict(lens.id);
    return { lens: lens.id, ...parsed, degraded: false };
  };

  // Fan out; a rejected settle (belt-and-suspenders — runLens already catches) also degrades, never throws.
  const settled = await Promise.allSettled(lenses.map(runLens));
  const verdicts: SpecialistVerdict[] = settled.map((s, i) =>
    s.status === "fulfilled" ? s.value : degradedVerdict(lenses[i].id));

  const degraded = verdicts.length === 0 || verdicts.every((v) => v.degraded);
  const { consensus, blockers, refinedInstruction } = aggregate(verdicts);
  return { verdicts, consensus, blockers, refinedInstruction, lensesRun: verdicts.length, degraded };
}

/**
 * Map a SpecialistReview onto engine.ts's ReasoningVerdict so phase-3 is a drop-in `evaluate` for
 * runReasoning. A fully-degraded review fails OPEN to SHIP+lowConfidence so the engine keeps the
 * artifact rather than blocking on a broken panel (§13).
 */
export function reviewToVerdict(r: SpecialistReview): ReasoningVerdict {
  if (r.degraded) return { verdict: "SHIP", lowConfidence: true, findings: r.verdicts };
  return { verdict: r.consensus, refinedInstruction: r.refinedInstruction, findings: r.verdicts };
}

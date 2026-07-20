// _shared/reasoning/reflect.ts — §34 Layer 4, PHASE 2: Pre-Work Self-Reflection (the Reflexion pattern).
//
// After phase-1 sets the STRATEGY (strategize.ts) and before Paige actually generates, she stops and asks
// the harder question: "where am I most likely to get THIS wrong, and what will I check myself on?" The
// output sharpens execution up front instead of catching mistakes only in the phase-4 iteration loop.
//
//   - blindSpots      — the specific ways this task tends to go wrong (the traps to avoid)
//   - selfChecks      — what Paige must verify about her own output before calling it done
//   - sharpenedApproach — the plan, tightened for those risks
//
// It composes with phase-1 (it reflects OVER the strategy) and is distinct from it (strategy = decompose
// the task; reflection = pre-mortem the strategy). It sits beside strategize.ts / engine.ts / trace.ts as
// one home (§18). It does NOT touch memory — reflection reasons over the task+strategy it's handed, so
// there's no recallSimilar here (that's phase-1's seed step).
//
// Mirrors the SHIP'd phase-1 contract exactly:
//   §13 — an ENHANCEMENT that NEVER throws into, blocks, or breaks the generation. Every failure path
//         (empty task, LLM throw, unparseable reply, assembly error) returns a `degraded` reflection and
//         the caller proceeds unchanged. Request assembly lives INSIDE the try.
//   §17 — routedChatCompletion("plan") → Claude reasoning tier, never an open model.
//   §34-L1 — that call self-traces one paige_llm_trace row; this module wires NO second trace (no
//            double-count) — it threads the correlation ctx onto the `trace` param, job_kind "reason:reflect".
//   §34 — pure in-repo (model-router only). No vendor reasoning SDK.
import { routedChatCompletion } from "../model-router.ts";
import type { TraceCtx } from "../llm-trace.ts";
import type { StrategyPlan } from "./strategize.ts";

export interface ReflectionNotes {
  /** The specific ways THIS task tends to go wrong — the traps to steer around. */
  blindSpots: string[];
  /** What Paige must verify about her own output before calling it done. */
  selfChecks: string[];
  /** The approach tightened for the blind spots (one or two sentences). */
  sharpenedApproach: string;
  /** True when this is a safe fallback (LLM/parse degraded) — the caller proceeds regardless (§13). */
  degraded: boolean;
}

export interface ReflectOpts {
  /** The task/brief Paige is about to work on. */
  task: string;
  /** The phase-1 strategy to reflect over (optional — reflection still works from the task alone). */
  strategy?: StrategyPlan | null;
  /** §9 — explicit resolved tenant id, for the L1 trace correlation only (no memory read here). */
  tenantId?: string | null;
  agentId?: string | null;
  taskId?: string | null;
}

/** A safe, non-null reflection that lets the caller proceed unblocked when this pass can't add lift (§13). */
function fallback(): ReflectionNotes {
  return { blindSpots: [], selfChecks: [], sharpenedApproach: "", degraded: true };
}

/** Render the phase-1 strategy into the reflection prompt (empty string when there's no strategy). */
function strategyBlock(s: StrategyPlan | null | undefined): string {
  if (!s) return "";
  const list = (label: string, xs: unknown) =>
    Array.isArray(xs) && xs.length ? `\n${label}: ${xs.filter((x) => typeof x === "string").join("; ")}` : "";
  const approach = typeof s.approach === "string" && s.approach ? `\nApproach: ${s.approach}` : "";
  return `\n\nThe planned strategy so far:${approach}${list("Steps", s.decomposition)}${list("Known risks", s.risks)}${list("Success criteria", s.successCriteria)}`;
}

const SYSTEM_PROMPT =
  "You are Paige running a PRE-WORK self-reflection (a pre-mortem). You are NOT doing the task and NOT " +
  "rewriting the plan — you are stress-testing it before work begins. Given a task (and its planned " +
  "strategy), return STRICT JSON with exactly these keys: " +
  '{"blindSpots": string[], "selfChecks": string[], "sharpenedApproach": string}. ' +
  "blindSpots = the concrete ways THIS specific task most often goes wrong (be specific, not generic). " +
  "selfChecks = what to verify about the finished output before calling it done. sharpenedApproach = one " +
  "or two sentences tightening the plan for those risks. Output ONLY the JSON object, no prose, no code fence.";

/** Extract the first JSON object from a model reply that may be fenced or prose-wrapped.
 *  NOTE: the pure logic here is mirrored in scratchpad/reflect-test.mjs for a headless smoke test
 *  (the Deno import chain blocks a plain-Node import) — keep the two in sync. */
function parseReflection(raw: string): Pick<ReflectionNotes, "blindSpots" | "selfChecks" | "sharpenedApproach"> | null {
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
  const blindSpots = arr(o.blindSpots);
  const selfChecks = arr(o.selfChecks);
  const sharpenedApproach = typeof o.sharpenedApproach === "string" ? o.sharpenedApproach.trim() : "";
  // A reply with no blind spots, no self-checks and no sharpening carried no real reflection.
  if (blindSpots.length === 0 && selfChecks.length === 0 && !sharpenedApproach) return null;
  return { blindSpots, selfChecks, sharpenedApproach };
}

/**
 * Reflect on a task (and its strategy) before Paige generates. Never throws; on any degrade returns a
 * safe fallback the caller proceeds with (§13). The single reasoning call self-traces to L1 (§34).
 */
export async function reflectBeforeWork(opts: ReflectOpts): Promise<ReflectionNotes> {
  const task = (opts.task ?? "").trim();
  if (!task) return fallback();

  const trace: TraceCtx = {
    tenant_id: opts.tenantId ?? null,
    agent_id: opts.agentId ?? "paige-reflector",
    task_id: opts.taskId ?? null,
    job_kind: "reason:reflect",
  };

  let content = "";
  try {
    // Assemble INSIDE the try so even a strategyBlock/assembly throw degrades safely (§13 airtight).
    const body = {
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: `Task:\n${task}${strategyBlock(opts.strategy)}` },
      ],
      temperature: 0.3,
      max_tokens: 1000,
    };
    const resp = await routedChatCompletion("plan", body, trace);
    content = resp?.choices?.[0]?.message?.content ?? "";
  } catch (e) {
    console.error("[reflect] reasoning call failed (non-fatal):", (e as Error)?.message);
    return fallback(); // §13: generation proceeds unblocked
  }

  const parsed = parseReflection(content);
  if (!parsed) return fallback();
  return { ...parsed, degraded: false };
}

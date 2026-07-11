// _shared/model-router.ts — Paige Model Router (#110).
//
// One seam that decides WHICH model does a job, by JOB KIND — so the high-volume grunt
// work (classify, extract, summarize, score, internal first-drafts) can ride cheap open
// models via Featherless, while Claude keeps the reasoning and everything that ships to a
// human or takes an action. This is the economic enabler under the Client Heartbeat (#111)
// and any per-client-at-scale work: reasoning about every client is only affordable if the
// cheap parts are actually cheap.
//
// HARD RULES (non-negotiable, enforced below):
//   1. SENSITIVE jobs — an approval/routing DECISION, a final outbound message, final
//      client-facing copy, anything side-effecting — NEVER route to an open model. They
//      always go to Claude's reasoning tier. Cost is not worth a wrong autonomous act or
//      an off-voice message under the coach's brand (§3/§8).
//   2. Client-facing copy an open model drafted gets a Claude voice-polish pass before it
//      reaches anyone (helper below); open models draft, Claude finishes.
//   3. Graceful fallback: if FEATHERLESS_API_KEY is unset, or Featherless errors/times out,
//      the job silently falls back to Claude. The router can never harden into an outage —
//      worst case is "we paid Claude prices," never "the feature broke."
//
// Until FEATHERLESS_API_KEY is set every job resolves to Claude, so adopting this is safe
// today and the cheap tier activates automatically once the key lands.

import { chatCompletionCompat, type ClaudeTier } from "./claude.ts";

// ── Job taxonomy ────────────────────────────────────────────────────────────
export type JobKind =
  // CHEAP — internal, high-volume, low-stakes; open-model-eligible
  | "classify" | "extract" | "summarize" | "score" | "tone_check" | "internal_first_draft"
  // REASONING — Claude reasoning tier
  | "chat" | "plan" | "propose" | "doc_draft"
  // SENSITIVE — Claude reasoning tier, NEVER an open model
  | "approval_decision" | "outbound_final" | "client_copy_final" | "action_decision";

const CHEAP_KINDS = new Set<JobKind>([
  "classify", "extract", "summarize", "score", "tone_check", "internal_first_draft",
]);
const SENSITIVE_KINDS = new Set<JobKind>([
  "approval_decision", "outbound_final", "client_copy_final", "action_decision",
]);

export interface Route {
  provider: "anthropic" | "featherless";
  model?: string;        // set only for featherless
  tier: ClaudeTier;      // the Claude tier used when provider=anthropic (or on fallback)
  reason: string;
}

// Featherless is OpenAI-compatible. Base URL + model are env-overridable so we can retune
// without a deploy; the defaults are widely-available instruct models. A wrong/removed
// model id is caught by the fallback, never a hard failure.
const FEATHERLESS_BASE = Deno.env.get("FEATHERLESS_BASE_URL") ?? "https://api.featherless.ai/v1";
const FEATHERLESS_CHEAP_MODEL = Deno.env.get("FEATHERLESS_CHEAP_MODEL") ?? "meta-llama/Meta-Llama-3.1-8B-Instruct";
function featherlessKey(): string | undefined { return Deno.env.get("FEATHERLESS_API_KEY") || undefined; }

/** Decide who does a job. Pure + synchronous — safe to log/inspect. */
export function pickRoute(jobKind: JobKind): Route {
  if (SENSITIVE_KINDS.has(jobKind)) {
    return { provider: "anthropic", tier: "reasoning", reason: `sensitive:${jobKind} → Claude reasoning (never an open model)` };
  }
  if (CHEAP_KINDS.has(jobKind)) {
    if (featherlessKey()) {
      return { provider: "featherless", model: FEATHERLESS_CHEAP_MODEL, tier: "classification", reason: `cheap:${jobKind} → open model (Claude classification on fallback)` };
    }
    return { provider: "anthropic", tier: "classification", reason: `cheap:${jobKind} → Claude classification (Featherless not configured)` };
  }
  // reasoning kinds (chat/plan/propose/doc_draft) and any unknown → Claude reasoning
  return { provider: "anthropic", tier: "reasoning", reason: `reasoning:${jobKind} → Claude reasoning` };
}

interface OpenAIStyleBody {
  model?: string;
  messages: { role: string; content: unknown }[];
  tools?: { type: string; function: { name: string; description?: string; parameters?: unknown } }[];
  tool_choice?: unknown;
  temperature?: number;
  max_tokens?: number;
  response_format?: { type?: string } | undefined;
}

// Featherless (OpenAI-compat) non-streaming call. Returns an OpenAI-shaped response, or
// null on ANY problem so the caller falls back to Claude. Tools are NOT sent to open
// models here (cheap-tier jobs are text in / text out); if a caller passes tools it's a
// signal the job isn't actually cheap — we fall back to Claude.
async function featherlessChat(body: OpenAIStyleBody, model: string): Promise<any | null> {
  const key = featherlessKey();
  if (!key) return null;
  if (body.tools?.length) return null; // tool-use jobs are not cheap-tier; use Claude
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 20_000);
    const resp = await fetch(`${FEATHERLESS_BASE}/chat/completions`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${key}` },
      body: JSON.stringify({
        model,
        messages: body.messages,
        max_tokens: body.max_tokens ?? 2048,
        temperature: body.temperature ?? 0.4,
        ...(body.response_format?.type && /json/.test(body.response_format.type)
          ? { response_format: { type: "json_object" } } : {}),
      }),
      signal: ctrl.signal,
    });
    if (!resp.ok) { clearTimeout(t); console.warn(`model-router: featherless ${resp.status}, falling back to Claude`); return null; }
    const data = await resp.json();
    clearTimeout(t);
    if (!data?.choices?.[0]?.message) return null;
    return data;
  } catch (e) {
    console.warn("model-router: featherless error, falling back to Claude:", (e as Error)?.message);
    return null;
  }
}

/**
 * Route one completion by job kind. Sensitive/reasoning jobs go straight to Claude;
 * cheap jobs try Featherless and fall back to Claude on any issue. Same OpenAI-shaped
 * return as gatewayCompat/chatCompletionCompat, so call sites parse choices[0].message
 * unchanged.
 */
export async function routedChatCompletion(jobKind: JobKind, body: OpenAIStyleBody): Promise<any> {
  const route = pickRoute(jobKind);
  if (route.provider === "featherless" && route.model) {
    const open = await featherlessChat(body, route.model);
    if (open) return open;
    // fall through to Claude on any failure
  }
  return chatCompletionCompat(body, route.tier);
}

/**
 * Voice-polish pass (§3): take copy an open model drafted and have Claude finish it in the
 * tenant's voice before it reaches a human. Sensitive/client-facing copy should ALWAYS end
 * on a Claude pass — cheap models draft, Claude ships. Returns the polished text (or the
 * original on any failure — never blocks).
 */
export async function claudeVoicePolish(draft: string, brandVoice?: string): Promise<string> {
  const d = (draft ?? "").trim();
  if (d.length < 2) return d;
  try {
    const resp = await chatCompletionCompat({
      messages: [
        { role: "system", content: `You polish marketing/communication copy so it reads in a direct, confident, human founder voice.${brandVoice ? ` Brand voice: ${brandVoice}.` : ""} Never use "AI-powered", "streamline", "seamless", or "empower". Keep the meaning and structure; tighten wording only. Return ONLY the polished copy — no preamble.` },
        { role: "user", content: d },
      ],
    }, "reasoning");
    const out = resp?.choices?.[0]?.message?.content;
    return typeof out === "string" && out.trim().length > 1 ? out.trim() : d;
  } catch { return d; }
}

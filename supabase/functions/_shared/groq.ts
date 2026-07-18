// _shared/groq.ts — Groq provider client for the Vibe Studio model router.
//
// Groq is the open-fast text tier: Llama 3.3 70B at very low latency/cost, OpenAI-compatible
// API. Used for the cheap, high-volume text lane (drafts, classification-adjacent work) where
// Claude reasoning would be overkill — never for a customer send or an approval decision
// (§17, enforced upstream in the router's gate layer, not here).
//
// FAIL-CLOSED (doctrine §13): GROQ_API_KEY is read at CALL time; if absent we throw
// NeedsConfigError("groq"). Key never logged/echoed/placed in a result. Mirrors claude.ts.

import { NeedsConfigError, type ProviderCallResult } from "./provider-types.ts";

const GROQ_BASE = Deno.env.get("GROQ_BASE_URL") ?? "https://api.groq.com/openai/v1";
const DEFAULT_MODEL = "llama-3.3-70b-versatile";

function groqKey(): string {
  const k = Deno.env.get("GROQ_API_KEY");
  if (!k) throw new NeedsConfigError("groq");
  return k;
}

export interface GroqChatInput {
  messages: { role: string; content: unknown }[];
  model?: string;
  max_tokens?: number;
  temperature?: number;
  json?: boolean;
}

/**
 * Text completion via Groq (OpenAI-compatible Chat Completions). Returns ProviderCallResult
 * with `content` + best-effort token counts.
 */
export async function groqChat(input: GroqChatInput): Promise<ProviderCallResult> {
  const key = groqKey();
  const model = input.model || DEFAULT_MODEL;
  const started = Date.now();

  const body: Record<string, unknown> = {
    model,
    messages: input.messages,
    max_tokens: input.max_tokens ?? 2048,
  };
  if (input.temperature != null) body.temperature = input.temperature;
  if (input.json) body.response_format = { type: "json_object" };

  const resp = await fetch(`${GROQ_BASE}/chat/completions`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${key}` },
    body: JSON.stringify(body),
  });
  if (!resp.ok) {
    const detail = await resp.text().catch(() => "");
    throw new Error(`Groq ${resp.status}: ${detail.slice(0, 500)}`);
  }
  const data = await resp.json();
  const content = data?.choices?.[0]?.message?.content ?? "";
  return {
    content: typeof content === "string" ? content : JSON.stringify(content),
    provider: "groq",
    model: data?.model ?? model,
    tokens_in: data?.usage?.prompt_tokens,
    tokens_out: data?.usage?.completion_tokens,
    latency_ms: Date.now() - started,
  };
}

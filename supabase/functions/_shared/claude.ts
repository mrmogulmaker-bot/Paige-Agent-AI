// _shared/claude.ts
// Anthropic-only AI client for Paige edge functions.
// Replaces the Lovable AI gateway (OpenAI-compatible proxy over Gemini/OpenAI).
//
// Two tiers (aliases → auto-upgrade on future model versions):
//   REASONING      — chat, doc drafting, game plans, deep skills
//   CLASSIFICATION — metadata extraction, tone checks, simple routing
//
// Exposes:
//   callClaude()            — native Anthropic Messages call (system/tools/json)
//   chatCompletionCompat()  — OpenAI-/gateway-shaped shim for minimal-diff migration
//   Model constants + tier mapping helper
//
// Streaming is intentionally NOT handled here — the two streaming call sites
// (paige-ai-chat, broker-paige-chat) get a dedicated streaming path in R4.

const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";
const ANTHROPIC_VERSION = "2023-06-01";

export const CLAUDE_REASONING = "claude-sonnet-5";       // alias: auto-upgrades
export const CLAUDE_CLASSIFICATION = "claude-haiku-4-5"; // alias: auto-upgrades
export type ClaudeTier = "reasoning" | "classification";

function tierModel(tier: ClaudeTier): string {
  return tier === "reasoning" ? CLAUDE_REASONING : CLAUDE_CLASSIFICATION;
}

// Map a legacy gateway model string to a Paige tier, preserving the original
// cost/capability intent (pro/gpt-4 => reasoning; flash/lite/mini => classification).
export function tierForLegacyModel(model?: string): ClaudeTier {
  const m = (model ?? "").toLowerCase();
  if (/pro|gpt-4|opus|sonnet|o1|o3/.test(m)) return "reasoning";
  return "classification"; // flash, flash-lite, mini, haiku, unknown => cheap tier
}

export interface ClaudeMessage {
  role: "user" | "assistant";
  content: string | unknown[]; // string, or Anthropic content blocks (incl. tool_result)
}

export interface ClaudeCallOpts {
  messages: ClaudeMessage[];
  system?: string;
  tier?: ClaudeTier;          // default "reasoning"
  model?: string;             // explicit override wins over tier
  maxTokens?: number;         // default 2048
  temperature?: number;
  tools?: unknown[];          // Anthropic tool schema: {name, description, input_schema}
  toolChoice?: unknown;       // {type:"auto"|"any"|"tool", name?}
  stopSequences?: string[];
  signal?: AbortSignal;
}

export interface ClaudeToolUse { id: string; name: string; input: unknown }

export interface ClaudeResult {
  text: string;                 // concatenated text blocks ("" if none)
  toolUses: ClaudeToolUse[];    // tool_use blocks ([] if none)
  stopReason: string | null;
  usage: { input_tokens?: number; output_tokens?: number } | null;
  raw: unknown;
}

function apiKey(): string {
  const k = Deno.env.get("ANTHROPIC_API_KEY");
  if (!k) throw new Error("ANTHROPIC_API_KEY is not set");
  return k;
}

export async function callClaude(opts: ClaudeCallOpts): Promise<ClaudeResult> {
  const model = opts.model ?? tierModel(opts.tier ?? "reasoning");
  const body: Record<string, unknown> = {
    model,
    max_tokens: opts.maxTokens ?? 2048,
    messages: opts.messages,
  };
  if (opts.system) body.system = opts.system;
  if (opts.temperature != null) body.temperature = opts.temperature;
  if (opts.tools?.length) body.tools = opts.tools;
  if (opts.toolChoice) body.tool_choice = opts.toolChoice;
  if (opts.stopSequences?.length) body.stop_sequences = opts.stopSequences;

  const resp = await fetch(ANTHROPIC_URL, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": apiKey(),
      "anthropic-version": ANTHROPIC_VERSION,
    },
    body: JSON.stringify(body),
    signal: opts.signal,
  });

  if (!resp.ok) {
    const detail = await resp.text().catch(() => "");
    throw new Error(`Anthropic ${resp.status}: ${detail.slice(0, 500)}`);
  }
  const data = await resp.json();
  const blocks: unknown[] = Array.isArray(data?.content) ? data.content : [];
  const text = blocks
    .filter((b: any) => b?.type === "text")
    .map((b: any) => b.text)
    .join("");
  const toolUses: ClaudeToolUse[] = blocks
    .filter((b: any) => b?.type === "tool_use")
    .map((b: any) => ({ id: b.id, name: b.name, input: b.input }));
  return { text, toolUses, stopReason: data?.stop_reason ?? null, usage: data?.usage ?? null, raw: data };
}

// ---------------------------------------------------------------------------
// OpenAI-/gateway-compatible shim.
// Lets existing call sites migrate with a near-mechanical edit:
//   fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {..body:{model,messages,tools,response_format}})
//     -> chatCompletionCompat({model,messages,tools,response_format})
// Returns an OpenAI-shaped response so downstream `choices[0].message.content`
// / `tool_calls` parsing keeps working.
// ---------------------------------------------------------------------------
interface OpenAIStyleBody {
  model?: string;
  messages: { role: string; content: unknown }[];
  tools?: { type: string; function: { name: string; description?: string; parameters?: unknown } }[];
  tool_choice?: unknown;
  temperature?: number;
  max_tokens?: number;
  response_format?: { type?: string } | undefined;
}

export async function chatCompletionCompat(body: OpenAIStyleBody): Promise<any> {
  // Extract system message(s); Anthropic takes system as a top-level param.
  const systemParts: string[] = [];
  const msgs: ClaudeMessage[] = [];
  for (const m of body.messages ?? []) {
    const content = typeof m.content === "string" ? m.content : JSON.stringify(m.content);
    if (m.role === "system") { systemParts.push(content); continue; }
    if (m.role === "tool") {
      // OpenAI tool result -> Anthropic tool_result block on a user turn
      msgs.push({ role: "user", content: [{ type: "tool_result", tool_use_id: (m as any).tool_call_id, content }] });
      continue;
    }
    msgs.push({ role: m.role === "assistant" ? "assistant" : "user", content });
  }
  let system = systemParts.join("\n\n");

  // response_format json -> nudge via system (Anthropic has no json_object flag).
  if (body.response_format?.type && /json/.test(body.response_format.type)) {
    system = (system ? system + "\n\n" : "") +
      "Respond with a single valid JSON value only. No prose, no markdown fences.";
  }

  // Translate OpenAI tool schema -> Anthropic tool schema.
  const tools = body.tools?.map((t) => ({
    name: t.function.name,
    description: t.function.description ?? "",
    input_schema: t.function.parameters ?? { type: "object", properties: {} },
  }));

  const result = await callClaude({
    messages: msgs,
    system: system || undefined,
    model: undefined,
    tier: tierForLegacyModel(body.model),
    maxTokens: body.max_tokens ?? 2048,
    temperature: body.temperature,
    tools,
    toolChoice: body.tool_choice && tools?.length ? { type: "auto" } : undefined,
  });

  const tool_calls = result.toolUses.map((tu) => ({
    id: tu.id,
    type: "function",
    function: { name: tu.name, arguments: JSON.stringify(tu.input ?? {}) },
  }));

  return {
    id: (result.raw as any)?.id ?? "msg",
    object: "chat.completion",
    model: (result.raw as any)?.model,
    choices: [{
      index: 0,
      finish_reason: result.stopReason === "tool_use" ? "tool_calls" : "stop",
      message: {
        role: "assistant",
        content: result.text || null,
        ...(tool_calls.length ? { tool_calls } : {}),
      },
    }],
    usage: result.usage
      ? { prompt_tokens: result.usage.input_tokens, completion_tokens: result.usage.output_tokens }
      : undefined,
  };
}

// Drop-in replacement for `fetch(gatewayUrl, init)` on NON-streaming chat calls.
// Returns a Response-like object so existing `.ok` / `.status` / `await x.json()`
// handling keeps working unchanged — the only migration edit at a call site is
// swapping `fetch("https://ai.gateway.lovable.dev/v1/chat/completions", init)`
// for `gatewayCompat("anthropic", init)`. (Streaming call sites are handled
// separately; do NOT use this for stream:true requests.)
export async function gatewayCompat(
  _url: string,
  init: { body?: string; method?: string; headers?: unknown },
): Promise<{ ok: boolean; status: number; json: () => Promise<any>; text: () => Promise<string> }> {
  try {
    const parsed = init?.body ? JSON.parse(init.body) : {};
    const data = await chatCompletionCompat(parsed);
    return { ok: true, status: 200, json: async () => data, text: async () => JSON.stringify(data) };
  } catch (e) {
    const msg = String((e as Error)?.message ?? e);
    const m = msg.match(/Anthropic (\d{3})/);
    const status = m ? Number(m[1]) : 500;
    return { ok: false, status, json: async () => ({ error: msg }), text: async () => msg };
  }
}

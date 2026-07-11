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

// ---------------------------------------------------------------------------
// Translate an OpenAI-/gateway-style message list into Anthropic messages.
// This is the ONE place that must get tool-calling right — the tool loop sends
// back an assistant turn carrying `tool_calls` followed by `tool` results, and
// Anthropic needs (a) the assistant `tool_use` blocks so each `tool_result` has
// a matching id, and (b) consecutive tool_results merged onto ONE user turn
// (Anthropic requires alternating roles). Missing (a) was the Lovable→Anthropic
// regression that broke every tool-using turn ("couldn't finish that").
// ---------------------------------------------------------------------------
interface OaiMessage { role: string; content: unknown; tool_calls?: any[]; tool_call_id?: string }

// Translate an OpenAI-style message content (string OR a blocks array that may carry
// image_url / file / data-URI attachments) into Anthropic content. A plain string stays
// a string; a blocks array maps text→text and data-URI images/PDFs→Anthropic image/document
// blocks. Without this, multimodal content was JSON.stringify'd and the model saw no image.
function toClaudeContent(c: unknown): string | any[] {
  if (typeof c === "string") return c;
  if (!Array.isArray(c)) return c == null ? "" : JSON.stringify(c);
  const blocks: any[] = [];
  for (const b of c as any[]) {
    if (b == null) continue;
    if (b.type === "text" && typeof b.text === "string") { blocks.push({ type: "text", text: b.text }); continue; }
    // Already-Anthropic blocks pass straight through.
    if (b.type === "image" || b.type === "document" || b.type === "tool_result" || b.type === "tool_use") { blocks.push(b); continue; }
    // OpenAI image_url / file blocks — accept a data: URI and split out media type + base64.
    const dataUrl: string | undefined =
      b.type === "image_url" ? b.image_url?.url :
      b.type === "file" ? (b.file?.file_data ?? b.file?.url ?? b.data) :
      typeof b.url === "string" ? b.url : undefined;
    const m = typeof dataUrl === "string" ? dataUrl.match(/^data:([^;]+);base64,(.*)$/s) : null;
    if (m) {
      const media = m[1]; const data = m[2];
      if (media === "application/pdf") blocks.push({ type: "document", source: { type: "base64", media_type: media, data } });
      else if (media.startsWith("image/")) blocks.push({ type: "image", source: { type: "base64", media_type: media, data } });
      else blocks.push({ type: "text", text: `[unsupported attachment: ${media}]` });
      continue;
    }
    blocks.push({ type: "text", text: typeof b === "string" ? b : JSON.stringify(b) });
  }
  return blocks.length ? blocks : "";
}

function splitMessages(messages: OaiMessage[]): { system: string; msgs: ClaudeMessage[] } {
  const asStr = (c: unknown) => (typeof c === "string" ? c : c == null ? "" : JSON.stringify(c));
  const systemParts: string[] = [];
  const raw: ClaudeMessage[] = [];
  for (const m of messages ?? []) {
    if (m.role === "system") { systemParts.push(asStr(m.content)); continue; }
    if (m.role === "tool") {
      raw.push({ role: "user", content: [{ type: "tool_result", tool_use_id: m.tool_call_id, content: asStr(m.content) }] });
      continue;
    }
    if (m.role === "assistant" && Array.isArray(m.tool_calls) && m.tool_calls.length) {
      const blocks: any[] = [];
      const txt = asStr(m.content);
      if (txt && txt !== "null") blocks.push({ type: "text", text: txt });
      for (const tc of m.tool_calls) {
        let input: unknown = {};
        try { input = tc?.function?.arguments ? JSON.parse(tc.function.arguments) : {}; } catch { input = {}; }
        blocks.push({ type: "tool_use", id: tc.id, name: tc?.function?.name, input });
      }
      raw.push({ role: "assistant", content: blocks });
      continue;
    }
    raw.push({ role: m.role === "assistant" ? "assistant" : "user", content: toClaudeContent(m.content) });
  }
  // Coalesce consecutive same-role turns (batches multiple tool_results onto one
  // user turn; keeps roles alternating).
  const toBlocks = (c: unknown): any[] => (Array.isArray(c) ? c : [{ type: "text", text: typeof c === "string" ? c : JSON.stringify(c) }]);
  const msgs: ClaudeMessage[] = [];
  for (const m of raw) {
    const last = msgs[msgs.length - 1];
    if (last && last.role === m.role) {
      last.content = [...toBlocks(last.content), ...toBlocks(m.content)];
    } else {
      msgs.push({ role: m.role, content: m.content });
    }
  }
  return { system: systemParts.join("\n\n"), msgs };
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

export async function chatCompletionCompat(body: OpenAIStyleBody, tierOverride?: ClaudeTier): Promise<any> {
  // Extract system + translate messages (incl. assistant tool_calls -> tool_use).
  const { system: sys0, msgs } = splitMessages(body.messages as OaiMessage[]);
  let system = sys0;

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
    tier: tierOverride ?? tierForLegacyModel(body.model),
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
// Translate an OpenAI-/gateway-style body into an Anthropic Messages request object.
function buildClaudeRequest(body: OpenAIStyleBody): Record<string, unknown> {
  const { system: sys0, msgs } = splitMessages(body.messages as OaiMessage[]);
  let system = sys0;
  if (body.response_format?.type && /json/.test(body.response_format.type)) {
    system = (system ? system + "\n\n" : "") +
      "Respond with a single valid JSON value only. No prose, no markdown fences.";
  }
  const tools = body.tools?.map((t) => ({
    name: t.function.name,
    description: t.function.description ?? "",
    input_schema: t.function.parameters ?? { type: "object", properties: {} },
  }));
  const req: Record<string, unknown> = {
    model: tierModel(tierForLegacyModel(body.model)),
    max_tokens: body.max_tokens ?? 2048,
    messages: msgs,
  };
  if (system) req.system = system;
  if (body.temperature != null) req.temperature = body.temperature;
  if (tools?.length) { req.tools = tools; req.tool_choice = body.tool_choice ? { type: "auto" } : { type: "auto" }; }
  return req;
}

// Call Anthropic with stream:true and translate its SSE events into OpenAI-style
// SSE (`data: {choices:[{delta:{content|tool_calls}, finish_reason}]}` ... `data: [DONE]`),
// so existing frontends/edge readers that parse the OpenAI stream keep working.
async function streamAnthropicAsOpenAI(
  reqBody: Record<string, unknown>,
): Promise<{ ok: boolean; status: number; body?: ReadableStream<Uint8Array> }> {
  const resp = await fetch(ANTHROPIC_URL, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": apiKey(),
      "anthropic-version": ANTHROPIC_VERSION,
    },
    body: JSON.stringify({ ...reqBody, stream: true }),
  });
  if (!resp.ok || !resp.body) return { ok: false, status: resp.status };

  const enc = new TextEncoder();
  const dec = new TextDecoder();
  const upstream = resp.body.getReader();
  const send = (c: ReadableStreamDefaultController<Uint8Array>, obj: unknown) =>
    c.enqueue(enc.encode(`data: ${JSON.stringify(obj)}\n\n`));

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let buf = "";
      let toolIndex = -1;
      const blockToTool = new Map<number, number>();
      let stopReason = "end_turn";
      send(controller, { choices: [{ index: 0, delta: { role: "assistant" }, finish_reason: null }] });
      try {
        while (true) {
          const { done, value } = await upstream.read();
          if (done) break;
          buf += dec.decode(value, { stream: true });
          const lines = buf.split("\n");
          buf = lines.pop() ?? "";
          for (const line of lines) {
            const t = line.trim();
            if (!t.startsWith("data:")) continue;
            const js = t.slice(5).trim();
            if (!js) continue;
            let ev: any;
            try { ev = JSON.parse(js); } catch { continue; }
            if (ev.type === "content_block_start" && ev.content_block?.type === "tool_use") {
              toolIndex++;
              blockToTool.set(ev.index, toolIndex);
              send(controller, { choices: [{ index: 0, delta: { tool_calls: [{ index: toolIndex, id: ev.content_block.id, type: "function", function: { name: ev.content_block.name, arguments: "" } }] }, finish_reason: null }] });
            } else if (ev.type === "content_block_delta") {
              if (ev.delta?.type === "text_delta") {
                send(controller, { choices: [{ index: 0, delta: { content: ev.delta.text }, finish_reason: null }] });
              } else if (ev.delta?.type === "input_json_delta") {
                const ti = blockToTool.get(ev.index) ?? 0;
                send(controller, { choices: [{ index: 0, delta: { tool_calls: [{ index: ti, function: { arguments: ev.delta.partial_json } }] }, finish_reason: null }] });
              }
            } else if (ev.type === "message_delta" && ev.delta?.stop_reason) {
              stopReason = ev.delta.stop_reason;
            } else if (ev.type === "message_stop") {
              send(controller, { choices: [{ index: 0, delta: {}, finish_reason: stopReason === "tool_use" ? "tool_calls" : "stop" }] });
            }
          }
        }
      } catch (_e) {
        // fall through to DONE so the client stream terminates cleanly
      } finally {
        controller.enqueue(enc.encode("data: [DONE]\n\n"));
        controller.close();
      }
    },
  });
  return { ok: true, status: 200, body: stream };
}

export async function gatewayCompat(
  _url: string,
  init: { body?: string; method?: string; headers?: unknown },
): Promise<{ ok: boolean; status: number; body?: ReadableStream<Uint8Array>; json: () => Promise<any>; text: () => Promise<string> }> {
  const parsed: OpenAIStyleBody & { stream?: boolean } = init?.body ? JSON.parse(init.body) : ({} as any);
  try {
    if (parsed.stream === true) {
      const r = await streamAnthropicAsOpenAI(buildClaudeRequest(parsed));
      return { ok: r.ok, status: r.status, body: r.body, json: async () => ({}), text: async () => "" };
    }
    const data = await chatCompletionCompat(parsed);
    return { ok: true, status: 200, json: async () => data, text: async () => JSON.stringify(data) };
  } catch (e) {
    const msg = String((e as Error)?.message ?? e);
    const m = msg.match(/Anthropic (\d{3})/);
    const status = m ? Number(m[1]) : 500;
    return { ok: false, status, json: async () => ({ error: msg }), text: async () => msg };
  }
}

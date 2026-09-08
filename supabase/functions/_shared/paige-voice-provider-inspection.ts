// Server-only metadata inspection. This is not a capability, retention, or activation attestation.
// Credentials and provider bodies remain inside this function; callers receive allowlisted facts.
export type InspectionTransport = "not_attempted" | "ok" | "unauthorized" | "forbidden" | "not_found" | "rate_limited" | "provider_error" | "redirect_refused" | "response_too_large" | "invalid_response" | "network_error" | "timeout";
const STATUSES = ["active", "trialing", "past_due", "unpaid", "canceled", "incomplete", "incomplete_expired", "paused", "free"] as const;
const TIERS = ["free", "starter", "creator", "pro", "scale", "business", "enterprise"] as const;
export interface VoiceProviderInspection {
  code: "metadata_only" | "not_configured" | "invalid_voice_reference";
  subscription: { transport: InspectionTransport; status: typeof STATUSES[number] | "unknown"; tier: typeof TIERS[number] | "other"; characterCount: number | null; characterLimit: number | null; creditLimitExtension: number | "unlimited" | null };
  voice: { transport: InspectionTransport; accessible: boolean; referenceMatches: boolean };
}
const MAX_BYTES = 65_536;
const TIMEOUT_MS = 8_000;
const integer = (value: unknown): number | null => typeof value === "number" && Number.isSafeInteger(value) && value >= 0 ? value : null;
type ReadResult = { transport: InspectionTransport; body?: Record<string, unknown> };

async function readMetadata(url: string, apiKey: string, fetcher: typeof fetch): Promise<ReadResult> {
  const controller = new AbortController();
  let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const work = async (): Promise<ReadResult> => {
    try {
      const response = await fetcher(url, { method: "GET", headers: { "xi-api-key": apiKey, accept: "application/json" }, redirect: "error", cache: "no-store", signal: controller.signal });
      if (controller.signal.aborted) { void response.body?.cancel().catch(() => {}); return { transport: "timeout" }; }
      const status = response.status;
      if (status !== 200 || response.redirected) {
        void response.body?.cancel().catch(() => {});
        return { transport: response.redirected || (status >= 300 && status < 400) ? "redirect_refused" : status === 401 ? "unauthorized" : status === 403 ? "forbidden" : status === 404 ? "not_found" : status === 429 ? "rate_limited" : "provider_error" };
      }
      if (Number(response.headers.get("content-length")) > MAX_BYTES) { void response.body?.cancel().catch(() => {}); return { transport: "response_too_large" }; }
      if (!response.body) return { transport: "invalid_response" };
      reader = response.body.getReader();
      const chunks: Uint8Array[] = [];
      let size = 0;
      for (;;) {
        const { done, value } = await reader.read();
        if (controller.signal.aborted) return { transport: "timeout" };
        if (done) break;
        size += value.byteLength;
        if (size > MAX_BYTES) { void reader.cancel().catch(() => {}); return { transport: "response_too_large" }; }
        chunks.push(value);
      }
      const bytes = new Uint8Array(size);
      let offset = 0;
      for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
      try {
        const body: unknown = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
        return body && typeof body === "object" && !Array.isArray(body) ? { transport: "ok", body: body as Record<string, unknown> } : { transport: "invalid_response" };
      } catch { return { transport: "invalid_response" }; }
    } catch { return { transport: controller.signal.aborted ? "timeout" : "network_error" }; }
  };
  try {
    return await Promise.race([work(), new Promise<ReadResult>(resolve => {
      timer = setTimeout(() => { controller.abort(); void reader?.cancel().catch(() => {}); resolve({ transport: "timeout" }); }, TIMEOUT_MS);
    })]);
  } finally { if (timer !== undefined) clearTimeout(timer); }
}

/** Fixed read-only provider endpoints. Never pass caller-supplied credentials/reference here:
 * endpoint integration must resolve both server-side after platform-owner authentication. */
export async function inspectConfiguredVoiceProvider({ apiKey, voiceRef, fetcher = fetch }: { apiKey: string | null | undefined; voiceRef: string; fetcher?: typeof fetch }): Promise<VoiceProviderInspection> {
  const result: VoiceProviderInspection = {
    code: "metadata_only",
    subscription: { transport: "not_attempted", status: "unknown", tier: "other", characterCount: null, characterLimit: null, creditLimitExtension: null },
    voice: { transport: "not_attempted", accessible: false, referenceMatches: false },
  };
  if (!apiKey?.trim()) return { ...result, code: "not_configured" };
  if (!/^[A-Za-z0-9]{8,128}$/.test(voiceRef)) return { ...result, code: "invalid_voice_reference" };
  const [subscription, voice] = await Promise.all([
    readMetadata("https://api.elevenlabs.io/v1/user/subscription", apiKey, fetcher),
    readMetadata(`https://api.elevenlabs.io/v1/voices/${encodeURIComponent(voiceRef)}`, apiKey, fetcher),
  ]);
  const body = subscription.body;
  result.subscription = {
    transport: subscription.transport,
    status: STATUSES.find(status => status === body?.status) ?? "unknown",
    tier: TIERS.find(tier => tier === body?.tier) ?? "other",
    characterCount: integer(body?.character_count), characterLimit: integer(body?.character_limit),
    creditLimitExtension: body?.max_credit_limit_extension === "unlimited" ? "unlimited" : integer(body?.max_credit_limit_extension),
  };
  const matches = voice.transport === "ok" && voice.body?.voice_id === voiceRef;
  result.voice = { transport: voice.transport, accessible: matches, referenceMatches: matches };
  return result;
}

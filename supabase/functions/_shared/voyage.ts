// _shared/voyage.ts
// Voyage AI embeddings for Paige edge functions (Anthropic-ecosystem partner).
// Replaces OpenAI text-embedding-3-small (1536) and Gemini gemini-embedding-001 (3072).
//
// NOTE (pending Antonio confirm): default model voyage-3 => 1024 dimensions.
// The pgvector columns must be sized to VOYAGE_DIMS via the R5 schema migration,
// and every embed call site must use the SAME model so vectors are comparable.

const VOYAGE_URL = "https://api.voyageai.com/v1/embeddings";
export const VOYAGE_MODEL = "voyage-3";
export const VOYAGE_DIMS = 1024; // must match the vector(N) column definitions

export type VoyageInputType = "query" | "document";

function apiKey(): string {
  const k = Deno.env.get("VOYAGE_API_KEY");
  if (!k) throw new Error("VOYAGE_API_KEY is not set");
  return k;
}

export interface VoyageOpts {
  model?: string;
  inputType?: VoyageInputType; // "document" when embedding stored content, "query" at search time
  signal?: AbortSignal;
}

// Embed one or many strings. Always returns an array of vectors, aligned to input order.
export async function voyageEmbed(
  input: string | string[],
  opts: VoyageOpts = {},
): Promise<number[][]> {
  const inputs = Array.isArray(input) ? input : [input];
  if (inputs.length === 0) return [];

  const resp = await fetch(VOYAGE_URL, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${apiKey()}`,
    },
    body: JSON.stringify({
      input: inputs,
      model: opts.model ?? VOYAGE_MODEL,
      ...(opts.inputType ? { input_type: opts.inputType } : {}),
    }),
    signal: opts.signal,
  });

  if (!resp.ok) {
    const detail = await resp.text().catch(() => "");
    throw new Error(`Voyage ${resp.status}: ${detail.slice(0, 500)}`);
  }
  const data = await resp.json();
  const rows: { index: number; embedding: number[] }[] = data?.data ?? [];
  // Preserve input order regardless of response ordering.
  return rows
    .slice()
    .sort((a, b) => a.index - b.index)
    .map((r) => r.embedding);
}

// Convenience for the common single-string case.
export async function voyageEmbedOne(text: string, opts: VoyageOpts = {}): Promise<number[]> {
  const [v] = await voyageEmbed(text, opts);
  return v;
}

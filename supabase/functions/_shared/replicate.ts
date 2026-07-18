// _shared/replicate.ts — Replicate provider client for the Vibe Studio model router.
//
// Replicate hosts the premium image models (Flux Pro/Dev/Schnell/Kontext) for the
// image open-flexible lane, and serves as the 3D backup when Meshy is unavailable. The API is
// async: create a prediction, then poll until it succeeds/fails. We poll with a bounded
// timeout so a stuck prediction degrades to a typed error, never an infinite hang.
//
// FAIL-CLOSED (doctrine §13): REPLICATE_API_TOKEN is read at CALL time; if absent we throw
// NeedsConfigError("replicate"). Token sent as the Authorization header only — never logged/
// echoed/placed in a result. Returns a vendor-hosted URL (artifact_url) the router re-hosts.

import { NeedsConfigError, type ProviderCallResult } from "./provider-types.ts";
import { envKey } from "./env-key.ts";

const REPLICATE_BASE = Deno.env.get("REPLICATE_BASE_URL") ?? "https://api.replicate.com/v1";
const POLL_TIMEOUT_MS = 180_000; // 3 min — Flux/premium renders can take a while
const POLL_INTERVAL_MS = 2_000;

function replicateToken(): string {
  // Accept EITHER the canonical REPLICATE_API_TOKEN or the common REPLICATE_API_KEY alias — operators
  // set it under both names in the wild, and a name mismatch is exactly the kind of silent gap that
  // masquerades as "not configured" (§13). Whichever is present wins (now case-tolerant too, via
  // envKey); only when NEITHER is set do we fail closed.
  const k = envKey("REPLICATE_API_TOKEN", "REPLICATE_API_KEY");
  if (!k) throw new NeedsConfigError("replicate");
  return k;
}

export interface ReplicateRunInput {
  model: string; // official slug "owner/name", or "owner/name:versionHash", or a bare 64-char version hash
  input: Record<string, unknown>;
}

/**
 * Run a Replicate model to completion. Creates the prediction, polls until terminal, and
 * returns the first output URL as artifact_url. Throws a typed Error on failure/timeout.
 */
export async function replicateRun(args: ReplicateRunInput): Promise<ProviderCallResult> {
  const token = replicateToken();
  const started = Date.now();
  const authHeaders = { authorization: `Bearer ${token}`, "content-type": "application/json" };

  // Two creation shapes: an official-model slug posts to /models/{slug}/predictions with just
  // {input}; a pinned version (bare hash, or owner/name:hash) posts to /predictions with {version}.
  const { createUrl, createBody } = buildCreate(args);
  const createResp = await fetch(createUrl, {
    method: "POST",
    headers: authHeaders,
    body: JSON.stringify(createBody),
  });
  if (!createResp.ok) {
    const detail = await createResp.text().catch(() => "");
    throw new Error(`Replicate ${createResp.status}: ${detail.slice(0, 500)}`);
  }
  let prediction = await createResp.json();

  // Poll the prediction's own get URL until terminal or timeout.
  const getUrl: string = prediction?.urls?.get ?? `${REPLICATE_BASE}/predictions/${prediction?.id}`;
  const deadline = Date.now() + POLL_TIMEOUT_MS;
  while (!isTerminal(prediction?.status)) {
    if (Date.now() > deadline) throw new Error(`Replicate: prediction timed out after ${POLL_TIMEOUT_MS}ms`);
    await sleep(POLL_INTERVAL_MS);
    const pollResp = await fetch(getUrl, { headers: authHeaders });
    if (!pollResp.ok) {
      const detail = await pollResp.text().catch(() => "");
      throw new Error(`Replicate poll ${pollResp.status}: ${detail.slice(0, 500)}`);
    }
    prediction = await pollResp.json();
  }

  if (prediction?.status !== "succeeded") {
    throw new Error(`Replicate prediction ${prediction?.status}: ${String(prediction?.error ?? "").slice(0, 300)}`);
  }

  const url = firstOutputUrl(prediction?.output);
  if (!url) throw new Error("Replicate: prediction succeeded but no output url");
  return {
    artifact_url: url,
    provider: "replicate",
    model: args.model,
    latency_ms: Date.now() - started,
  };
}

function buildCreate(args: ReplicateRunInput): { createUrl: string; createBody: Record<string, unknown> } {
  const m = args.model.trim();
  // "owner/name:versionHash" — pinned version of a slug.
  if (m.includes(":")) {
    const version = m.slice(m.indexOf(":") + 1);
    return { createUrl: `${REPLICATE_BASE}/predictions`, createBody: { version, input: args.input } };
  }
  // Bare 64-char version hash.
  if (/^[0-9a-f]{64}$/i.test(m)) {
    return { createUrl: `${REPLICATE_BASE}/predictions`, createBody: { version: m, input: args.input } };
  }
  // Official-model slug "owner/name".
  return { createUrl: `${REPLICATE_BASE}/models/${m}/predictions`, createBody: { input: args.input } };
}

function isTerminal(status: unknown): boolean {
  return status === "succeeded" || status === "failed" || status === "canceled";
}

// Replicate output is a string url, an array of urls, or an object of urls — normalize to first.
function firstOutputUrl(output: unknown): string | undefined {
  if (typeof output === "string") return output;
  if (Array.isArray(output)) {
    const first = output.find((o) => typeof o === "string");
    return typeof first === "string" ? first : undefined;
  }
  if (output && typeof output === "object") {
    const v = Object.values(output as Record<string, unknown>).find((o) => typeof o === "string");
    return typeof v === "string" ? v : undefined;
  }
  return undefined;
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

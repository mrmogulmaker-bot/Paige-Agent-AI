/**
 * fal.ai adapter — the first ASYNC implementation of the media-provider seam.
 *
 * Queue mechanics (fal docs, read-only verification 2026-09-12 — no paid calls
 * were made to determine any of this):
 *   submit  POST   https://queue.fal.run/{model}?fal_webhook=<url>
 *                  Authorization: Key <FAL_KEY>
 *   status  GET    https://queue.fal.run/{model}/requests/{id}/status
 *                  → IN_QUEUE | IN_PROGRESS | COMPLETED (+ queue_position)
 *   result  GET    https://queue.fal.run/{model}/requests/{id}
 *   cancel  PUT    https://queue.fal.run/{model}/requests/{id}/cancel
 *                  → 202 CANCELLATION_REQUESTED | 400 ALREADY_COMPLETED | 404
 *
 * Webhook completion is verified by paige-media-webhook (ED25519 via fal's JWKS
 * — see that function); polling here is the recovery path, not the primary.
 *
 * FAIL-CLOSED (§13): FAL_KEY is read at CALL time; absent → NeedsConfigError.
 * The key travels ONLY in the Authorization header — never logged, echoed, or
 * placed in a job row, receipt, or Rail event.
 *
 * Retention: outputs land on fal's CDN with a configurable lifecycle; we send
 * X-Fal-Object-Lifecycle-Preference (default "medium", env-overridable) and the
 * seam copies bytes into Paige Storage on completion — the provider URL is never
 * the canonical source, and deletion-at-provider is a follow-up call the sweeper
 * may make once the copy is verified.
 */

import { NeedsConfigError } from "../provider-types.ts";
import { envKey } from "../env-key.ts";
import {
  COMMERCIAL_USE_DISCLOSURE,
  estimateFromCatalog,
  type MediaModelInfo,
  type MediaMode,
  type MediaProviderAdapter,
  type PollResult,
  type ProviderRef,
  type SubmitInput,
} from "./mod.ts";

// Module-level env reads are guarded so vitest (no Deno global) can import this
// module for adapter contract tests.
function env(name: string): string | undefined {
  const d = (globalThis as { Deno?: { env?: { get(n: string): string | undefined } } }).Deno;
  return d?.env?.get(name);
}

const QUEUE_BASE = env("FAL_QUEUE_BASE_URL") ?? "https://queue.fal.run";
/** CDN lifecycle preference sent on every submit (env-overridable config-as-data). */
const LIFECYCLE_PREFERENCE = env("FAL_MEDIA_LIFECYCLE") ?? "medium";

function falKey(): string {
  const k = envKey("FAL_KEY", "FAL_API_KEY");
  if (!k) throw new NeedsConfigError("fal");
  return k;
}

/**
 * Curated catalog. Model ids are env-overridable so the owner can pin/upgrade a
 * variant platform-wide without a deploy (§10). Prices are ESTIMATES from fal's
 * public pricing as of the due-diligence record (2026-09-12) — labeled as
 * estimates everywhere they surface; actual_cost_usd stays null until a provider
 * cost readback is owner-approved.
 */
function catalog(): MediaModelInfo[] {
  return [
    {
      id: env("FAL_IMAGE_MODEL_STANDARD") ?? "fal-ai/nano-banana",
      label: "Nano Banana",
      mode: "image",
      tier: "standard",
      estCostPerUnitUsd: 0.039,
      unit: "image",
    },
    {
      id: env("FAL_IMAGE_MODEL_PREMIUM") ?? "fal-ai/flux-pro/v1.1",
      label: "Flux Pro 1.1",
      mode: "image",
      tier: "premium",
      estCostPerUnitUsd: 0.04,
      unit: "image",
    },
    {
      id: env("FAL_EDIT_MODEL") ?? "fal-ai/nano-banana/edit",
      label: "Nano Banana Edit",
      mode: "image_edit",
      tier: "standard",
      estCostPerUnitUsd: 0.039,
      unit: "image",
    },
    // Veo 3.1 family (2026-09-12 correction): fal deprecated fal-ai/veo3 and veo3/fast —
    // the live endpoints are veo3.1/fast and veo3.1. Estimates are the AUDIO-ON rates
    // ($0.15/s fast, $0.40/s standard; hi-res tiers run to $0.60/s), verified against
    // fal's model pages. Video remains flag-gated + per-job approval regardless.
    {
      id: env("FAL_VIDEO_MODEL") ?? "fal-ai/veo3.1/fast",
      label: "Veo 3.1 Fast",
      mode: "video",
      tier: "standard",
      estCostPerUnitUsd: 0.15,
      unit: "second",
    },
    {
      id: env("FAL_VIDEO_MODEL_PREMIUM") ?? "fal-ai/veo3.1",
      label: "Veo 3.1",
      mode: "video",
      tier: "premium",
      estCostPerUnitUsd: 0.4,
      unit: "second",
    },
  ];
}

export const falAdapter: MediaProviderAdapter = {
  name: "fal",

  isConfigured(): boolean {
    return !!envKey("FAL_KEY", "FAL_API_KEY");
  },

  getCapabilities() {
    return {
      provider: "fal" as const,
      execution: "async" as const,
      models: catalog(),
      configured: falAdapter.isConfigured(),
    };
  },

  getLicenseClass() {
    return {
      licenseClass: "provider_and_model_terms",
      commercialUse: "conditional" as const,
      disclosure: COMMERCIAL_USE_DISCLOSURE,
    };
  },

  getRetentionPolicy() {
    return {
      policy: `fal CDN with X-Fal-Object-Lifecycle-Preference=${LIFECYCLE_PREFERENCE}; at least 7 days guaranteed`,
      copyDeadline: "Paige copies the asset into its own Storage on completion; the provider URL is never canonical",
    };
  },

  estimateCost(input: { mode: MediaMode; model: string; videoSeconds?: number }) {
    return estimateFromCatalog(catalog(), input);
  },

  async submit(input: SubmitInput): Promise<{ providerRequestId: string }> {
    const key = falKey();
    const url = new URL(`${QUEUE_BASE}/${input.model}`);
    if (input.webhookUrl) url.searchParams.set("fal_webhook", input.webhookUrl);

    const body: Record<string, unknown> = { prompt: input.prompt };
    if (input.aspectRatio) body.aspect_ratio = input.aspectRatio;
    // image_edit: reference images travel as provider-fetchable urls.
    if (input.referenceUrls?.length) body.image_urls = input.referenceUrls;
    if (input.mode === "video") {
      // Veo 3.1's schema: DurationEnum "4s" | "6s" | "8s" (a bare number 422s —
      // found live by the controlled proof). Snap to the nearest allowed value.
      const allowed = [4, 6, 8];
      const want = Math.max(1, Math.min(12, Math.round(input.videoSeconds ?? 5)));
      const snapped = allowed.reduce((best, v) => Math.abs(v - want) < Math.abs(best - want) ? v : best, allowed[0]);
      body.duration = `${snapped}s`;
    }

    const resp = await fetch(url.toString(), {
      method: "POST",
      headers: {
        authorization: `Key ${key}`,
        "content-type": "application/json",
        "x-fal-object-lifecycle-preference": LIFECYCLE_PREFERENCE,
      },
      body: JSON.stringify(body),
    });
    if (!resp.ok) {
      const detail = await resp.text().catch(() => "");
      // 401/403 → the secret is present but invalid: distinct, honest signal.
      if (resp.status === 401 || resp.status === 403) {
        throw new Error(`fal rejected the credential (${resp.status}). Check the FAL_KEY secret.`);
      }
      throw new Error(`fal submit ${resp.status}: ${detail.slice(0, 300)}`);
    }
    const data = await resp.json();
    const requestId = data?.request_id;
    if (!requestId) throw new Error("fal submit returned no request_id");
    return { providerRequestId: String(requestId) };
  },

  async poll(ref: ProviderRef): Promise<PollResult> {
    const key = falKey();
    const resp = await fetch(`${QUEUE_BASE}/${ref.model}/requests/${encodeURIComponent(ref.providerRequestId)}/status`, {
      headers: { authorization: `Key ${key}` },
    });
    if (resp.status === 404 || resp.status === 405) {
      // Observed live (2026-09-13): the status route can vanish once a request
      // completes. Report COMPLETED so the caller proceeds to fetchResult —
      // the result fetch is the authority on whether the artifact survives.
      return { status: "COMPLETED" };
    }
    if (!resp.ok) {
      const detail = await resp.text().catch(() => "");
      throw new Error(`fal status ${resp.status}: ${detail.slice(0, 300)}`);
    }
    const data = await resp.json();
    const status = data?.status;
    if (status === "IN_QUEUE") return { status: "IN_QUEUE", queuePosition: data?.queue_position };
    if (status === "IN_PROGRESS") return { status: "IN_PROGRESS" };
    if (status === "COMPLETED") return { status: "COMPLETED" };
    throw new Error(`fal status returned unknown state "${String(status).slice(0, 80)}"`);
  },

  async fetchResult(ref: ProviderRef): Promise<{ artifactUrls: string[] }> {
    const key = falKey();
    // fal documents BOTH result forms: the submit response's `response_url`
    // (.../requests/{id}/response) and the bare queue GET (.../requests/{id}).
    // Some models (nano-banana observed live, 2026-09-12) return output only at
    // the /response form, so try it FIRST and fall back to the bare form.
    const id = encodeURIComponent(ref.providerRequestId);
    const attempts = [`${QUEUE_BASE}/${ref.model}/requests/${id}/response`, `${QUEUE_BASE}/${ref.model}/requests/${id}`];
    let lastDetail = "";
    for (const url of attempts) {
      const resp = await fetch(url, { headers: { authorization: `Key ${key}` } });
      if (!resp.ok) {
        lastDetail = `${resp.status}: ${(await resp.text().catch(() => "")).slice(0, 200)}`;
        continue;
      }
      const data = await resp.json().catch(() => null);
      // The /response form IS the output; the bare form nests it under `output`.
      const urls = normalizeFalOutput(data?.output ?? data);
      if (urls.length) return { artifactUrls: urls };
      lastDetail = "no artifact url in payload";
    }
    throw new Error(`fal result carried no artifact url (${lastDetail})`);
  },

  async cancel(ref: ProviderRef) {
    const key = falKey();
    const resp = await fetch(`${QUEUE_BASE}/${ref.model}/requests/${encodeURIComponent(ref.providerRequestId)}/cancel`, {
      method: "PUT",
      headers: { authorization: `Key ${key}` },
    });
    if (resp.status === 202) return { requested: true };
    if (resp.status === 400) return { requested: false, alreadyCompleted: true };
    if (resp.status === 404) return { requested: false, notFound: true };
    const detail = await resp.text().catch(() => "");
    throw new Error(`fal cancel ${resp.status}: ${detail.slice(0, 300)}`);
  },

  // fal is async; the sync shape does not apply.
  async execute(): Promise<never> {
    throw new Error("fal is an async adapter; use submit/poll/fetchResult");
  },
};

/**
 * fal outputs vary by model family: images arrive as {images:[{url}]}, video as
 * {video:{url}}, some as bare strings/arrays. Normalize to url list. Exported
 * for contract tests.
 */
export function normalizeFalOutput(output: unknown): string[] {
  const urls: string[] = [];
  const push = (v: unknown) => {
    if (typeof v === "string" && v.startsWith("http")) urls.push(v);
  };
  if (Array.isArray(output)) {
    for (const v of output) push(v);
    return urls;
  }
  if (!output || typeof output !== "object") {
    push(output);
    return urls;
  }
  const o = output as Record<string, unknown>;
  if (Array.isArray(o.images)) {
    for (const img of o.images) push((img as Record<string, unknown> | null)?.url ?? img);
  }
  if (o.video && typeof o.video === "object") push((o.video as Record<string, unknown>).url);
  push(o.image);
  push(o.url);
  if (Array.isArray(o.output)) for (const v of o.output) push(v);
  return urls;
}

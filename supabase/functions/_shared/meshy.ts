// _shared/meshy.ts — Meshy provider client for the Vibe Studio model router.
//
// Meshy is the 3D-primary lane: text → a 3D mesh (.glb). The API is async — create a
// text-to-3d task, then poll until SUCCEEDED. We poll with a bounded timeout so a stuck task
// degrades to a typed error, never an infinite hang. (Replicate is the router's 3D backup.)
//
// FAIL-CLOSED (doctrine §13): MESHY_API_KEY is read at CALL time; if absent we throw
// NeedsConfigError("meshy"). Key sent as the Authorization header only — never logged/echoed/
// placed in a result. Returns the vendor-hosted .glb URL (artifact_url) the router re-hosts.

import { NeedsConfigError, type ProviderCallResult } from "./provider-types.ts";

const MESHY_BASE = Deno.env.get("MESHY_BASE_URL") ?? "https://api.meshy.ai";
const POLL_TIMEOUT_MS = 300_000; // 5 min — mesh generation is slow
const POLL_INTERVAL_MS = 5_000;
const MODEL_TAG = "meshy-text-to-3d"; // reported as the model id in the result

function meshyKey(): string {
  const k = Deno.env.get("MESHY_API_KEY");
  if (!k) throw new NeedsConfigError("meshy");
  return k;
}

export interface MeshyTextTo3dInput {
  prompt: string;
  art_style?: string;      // "realistic" | "sculpture" (Meshy default: realistic)
  negative_prompt?: string;
  ai_model?: string;       // Meshy engine version, e.g. "meshy-5"
}

/**
 * Generate a 3D mesh from text. Creates a preview-mode task, polls to SUCCEEDED, and returns
 * the .glb URL as artifact_url. Throws a typed Error on failure/timeout.
 */
export async function meshyTextTo3d(input: MeshyTextTo3dInput): Promise<ProviderCallResult> {
  const key = meshyKey();
  const started = Date.now();
  const authHeaders = { authorization: `Bearer ${key}`, "content-type": "application/json" };

  const createBody: Record<string, unknown> = {
    mode: "preview",
    prompt: input.prompt,
    art_style: input.art_style ?? "realistic",
  };
  if (input.negative_prompt) createBody.negative_prompt = input.negative_prompt;
  if (input.ai_model) createBody.ai_model = input.ai_model;

  const createResp = await fetch(`${MESHY_BASE}/openapi/v2/text-to-3d`, {
    method: "POST",
    headers: authHeaders,
    body: JSON.stringify(createBody),
  });
  if (!createResp.ok) {
    const detail = await createResp.text().catch(() => "");
    throw new Error(`Meshy ${createResp.status}: ${detail.slice(0, 500)}`);
  }
  const created = await createResp.json();
  const taskId: string | undefined = created?.result ?? created?.id;
  if (!taskId) throw new Error("Meshy: no task id returned");

  // Poll the task until terminal or timeout.
  const getUrl = `${MESHY_BASE}/openapi/v2/text-to-3d/${taskId}`;
  const deadline = Date.now() + POLL_TIMEOUT_MS;
  let task: any = null;
  while (true) {
    if (Date.now() > deadline) throw new Error(`Meshy: task timed out after ${POLL_TIMEOUT_MS}ms`);
    await sleep(POLL_INTERVAL_MS);
    const pollResp = await fetch(getUrl, { headers: authHeaders });
    if (!pollResp.ok) {
      const detail = await pollResp.text().catch(() => "");
      throw new Error(`Meshy poll ${pollResp.status}: ${detail.slice(0, 500)}`);
    }
    task = await pollResp.json();
    if (isTerminal(task?.status)) break;
  }

  if (task?.status !== "SUCCEEDED") {
    throw new Error(`Meshy task ${task?.status}: ${String(task?.task_error?.message ?? "").slice(0, 300)}`);
  }

  const glb: string | undefined = task?.model_urls?.glb;
  if (!glb) throw new Error("Meshy: task succeeded but no glb url");
  return {
    artifact_url: glb,
    artifact_mime: "model/gltf-binary",
    provider: "meshy",
    model: input.ai_model ? `${MODEL_TAG}:${input.ai_model}` : MODEL_TAG,
    latency_ms: Date.now() - started,
  };
}

function isTerminal(status: unknown): boolean {
  return status === "SUCCEEDED" || status === "FAILED" || status === "CANCELED" || status === "EXPIRED";
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

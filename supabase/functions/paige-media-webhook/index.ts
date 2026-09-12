// paige-media-webhook — fal.ai completion receiver.
//
// MUST BE DEPLOYED WITH --no-verify-jwt (a provider callback carries no Supabase
// JWT). Its ENTIRE security model is fal's own callback signature:
//
//   X-Fal-Webhook-Request-Id   — fal's request id (matches our provider_request_id)
//   X-Fal-Webhook-User-Id      — the fal account id (optionally pinned via env)
//   X-Fal-Webhook-Timestamp    — unix seconds; ±300s replay window (docs mandate)
//   X-Fal-Webhook-Signature    — hex ED25519 signature over
//                                requestId \n userId \n timestamp \n sha256hex(body)
//
// Verified against fal's JWKS (https://rest.fal.ai/.well-known/jwks.json,
// cached ≤24h per docs — keys rotate). NOT HMAC, NOT FAL_KEY — the verifying
// side never holds a secret (ED25519 asymmetric; fal docs, read 2026-09-12).
//
// OWNER RULES ENFORCED HERE:
//   • "No public webhook may spend money, create a job, or accept unverified
//     provider data." This receiver only COMPLETES an existing job matched by
//     provider_request_id — it never inserts, never dispatches new work.
//   • Idempotent: the shared completeMediaJob tail's guarded transition makes a
//     redelivery (fal retries up to 31×) a no-op.
//   • Signature verification failure → 401, fail closed. If this runtime cannot
//     verify ED25519 at all, the receiver 401s EVERYTHING — completion falls
//     back to the sweeper's polling (by design, never a silent accept).
//
// Deploy note: `supabase functions deploy paige-media-webhook --no-verify-jwt`
// (NOT executed in this PR — the workstream is review-ready only).

import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.75.0";
import { completeMediaJob } from "../_shared/media-provider/complete.ts";
import { falAdapter } from "../_shared/media-provider/fal.ts";
import { verifyFalCallback } from "../_shared/media-provider/fal-webhook.ts";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

serve(async (req: Request) => {
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);
  // The RAW body is the signed artifact — read it before any parsing.
  const rawBody = await req.text();

  let verdict: { ok: true } | { ok: false; reason: string };
  try {
    verdict = await verifyFalCallback({
      requestId: req.headers.get("x-fal-webhook-request-id"),
      userId: req.headers.get("x-fal-webhook-user-id"),
      timestamp: req.headers.get("x-fal-webhook-timestamp"),
      signatureHex: req.headers.get("x-fal-webhook-signature"),
      body: rawBody,
    });
  } catch (e) {
    console.error("[paige-media-webhook] verification error:", e instanceof Error ? e.message : "unknown");
    return json({ error: "verification_failed" }, 401);
  }
  if (!verdict.ok) {
    console.warn("[paige-media-webhook] rejected:", verdict.reason);
    return json({ error: "unverified" }, 401);
  }

  let event: { request_id?: string; status?: string; payload?: unknown; error?: string };
  try {
    event = JSON.parse(rawBody);
  } catch {
    return json({ error: "invalid_json" }, 400);
  }
  const requestId = String(event.request_id ?? "");
  if (!requestId) return json({ error: "no_request_id" }, 400);

  const admin = createClient(supabaseUrl, supabaseServiceKey);

  // COMPLETION-ONLY: match an existing fal job; never create anything.
  const { data: job } = await admin
    .from("paige_media_jobs")
    .select("*")
    .eq("provider_request_id", requestId)
    .eq("provider", "fal")
    .maybeSingle();
  if (!job) {
    // An unknown request id gets a 200 so fal stops retrying — but nothing was
    // acted on. (Our submits always record the id first; an unmatched id is not
    // ours to act on.)
    return json({ ignored: true, reason: "unknown_request_id" });
  }

  if (event.status === "OK") {
    try {
      const { artifactUrls } = await falAdapter.fetchResult({ model: job.model, providerRequestId: requestId });
      const result = await completeMediaJob(admin, { ...job, attempts: job.attempts ?? 1 }, artifactUrls[0]);
      return json({ completed: result.state === "succeeded", state: result.state });
    } catch (e) {
      // Result fetch failed AFTER a verified OK — the artifact exists at the
      // provider: outcome_unknown (reconcile retries the fetch+copy), never
      // a definitive failure for an asset we know was produced.
      const message = e instanceof Error ? e.message : "result fetch failed";
      await admin
        .from("paige_media_jobs")
        .update({ state: "outcome_unknown", error: `post_callback_failure: ${message}`.slice(0, 500), lease_until: null })
        .eq("id", job.id)
        .in("state", ["submitted", "processing", "outcome_unknown", "expired"])
        .then(() => {}, () => {});
      return json({ state: "outcome_unknown", error: message.slice(0, 200) });
    }
  }

  // status ERROR (or anything else non-OK): honest provider failure.
  const detail = typeof event.error === "string"
    ? event.error.slice(0, 300)
    : JSON.stringify(event.payload ?? {}).slice(0, 300);
  await failMediaJob(admin, { ...job, attempts: job.attempts ?? 1 }, `provider reported ERROR: ${detail}`)
    .catch(() => {});
  return json({ state: "failed" });
});

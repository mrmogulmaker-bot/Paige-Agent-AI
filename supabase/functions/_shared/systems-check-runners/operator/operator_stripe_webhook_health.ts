// operator/operator_stripe_webhook_health.ts — OPERATOR check #5 (runner_key: operator_stripe_webhook_health).
//
// SEAM (reuse ONLY these tables): public.stripe_event_log (the stripe-webhook idempotency log — every
// received event with received_at/processed_at) + public.webhook_event_log (inbound/outbound webhook
// deliveries with status). Service role reads directly (both are service-write, admin-read; the runner
// self-scopes to platform-global rows — there is no tenant filter, §53).
//
// VERDICT (§13 honest, pre-launch-aware):
//   • No Stripe events EVER recorded → 'skip' (needs traffic to assess; NOT a fabricated pass).
//   • Recent events all processed AND no recent inbound webhook failures → 'pass'.
//   • Recent events unprocessed (stuck) OR recent inbound webhook deliveries failing → 'fail'.
// §32 fail-loud: a db error throws → status:'error'.

import type { CheckRunner } from "../../systems-check-runner.ts";
import { throwOnDbError, errorResult } from "../_kit.ts";

export const runnerKey = "operator_stripe_webhook_health";

const WINDOW_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

export const run: CheckRunner = async (ctx, _row) => {
  const { admin } = ctx;
  const since = new Date(Date.now() - WINDOW_MS).toISOString();
  try {
    const [totalRes, recentRes, unprocessedRes, inboundFailRes] = await Promise.all([
      // Any Stripe events ever received at all?
      admin.from("stripe_event_log").select("event_id", { count: "exact", head: true }),
      // Recent events in the window.
      admin.from("stripe_event_log").select("event_id", { count: "exact", head: true }).gte("received_at", since),
      // Recent events still unprocessed (received but processed_at null) — stuck webhook processing.
      admin.from("stripe_event_log").select("event_id", { count: "exact", head: true })
        .gte("received_at", since).is("processed_at", null),
      // Recent INBOUND webhook deliveries that failed.
      admin.from("webhook_event_log").select("id", { count: "exact", head: true })
        .eq("direction", "inbound").eq("status", "failed").gte("created_at", since),
    ]);
    throwOnDbError(totalRes.error, "stripe_event_log.total");
    throwOnDbError(recentRes.error, "stripe_event_log.recent");
    throwOnDbError(unprocessedRes.error, "stripe_event_log.unprocessed");
    throwOnDbError(inboundFailRes.error, "webhook_event_log.inbound_failed");

    const totalEver = totalRes.count ?? 0;
    const recent = recentRes.count ?? 0;
    const unprocessed = unprocessedRes.count ?? 0;
    const inboundFailed = inboundFailRes.count ?? 0;

    const evidence = {
      events_ever: totalEver,
      events_last_7d: recent,
      unprocessed_last_7d: unprocessed,
      inbound_webhook_failed_last_7d: inboundFailed,
      window_days: 7,
    };

    if (totalEver === 0) {
      return {
        status: "skip",
        evidence: { ...evidence, needs_config: true, reason: "no_stripe_events_recorded" },
        interpretation: "No Stripe webhook events have ever been recorded — pre-launch or no payment traffic yet. Webhook health cannot be assessed until events flow.",
      };
    }

    const unhealthy = unprocessed > 0 || inboundFailed > 0;
    return {
      status: unhealthy ? "fail" : "pass",
      evidence,
      interpretation: unhealthy
        ? `Platform Stripe webhook is unhealthy: ${unprocessed} unprocessed event(s) and ${inboundFailed} failed inbound webhook delivery(ies) in the last 7 days.`
        : `Platform Stripe webhook is healthy: ${recent} event(s) received and all processed in the last 7 days, no failed inbound deliveries.`,
    };
  } catch (e) {
    return errorResult(e, runnerKey);
  }
};

import { assertEquals } from "https://deno.land/std@0.190.0/testing/asserts.ts";

import { decideBillingWebhookLifecycle } from "./billing-webhook-lifecycle.ts";

Deno.test("billing webhook follows the received-to-completed lifecycle", () => {
  assertEquals(decideBillingWebhookLifecycle("received", "validate"), {
    ok: true,
    nextState: "validated",
    action: "persist_validated",
    replay: false,
  });
  assertEquals(decideBillingWebhookLifecycle("validated", "start_processing"), {
    ok: true,
    nextState: "processing",
    action: "claim_processing",
    replay: false,
  });
  assertEquals(decideBillingWebhookLifecycle("processing", "complete"), {
    ok: true,
    nextState: "completed",
    action: "persist_completed",
    replay: false,
  });
});

Deno.test("billing webhook records a retryable failure and can be claimed for retry", () => {
  assertEquals(decideBillingWebhookLifecycle("processing", "fail_retryable"), {
    ok: true,
    nextState: "retryable_failure",
    action: "persist_retryable_failure",
    replay: false,
  });
  assertEquals(
    decideBillingWebhookLifecycle("retryable_failure", "start_processing"),
    {
      ok: true,
      nextState: "processing",
      action: "claim_processing",
      replay: false,
    },
  );
});

Deno.test("completed webhook replay is acknowledged without reprocessing", () => {
  assertEquals(decideBillingWebhookLifecycle("completed", "replay"), {
    ok: true,
    nextState: "completed",
    action: "ack_completed",
    replay: true,
  });
});

Deno.test("processing webhook replay does not create concurrent processing", () => {
  assertEquals(decideBillingWebhookLifecycle("processing", "replay"), {
    ok: true,
    nextState: "processing",
    action: "ack_in_progress",
    replay: true,
  });
});

Deno.test("pre-processing and retryable webhook replays have explicit resume decisions", () => {
  assertEquals(decideBillingWebhookLifecycle("received", "replay"), {
    ok: true,
    nextState: "received",
    action: "resume_validation",
    replay: true,
  });
  assertEquals(decideBillingWebhookLifecycle("validated", "replay"), {
    ok: true,
    nextState: "validated",
    action: "resume_processing",
    replay: true,
  });
  assertEquals(decideBillingWebhookLifecycle("retryable_failure", "replay"), {
    ok: true,
    nextState: "retryable_failure",
    action: "retry_processing",
    replay: true,
  });
});

Deno.test("invalid webhook lifecycle inputs fail closed with explicit codes", () => {
  assertEquals(decideBillingWebhookLifecycle("received", "complete"), {
    ok: false,
    code: "invalid_transition",
    state: "received",
  });
  assertEquals(decideBillingWebhookLifecycle("unknown", "replay"), {
    ok: false,
    code: "unknown_state",
    state: "unknown",
  });
  assertEquals(decideBillingWebhookLifecycle("received", "unknown"), {
    ok: false,
    code: "unknown_command",
    state: "received",
  });
});

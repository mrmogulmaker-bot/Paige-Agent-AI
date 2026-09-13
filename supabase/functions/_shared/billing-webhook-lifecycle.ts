/**
 * Pure decisions for a persisted billing-webhook event lifecycle.
 *
 * The caller remains responsible for signature verification, persistence, and
 * atomic compare-and-set claims. In particular, `claim_processing` must be
 * persisted atomically before invoking any side effect.
 */

export type BillingWebhookLifecycleState =
  | "received"
  | "validated"
  | "processing"
  | "completed"
  | "retryable_failure";

export type BillingWebhookLifecycleCommand =
  | "validate"
  | "start_processing"
  | "complete"
  | "fail_retryable"
  | "replay";

export type BillingWebhookLifecycleAction =
  | "persist_validated"
  | "claim_processing"
  | "persist_completed"
  | "persist_retryable_failure"
  | "ack_completed"
  | "ack_in_progress"
  | "resume_validation"
  | "resume_processing"
  | "retry_processing";

export type BillingWebhookLifecycleErrorCode =
  | "unknown_state"
  | "unknown_command"
  | "invalid_transition";

export type BillingWebhookLifecycleDecision =
  | {
    ok: true;
    nextState: BillingWebhookLifecycleState;
    action: BillingWebhookLifecycleAction;
    replay: boolean;
  }
  | {
    ok: false;
    code: BillingWebhookLifecycleErrorCode;
    state: string;
  };

const STATES = new Set<string>([
  "received",
  "validated",
  "processing",
  "completed",
  "retryable_failure",
]);

const COMMANDS = new Set<string>([
  "validate",
  "start_processing",
  "complete",
  "fail_retryable",
  "replay",
]);

const replayDecision: Record<
  BillingWebhookLifecycleState,
  Extract<BillingWebhookLifecycleDecision, { ok: true }>
> = {
  received: {
    ok: true,
    nextState: "received",
    action: "resume_validation",
    replay: true,
  },
  validated: {
    ok: true,
    nextState: "validated",
    action: "resume_processing",
    replay: true,
  },
  processing: {
    ok: true,
    nextState: "processing",
    action: "ack_in_progress",
    replay: true,
  },
  completed: {
    ok: true,
    nextState: "completed",
    action: "ack_completed",
    replay: true,
  },
  retryable_failure: {
    ok: true,
    nextState: "retryable_failure",
    action: "retry_processing",
    replay: true,
  },
};

/**
 * Returns the only permitted lifecycle transition or a fail-closed code.
 * Replay decisions never themselves re-run work; the caller must atomically
 * claim `start_processing` before a resume or retry performs side effects.
 */
export function decideBillingWebhookLifecycle(
  state: string,
  command: string,
): BillingWebhookLifecycleDecision {
  if (!STATES.has(state)) {
    return { ok: false, code: "unknown_state", state };
  }
  if (!COMMANDS.has(command)) {
    return { ok: false, code: "unknown_command", state };
  }

  const typedState = state as BillingWebhookLifecycleState;
  if (command === "replay") {
    return replayDecision[typedState];
  }

  if (typedState === "received" && command === "validate") {
    return {
      ok: true,
      nextState: "validated",
      action: "persist_validated",
      replay: false,
    };
  }
  if (
    (typedState === "validated" || typedState === "retryable_failure") &&
    command === "start_processing"
  ) {
    return {
      ok: true,
      nextState: "processing",
      action: "claim_processing",
      replay: false,
    };
  }
  if (typedState === "processing" && command === "complete") {
    return {
      ok: true,
      nextState: "completed",
      action: "persist_completed",
      replay: false,
    };
  }
  if (typedState === "processing" && command === "fail_retryable") {
    return {
      ok: true,
      nextState: "retryable_failure",
      action: "persist_retryable_failure",
      replay: false,
    };
  }

  return { ok: false, code: "invalid_transition", state };
}

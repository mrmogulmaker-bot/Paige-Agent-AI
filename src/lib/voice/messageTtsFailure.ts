export type TtsFailureKind =
  | "allowance"
  | "platform_paused"
  | "pending"
  | "retryable"
  | "not_configured";

export interface TtsFailureFeedback {
  kind: TtsFailureKind;
  message: string;
}

const TENANT_ALLOWANCE_CODES = new Set([
  "tts_tenant_allowance_reached",
  "tts_tenant_cost_limit",
]);

const PLATFORM_PAUSED_CODES = new Set([
  "tts_global_cap_reached",
  "tts_platform_cost_limit",
  "tts_emergency_disabled",
  "tts_cost_limit_unavailable",
]);

const PENDING_CODES = new Set([
  "tts_request_pending",
  "tts_request_ambiguous",
  "tts_request_already_reserved",
]);

const NOT_CONFIGURED_CODES = new Set([
  "tts_not_configured",
  "tts_tier_reserved",
]);

function formatResetDate(resetAt: string | null | undefined): string | null {
  if (!resetAt) return null;
  const date = new Date(resetAt);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    year: date.getUTCFullYear() === new Date().getUTCFullYear() ? undefined : "numeric",
    timeZone: "UTC",
  }).format(date);
}

/** Maps a machine response to one honest, provider-neutral user state. */
export function classifyTtsFailure(
  code: string | null | undefined,
  status: number,
  resetAt?: string | null,
): TtsFailureFeedback {
  if (code && TENANT_ALLOWANCE_CODES.has(code)) {
    const resetDate = formatResetDate(resetAt);
    return {
      kind: "allowance",
      message: resetDate
        ? `Voice playback has reached this workspace’s monthly allowance. It resets ${resetDate}.`
        : "Voice playback has reached this workspace’s monthly allowance. Please try again after the monthly reset.",
    };
  }

  if (code && NOT_CONFIGURED_CODES.has(code)) {
    return { kind: "not_configured", message: "Voice playback isn’t available for this workspace." };
  }

  if ((code && PENDING_CODES.has(code)) || status === 409) {
    return { kind: "pending", message: "That audio may still be processing. Please try again in a moment." };
  }

  if ((code && PLATFORM_PAUSED_CODES.has(code)) || status === 503) {
    return { kind: "platform_paused", message: "Voice playback is temporarily paused. Please try again later." };
  }

  return { kind: "retryable", message: "Voice playback didn’t start. Please try again." };
}

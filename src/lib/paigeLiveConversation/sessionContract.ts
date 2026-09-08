import type { LiveConversationScope, TruthfulAvailability } from "./contract";
import type { BoundVoiceProfile } from "./voiceProfile";

export type LiveConversationStartRequest = Readonly<{
  threadId: string;
  contextEpoch: string;
  entryMode: "embedded" | "existing-popout" | "requested-popout";
}>;

export type ServerResolvedLiveContext = Readonly<{
  actorId: string;
  tenantId: string;
  workspaceId: string;
  role: string;
  threadId: string;
  contextEpoch: string;
  pageContextRef?: string;
  objectContextRef?: string;
}>;

export type VoiceProviderReadiness = Readonly<{
  provider: "elevenlabs" | "none";
  availability: TruthfulAvailability;
  realtimeStt: TruthfulAvailability;
  streamingTts: TruthfulAvailability;
  retentionPolicyApproved: boolean;
  costLimitApproved: boolean;
}>;

export type LiveConversationStartDecision =
  | Readonly<{
      ok: true;
      scope: LiveConversationScope;
      voiceProfile: BoundVoiceProfile["publicProfile"];
      tokenAudience: "paige-live-voice-io";
      tokenTtlSeconds: number;
    }>
  | Readonly<{
      ok: false;
      code:
        | "feature_disabled"
        | "stale_context"
        | "thread_scope_mismatch"
        | "provider_unavailable"
        | "privacy_not_approved"
        | "cost_limit_not_approved";
    }>;

export function decideLiveConversationStart(input: Readonly<{
  featureEnabled: boolean;
  request: LiveConversationStartRequest;
  resolved: ServerResolvedLiveContext;
  provider: VoiceProviderReadiness;
  voiceProfile: BoundVoiceProfile;
}>): LiveConversationStartDecision {
  if (!input.featureEnabled) return { ok: false, code: "feature_disabled" };
  if (input.request.threadId !== input.resolved.threadId) {
    return { ok: false, code: "thread_scope_mismatch" };
  }
  if (input.request.contextEpoch !== input.resolved.contextEpoch) {
    return { ok: false, code: "stale_context" };
  }
  if (
    input.provider.provider !== "elevenlabs" ||
    input.provider.availability !== "LIVE" ||
    input.provider.realtimeStt !== "LIVE" ||
    input.provider.streamingTts !== "LIVE"
  ) {
    return { ok: false, code: "provider_unavailable" };
  }
  if (!input.provider.retentionPolicyApproved) {
    return { ok: false, code: "privacy_not_approved" };
  }
  if (!input.provider.costLimitApproved) {
    return { ok: false, code: "cost_limit_not_approved" };
  }

  return {
    ok: true,
    scope: {
      threadId: input.resolved.threadId,
      tenantId: input.resolved.tenantId,
      workspaceId: input.resolved.workspaceId,
      contextEpoch: input.resolved.contextEpoch,
    },
    voiceProfile: input.voiceProfile.publicProfile,
    tokenAudience: "paige-live-voice-io",
    tokenTtlSeconds: 60,
  };
}

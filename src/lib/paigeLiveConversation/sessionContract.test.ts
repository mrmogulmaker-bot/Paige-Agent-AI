import { describe, expect, it } from "vitest";
import { decideLiveConversationStart, type VoiceProviderReadiness } from "./sessionContract";

const request = { threadId: "thread-1", contextEpoch: "epoch-1", entryMode: "embedded" } as const;
const resolved = {
  actorId: "actor-1",
  tenantId: "tenant-1",
  workspaceId: "workspace-1",
  role: "owner",
  threadId: "thread-1",
  contextEpoch: "epoch-1",
} as const;
const ready: VoiceProviderReadiness = {
  provider: "elevenlabs",
  availability: "LIVE",
  realtimeStt: "LIVE",
  streamingTts: "LIVE",
  retentionPolicyApproved: true,
  costLimitApproved: true,
};
const voiceProfile = {
  publicProfile: { name: "paige_default_voice", revision: "rev-7" },
  internal: {
    profileId: "profile-1",
    provider: "elevenlabs" as const,
    providerVoiceRef: "server-only-provider-ref",
    changeReceiptRef: "receipt-7",
  },
};

describe("Paige Live Conversation server-issued session contract", () => {
  it("is disabled until the owner-approved provider, privacy, cost, and feature gates are live", () => {
    expect(decideLiveConversationStart({ featureEnabled: false, request, resolved, provider: ready, voiceProfile }))
      .toEqual({ ok: false, code: "feature_disabled" });
  });

  it("uses only server-resolved tenant and workspace scope", () => {
    const decision = decideLiveConversationStart({ featureEnabled: true, request, resolved, provider: ready, voiceProfile });
    expect(decision).toMatchObject({
      ok: true,
      scope: { tenantId: "tenant-1", workspaceId: "workspace-1", threadId: "thread-1" },
      voiceProfile: { name: "paige_default_voice", revision: "rev-7" },
      tokenAudience: "paige-live-voice-io",
    });
    expect(decision).not.toHaveProperty("provider");
    expect(decision).not.toHaveProperty("providerVoiceRef");
    expect(decision).not.toHaveProperty("scope.actorId");
  });

  it("fails closed on stale context, cross-thread reuse, privacy, or cost gaps", () => {
    expect(decideLiveConversationStart({
      featureEnabled: true,
      request: { ...request, contextEpoch: "stale" },
      resolved,
      provider: ready,
      voiceProfile,
    })).toEqual({ ok: false, code: "stale_context" });
    expect(decideLiveConversationStart({
      featureEnabled: true,
      request: { ...request, threadId: "other" },
      resolved,
      provider: ready,
      voiceProfile,
    })).toEqual({ ok: false, code: "thread_scope_mismatch" });
    expect(decideLiveConversationStart({
      featureEnabled: true,
      request,
      resolved,
      provider: { ...ready, retentionPolicyApproved: false },
      voiceProfile,
    })).toEqual({ ok: false, code: "privacy_not_approved" });
    expect(decideLiveConversationStart({
      featureEnabled: true,
      request,
      resolved,
      provider: { ...ready, costLimitApproved: false },
      voiceProfile,
    })).toEqual({ ok: false, code: "cost_limit_not_approved" });
  });
});

export type PaigeVoiceProfile = Readonly<{
  id: string;
  paigeFacingName: string;
  revision: string;
  provider: "elevenlabs" | "openai";
  providerVoiceRef: string;
  approved: boolean;
  active: boolean;
  effectiveAt: string;
  speechPolicy?: Readonly<{
    source: "paige-profile" | "provider-dashboard";
    speed?: number;
    style?: string;
  }>;
  audit: Readonly<{
    approvedByActorId: string;
    approvedAt: string;
    changeReceiptRef: string;
  }>;
}>;

export type ProviderVoiceAvailability = Readonly<{
  provider: PaigeVoiceProfile["provider"];
  providerVoiceRef: string;
  available: boolean;
  authorized: boolean;
}>;

export type BoundVoiceProfile = Readonly<{
  publicProfile: Readonly<{ name: string; revision: string }>;
  internal: Readonly<{
    profileId: string;
    provider: PaigeVoiceProfile["provider"];
    providerVoiceRef: string;
    speechPolicy?: PaigeVoiceProfile["speechPolicy"];
    changeReceiptRef: string;
  }>;
}>;

export type VoiceProfileResolution =
  | Readonly<{ ok: true; binding: BoundVoiceProfile; usedFallback: boolean }>
  | Readonly<{
      ok: false;
      code: "profile_not_effective" | "profile_not_approved" | "provider_voice_unavailable";
    }>;

function isUsable(
  profile: PaigeVoiceProfile,
  availability: ReadonlyArray<ProviderVoiceAvailability>,
  sessionStartedAt: string,
): VoiceProfileResolution["ok"] {
  if (!profile.approved || !profile.active) return false;
  if (Date.parse(profile.effectiveAt) > Date.parse(sessionStartedAt)) return false;
  return availability.some(
    (candidate) =>
      candidate.provider === profile.provider &&
      candidate.providerVoiceRef === profile.providerVoiceRef &&
      candidate.available &&
      candidate.authorized,
  );
}

function bind(profile: PaigeVoiceProfile): BoundVoiceProfile {
  return Object.freeze({
    publicProfile: Object.freeze({ name: profile.paigeFacingName, revision: profile.revision }),
    internal: Object.freeze({
      profileId: profile.id,
      provider: profile.provider,
      providerVoiceRef: profile.providerVoiceRef,
      speechPolicy: profile.speechPolicy,
      changeReceiptRef: profile.audit.changeReceiptRef,
    }),
  });
}

export function resolvePaigeVoiceProfile(input: Readonly<{
  primary: PaigeVoiceProfile;
  approvedFallback?: PaigeVoiceProfile;
  availability: ReadonlyArray<ProviderVoiceAvailability>;
  sessionStartedAt: string;
}>): VoiceProfileResolution {
  if (!input.primary.approved || !input.primary.active) {
    return { ok: false, code: "profile_not_approved" };
  }
  if (Date.parse(input.primary.effectiveAt) > Date.parse(input.sessionStartedAt)) {
    return { ok: false, code: "profile_not_effective" };
  }
  if (isUsable(input.primary, input.availability, input.sessionStartedAt)) {
    return { ok: true, binding: bind(input.primary), usedFallback: false };
  }
  if (
    input.approvedFallback &&
    isUsable(input.approvedFallback, input.availability, input.sessionStartedAt)
  ) {
    return { ok: true, binding: bind(input.approvedFallback), usedFallback: true };
  }
  return { ok: false, code: "provider_voice_unavailable" };
}

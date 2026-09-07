export type PublicPresenceProviderId =
  | "google-search-console"
  | "google-business-profile";

export type PublicPresenceConnectionState =
  | "UNAVAILABLE"
  | "NOT_CONNECTED"
  | "CONNECTING"
  | "DENIED"
  | "CONNECTED"
  | "EXPIRED"
  | "READ_FAILED"
  | "STALE"
  | "DISCONNECTING";

export type ProviderEvidenceEnvelope = {
  provider: PublicPresenceProviderId;
  tenantId: string;
  connectionId: string;
  source: "provider";
  observedAt: string;
  receiptId?: string;
};

export type GoogleSearchConsoleEvidence = ProviderEvidenceEnvelope & {
  provider: "google-search-console";
  verifiedSite: string;
  permissionLevel: string;
  sitemap?: { path: string; lastSubmittedAt?: string; providerStatus?: string };
  urlInspection?: { url: string; inspectedAt: string; verdict?: string };
};

export type GoogleBusinessProfileEvidence = ProviderEvidenceEnvelope & {
  provider: "google-business-profile";
  accountId: string;
  locationId: string;
  publicFacts: Partial<Record<"name" | "website" | "phone" | "address" | "serviceArea" | "hours" | "category", string>>;
};

export const PUBLIC_PRESENCE_GOOGLE_RELEASES = [
  {
    id: "google-search-console",
    label: "Google Search Console",
    sequence: 1,
    state: "UNAVAILABLE",
    setupOwner: "Integrations",
    consent: "Tenant authorization for the verified site and read-only Search Console scope is required.",
    selection: "Verified-site selection appears only after a provider-confirmed connection.",
    evidence: "Site, sitemap, and URL-inspection reads require provider source time and tenant-bound connection evidence.",
    unavailableReason: "Platform OAuth setup and tenant authorization are not implemented.",
  },
  {
    id: "google-business-profile",
    label: "Google Business Profile",
    sequence: 2,
    state: "UNAVAILABLE",
    setupOwner: "Integrations",
    consent: "Google platform approval plus provider-specific tenant consent is required; generic automation permission is insufficient.",
    selection: "Account and location selection appear only after a provider-confirmed connection.",
    evidence: "Fact comparison and any proposal require a selected provider account/location, source time, and attributable receipt/readback.",
    unavailableReason: "Platform approval, OAuth setup, and tenant authorization are not implemented.",
  },
] as const satisfies ReadonlyArray<{
  id: PublicPresenceProviderId;
  label: string;
  sequence: number;
  state: "UNAVAILABLE";
  setupOwner: "Integrations";
  consent: string;
  selection: string;
  evidence: string;
  unavailableReason: string;
}>;

export function isProviderEvidenceEnvelope(value: unknown): value is ProviderEvidenceEnvelope {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<ProviderEvidenceEnvelope>;
  return (
    PUBLIC_PRESENCE_GOOGLE_RELEASES.some((provider) => provider.id === candidate.provider) &&
    candidate.source === "provider" &&
    typeof candidate.tenantId === "string" && candidate.tenantId.length > 0 &&
    typeof candidate.connectionId === "string" && candidate.connectionId.length > 0 &&
    typeof candidate.observedAt === "string" && !Number.isNaN(Date.parse(candidate.observedAt))
  );
}

export function acceptProviderEvidenceForTenant(value: unknown, tenantId: string) {
  return isProviderEvidenceEnvelope(value) && value.tenantId === tenantId ? value : null;
}

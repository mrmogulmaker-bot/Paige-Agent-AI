/** Internal provider-neutral Social connection seam. Provider names never become customer copy. */
export type SocialConnectionStatus = "connected" | "needs_reauth";

export interface SocialProviderAccount {
  platform: string;
  providerAccountId: string;
  handle: string | null;
  displayName: string | null;
  avatarUrl: string | null;
  status: SocialConnectionStatus;
  capabilities: string[];
}

export interface SocialProviderProfile {
  providerProfileKey: string;
  accounts: SocialProviderAccount[];
}

export interface SocialProviderAdapter {
  readonly key: string;
  isConfigured(): boolean;
  createProfile(input: { providerProfileKey: string }): Promise<{ created: boolean }>;
  createConnectUrl(input: {
    providerProfileKey: string;
    redirectUrl: string;
    platform: string;
  }): Promise<{ url: string; expiresAt: string }>;
  readProfile(input: { providerProfileKey: string }): Promise<SocialProviderProfile>;
  deleteProfile(input: { providerProfileKey: string }): Promise<void>;
}

export class SocialProviderError extends Error {
  constructor(
    readonly code: string,
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "SocialProviderError";
  }
}

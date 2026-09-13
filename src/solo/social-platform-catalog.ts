export type SocialPlatformKey =
  | "tiktok" | "instagram" | "facebook" | "linkedin" | "youtube" | "x"
  | "threads" | "pinterest" | "google_business" | "snapchat" | "reddit";

export type SocialPlatformDefinition = {
  key: SocialPlatformKey;
  name: string;
  mark: string;
  oauthAvailable: boolean;
  connectionNote: string;
};

/** Customer-visible catalogue grounded in the provider's Connect API. */
export const SOCIAL_PLATFORMS: ReadonlyArray<SocialPlatformDefinition> = [
  { key: "instagram", name: "Instagram", mark: "IG", oauthAvailable: true, connectionNote: "Business or Creator account required." },
  { key: "facebook", name: "Facebook", mark: "f", oauthAvailable: true, connectionNote: "Publishing targets an authorized Page, not a personal profile." },
  { key: "x", name: "X", mark: "X", oauthAvailable: true, connectionNote: "Account permissions are confirmed after connection." },
  { key: "tiktok", name: "TikTok", mark: "TT", oauthAvailable: true, connectionNote: "Available actions depend on the scopes granted by this account." },
  { key: "youtube", name: "YouTube", mark: "YT", oauthAvailable: true, connectionNote: "Connect the Google identity that owns the intended channel." },
  { key: "linkedin", name: "LinkedIn", mark: "in", oauthAvailable: true, connectionNote: "Profile and organization targets are resolved after connection." },
  { key: "threads", name: "Threads", mark: "Th", oauthAvailable: true, connectionNote: "Account permissions are confirmed after connection." },
  { key: "pinterest", name: "Pinterest", mark: "P", oauthAvailable: true, connectionNote: "Boards are selected only after provider discovery." },
  { key: "google_business", name: "Google Business Profile", mark: "G", oauthAvailable: true, connectionNote: "Locations are selected only after provider discovery." },
  { key: "snapchat", name: "Snapchat", mark: "S", oauthAvailable: true, connectionNote: "Connection currently proves basic profile access only; publishing is unavailable." },
  { key: "reddit", name: "Reddit", mark: "R", oauthAvailable: false, connectionNote: "OAuth is temporarily unavailable from the provider." },
] as const;

export function socialPlatform(key: string | null | undefined) {
  return SOCIAL_PLATFORMS.find((platform) => platform.key === key) ?? null;
}

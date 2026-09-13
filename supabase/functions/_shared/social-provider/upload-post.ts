/**
 * Internal adapter for Paige's initial Social connection provider.
 * The platform key authenticates Paige's server only. Tenant identity is the
 * opaque provider profile key persisted by the canonical Social connection row.
 */
import { envKey } from "../env-key.ts";
import { NeedsConfigError } from "../provider-types.ts";
import { safeFetch } from "../ssrfGuard.ts";
import {
  SocialProviderError,
  type SocialProviderAccount,
  type SocialProviderAdapter,
  type SocialProviderProfile,
} from "./mod.ts";

const DEFAULT_API_BASE = "https://api.upload-post.com/api/uploadposts";
const PROFILE_KEY_PATTERN = /^ps_[a-f0-9]{40}$/;
// Current hosted-page OAuth catalogue from the provider contract. Manual-secret
// channels stay excluded until Paige has an approved Vault-backed custody flow.
const HOSTED_OAUTH_PLATFORMS = [
  "tiktok", "instagram", "linkedin", "youtube", "facebook", "x", "threads", "google_business",
] as const;

function env(name: string): string | undefined {
  const deno = (globalThis as { Deno?: { env?: { get(key: string): string | undefined } } }).Deno;
  return deno?.env?.get(name);
}

function providerKey(): string {
  const key = envKey("UPLOAD_POST_API_KEY");
  if (!key) throw new NeedsConfigError("social");
  return key;
}

function apiBase(): string {
  return (env("UPLOAD_POST_API_BASE_URL") ?? DEFAULT_API_BASE).replace(/\/$/, "");
}

function assertProfileKey(value: string): void {
  if (!PROFILE_KEY_PATTERN.test(value)) {
    throw new SocialProviderError("invalid_profile_key", 400, "The Social profile identifier is invalid.");
  }
}

async function request(path: string, init: RequestInit = {}): Promise<unknown> {
  const response = await safeFetch(`${apiBase()}${path}`, {
    ...init,
    headers: {
      Authorization: `Apikey ${providerKey()}`,
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
  }, { timeoutMs: 15_000, maxBytes: 262_144 });
  if (response.status < 200 || response.status >= 300) {
    const code = response.status === 401 || response.status === 403
      ? "provider_authorization_rejected"
      : response.status === 404
        ? "provider_profile_not_found"
        : response.status === 409
          ? "provider_profile_exists"
          : response.status === 429
            ? "provider_rate_limited"
            : "provider_request_failed";
    throw new SocialProviderError(code, response.status, "The Social provider request could not be completed.");
  }
  if (response.truncated) throw new SocialProviderError("provider_response_too_large", 502, "The Social provider response exceeded its safe limit.");
  try { return response.body ? JSON.parse(response.body) : {}; }
  catch { throw new SocialProviderError("invalid_provider_response", 502, "The Social provider returned an invalid response."); }
}

function text(value: unknown, max = 240): string | null {
  return typeof value === "string" && value.trim() ? value.trim().slice(0, max) : null;
}

function stringList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(value
    .filter((item): item is string => typeof item === "string" && /^[a-z][a-z0-9_.:-]{0,79}$/.test(item.trim()))
    .map((item) => item.trim()))].slice(0, 64);
}

function safeImage(value: unknown): string | null {
  const candidate = text(value, 2048);
  if (!candidate) return null;
  try {
    const url = new URL(candidate);
    return url.protocol === "https:" && !url.username && !url.password ? url.href : null;
  } catch {
    return null;
  }
}

export async function buildSocialProfileKey(tenantId: string, connectionId: string, signingSecret: string): Promise<string> {
  const bytes = new TextEncoder();
  const key = await crypto.subtle.importKey("raw", bytes.encode(signingSecret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const signature = new Uint8Array(await crypto.subtle.sign("HMAC", key, bytes.encode(`${tenantId}:${connectionId}`)));
  return `ps_${Array.from(signature.slice(0, 20), (byte) => byte.toString(16).padStart(2, "0")).join("")}`;
}

export function normalizeSocialProfile(payload: unknown): SocialProviderProfile {
  const root = payload && typeof payload === "object" ? payload as Record<string, unknown> : {};
  const rawProfile = root.profile && typeof root.profile === "object"
    ? root.profile as Record<string, unknown>
    : Array.isArray(root.profiles) && root.profiles[0] && typeof root.profiles[0] === "object"
      ? root.profiles[0] as Record<string, unknown>
      : null;
  const providerProfileKey = text(rawProfile?.username);
  if (!rawProfile || !providerProfileKey || !PROFILE_KEY_PATTERN.test(providerProfileKey)) {
    throw new SocialProviderError("invalid_profile_readback", 502, "Social profile readback could not be verified.");
  }
  const socialAccounts = rawProfile.social_accounts && typeof rawProfile.social_accounts === "object"
    ? rawProfile.social_accounts as Record<string, unknown>
    : {};
  const accounts: SocialProviderAccount[] = [];
  for (const [rawPlatform, rawAccount] of Object.entries(socialAccounts)) {
    if (!rawAccount || typeof rawAccount !== "object" || Array.isArray(rawAccount)) continue;
    const account = rawAccount as Record<string, unknown>;
    const providerAccountId = text(account.username);
    if (!providerAccountId) {
      throw new SocialProviderError("invalid_account_readback", 502, "Provider readback did not include a stable account identifier.");
    }
    const platform = rawPlatform.trim().toLowerCase().replace(/[^a-z0-9_]/g, "_");
    if (!/^[a-z][a-z0-9_]{1,31}$/.test(platform)) continue;
    accounts.push({
      platform,
      providerAccountId,
      handle: text(account.handle, 160),
      displayName: text(account.display_name, 200),
      avatarUrl: safeImage(account.social_images),
      status: account.reauth_required === true ? "needs_reauth" : "connected",
      capabilities: stringList(account.capabilities),
    });
  }
  return { providerProfileKey, accounts };
}

export const uploadPostSocialAdapter: SocialProviderAdapter = {
  key: "upload_post",
  isConfigured: () => Boolean(envKey("UPLOAD_POST_API_KEY")),
  async createProfile({ providerProfileKey }) {
    assertProfileKey(providerProfileKey);
    try {
      await request("/users", { method: "POST", body: JSON.stringify({ username: providerProfileKey }) });
      return { created: true };
    } catch (error) {
      if (error instanceof SocialProviderError && error.code === "provider_profile_exists") return { created: false };
      throw error;
    }
  },
  async createConnectUrl({ providerProfileKey, redirectUrl, platforms }) {
    assertProfileKey(providerProfileKey);
    const requested = platforms?.filter((platform) => HOSTED_OAUTH_PLATFORMS.includes(platform as typeof HOSTED_OAUTH_PLATFORMS[number]));
    const payload = await request("/users/generate-jwt", {
      method: "POST",
      body: JSON.stringify({
        username: providerProfileKey,
        redirect_url: redirectUrl,
        connect_title: "Connect Social",
        connect_description: "Choose the Social accounts you authorize Paige to use.",
        redirect_button_text: "Return to Paige",
        show_calendar: false,
        platforms: requested?.length ? requested : HOSTED_OAUTH_PLATFORMS,
      }),
    }) as Record<string, unknown>;
    const url = text(payload.access_url);
    let authorization: URL | null = null;
    try { authorization = url ? new URL(url) : null; } catch { authorization = null; }
    if (!authorization || authorization.origin !== "https://app.upload-post.com" || authorization.username || authorization.password) {
      throw new SocialProviderError("invalid_authorization_url", 502, "The Social provider did not return a secure authorization URL.");
    }
    return { url: authorization.href, expiresAt: new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString() };
  },
  async readProfile({ providerProfileKey }) {
    assertProfileKey(providerProfileKey);
    return normalizeSocialProfile(await request(`/users/${encodeURIComponent(providerProfileKey)}`));
  },
  async deleteProfile({ providerProfileKey }) {
    assertProfileKey(providerProfileKey);
    await request("/users", { method: "DELETE", body: JSON.stringify({ username: providerProfileKey }) });
  },
};

// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  buildSocialProfileKey,
  normalizeSocialProfile,
  uploadPostSocialAdapter,
} from "../../supabase/functions/_shared/social-provider/upload-post.ts";
import { NeedsConfigError } from "../../supabase/functions/_shared/provider-types.ts";

const stubEnv = (env: Record<string, string> = {}) => {
  vi.stubGlobal("Deno", {
    env: { get: (name: string) => env[name], toObject: () => env },
    resolveDns: vi.fn().mockResolvedValue(["8.8.8.8"]),
  });
};

afterEach(() => vi.unstubAllGlobals());

describe("Social provider profile identity", () => {
  it("derives an opaque stable provider key without exposing tenant or connection ids", async () => {
    const key = await buildSocialProfileKey(
      "00000000-0000-4000-8000-000000000011",
      "00000000-0000-4000-8000-000000000022",
      "test-signing-secret",
    );
    expect(key).toMatch(/^ps_[a-f0-9]{40}$/);
    expect(key).not.toContain("00000000");
  });
});

describe("Social provider readback", () => {
  it("keeps only provider-confirmed accounts and preserves open capability lists", () => {
    const profile = normalizeSocialProfile({
      success: true,
      profile: {
        username: "ps_0123456789abcdef0123456789abcdef01234567",
        social_accounts: {
          instagram: null,
          tiktok: {
            username: "acct_01HZZZZZZZZZZZZZZZZZZZZZZZ",
            handle: "@example",
            display_name: "Example account",
            social_images: "https://cdn.example/avatar.png",
            capabilities: ["video", "comments", "future_capability"],
            reauth_required: true,
          },
        },
      },
    });
    expect(profile.accounts).toEqual([expect.objectContaining({
      platform: "tiktok",
      providerAccountId: "acct_01HZZZZZZZZZZZZZZZZZZZZZZZ",
      status: "needs_reauth",
      capabilities: ["video", "comments", "future_capability"],
    })]);
  });

  it("rejects an account object without a stable provider account id", () => {
    expect(() => normalizeSocialProfile({
      success: true,
      profile: { username: "ps_0123456789abcdef0123456789abcdef01234567", social_accounts: { instagram: { handle: "@only-a-label" } } },
    })).toThrow(/stable account identifier/i);
  });
});

describe("Social adapter secret boundary", () => {
  it("reports unconfigured without revealing or reading a tenant credential", () => {
    stubEnv({});
    expect(uploadPostSocialAdapter.isConfigured()).toBe(false);
  });

  it("fails before network when the platform provider credential is absent", async () => {
    stubEnv({});
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    await expect(uploadPostSocialAdapter.readProfile({ providerProfileKey: "ps_0123456789abcdef0123456789abcdef01234567" }))
      .rejects.toBeInstanceOf(NeedsConfigError);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("reports whether an opaque provider profile was created", async () => {
    stubEnv({ UPLOAD_POST_API_KEY: "opaque-server-key" });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("{}", { status: 201 })));
    await expect(uploadPostSocialAdapter.createProfile({
      providerProfileKey: "ps_0123456789abcdef0123456789abcdef01234567",
    })).resolves.toEqual({ created: true });
  });

  it("treats an existing opaque provider profile as an idempotent non-creation", async () => {
    stubEnv({ UPLOAD_POST_API_KEY: "opaque-server-key" });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("{}", { status: 409 })));
    await expect(uploadPostSocialAdapter.createProfile({
      providerProfileKey: "ps_0123456789abcdef0123456789abcdef01234567",
    })).resolves.toEqual({ created: false });
  });

  it("limits hosted authorization to the documented OAuth catalogue", async () => {
    stubEnv({ UPLOAD_POST_API_KEY: "opaque-server-key" });
    const fetchSpy = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      access_url: "https://app.upload-post.com/connect?token=opaque",
    }), { status: 200, headers: { "Content-Type": "application/json" } }));
    vi.stubGlobal("fetch", fetchSpy);
    await uploadPostSocialAdapter.createConnectUrl({
      providerProfileKey: "ps_0123456789abcdef0123456789abcdef01234567",
      redirectUrl: "https://functions.example/social-callback",
    });
    const request = fetchSpy.mock.calls[0]?.[1] as RequestInit;
    const body = JSON.parse(String(request.body)) as { platforms: string[]; show_calendar: boolean };
    expect(body.platforms).toEqual([
      "tiktok", "instagram", "linkedin", "youtube", "facebook", "x", "threads", "google_business",
    ]);
    expect(body.platforms).not.toContain("discord");
    expect(body.show_calendar).toBe(false);
  });

  it("rejects an authorization URL outside the provider-hosted origin", async () => {
    stubEnv({ UPLOAD_POST_API_KEY: "opaque-server-key" });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({
      access_url: "https://untrusted.example/connect?token=opaque",
    }), { status: 200, headers: { "Content-Type": "application/json" } })));
    await expect(uploadPostSocialAdapter.createConnectUrl({
      providerProfileKey: "ps_0123456789abcdef0123456789abcdef01234567",
      redirectUrl: "https://functions.example/social-callback",
    })).rejects.toThrow(/secure authorization URL/i);
  });
});

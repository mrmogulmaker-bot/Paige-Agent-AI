import { beforeEach, describe, expect, it, vi } from "vitest";

const harness = vi.hoisted(() => ({
  signInWithOAuth: vi.fn(),
  linkIdentity: vi.fn(),
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: { auth: harness },
}));

import { signInWithOAuth } from "./oauth";

describe("signInWithOAuth", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    harness.signInWithOAuth.mockResolvedValue({ data: { url: "https://accounts.google.com" }, error: null });
  });

  it("asks Google to show its identity chooser for an explicit login", async () => {
    await signInWithOAuth("google", "https://paige.example/auth", { chooseAccount: true });

    expect(harness.signInWithOAuth).toHaveBeenCalledWith({
      provider: "google",
      options: {
        redirectTo: "https://paige.example/auth",
        queryParams: { prompt: "select_account" },
      },
    });
  });

  it("does not add Google's prompt to other providers", async () => {
    await signInWithOAuth("apple", "https://paige.example/auth", { chooseAccount: true });

    expect(harness.signInWithOAuth).toHaveBeenCalledWith({
      provider: "apple",
      options: { redirectTo: "https://paige.example/auth" },
    });
  });
});

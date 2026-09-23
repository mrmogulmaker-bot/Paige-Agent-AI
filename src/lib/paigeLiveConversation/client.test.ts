import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/integrations/supabase/client", () => ({
  supabase: { auth: { getSession: vi.fn(async () => ({ data: { session: { access_token: "test-token" } } })) } },
}));

import { renewPaigeLiveRelayTicket } from "./client";

describe("Live relay renewal response", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("preserves a platform availability revocation from the server", async () => {
    const send = vi.fn(async () => new Response(JSON.stringify({
      ok: false,
      availability: "UNAVAILABLE",
      code: "live_audio_not_enabled",
      explanation: "Live audio isn't available for this workspace yet. You can keep working with Paige in chat.",
    }), { status: 200, headers: { "Content-Type": "application/json" } }));
    vi.stubGlobal("fetch", send);

    const result = await renewPaigeLiveRelayTicket({
      sessionId: "22222222-2222-4222-8222-222222222222",
      threadId: "11111111-1111-4111-8111-111111111111",
      contextEpoch: "tenant-a||",
      entryMode: "embedded",
    });

    expect(result).toMatchObject({
      ok: false,
      availability: "UNAVAILABLE",
      code: "live_audio_not_enabled",
    });
    expect(result.ticket).toBeUndefined();
    expect(send).toHaveBeenCalledOnce();
  });
});

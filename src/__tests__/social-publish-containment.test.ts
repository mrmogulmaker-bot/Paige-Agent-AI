// @vitest-environment node
//
// Social capability-truth CONTAINMENT (§9/§38, §13/§36, §58, #1161/#1166).
// The three social model tools (social_post / social_analytics / social_accounts) no
// longer proxy the platform-wide `paige-social` Upload-Post credential. Their executor
// returns a truthful governed "unavailable" result, assembled by this one pure helper so
// the tool AGREES with the capability-truth manifest (social.publish → planned, #1166)
// instead of implying Paige can post/report/list. These tests lock the honesty contract:
// never available, never a completed-send claim, always a clearly-negative phrase, and
// pure (deterministic).
import { describe, expect, it } from "vitest";
import {
  socialToolUnavailable,
  type SocialTool,
} from "../../supabase/functions/_shared/social-publish-containment.ts";

const TOOLS: SocialTool[] = ["social_post", "social_analytics", "social_accounts"];

// A clearly-negative phrase the model relays so it never implies a send happened.
const NEGATIVE_PHRASE = /isn't available|not available|can't (publish|post)/i;
// Bare completed-send words — allowed ONLY inside an explicit negation (social_post only).
const COMPLETED_SEND = /\b(posted|published|scheduled|sent)\b/i;

describe("socialToolUnavailable — governed honest-degrade for the social tools", () => {
  for (const tool of TOOLS) {
    describe(tool, () => {
      const r = socialToolUnavailable(tool);

      it("reports unavailable, never a success-looking send", () => {
        expect(r.success).toBe(true);
        expect(r.available).toBe(false);
        expect(r.status).toBe("unavailable");
      });

      it("carries a non-empty, clearly-negative note", () => {
        expect(typeof r.note).toBe("string");
        expect(r.note.trim().length).toBeGreaterThan(0);
        expect(r.note).toMatch(NEGATIVE_PHRASE);
      });

      it("maps to a capability-truth manifest key", () => {
        expect(typeof r.capability).toBe("string");
        expect(r.capability.length).toBeGreaterThan(0);
      });
    });
  }

  it("social_post maps to social.publish and says it can still DRAFT but not publish", () => {
    const r = socialToolUnavailable("social_post");
    expect(r.capability).toBe("social.publish");
    expect(r.note).toMatch(/draft/i);
    // A completed-send word appears ONLY inside the explicit negation — never as a claim.
    expect(r.note).toMatch(/nothing was posted or scheduled/i);
    expect(r.note).toMatch(/can't publish or schedule/i);
  });

  it("social_analytics maps to social.analytics and claims no completed send at all", () => {
    const r = socialToolUnavailable("social_analytics");
    expect(r.capability).toBe("social.analytics");
    // This note never touches posted/published/scheduled/sent, even negated.
    expect(r.note).not.toMatch(COMPLETED_SEND);
  });

  it("social_accounts maps to social.presence and claims no completed send at all", () => {
    const r = socialToolUnavailable("social_accounts");
    expect(r.capability).toBe("social.presence");
    expect(r.note).not.toMatch(COMPLETED_SEND);
  });

  it("is PURE — same input yields deeply-equal output across calls", () => {
    for (const tool of TOOLS) {
      const a = socialToolUnavailable(tool);
      const b = socialToolUnavailable(tool);
      expect(a).toEqual(b);
      // Exact shape is deterministic and locked.
      expect(a).toEqual({
        success: true,
        available: false,
        status: "unavailable",
        capability: a.capability,
        note: a.note,
      });
    }
  });

  it("every tool's note is distinct (the three notes are tool-specific)", () => {
    const notes = TOOLS.map((t) => socialToolUnavailable(t).note);
    expect(new Set(notes).size).toBe(TOOLS.length);
  });
});

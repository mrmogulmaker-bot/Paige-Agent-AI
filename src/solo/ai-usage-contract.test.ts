/**
 * The AI usage card's presentation contract, asserted directly.
 *
 * The cases that matter here are the ones where a plausible-looking implementation would state
 * something it cannot prove: a refusal rendered as zero usage, a calendar month described as a
 * billing period, promotional access described as a paid plan, a missing allowance rendered as
 * "0 included", or a rounded credit count that overstates what was used.
 */
import { describe, expect, it } from "vitest";
import {
  creditsFrom,
  resolveAiUsagePresentation,
  type AiUsageInput,
} from "./billing-contract";
import { asCount, readAiUsageRow } from "./data/useWorkspaceAiUsage";

const fmt = (iso: string) => iso.slice(0, 10);

function input(over: Partial<AiUsageInput> = {}): AiUsageInput {
  return {
    loading: false,
    readFailed: false,
    usageState: "ok",
    revenueClass: "promotional",
    includedAiTokensMonth: 5_000_000,
    aiCreditTokenRatio: 1000,
    periodSource: "calendar_month",
    periodStart: "2026-09-01T00:00:00Z",
    periodEnd: "2026-10-01T00:00:00Z",
    tokensUsed: 1_000_000,
    formatDate: fmt,
    ...over,
  };
}

const valueOf = (p: ReturnType<typeof resolveAiUsagePresentation>, label: string) =>
  p.fields.find((f) => f.label === label)?.value ?? null;

describe("resolveAiUsagePresentation — refusals never become numbers", () => {
  it("loading states nothing at all", () => {
    const p = resolveAiUsagePresentation(input({ loading: true }));
    expect(p.state).toBe("usage-loading");
    expect(p.fields).toHaveLength(0);
  });

  it("a failed read says the read failed, offers a retry, and shows no total", () => {
    const p = resolveAiUsagePresentation(input({ readFailed: true }));
    expect(p.state).toBe("usage-error");
    expect(p.canRetry).toBe(true);
    expect(p.fields).toHaveLength(0);
  });

  it.each([
    ["not_applicable", "usage-not-applicable"],
    ["owner_only", "usage-owner-only"],
    ["no_workspace", "usage-no-workspace"],
  ] as const)("%s shows no fields, so a refusal can never read as zero usage", (usageState, state) => {
    const p = resolveAiUsagePresentation(input({ usageState, tokensUsed: null }));
    expect(p.state).toBe(state);
    expect(p.fields).toHaveLength(0);
    expect(JSON.stringify(p)).not.toMatch(/0 tokens|0 AI credits/);
  });

  it("a sub-account is told the roll-up is undecided, not that it used nothing", () => {
    const p = resolveAiUsagePresentation(input({ usageState: "not_applicable" }));
    expect(p.body).toMatch(/not a statement that nothing was used/i);
  });

  it("a non-owner is told why no total is shown, not shown a zero", () => {
    const p = resolveAiUsagePresentation(input({ usageState: "owner_only" }));
    expect(p.body).toMatch(/rather than a zero/i);
  });
});

describe("resolveAiUsagePresentation — the tracked reading", () => {
  it("states the allowance, the usage and the remainder in credits AND tokens", () => {
    const p = resolveAiUsagePresentation(input());
    expect(p.state).toBe("usage-tracked");
    expect(valueOf(p, "Included each month")).toBe("5,000 AI credits (5,000,000 tokens)");
    expect(valueOf(p, "Used this period")).toBe("1,000 AI credits (1,000,000 tokens)");
    expect(valueOf(p, "Remaining")).toBe("4,000 AI credits (4,000,000 tokens)");
  });

  it("states the credit conversion from the PLAN's ratio, not a hardcoded 1,000", () => {
    const p = resolveAiUsagePresentation(input({ aiCreditTokenRatio: 500, tokensUsed: 1000 }));
    expect(p.note).toContain("One AI credit is 500 tokens recorded by the platform.");
    expect(valueOf(p, "Used this period")).toBe("2 AI credits (1,000 tokens)");
  });

  it("names a calendar month as a calendar month and DENIES a billing period exists", () => {
    // Two revisions, both from real defects. First this banned the substring "billing period"
    // outright, which the honest copy trips on the way to saying "has NO provider billing period" —
    // banning the word would have silenced the disclosure. Then the sentence moved from a FIELD to
    // the note, because the rendered frame showed the field clipped to "This calendar month (this
    // workspace has no …". Asserting the field kept passing while the sentence was unreadable, so
    // the assertion now follows the text to where a person can actually finish reading it.
    const p = resolveAiUsagePresentation(input({ periodSource: "calendar_month" }));
    expect(p.note).toMatch(/calendar month/i);
    expect(p.note).toMatch(/no provider billing period/i);
    expect(p.note).not.toMatch(/your .{0,20}billing period/i);
    expect(p.fields.some((f) => f.label === "Period source")).toBe(false);
  });

  it("names a real subscription period as one", () => {
    const p = resolveAiUsagePresentation(input({ periodSource: "subscription" }));
    expect(p.note).toMatch(/subscription’s current billing period/i);
  });

  it("omits the period row entirely when the server gave no boundary", () => {
    const p = resolveAiUsagePresentation(input({ periodStart: null, periodEnd: null }));
    expect(valueOf(p, "Period")).toBeNull();
  });

  it("labels a promotional workspace as promotional and does not call it a paid plan", () => {
    const p = resolveAiUsagePresentation(input({ revenueClass: "promotional" }));
    expect(p.heading).toBe("Promotional AI usage tracking");
    expect(p.body).toMatch(/promotional access during the beta/i);
    expect(p.body).not.toMatch(/\bpaid\b|\bpurchase|\bcharged\s+\$/i);
  });

  it("does not claim promotional access for an unclassified workspace (R13)", () => {
    const p = resolveAiUsagePresentation(input({ revenueClass: null }));
    expect(p.heading).toBe("AI usage");
    expect(p.body).not.toMatch(/promotional/i);
  });

  it("says plainly that nothing is charged and nothing stops working", () => {
    const p = resolveAiUsagePresentation(input());
    expect(p.body).toMatch(/nothing stops working/i);
  });

  it("never states a cost, a projection, or an invented unit", () => {
    const blob = JSON.stringify(resolveAiUsagePresentation(input()));
    expect(blob).not.toMatch(/\$|USD|cost|estimated spend/i);
    expect(blob).not.toMatch(/project|forecast|on track to|will run out|overage/i);
    expect(blob).not.toMatch(/\bactions\b|\bmessages used\b/i);
  });

  it("shows a real zero from a successful read, which is not the same as a refusal", () => {
    const p = resolveAiUsagePresentation(input({ tokensUsed: 0 }));
    expect(p.state).toBe("usage-tracked");
    expect(valueOf(p, "Used this period")).toBe("0 AI credits (0 tokens)");
    expect(valueOf(p, "Remaining")).toBe("5,000 AI credits (5,000,000 tokens)");
  });

  it("clamps the remainder at zero rather than showing a negative credit count", () => {
    const p = resolveAiUsagePresentation(input({ tokensUsed: 6_000_000 }));
    expect(valueOf(p, "Remaining")).toBe("0 AI credits (0 tokens)");
    expect(valueOf(p, "Used this period")).toBe("6,000 AI credits (6,000,000 tokens)");
  });
});

describe("resolveAiUsagePresentation — no allowance is not a zero allowance", () => {
  it("a plan with no allowance says so instead of showing 0 included", () => {
    const p = resolveAiUsagePresentation(input({ includedAiTokensMonth: null, aiCreditTokenRatio: null }));
    expect(p.state).toBe("usage-no-allowance");
    expect(valueOf(p, "Included each month")).toBeNull();
    expect(p.body).toMatch(/does not define an included monthly amount/i);
    expect(valueOf(p, "Used this period")).toBe("1,000,000 tokens");
  });

  it("a nonsense ratio degrades to the no-allowance reading rather than dividing by zero", () => {
    const p = resolveAiUsagePresentation(input({ aiCreditTokenRatio: 0 }));
    expect(p.state).toBe("usage-no-allowance");
    expect(JSON.stringify(p)).not.toMatch(/Infinity|NaN/);
  });
});

describe("creditsFrom", () => {
  it("floors rather than rounding, so a credit count never overstates", () => {
    expect(creditsFrom(4_999_500, 1000)).toBe(4999);
    expect(creditsFrom(999, 1000)).toBe(0);
  });
  it("returns zero for a ratio that cannot divide", () => {
    expect(creditsFrom(1000, 0)).toBe(0);
  });
});

describe("readAiUsageRow", () => {
  it("reads bigint counts that PostgREST delivers as STRINGS", () => {
    const row = readAiUsageRow({
      tenant_id: "t1",
      scope: "top_level",
      can_view: true,
      usage_state: "ok",
      revenue_class: "promotional",
      reference_plan_slug: "solo",
      included_ai_tokens_month: "5000000",
      ai_credit_token_ratio: 1000,
      period_source: "calendar_month",
      period_start: "2026-09-01T00:00:00Z",
      period_end: "2026-10-01T00:00:00Z",
      tokens_used: "1000000",
      events_counted: 3,
      usage_last_recorded_at: "2026-09-02T00:00:00Z",
    });
    expect(row?.includedAiTokensMonth).toBe(5_000_000);
    expect(row?.tokensUsed).toBe(1_000_000);
  });

  it("drops a total the server attached to a refusal, so a refusal can never paint as usage", () => {
    const row = readAiUsageRow({ usage_state: "owner_only", tokens_used: "999999", scope: "top_level" });
    expect(row?.usageState).toBe("owner_only");
    expect(row?.tokensUsed).toBeNull();
  });

  it("treats an unknown usage_state as no_workspace rather than letting it through as ok", () => {
    expect(readAiUsageRow({ usage_state: "something_new" })?.usageState).toBe("no_workspace");
  });

  it("returns null for a missing row so the caller reports a failed read", () => {
    expect(readAiUsageRow(null)).toBeNull();
  });

  it("never produces NaN from a non-numeric count", () => {
    expect(asCount("not a number")).toBeNull();
    expect(asCount(Number.NaN)).toBeNull();
    expect(asCount("")).toBeNull();
    expect(asCount(null)).toBeNull();
  });
});

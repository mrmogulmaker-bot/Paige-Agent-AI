// @vitest-environment node
// Media budget + approval policy — the pure decision core of the media seam
// (owner build authorization 2026-09-12). These tests pin the fail-closed
// rulings: unknown accrual blocks, unset ceiling blocks (no silent default),
// the cheap band does NOT continue past the hard ceiling for media, marginal
// spend cannot cross the ceiling, and the approval boundary (draft allowance /
// premium / video-always) behaves exactly as authorized.
import { describe, expect, it } from "vitest";
import {
  decideMediaBudget,
  mediaBand,
  resolveApprovalPolicy,
} from "../../supabase/functions/_shared/media-provider/budget.ts";

describe("media approval boundary (owner authorization 'Required behavior')", () => {
  it("video ALWAYS requires approval, whatever the estimate", () => {
    expect(resolveApprovalPolicy({ mode: "video", tier: "standard", estimatedCostUsd: 0.01, draftAllowanceUsd: 0.1 }))
      .toEqual({ approvalRequired: true, reason: "video_requires_approval" });
  });

  it("premium models always require confirmation", () => {
    expect(resolveApprovalPolicy({ mode: "image", tier: "premium", estimatedCostUsd: 0.04, draftAllowanceUsd: 0.1 }))
      .toEqual({ approvalRequired: true, reason: "premium_model" });
  });

  it("standard images within the draft allowance may proceed", () => {
    expect(resolveApprovalPolicy({ mode: "image", tier: "standard", estimatedCostUsd: 0.03, draftAllowanceUsd: 0.1 }))
      .toEqual({ approvalRequired: false, reason: "within_draft_allowance" });
  });

  it("standard images above the allowance require confirmation", () => {
    expect(resolveApprovalPolicy({ mode: "image", tier: "standard", estimatedCostUsd: 0.11, draftAllowanceUsd: 0.1 }))
      .toEqual({ approvalRequired: true, reason: "above_draft_allowance" });
  });
});

describe("media band mapping", () => {
  it("premium tiers and video are never the cheap band (they must block at the hard ceiling)", () => {
    expect(mediaBand("video", "standard")).toBe("reasoning");
    expect(mediaBand("image", "premium")).toBe("reasoning");
    expect(mediaBand("image_edit", "premium")).toBe("reasoning");
    expect(mediaBand("image", "standard")).toBe("cheap");
  });
});

describe("decideMediaBudget — fail-closed rulings", () => {
  it("fails closed on unknown accrual (owner: 'budget unavailable… → fail closed')", () => {
    const v = decideMediaBudget({ accruedUsd: null, ceilingUsd: 20, mode: "image", tier: "standard", estimatedCostUsd: 0.03 });
    expect(v.verdict).toBe("deny");
    if (v.verdict === "deny") expect(v.gate).toBe("budget_unknown");
  });

  it("treats an UNSET ceiling as spend-off — no silent default (compliance H3)", () => {
    const v = decideMediaBudget({ accruedUsd: 0, ceilingUsd: null, mode: "image", tier: "standard", estimatedCostUsd: 0.03 });
    expect(v.verdict).toBe("deny");
    if (v.verdict === "deny") {
      expect(v.gate).toBe("budget_unknown");
      expect(v.explanation).toMatch(/media_budget_daily_usd/);
    }
  });

  it("blocks cheap-band image spend at the hard ceiling (compliance H1: media never continues past 100%)", () => {
    const v = decideMediaBudget({ accruedUsd: 20, ceilingUsd: 20, mode: "image", tier: "standard", estimatedCostUsd: 0.03 });
    expect(v.verdict).toBe("deny");
    if (v.verdict === "deny") expect(v.gate).toBe("budget_exceeded");
  });

  it("blocks a job whose marginal spend would cross the ceiling even below it", () => {
    const v = decideMediaBudget({ accruedUsd: 19.99, ceilingUsd: 20, mode: "image", tier: "standard", estimatedCostUsd: 0.03 });
    expect(v.verdict).toBe("deny");
    if (v.verdict === "deny") expect(v.explanation).toMatch(/would exceed today's media budget/);
  });

  it("allows ordinary in-budget image jobs, soft-gated near the ceiling", () => {
    const okCase = decideMediaBudget({ accruedUsd: 1, ceilingUsd: 20, mode: "image", tier: "standard", estimatedCostUsd: 0.03 });
    expect(okCase.verdict).toBe("allow");
    const soft = decideMediaBudget({ accruedUsd: 16.5, ceilingUsd: 20, mode: "image", tier: "standard", estimatedCostUsd: 0.03 });
    expect(soft.verdict).toBe("allow");
    if (soft.verdict === "allow") expect(soft.decision.gate).toBe("budget_soft");
  });
});

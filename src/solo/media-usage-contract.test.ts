/**
 * Vibe Media usage presentation — the pure resolver contract (the
 * ai-usage-contract.test.ts precedent). These pin the OWNER-REQUIRED states a
 * person can land on, at the contract the surface renders:
 *   trial-equivalent included allowance, low balance (80%+), exhausted,
 *   reserved-in-flight holds, completion breakdown, refusals, retry.
 */
import { describe, expect, it } from "vitest";
import { resolveMediaUsagePresentation } from "./billing-contract";

const base = {
  loading: false,
  readFailed: false,
  usageState: "ok" as const,
  allowanceMonthly: 300,
  includedRemaining: 300,
  purchasedRemaining: 0,
  totalRemaining: 300,
  holdsOpen: 0,
  imageCredits: 0,
  imageEditCredits: 0,
  videoCredits: 0,
  otherCredits: 0,
  jobsMonth: 0,
  periodEnd: "2026-10-01T00:00:00Z",
  formatDate: () => "Oct 1, 2026",
};

describe("the working state — included allowance, stated plainly", () => {
  it("shows the allowance, included remaining, available total, and reset", () => {
    const v = resolveMediaUsagePresentation(base);
    expect(v.state).toBe("media-ok");
    expect(v.fields).toContainEqual({ label: "Included monthly allowance", value: "300 Media Credits" });
    expect(v.fields).toContainEqual({ label: "Available to spend", value: "300 Media Credits" });
    expect(v.fields).toContainEqual({ label: "Allowance resets", value: "Oct 1, 2026" });
    expect(v.notice).toBeNull();
    expect(v.note).toMatch(/One Media Credit covers one cent/);
    expect(v.note).toMatch(/no unlimited media/i);
  });

  it("purchased credits are shown only when they exist", () => {
    const v = resolveMediaUsagePresentation({ ...base, purchasedRemaining: 350, totalRemaining: 650, includedRemaining: 300 });
    expect(v.fields).toContainEqual({ label: "Purchased credits remaining", value: "350" });
  });
});

describe("notice bands — 50 / 80 / 100", () => {
  it("quiet below 50%", () => {
    expect(resolveMediaUsagePresentation({ ...base, includedRemaining: 200, imageCredits: 100, jobsMonth: 25 }).notice).toBeNull();
  });
  it("halfway note at 50%", () => {
    expect(resolveMediaUsagePresentation({ ...base, includedRemaining: 150, imageCredits: 150, jobsMonth: 38 }).notice).toMatch(/Halfway/);
  });
  it("80% warning", () => {
    expect(resolveMediaUsagePresentation({ ...base, includedRemaining: 50, imageCredits: 250, jobsMonth: 60 }).notice).toMatch(/about 83%/);
  });
  it("100% notice while purchased credits remain", () => {
    const v = resolveMediaUsagePresentation({ ...base, includedRemaining: 0, purchasedRemaining: 350, totalRemaining: 350, imageCredits: 300, jobsMonth: 75 });
    expect(v.state).toBe("media-ok");
    expect(v.notice).toMatch(/included media allowance is used/);
  });
});

describe("exhausted — the hard stop is truthful, not scary", () => {
  it("exhausted state names what happens next (estimate + approval + credits)", () => {
    const v = resolveMediaUsagePresentation({ ...base, includedRemaining: 0, purchasedRemaining: 0, totalRemaining: 0, imageCredits: 300, jobsMonth: 75 });
    expect(v.state).toBe("media-exhausted");
    expect(v.heading).toMatch(/exhausted/i);
    expect(v.body).toMatch(/estimated cost/i);
  });
});

describe("holds and completion breakdown", () => {
  it("reserved credits surface as 'Reserved for jobs in flight'", () => {
    const v = resolveMediaUsagePresentation({ ...base, includedRemaining: 296, totalRemaining: 296, holdsOpen: 4 });
    expect(v.fields).toContainEqual({ label: "Reserved for jobs in flight", value: "4" });
  });
  it("a month with usage shows the category breakdown", () => {
    const v = resolveMediaUsagePresentation({
      ...base, includedRemaining: 44, totalRemaining: 44,
      imageCredits: 220, imageEditCredits: 32, videoCredits: 4, jobsMonth: 64,
    });
    expect(v.fields).toContainEqual({ label: "Images this month", value: "220 cr" });
    expect(v.fields).toContainEqual({ label: "Edits this month", value: "32 cr" });
    expect(v.fields).toContainEqual({ label: "Video this month", value: "4 cr" });
    expect(v.fields).toContainEqual({ label: "Completed jobs this month", value: "64" });
  });
  it("video and other categories appear only when nonzero (no zero-noise)", () => {
    const v = resolveMediaUsagePresentation({ ...base, includedRemaining: 296, totalRemaining: 296, imageCredits: 4, jobsMonth: 1 });
    expect(v.fields.some((f) => f.label === "Video this month")).toBe(false);
    expect(v.fields.some((f) => f.label === "Other media this month")).toBe(false);
  });
});

describe("refusals and retry — a refusal is never zero usage", () => {
  it("read failure retries and states nothing changed", () => {
    const v = resolveMediaUsagePresentation({ ...base, readFailed: true });
    expect(v.state).toBe("media-error");
    expect(v.canRetry).toBe(true);
    expect(v.heading).toMatch(/could not be read/);
  });
  it("loading / no-workspace / owner-only / not-applicable", () => {
    expect(resolveMediaUsagePresentation({ ...base, loading: true }).state).toBe("media-loading");
    expect(resolveMediaUsagePresentation({ ...base, usageState: "no_workspace" }).state).toBe("media-no-workspace");
    expect(resolveMediaUsagePresentation({ ...base, usageState: "owner_only" }).state).toBe("media-owner-only");
    expect(resolveMediaUsagePresentation({ ...base, usageState: "not_applicable" }).state).toBe("media-not-applicable");
  });
});

import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import type { SystemsCheckFinding } from "@/hooks/useSystemsCheck";

/**
 * Two things this file settles.
 *
 * 1. THE RETIRED-PACK COPY IS GONE. Claude Design caught this surface rendering
 *    `Super Admin Shell.dc.html` L6781–6783 — "Is the machine running for everybody" and
 *    "Green means a check ran and passed…" — plus its THIRTEEN-category taxonomy. None of those
 *    strings exists in v3, and the thirteen categories are not the vocabulary our registry uses.
 *    A grep-style assertion is the only thing that keeps them from creeping back in a later edit.
 *
 * 2. THE SPACE-BEFORE-PUNCTUATION REPORT. CD read the live surface as
 *    "10 checks , one category seeded ." — a space before every comma and period. Reading the
 *    source found no such spaces, and an unfalsifiable "I could not reproduce it" is worth
 *    nothing, so this asserts on the RENDERED text instead: whatever the composition does, the
 *    output must never put whitespace in front of a comma, period or semicolon.
 */

const FINDINGS: SystemsCheckFinding[] = [
  {
    id: "a",
    run_id: "r",
    check_id: "operator_rls_posture",
    status: "pass",
    severity_at_finding: "blocking",
    evidence: { tables: 11 },
    paige_interpretation: null,
    paige_drafted_fix: null,
    department_id: null,
    resolved_at: null,
    resolution: null,
    resolution_action_id: null,
    created_at: "2026-08-23T06:30:00Z",
    check_name: "operator_rls_posture",
    domain: "infrastructure",
    priority: 5,
  },
  {
    id: "b",
    run_id: "r",
    check_id: "operator_migration_drift",
    status: "skip",
    severity_at_finding: "medium",
    evidence: null,
    paige_interpretation: "Deferred to the CI reader.",
    paige_drafted_fix: null,
    department_id: null,
    resolved_at: null,
    resolution: null,
    resolution_action_id: null,
    created_at: "2026-08-23T06:30:00Z",
    check_name: "operator_migration_drift",
    domain: "infrastructure",
    priority: 70,
  },
  {
    id: "c",
    run_id: "r",
    check_id: "operator_campaign_attribution",
    status: "error",
    severity_at_finding: "high",
    evidence: null,
    paige_interpretation: "The runner failed.",
    paige_drafted_fix: null,
    department_id: null,
    resolved_at: null,
    resolution: null,
    resolution_action_id: null,
    created_at: "2026-08-23T06:30:00Z",
    check_name: "operator_campaign_attribution",
    domain: "marketing",
    priority: 30,
  },
];

vi.mock("@/hooks/useSystemsCheck", () => ({
  useSystemsCheck: () => ({
    run: {
      id: "r",
      started_at: "2026-08-23T06:30:00Z",
      completed_at: "2026-08-23T06:34:00Z",
      check_count: 3,
      pass_count: 1,
      fail_count: 0,
    },
    findings: FINDINGS,
    loading: false,
    isError: false,
    scanPending: false,
    refresh: () => {},
  }),
}));

vi.mock("@/operator/data/usePlatformTrust", () => ({
  usePlatformTrust: () => ({
    level: 2,
    tally: [0, 23, 0, 0],
    away: "hold",
    domains: {},
    loading: false,
    error: null,
    setLevel: async () => {},
  }),
}));

vi.mock("@/components/systems-check/SystemsCheckTile", () => ({
  SystemsCheckTile: () => null,
}));

vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: () => {} }) }));

async function render(): Promise<string> {
  const { default: SystemsCheckSurface } = await import("@/operator/surfaces/SystemsCheckSurface");
  return renderToStaticMarkup(
    <MemoryRouter>
      <SystemsCheckSurface />
    </MemoryRouter>,
  );
}

/** The rendered text, with tags and entities out of the way. */
function text(html: string): string {
  return html
    .replace(/<[^>]*>/g, " ")
    .replace(/&middot;/g, "·")
    .replace(/&#x27;|&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&")
    .replace(/&mdash;/g, "—")
    .replace(/\s+/g, " ");
}

describe("Systems Check — re-ported from v3", () => {
  it("renders none of the retired pack's copy", async () => {
    const t = text(await render());
    expect(t).not.toMatch(/Is the machine running for everybody/i);
    expect(t).not.toMatch(/Green means a check ran and passed/i);
    expect(t).not.toMatch(/Thirteen categories/i);
    // The retired taxonomy's tile names, none of which the registry uses.
    expect(t).not.toMatch(/CI\/CD pipelines/i);
    expect(t).not.toMatch(/Automations state/i);
    expect(t).not.toMatch(/Fleet-wide tenant health/i);
  });

  it("renders v3's own copy and domain vocabulary", async () => {
    const t = text(await render());
    expect(t).toMatch(/One cell per check, in registry order/);
    expect(t).toMatch(/A thicker cap marks a blocking check/);
    expect(t).toMatch(/Worst severity first, then registry priority/);
    expect(t).toMatch(/Comms deliverability/);
    expect(t).toMatch(/Payments ops/);
    expect(t).toMatch(/Data and product/);
  });

  it("composes the brief from the findings rather than an authored sentence", async () => {
    const t = text(await render());
    // One pass of three, two unrun (one skip + one error) — every figure derived.
    expect(t).toMatch(/Nothing failed\. One of three passed, and two could not run at all\./);
    expect(t).toMatch(/one were skipped and one errored/);
  });

  it("never renders whitespace before a comma, period or semicolon", async () => {
    const t = text(await render());
    const offenders = [...t.matchAll(/\S\s+[,.;]/g)].map((m) => m[0]);
    expect(offenders).toEqual([]);
  });

  it("draws the Trust Compass ceiling by name, not a hardcoded rung", async () => {
    const t = text(await render());
    expect(t).toMatch(/Trust Compass — Ask first/);
    expect(t).toMatch(/Ceiling for every capability/);
  });
});

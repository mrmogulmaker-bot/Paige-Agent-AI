import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import type { SystemsCheckFinding, SystemsCheckRun } from "@/hooks/useSystemsCheck";

/**
 * The failure these assertions exist to stop is the one this console has shipped four times:
 * a surface that typechecks, lints, resolves its route and renders nothing a human can read —
 * or renders the RETIRED pack's content at a v3 address. Every assertion is on rendered
 * CONTENT; every string checked is either the pack's verbatim structure (`paige-ia.js`
 * L268–L294 / L496–L508) or a figure DERIVED from the controlled read below — never a
 * fixture, because no fixture is ported.
 */

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    // The series/ack reads never resolve inside a static render (effects do not run there),
    // so the charts render their honest loading state — asserted below, not avoided.
    from: () => {
      throw new Error("not reached in a static render");
    },
  },
}));

const RUN: SystemsCheckRun = {
  id: "r1",
  started_at: "2026-09-12T06:30:00Z",
  completed_at: "2026-09-12T06:34:00Z",
  // Deliberately NOT the pack's fixture 10/4/1 — a derived figure must be provably ours.
  // 5 pass + 1 fail + 2 could-not-run = 8, consistent with FINDINGS below (§13: the
  // aggregate and the findings describe the same run).
  check_count: 8,
  pass_count: 5,
  fail_count: 1,
};

function finding(id: string, checkId: string, status: SystemsCheckFinding["status"], severity: SystemsCheckFinding["severity_at_finding"], name: string): SystemsCheckFinding {
  return {
    id,
    run_id: "r1",
    check_id: checkId,
    status,
    severity_at_finding: severity,
    evidence: null,
    paige_interpretation: null,
    paige_drafted_fix: null,
    department_id: null,
    resolved_at: null,
    resolution: null,
    resolution_action_id: null,
    created_at: "2026-09-12T06:30:00Z",
    check_name: name,
    domain: "infrastructure",
    priority: 10,
  };
}

const FINDINGS: SystemsCheckFinding[] = [
  finding("a", "operator_cross_tenant_canary", "pass", "blocking", "Cross-tenant canary"),
  finding("b", "operator_rls_coverage", "pass", "blocking", "RLS coverage"),
  finding("c", "operator_migration_drift", "skip", "medium", "Database migration drift"),
  finding("d", "operator_edge_drift", "error", "medium", "Edge function drift"),
  finding("e", "operator_db_health", "fail", "high", "Prod DB health"),
];

const snapshot = (over: Partial<{ run: SystemsCheckRun | null; findings: SystemsCheckFinding[]; loading: boolean; isError: boolean }> = {}) => ({
  run: RUN,
  findings: FINDINGS,
  loading: false,
  isError: false,
  scanPending: false,
  scanInProgressSince: null,
  refresh: () => {},
  ...over,
});

vi.mock("@/hooks/useSystemsCheck", () => ({
  useSystemsCheck: () => snapshot(),
}));

import { couldNotRun, findingByKey, runCountOf, LEDGER_CHECK_KEYS } from "@/operator/data/usePlatformHealth";

async function render(): Promise<string> {
  const { default: PlatformHealthSurface } = await import("@/operator/surfaces/PlatformHealthSurface");
  return renderToStaticMarkup(
    <MemoryRouter>
      <PlatformHealthSurface />
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

describe("Platform health — the pack's Analytics view, ported", () => {
  it("renders the pack's verbatim structure", async () => {
    const t = text(await render());
    // ledgerByView (L276–L284): the Latest run ledger.
    expect(t).toContain("Latest run");
    expect(t).toContain("Read from the sweep, not asserted.");
    // The slot ledger (L285–L294): rows, meta and the authored foot.
    expect(t).toContain("Platform health");
    expect(t).toContain("Systems check, run history and rules read here");
    for (const row of ["Resolver integrity", "RLS posture", "Migration drift", "Run history", "Alert firings"]) {
      expect(t).toContain(row);
    }
    expect(t).toContain(
      "These three used to want rail slots. They are readings, so they are lenses here — and the rules that produce them are knobs, so they are configured in Settings.",
    );
    // The four chart titles (L496–L508).
    for (const chart of ["Sweep outcome", "Checks that could not run", "LLM error rate", "Time to acknowledge"]) {
      expect(t).toContain(chart);
    }
  });

  it("derives every Latest-run figure from the read — never the pack's fixture 4/10", async () => {
    const t = text(await render());
    expect(t).toContain("5 / 8"); // passed, from the controlled run
    expect(t).toContain("1 high"); // the Failed detail, composed from findings
    expect(t).not.toContain("4 / 10"); // the pack's fixture must not leak through
    // Rule 3 — the deferral foot names OUR unrun checks, composed not authored.
    expect(t).toContain("2 of 8 checks could not run");
    expect(t).toContain("Database migration drift");
    expect(t).toContain("None of them is a pass.");
  });

  it("resolves the ledger rows from real findings, naming their checks", async () => {
    const t = text(await render());
    expect(t).toContain("operator_cross_tenant_canary");
    expect(t).toContain("operator_rls_coverage");
    expect(t).toContain("operator_migration_drift");
    // Pass statuses for the two passing checks; Could not run for the deferred drift check.
    expect(t).toMatch(/Resolver integrity .*?Pass/);
    expect(t).toMatch(/RLS posture .*?Pass/);
    expect(t).toMatch(/Migration drift .*?Could not run/);
  });

  it("renders the honest absences, never a fabricated series", async () => {
    const t = text(await render());
    // No metric history exists for llm.error_rate — the chart says so instead of drawing one.
    expect(t).toContain("no metric history exists to plot");
    // The series and ack reads have not resolved inside a static render — loading is honest.
    expect(t).toContain("Last twelve runs");
    expect(t).toContain("Firing → acknowledgement");
  });

  it("does not render the displaced Team Pulse content", async () => {
    const t = text(await render());
    expect(t).not.toContain("Team Pulse");
    expect(t).not.toContain("Platform seats only");
  });

  it("never puts whitespace before punctuation", async () => {
    const t = text(await render());
    expect(t).not.toMatch(/\s[,.;:]/);
  });
});

describe("Platform health — pure derivations", () => {
  it("keeps an unrecorded count null rather than coercing it to zero", () => {
    const unread = runCountOf({ ...RUN, check_count: null, pass_count: null, fail_count: null });
    expect(unread).toEqual({ total: null, pass: null, fail: null, other: null });
    expect(runCountOf(null).total).toBeNull();
    const read = runCountOf(RUN);
    expect(read).toEqual({ total: 8, pass: 5, fail: 1, other: 2 });
  });

  it("counts skip and error as could-not-run, and nothing else", () => {
    const unrun = couldNotRun(FINDINGS);
    expect(unrun.map((f) => f.check_id)).toEqual(["operator_migration_drift", "operator_edge_drift"]);
  });

  it("finds a ledger row's finding by its check key", () => {
    expect(findingByKey(FINDINGS, LEDGER_CHECK_KEYS.canary)?.status).toBe("pass");
    expect(findingByKey(FINDINGS, "operator_nothing")).toBeNull();
  });
});

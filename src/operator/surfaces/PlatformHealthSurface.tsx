import { useMemo } from "react";
import { Link } from "react-router-dom";
import { cn } from "@/lib/utils";
import {
  usePlatformHealth,
  LEDGER_CHECK_KEYS,
  findingByKey,
  runCountOf,
  couldNotRun,
} from "@/operator/data/usePlatformHealth";
import type { SystemsCheckFinding } from "@/hooks/useSystemsCheck";

/**
 * Platform health — the v3 pack's drawing for Analytics → Platform health
 * (`paige-ia.js` L268–L294 `ledgerByView` + the slot ledger, charts L496–L508), ported as the
 * first slice of the Platform Operator Command Center (mandate 2026-09-12, Phase 2 first
 * view; map: `docs/delivery/platform-operator-command-center.md`).
 *
 * "STRUCTURE IS DESIGN. VALUES ARE DATA." — the pack's labels, ledgers, chart titles and the
 * slot's authored foot port VERBATIM. Every figure comes from a real read or renders the
 * honest absence: the pack's own numbers (4/10, 6/6, 0.4%) are fixtures and do not cross over.
 *
 * WHERE EACH ROW READS FROM — named on screen, per the mandate ("each item must name its
 * source, freshness, scope, and honest availability"):
 *   Resolver integrity  ← `operator_cross_tenant_canary` finding (the canary exercises both
 *                          tenant resolvers cross-tenant)
 *   RLS posture         ← `operator_rls_coverage` finding (reads `operator_rls_coverage_audit()`)
 *   Migration drift     ← `operator_migration_drift` finding — its own registry row says an
 *                          edge function cannot read git, so an honest deferral here is the
 *                          CHECK'S truth, not a gap in the port
 *   Run history         ← `paige_systems_check_run` (tenant-less, capped at 100)
 *   Alert firings       ← `paige_alert_firing` (written by the evaluator only)
 *
 * RULE 3 REACHES THE PROSE — the "Latest run" foot is composed from the real skips and errors
 * of OUR sweep (the same rule SystemsCheckSurface ports CD's brief under); the pack's
 * five-of-ten sentence is fixture.
 *
 * THE CHARTS THE PACK DRAWS THAT HAVE NO SUBSTRATE render the pack's own honest-absence
 * treatment rather than a fabricated series: LLM error rate has firings (threshold crossings)
 * but no metric history to plot, and Time to acknowledge reads real `acknowledged_at` latency
 * when acknowledged firings exist and says so when none do.
 */

/** Ledger row tones — the pack's (`--pg-positive` / `--pg-negative` / `--pg-faint` / `--pg-warning`). */
type RowTone = "positive" | "negative" | "faint" | "warning";

const TONE_TEXT: Record<RowTone, string> = {
  positive: "text-[color:var(--pg-positive)]",
  negative: "text-[color:var(--pg-negative)]",
  faint: "text-muted-foreground",
  warning: "text-[color:var(--pg-warning)]",
};

const TONE_BG: Record<RowTone, string> = {
  positive: "bg-[color:var(--pg-positive)]",
  negative: "bg-[color:var(--pg-negative)]",
  faint: "bg-[color:var(--pg-line-strong)]",
  warning: "bg-[color:var(--pg-warning)]",
};

/** A finding's status on the pack's ledger vocabulary, or the honest absence. */
function statusOf(f: SystemsCheckFinding | null): { label: string; tone: RowTone } {
  if (!f) return { label: "No finding", tone: "faint" };
  if (f.status === "pass") return { label: "Pass", tone: "positive" };
  if (f.status === "fail") return { label: "Failed", tone: "negative" };
  // skip and error are both "could not run" on this vocabulary; the pack's faint tone.
  return { label: "Could not run", tone: "faint" };
}

function LedgerRow({
  name, detail, figure, status, tone, to,
}: {
  name: string;
  detail: string;
  figure: string;
  status: string;
  tone: RowTone;
  to?: string;
}) {
  const inner = (
    <>
      <div className="min-w-0 flex-1">
        <div className="truncate text-[length:var(--pg-t-body)] font-semibold leading-[1.35]">{name}</div>
        <div className="truncate text-[length:var(--pg-t-label)] text-muted-foreground">{detail}</div>
      </div>
      <div className="ml-auto flex flex-none items-center gap-3">
        <span className="text-[length:var(--pg-t-body)] font-bold tabular-nums tracking-[-0.02em]">{figure}</span>
        <span className={cn("flex-none whitespace-nowrap rounded-full px-2 py-0.5 text-[length:var(--pg-t-label)] font-semibold", TONE_TEXT[tone], "bg-[var(--pg-workspace)]")}>
          {status}
        </span>
        {to && <span className="flex-none text-[length:var(--pg-t-label)] font-semibold text-muted-foreground">Open →</span>}
      </div>
    </>
  );
  const cls =
    "flex min-w-0 items-center gap-2.5 border-b border-border/60 px-4 py-3 last:border-b-0";
  return to ? (
    <Link to={to} className={cn(cls, "transition-colors hover:bg-[var(--pg-workspace)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring")}>
      {inner}
    </Link>
  ) : (
    <div className={cls}>{inner}</div>
  );
}

/** One stacked column of the pack's `Sweep outcome` — pass/fail/could-not-run, one bar per run. */
function SweepStack({ bars }: { bars: readonly { pass: number; fail: number; other: number }[] }) {
  const max = Math.max(1, ...bars.map((b) => b.pass + b.fail + b.other));
  return (
    <div className="flex h-28 items-end gap-1.5" role="img" aria-label="Sweep outcome, last twelve runs: stacked pass, fail, and could-not-run per run">
      {bars.map((b, i) => {
        const total = b.pass + b.fail + b.other;
        return (
          <div key={i} className="flex h-full min-w-0 flex-1 flex-col justify-end gap-px" title={`Run ${i + 1}: ${b.pass} pass · ${b.fail} fail · ${b.other} could not run`}>
            {total === 0 ? (
              <div className="h-1.5 rounded-[2px] bg-[var(--pg-workspace)]" />
            ) : (
              <>
                {b.other > 0 && <div className={cn("rounded-t-[2px]", TONE_BG.faint)} style={{ height: `${(b.other / max) * 100}%` }} />}
                {b.fail > 0 && <div className={cn(TONE_BG.negative, b.other === 0 && "rounded-t-[2px]")} style={{ height: `${(b.fail / max) * 100}%` }} />}
                <div className={cn(TONE_BG.positive, "rounded-b-[2px]", b.fail === 0 && b.other === 0 && "rounded-t-[2px]")} style={{ height: `${(b.pass / max) * 100}%` }} />
              </>
            )}
          </div>
        );
      })}
    </div>
  );
}

function ChartCard({
  title, note, children,
}: {
  title: string;
  note: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex-none rounded-[13px] border-[1.5px] border-border bg-[var(--pg-raised)] px-3.5 py-3 shadow-[shadow:var(--pg-rim),var(--pg-lift-1)]">
      <div className="text-[length:var(--pg-t-body)] font-semibold">{title}</div>
      <div className="mt-0.5 text-[length:var(--pg-t-label)] text-muted-foreground">{note}</div>
      <div className="mt-2.5">{children}</div>
    </div>
  );
}

/** The pack's honest-absence treatment for a chart with no substrate (`kind: 'none'`). */
function ChartAbsence({ line }: { line: string }) {
  return (
    <div className="flex h-28 items-center justify-center rounded-[10px] border border-dashed border-border-strong/60 bg-[var(--pg-workspace)] px-6 text-center">
      <p className="max-w-[42ch] text-[length:var(--pg-t-label)] leading-[1.5] text-muted-foreground">{line}</p>
    </div>
  );
}

function SkeletonRows({ rows }: { rows: number }) {
  return (
    <div className="space-y-px" aria-busy="true">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex items-center gap-2.5 border-b border-border/60 px-4 py-3 last:border-b-0">
          <div className="h-3 w-40 animate-pulse rounded bg-[var(--pg-workspace)]" />
          <div className="ml-auto h-3 w-14 animate-pulse rounded bg-[var(--pg-workspace)]" />
        </div>
      ))}
    </div>
  );
}

export default function PlatformHealthSurface() {
  const { snapshot, sweepSeries, runCount, ack, seriesError, ackError, seriesLoading, ackLoading } =
    usePlatformHealth(true);

  const { run, findings, loading: snapshotLoading, isError: snapshotFailed } = snapshot;
  const counts = runCountOf(run);
  const unrun = useMemo(() => couldNotRun(findings), [findings]);

  // Blocking/high detail for the Failed row — computed from findings, never authored (rule 3).
  const failedDetail = useMemo(() => {
    const failed = findings.filter((f) => f.status === "fail");
    const blocking = failed.filter((f) => f.severity_at_finding === "blocking").length;
    const high = failed.filter((f) => f.severity_at_finding === "high").length;
    const parts: string[] = [];
    if (blocking > 0) parts.push(`${blocking} blocking`);
    if (high > 0) parts.push(`${high} high`);
    return parts.length ? parts.join(" · ") : "None blocking";
  }, [findings]);

  // Rule 3 — the foot names OUR sweep's deferrals, composed from the real skips and errors.
  const latestFoot = useMemo(() => {
    if (!run) return null;
    if (unrun.length === 0) return `Every check in the latest run ran. ${counts.pass ?? 0} passed, ${counts.fail ?? 0} failed.`;
    const names = unrun
      .map((f) => f.check_name ?? f.check_id)
      .slice(0, 3)
      .join(", ");
    const more = unrun.length > 3 ? `, and ${unrun.length - 3} more` : "";
    return `${unrun.length} of ${counts.total ?? "—"} checks could not run: ${names}${more}. None of them is a pass.`;
  }, [run, unrun, counts]);

  const canary = findingByKey(findings, LEDGER_CHECK_KEYS.canary);
  const rls = findingByKey(findings, LEDGER_CHECK_KEYS.rls);
  const drift = findingByKey(findings, LEDGER_CHECK_KEYS.migrationDrift);

  const ackLine = ack
    ? `Median ${ack.medianMinutes < 90 ? `${Math.round(ack.medianMinutes)} min` : `${(ack.medianMinutes / 60).toFixed(1)} h`} over ${ack.acknowledged} acknowledged firing${ack.acknowledged === 1 ? "" : "s"}${ack.unacknowledged !== null ? ` · ${ack.unacknowledged} unacknowledged` : ""}`
    : null;

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3.5">
      {/* ── title row ─────────────────────────────────────────────── */}
      <div className="flex flex-none flex-wrap items-start gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2.5">
            <span className="text-[length:var(--pg-t-label)] font-semibold tracking-[0.15em] text-muted-foreground">ANALYTICS</span>
            <span className="text-[length:var(--pg-t-title)] font-bold tracking-[-0.02em]">Platform health</span>
          </div>
          <div className="mt-1.5 text-[length:var(--pg-t-body)] text-muted-foreground">
            Systems check, run history and rules read here.
          </div>
        </div>
      </div>

      {snapshotFailed && (
        <div className="flex-none rounded-[13px] border-[1.5px] border-[color:var(--pg-negative)]/40 bg-[var(--pg-raised)] px-4 py-3 shadow-[shadow:var(--pg-rim),var(--pg-lift-1)]">
          <div className="text-[length:var(--pg-t-body)] font-semibold text-[color:var(--pg-negative)]">
            The latest sweep could not be read.
          </div>
          <div className="mt-0.5 text-[length:var(--pg-t-label)] text-muted-foreground">
            The systems-check read failed — that is a read failure, not a verdict, and no figure
            below is inferred from it. The sweep itself may be fine; retrying the view re-reads it.
          </div>
        </div>
      )}

      {!snapshotFailed && snapshotLoading && (
        <div className="grid flex-none grid-cols-1 gap-3.5 lg:grid-cols-2">
          <div className="min-h-0 overflow-hidden rounded-[13px] border-[1.5px] border-border bg-[var(--pg-raised)] shadow-[shadow:var(--pg-rim),var(--pg-lift-1)]">
            <div className="border-b border-border px-3.5 py-3"><SkeletonRows rows={1} /></div>
            <SkeletonRows rows={3} />
          </div>
          <div className="min-h-0 overflow-hidden rounded-[13px] border-[1.5px] border-border bg-[var(--pg-raised)] shadow-[shadow:var(--pg-rim),var(--pg-lift-1)]">
            <div className="border-b border-border px-3.5 py-3"><SkeletonRows rows={1} /></div>
            <SkeletonRows rows={5} />
          </div>
        </div>
      )}

      {!snapshotFailed && !snapshotLoading && !run && (
        <div className="flex-none rounded-[13px] border-[1.5px] border-border bg-[var(--pg-raised)] px-4 py-10 text-center shadow-[shadow:var(--pg-rim),var(--pg-lift-1)]">
          <div className="text-[length:var(--pg-t-body)] font-semibold">No sweep has run yet.</div>
          <div className="mx-auto mt-1 max-w-md text-[length:var(--pg-t-label)] text-muted-foreground">
            The operator sweep records every run it takes; nothing has been recorded, so nothing
            here is asserted. The first sweep populates this view.
          </div>
        </div>
      )}

      {!snapshotFailed && !snapshotLoading && run && (
        <>
          {/* ── Latest run ledger (the pack's `ledgerByView` for this view) ── */}
          <div className="min-h-0 flex-none overflow-hidden rounded-[13px] border-[1.5px] border-border bg-[var(--pg-raised)] shadow-[shadow:var(--pg-rim),var(--pg-lift-1)]">
            <div className="border-b border-border px-3.5 py-3">
              <div className="text-[length:var(--pg-t-body)] font-semibold">Latest run</div>
              <div className="mt-0.5 text-[length:var(--pg-t-label)] text-muted-foreground">Read from the sweep, not asserted.</div>
            </div>
            <LedgerRow
              name="Passed"
              detail="Of the total run"
              figure={counts.pass !== null && counts.total !== null ? `${counts.pass} / ${counts.total}` : "—"}
              status={counts.fail === 0 && counts.fail !== null ? "Pass" : counts.fail !== null && counts.fail > 0 ? "Attention" : "—"}
              tone={counts.fail === 0 && counts.fail !== null ? "positive" : "warning"}
            />
            <LedgerRow
              name="Failed"
              detail={failedDetail}
              figure={counts.fail !== null ? String(counts.fail) : "—"}
              status={counts.fail !== null && counts.fail > 0 ? "Blocking" : counts.fail === 0 ? "None" : "—"}
              tone={counts.fail !== null && counts.fail > 0 ? "negative" : "positive"}
            />
            <LedgerRow
              name="Could not run"
              detail="Skipped or errored"
              figure={counts.other !== null ? String(counts.other) : "—"}
              status={counts.other !== null && counts.other > 0 ? "Unrun" : counts.other === 0 ? "None" : "—"}
              tone="faint"
            />
            {latestFoot && (
              <div className="border-t border-border px-3.5 py-2.5 text-[length:var(--pg-t-label)] leading-[1.5] text-muted-foreground">
                {latestFoot}
              </div>
            )}
          </div>

          {/* ── Platform health ledger (the pack's slot ledger) ── */}
          <div className="min-h-0 flex-none overflow-hidden rounded-[13px] border-[1.5px] border-border bg-[var(--pg-raised)] shadow-[shadow:var(--pg-rim),var(--pg-lift-1)]">
            <div className="border-b border-border px-3.5 py-3">
              <div className="text-[length:var(--pg-t-body)] font-semibold">Platform health</div>
              <div className="mt-0.5 text-[length:var(--pg-t-label)] text-muted-foreground">Systems check, run history and rules read here.</div>
            </div>
            <LedgerRow
              name="Resolver integrity"
              detail="Cross-tenant canary · operator_cross_tenant_canary"
              figure={canary ? (canary.status === "pass" ? "Pass" : canary.status === "fail" ? "Fail" : "—") : "—"}
              status={statusOf(canary).label}
              tone={statusOf(canary).tone}
              to="/operator/fleet/systems-check"
            />
            <LedgerRow
              name="RLS posture"
              detail="Forced on operator-scope tables · operator_rls_coverage"
              figure={rls ? (rls.status === "pass" ? "Pass" : rls.status === "fail" ? "Fail" : "—") : "—"}
              status={statusOf(rls).label}
              tone={statusOf(rls).tone}
              to="/operator/fleet/systems-check"
            />
            <LedgerRow
              name="Migration drift"
              detail="An edge function cannot read git · operator_migration_drift"
              figure="—"
              status={statusOf(drift).label}
              tone={statusOf(drift).tone}
              to="/operator/fleet/systems-check"
            />
            <LedgerRow
              name="Run history"
              detail="Newest first, capped at 100"
              figure={runCount !== null ? (runCount > 100 ? "100+" : String(runCount)) : "—"}
              status={runCount !== null ? "Live" : "—"}
              tone={runCount !== null ? "positive" : "faint"}
              to="/operator/fleet/history"
            />
            <LedgerRow
              name="Alert firings"
              detail="Written by the evaluator only"
              figure={ack?.unacknowledged !== null && ack?.unacknowledged !== undefined ? String(ack.unacknowledged) : "—"}
              status={ack?.unacknowledged == null ? (ackError ? "Unread" : "—") : ack.unacknowledged > 0 ? "Unacknowledged" : "None open"}
              tone={ack?.unacknowledged != null && ack.unacknowledged > 0 ? "warning" : "faint"}
              to="/operator/settings/alerts"
            />
            <div className="border-t border-border px-3.5 py-2.5 text-[length:var(--pg-t-label)] leading-[1.5] text-muted-foreground">
              These three used to want rail slots. They are readings, so they are lenses here — and
              the rules that produce them are knobs, so they are configured in Settings.
            </div>
          </div>

          {/* ── charts (the pack's four, honest where no substrate exists) ── */}
          <div className="grid flex-none grid-cols-1 gap-2.5 lg:grid-cols-2">
            <ChartCard title="Sweep outcome" note="Last twelve runs · pass, fail, could not run">
              {seriesLoading ? (
                <div className="h-28 animate-pulse rounded-[10px] bg-[var(--pg-workspace)]" aria-busy="true" />
              ) : seriesError ? (
                <ChartAbsence line={`The run history could not be read: ${seriesError}`} />
              ) : !sweepSeries || sweepSeries.length === 0 ? (
                <ChartAbsence line="No completed run is recorded yet, so there is no series to draw." />
              ) : (
                <SweepStack bars={[...sweepSeries].reverse().map((b) => ({ pass: b.pass, fail: b.fail, other: b.other }))} />
              )}
            </ChartCard>

            <ChartCard
              title="Checks that could not run"
              note={
                counts.total !== null
                  ? `${unrun.length} of ${counts.total}, latest run`
                  : "Latest run"
              }
            >
              {unrun.length === 0 ? (
                <ChartAbsence line={run ? "Every check in the latest run ran — none was skipped or errored." : "No run yet."} />
              ) : (
                <div className="space-y-2" role="img" aria-label="Checks that could not run in the latest run">
                  {unrun.slice(0, 6).map((f) => (
                    <div key={f.id} className="flex items-center gap-2.5">
                      <span className="w-44 flex-none truncate text-[length:var(--pg-t-label)] text-muted-foreground" title={f.check_name ?? f.check_id}>
                        {f.check_name ?? f.check_id}
                      </span>
                      <div className={cn("h-1.5 flex-1 rounded-full", TONE_BG.faint)} />
                      <span className="w-20 flex-none text-right text-[length:var(--pg-t-label)] font-mono text-muted-foreground">
                        {f.status === "error" ? "error" : "skipped"}
                      </span>
                    </div>
                  ))}
                  {unrun.length > 6 && (
                    <div className="text-[length:var(--pg-t-label)] text-muted-foreground">
                      and {unrun.length - 6} more
                    </div>
                  )}
                </div>
              )}
            </ChartCard>

            <ChartCard title="LLM error rate" note="llm.error_rate · percent">
              <ChartAbsence line="Alert firings record threshold crossings, not the rate itself — no metric history exists to plot yet. The figure appears here when a series substrate records it." />
            </ChartCard>

            <ChartCard
              title="Time to acknowledge"
              note={ackLine ?? "Firing → acknowledgement, last fourteen days"}
            >
              {ackLoading ? (
                <div className="h-28 animate-pulse rounded-[10px] bg-[var(--pg-workspace)]" aria-busy="true" />
              ) : ackError ? (
                <ChartAbsence line={`Acknowledgements could not be read: ${ackError}`} />
              ) : ack ? (
                <div className="flex h-28 flex-col items-center justify-center gap-1">
                  <div className="text-[length:var(--pg-t-title)] font-bold tabular-nums tracking-[-0.02em]">
                    {ack.medianMinutes < 90 ? `${Math.round(ack.medianMinutes)} min` : `${(ack.medianMinutes / 60).toFixed(1)} h`}
                  </div>
                  <div className="text-[length:var(--pg-t-label)] text-muted-foreground">median, {ack.acknowledged} acknowledged</div>
                </div>
              ) : (
                <ChartAbsence line="Delivery ships, and acknowledgements are recorded — but no firing in the last fourteen days has been acknowledged yet, so there is no latency to report." />
              )}
            </ChartCard>
          </div>
        </>
      )}
    </div>
  );
}

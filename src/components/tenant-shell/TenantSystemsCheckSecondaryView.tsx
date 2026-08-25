import { useMemo } from "react";
import { AlertTriangle, Clock3, ListChecks } from "lucide-react";
import { useSystemsCheck, type SystemsCheckFinding } from "@/hooks/useSystemsCheck";

type SecondaryView = "directory" | "history";

const STATUS_LABEL: Record<SystemsCheckFinding["status"], string> = {
  pass: "Passing",
  fail: "Needs attention",
  skip: "Could not run",
  error: "Errored",
};

function findingName(finding: SystemsCheckFinding): string {
  return finding.check_name?.trim() || finding.check_id;
}

function domainName(finding: SystemsCheckFinding): string {
  return finding.domain?.replace(/_/g, " ") || "Other";
}

function readableTime(value: string | null | undefined): string {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleString();
}

export function TenantSystemsCheckSecondaryView({ view }: { view: SecondaryView }) {
  const snapshot = useSystemsCheck("tenant");
  const latestFindings = useMemo(
    () => snapshot.run
      ? snapshot.findings
          .filter((finding) => finding.run_id === snapshot.run?.id)
          .slice()
          .sort((a, b) => (a.priority ?? 999) - (b.priority ?? 999))
      : [],
    [snapshot.findings, snapshot.run],
  );

  const proof = snapshot.isError
    ? "UNAVAILABLE"
    : snapshot.loading
      ? "LOADING"
      : snapshot.run
        ? "PARTIAL"
        : "UNAVAILABLE";

  return (
    <section className="tcc-secondary" aria-labelledby={`tcc-${view}-title`}>
      <header className="tcc-secondary-head">
        <div>
          <p className="tcc-kicker">Systems Check · {proof}</p>
          <h1 id={`tcc-${view}-title`}>{view === "directory" ? "Directory" : "History"}</h1>
          <p>
            {view === "directory"
              ? "The checks recorded in your latest tenant-scoped snapshot."
              : "Your latest persisted Systems Check run. Full run history is not connected here yet."}
          </p>
        </div>
        {view === "directory" ? <ListChecks aria-hidden /> : <Clock3 aria-hidden />}
      </header>

      {snapshot.loading ? (
        <div className="tcc-secondary-state" aria-busy="true">Loading the tenant-scoped snapshot…</div>
      ) : snapshot.isError ? (
        <div className="tcc-secondary-state" role="alert">
          <AlertTriangle aria-hidden />
          <strong>Systems Check data is unavailable.</strong>
          <span>No account status is being inferred while the read is unavailable.</span>
        </div>
      ) : view === "directory" ? (
        latestFindings.length ? (
          <div className="tcc-directory" role="table" aria-label="Latest Systems Check directory">
            <div role="row" className="tcc-directory-header">
              <span role="columnheader">Check</span>
              <span role="columnheader">Domain</span>
              <span role="columnheader">Latest state</span>
            </div>
            {latestFindings.map((finding) => (
              <div role="row" key={finding.id}>
                <strong role="cell">{findingName(finding)}</strong>
                <span role="cell">{domainName(finding)}</span>
                <span role="cell" data-status={finding.status}>{STATUS_LABEL[finding.status]}</span>
              </div>
            ))}
          </div>
        ) : (
          <div className="tcc-secondary-state" role="status">
            <strong>
              {snapshot.scanPending
                ? "Your first scan is still in progress."
                : snapshot.run
                  ? "No checks were recorded in the latest snapshot."
                  : "No check directory is available yet."}
            </strong>
            <span>
              {snapshot.scanPending
                ? "No persisted snapshot is available yet."
                : "Checks appear after PAIGE records a tenant-scoped run."}
            </span>
          </div>
        )
      ) : snapshot.run ? (
        <article className="tcc-history-latest">
          <div>
            <p className="tcc-kicker">Latest persisted run · PARTIAL</p>
            <h2>{snapshot.run.completed_at ? "Completed" : "In progress"}</h2>
          </div>
          <dl>
            <div><dt>Started</dt><dd>{readableTime(snapshot.run.started_at)}</dd></div>
            <div><dt>Completed</dt><dd>{readableTime(snapshot.run.completed_at)}</dd></div>
            <div><dt>Checks</dt><dd>{snapshot.run.check_count ?? "—"}</dd></div>
            <div><dt>Passing</dt><dd>{snapshot.run.pass_count ?? "—"}</dd></div>
            <div><dt>Failing</dt><dd>{snapshot.run.fail_count ?? "—"}</dd></div>
          </dl>
          <p>Only the latest run is available through the current tenant read. Earlier runs remain unavailable here.</p>
        </article>
      ) : (
        <div className="tcc-secondary-state" role="status">
          <strong>{snapshot.scanPending ? "Your first scan is still in progress." : "No Systems Check history is available yet."}</strong>
          <span>{snapshot.scanPending ? "No persisted run is available yet." : "The latest run appears here after it is persisted."}</span>
        </div>
      )}
    </section>
  );
}

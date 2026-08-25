import { useMemo, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import {
  Activity,
  ArrowRight,
  Check,
  ChevronDown,
  Clock3,
  RefreshCw,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import type { DeptStatusRow } from "@/hooks/usePaigeDeptStatus";
import type { PracticeAttention } from "@/hooks/usePracticeDashboard";
import { useCommandCenter, type CommandApproval } from "@/solo/data/useCommandCenter";
import {
  useAgencyCommandCenter,
  type CommandApproval as AgencyCommandApproval,
} from "@/agency/data/useAgencyCommandCenter";
import type { AgencyShellCtx } from "@/agency/data/useAgencyRoster";
import { tenantShellDestinationsForPath } from "./tenantShellRoutes";
import "./tenant-command-center-core.css";

type Approval = CommandApproval | AgencyCommandApproval;
type ProofState = "LIVE" | "PARTIAL" | "UNAVAILABLE";

interface Metric {
  label: string;
  value?: string;
  state: ProofState;
  note?: string;
}

interface CoreData {
  greeting: { name: string; dateLabel: string; summary: string };
  metrics: Metric[];
  approvals: Approval[];
  attention?: PracticeAttention;
  attentionState: ProofState;
  departments: DeptStatusRow[];
  departmentState: ProofState;
  loading: boolean;
  approve: (id: string) => Promise<{ ok: boolean; error?: string }>;
  decline: (id: string) => Promise<{ ok: boolean; error?: string }>;
  refresh: () => void;
}

export function SoloCommandCenterCore({ openPaige }: { openPaige: () => void }) {
  const data = useCommandCenter();
  return (
    <TenantCommandCenterCore
      openPaige={openPaige}
      data={{
        ...data,
        metrics: data.metrics.map((metric) => ({
          label: metric.k,
          value: metric.v,
          state: "LIVE" as const,
        })),
        attentionState: "LIVE",
        departmentState: "LIVE",
      }}
    />
  );
}

export function AgencyCommandCenterCore({
  context,
  openPaige,
}: {
  context: AgencyShellCtx;
  openPaige: () => void;
}) {
  const data = useAgencyCommandCenter(context);
  return (
    <TenantCommandCenterCore
      openPaige={openPaige}
      data={{
        greeting: data.greeting,
        metrics: data.metrics.kpis.map((metric) =>
          metric.kind === "real"
            ? { label: metric.label, value: metric.value, state: "LIVE" as const }
            : {
                label: metric.label,
                state: "UNAVAILABLE" as const,
                note: "No connected read yet",
              },
        ),
        approvals: data.approvals,
        attention: data.attention,
        attentionState: data.mode === "agency" ? "PARTIAL" : "LIVE",
        departments: data.departments,
        departmentState: data.mode === "agency" ? "PARTIAL" : "LIVE",
        loading: data.loading,
        approve: data.approve,
        decline: data.decline,
        refresh: data.refresh,
      }}
    />
  );
}

export function TenantCommandCenterCore({
  data,
  openPaige,
}: {
  data: CoreData;
  openPaige: () => void;
}) {
  const location = useLocation();
  const destinations = tenantShellDestinationsForPath(location.pathname);
  const clientsHref = destinations.find((item) => item.id === "clients")?.href ?? "/admin/clients-hub";
  const calendarHref = destinations.find((item) => item.id === "calendar")?.href ?? "/admin/calendar";
  const settingsHref = destinations.find((item) => item.id === "settings")?.href ?? "/admin/setup";
  const [window, setWindow] = useState<"today" | "week" | "all">("today");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [resolved, setResolved] = useState(() => new Set<string>());
  const [busyId, setBusyId] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const approvals = useMemo(
    () => data.approvals.filter((approval) => !resolved.has(approval.id)),
    [data.approvals, resolved],
  );
  const visibleApprovals = approvals.filter(
    (approval) => window === "all" || approval.urgency === window,
  );
  const activeDepartments = data.departments
    .filter((department) => department.openCount > 0)
    .sort((a, b) => b.awaitingCount - a.awaitingCount || b.workingCount - a.workingCount)
    .slice(0, 5);

  async function resolveApproval(approval: Approval, decision: "approve" | "dismiss") {
    setBusyId(approval.id);
    setResolved((current) => new Set(current).add(approval.id));
    const result =
      decision === "approve" ? await data.approve(approval.id) : await data.decline(approval.id);
    setBusyId(null);
    if (!result.ok) {
      setResolved((current) => {
        const next = new Set(current);
        next.delete(approval.id);
        return next;
      });
      setNotice(result.error ?? "That action did not complete.");
      return;
    }
    setNotice(decision === "approve" ? "Approved — PAIGE is handling it." : "Dismissed.");
  }

  const attentionRows = [
    { label: "Clients at risk", value: data.attention?.at_risk_clients, href: clientsHref },
    { label: "Follow-ups due", value: data.attention?.follow_ups_due, href: clientsHref },
    { label: "Tasks due", value: data.attention?.tasks_due, href: calendarHref },
    { label: "Sessions this week", value: data.attention?.upcoming_sessions_7d, href: calendarHref },
    { label: "Onboarding", value: data.attention?.onboarding_in_progress, href: clientsHref },
  ].filter((row) => typeof row.value === "number");

  return (
    <section className="tcc-core" aria-labelledby="tenant-command-center-title">
      <header className="tcc-brief">
        <div>
          <p className="tcc-kicker">{data.greeting.dateLabel}</p>
          <h1 id="tenant-command-center-title">
            Good {new Date().getHours() < 12 ? "morning" : new Date().getHours() < 18 ? "afternoon" : "evening"}, {data.greeting.name}.
          </h1>
          <p>{data.greeting.summary}</p>
        </div>
        <div className="tcc-brief-actions">
          <button type="button" className="tcc-quiet-button" onClick={data.refresh}>
            <RefreshCw aria-hidden /> Refresh
          </button>
          <button type="button" className="tcc-primary-button" onClick={openPaige}>
            <Sparkles aria-hidden /> Put PAIGE to work
          </button>
        </div>
      </header>

      <div className="tcc-metrics" aria-label="Live business measures">
        {data.loading
          ? [0, 1, 2, 3].map((item) => <span key={item} className="tcc-metric-skeleton" />)
          : data.metrics.length > 0
            ? data.metrics.slice(0, 4).map((metric) => (
                <div className="tcc-metric" key={metric.label} data-proof={metric.state.toLowerCase()}>
                  <span>{metric.label}</span>
                  <strong>{metric.value ?? "—"}</strong>
                  <small>{metric.state === "LIVE" ? "Connected read" : metric.note}</small>
                </div>
              ))
            : (
                <div className="tcc-measures-empty" role="status">
                  No business measures are available yet. They appear here when connected records exist.
                </div>
              )}
      </div>

      <div className="tcc-field">
        <section className="tcc-queue" aria-labelledby="tcc-queue-title">
          <div className="tcc-section-head">
            <div>
              <p className="tcc-kicker">Decision queue · LIVE</p>
              <h2 id="tcc-queue-title">Waiting on you</h2>
              <p>PAIGE drafted it. You decide.</p>
            </div>
            <div className="tcc-segment" aria-label="Decision window">
              {(["today", "week", "all"] as const).map((key) => (
                <button
                  type="button"
                  key={key}
                  aria-pressed={window === key}
                  onClick={() => setWindow(key)}
                >
                  {key === "today" ? "Today" : key === "week" ? "This week" : "All"}
                </button>
              ))}
            </div>
          </div>
          <div className="tcc-queue-scroll">
            {data.loading ? (
              <div className="tcc-loading" aria-busy="true">Loading the live decision queue…</div>
            ) : visibleApprovals.length > 0 ? (
              visibleApprovals.map((approval) => {
                const expanded = expandedId === approval.id;
                return (
                  <article className="tcc-decision" key={approval.id}>
                    <div className="tcc-decision-mark" aria-hidden><Sparkles /></div>
                    <div>
                      <div className="tcc-decision-title">
                        <h3>{approval.title}</h3>
                        <span>{approval.dept}</span>
                        {approval.type && <span>{approval.type}</span>}
                        <time><Clock3 aria-hidden /> {approval.aging}</time>
                      </div>
                      {expanded && (
                        <p className="tcc-draft">
                          {approval.preview || "PAIGE has not attached a draft body to this item yet."}
                        </p>
                      )}
                      <div className="tcc-decision-actions">
                        <button
                          type="button"
                          className="tcc-primary-button"
                          disabled={busyId !== null}
                          onClick={() => void resolveApproval(approval, "approve")}
                        >
                          <Check aria-hidden /> {busyId === approval.id ? "Working…" : "Approve"}
                        </button>
                        <button
                          type="button"
                          className="tcc-quiet-button"
                          aria-expanded={expanded}
                          onClick={() => setExpandedId(expanded ? null : approval.id)}
                        >
                          {expanded ? "Hide draft" : "Read draft"} <ChevronDown aria-hidden />
                        </button>
                        <button
                          type="button"
                          className="tcc-text-button"
                          disabled={busyId !== null}
                          onClick={() => void resolveApproval(approval, "dismiss")}
                        >
                          Dismiss
                        </button>
                      </div>
                    </div>
                  </article>
                );
              })
            ) : (
              <div className="tcc-empty" role="status">
                <span><Check aria-hidden /></span>
                <strong>{approvals.length ? "Nothing in this window" : "Nothing waiting on you"}</strong>
                <p>{approvals.length ? "Choose All to see the remaining decisions." : "PAIGE will raise the next item when it earns your attention."}</p>
              </div>
            )}
          </div>
        </section>

        <aside className="tcc-signal" aria-label="Operating signal">
          <section>
            <div className="tcc-section-head compact">
              <div>
                <p className="tcc-kicker">Operating pulse · {data.departmentState}</p>
                <h2>In motion</h2>
              </div>
              <Activity aria-hidden />
            </div>
            <div className="tcc-signal-rows">
              {activeDepartments.length ? activeDepartments.map((department) => (
                <div key={department.slug}>
                  <span>{department.name}</span>
                  <strong>{department.workingCount} working</strong>
                  <small>{department.awaitingCount} awaiting you · {department.openCount} open</small>
                </div>
              )) : (
                <p className="tcc-inline-empty">No department work is in motion right now.</p>
              )}
            </div>
          </section>

          <section>
            <div className="tcc-section-head compact">
              <div>
                <p className="tcc-kicker">Attention · {data.attentionState}</p>
                <h2>Needs your attention</h2>
              </div>
            </div>
            <div className="tcc-link-rows">
              {attentionRows.length ? attentionRows.map((row) => (
                <Link key={row.label} to={row.href}>
                  <span>{row.label}</span><strong>{row.value}</strong><ArrowRight aria-hidden />
                </Link>
              )) : <p className="tcc-inline-empty">No attention counts are available yet.</p>}
            </div>
          </section>

          <section className="tcc-coverage">
            <div className="tcc-section-head compact">
              <div>
                <p className="tcc-kicker">Capability coverage</p>
                <h2>Connection status</h2>
              </div>
              <ShieldCheck aria-hidden />
            </div>
            <div className="tcc-coverage-row"><span>Trust Compass authority history</span><b>UNAVAILABLE</b></div>
            <div className="tcc-coverage-row"><span>Unified Business Vault</span><b>UNAVAILABLE</b></div>
            <Link className="tcc-settings-link" to={settingsHref}>Open Settings <ArrowRight aria-hidden /></Link>
          </section>
        </aside>
      </div>

      {notice && <div className="tcc-notice" role="status" onAnimationEnd={() => setNotice(null)}>{notice}</div>}
    </section>
  );
}

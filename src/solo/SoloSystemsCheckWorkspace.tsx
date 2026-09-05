import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import {
  AlertTriangle, ArrowUpRight, Bot, ChevronRight, RefreshCw, X,
} from "lucide-react";
import { useSystemsCheck, type SystemsCheckFinding } from "@/hooks/useSystemsCheck";
import { resolveTenantAccountContext, type TenantAccountContext } from "@/components/tenant-shell/tenantShellRoutes";
import { useCommandCenter, type CommandApproval } from "./data/useCommandCenter";
import { useSoloActivityFeed, departmentLabel, elapsedLabel } from "./data/useSoloActivityFeed";
import {
  SYSTEMS_CHECK_AREAS, destinationForCheck, areaForCheck,
} from "./systems-check-areas";
import "./solo-systems-check-workspace.css";

interface Props {
  accountContext?: TenantAccountContext | null;
  openPaige?: () => void;
  /**
   * The active workspace, forwarded by `CommandHub`. Never sent to the server — the Rail resolver
   * takes no tenant argument — it exists only so a switch is noticed by the feed's request guard.
   * `CommandHub` ALSO re-keys this whole subtree on the same value, which is the primary mechanism:
   * a switch unmounts and remounts, so no prior-workspace row, filter, pending read or loading
   * state can survive it. This prop is the second layer, not the first.
   */
  workspaceId?: string | null;
}

/** How many rail lines the compact panel carries. Deliberately small; the feed reads 25. */
const RAIL_PANEL_ROWS = 4;

const label = (value: string | null | undefined) =>
  (value || "Other").replace(/[_-]+/g, " ").replace(/\b\w/g, (char) => char.toUpperCase());

const isUnavailable = (finding: SystemsCheckFinding) => finding.status === "skip" || finding.status === "error";
const isResolved = (finding: SystemsCheckFinding) => Boolean(finding.resolved_at);
type EvidenceState = "attention" | "confirmed" | "unavailable" | "resolved";

const evidenceFilter = (finding: SystemsCheckFinding): EvidenceState => {
  if (isResolved(finding)) return "resolved";
  if (finding.status === "pass") return "confirmed";
  if (isUnavailable(finding)) return "unavailable";
  return "attention";
};

const evidenceStateLabel = (state: EvidenceState) => state === "confirmed"
  ? "Confirmed"
  : state === "attention"
    ? "Needs attention"
    : state === "unavailable"
      ? "Unavailable"
      : "Resolved";

const draftedFixText = (fix: SystemsCheckFinding["paige_drafted_fix"]): string | null => {
  if (!fix) return null;
  if (typeof fix === "string") return fix.trim() || null;
  for (const key of ["content", "summary", "remediation", "plan", "guidance", "text", "body"]) {
    const value = fix[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return null;
};

const PRESENTATION_SAFE_EVIDENCE = new Set([
  "provider", "state", "has_email_identity", "has_primary_phone", "has_a2p_registration",
  "has_business_phone", "customer_count", "has_name", "has_website", "has_industry", "has_about",
  "has_active_n8n_workflow", "has_mcp_connection", "scope_note", "payment_methods_declared", "count",
  "processor_agnostic", "payment_processor_declared", "has_revenue_classification", "integrity_ok",
  "revenue_class", "custom_pipeline_count", "has_stages", "social_handle_count", "declared_capture_only",
  "has_published_growth_page", "has_declared_website",
]);

const evidenceValue = (value: unknown): string | null => {
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") return String(value);
  if (Array.isArray(value) && value.every((item) => ["string", "number", "boolean"].includes(typeof item))) {
    return value.map(String).join(", ");
  }
  return null;
};

const projectEvidence = (evidence: SystemsCheckFinding["evidence"]) => {
  if (!evidence) return { rows: [] as Array<[string, string]>, hasSuppressed: false };
  const rows = Object.entries(evidence).flatMap(([key, value]) => {
    if (!PRESENTATION_SAFE_EVIDENCE.has(key)) return [];
    const rendered = evidenceValue(value);
    return rendered === null ? [] : [[key, rendered] as [string, string]];
  });
  return { rows, hasSuppressed: rows.length < Object.keys(evidence).length };
};

function Proof({ children, tone = "partial" }: { children: React.ReactNode; tone?: string }) {
  return <span className={`sc-proof sc-proof--${tone}`}>{children}</span>;
}

/**
 * "Recent activity" — the tenant-wide Rail, made reachable from the Solo Command Center.
 *
 * WHY THIS EXISTS. The Rail's tenant-wide strip (`PaigeRailFeed`) ships inside `PaigeWorkspace`,
 * which `TenantCommandCenterShell` renders ONLY when the Solo workspace is absent — and the Solo
 * shell always supplies it. So that strip is an Agency / sub-account / admin surface, and the
 * tenant-wide rail was dark for every Solo tenant. This mounts the SAME already-deployed read the
 * Trust Compass and Team Activity panels use (`useSoloActivityFeed` → `get_solo_rail_activity`);
 * it is not a second Rail source, and it does not duplicate or re-derive a single event.
 *
 * SAFE FIELDS BY CONSTRUCTION, not by filtering here. `get_solo_rail_activity` returns eleven
 * display columns and `toActivityItem` narrows those to `{id,title,summary,byPaige,departmentSlug,
 * occurredAt}`. There is no payload, ref_table, ref_id, actor_user_id, tenant_id, contact_id or
 * email in the shape at all, so none can reach this markup. `id` is a React key and is never
 * rendered. The feed's `error` string is deliberately NOT rendered either — `status` alone drives
 * the copy — so no server text, SQLSTATE or function name can surface on a tenant screen.
 *
 * FIVE ANSWERS, KEPT APART (§13). Reading `items.length` alone would answer five questions with
 * one sentence: still loading, refused, failed, genuinely empty, and populated. Three of those are
 * not "nothing happened", and two of them would be confident false statements about Paige's work.
 * A refusal therefore never renders as an empty state — it says so, and says so out loud.
 */
function RailActivityPanel({ activity }: { activity: ReturnType<typeof useSoloActivityFeed> }) {
  const rows = activity.items.slice(0, RAIL_PANEL_ROWS);
  const state = activity.status === "ready" && rows.length ? "live" : activity.status;

  return (
    <section className="sc-side-panel">
      <div className="sc-section-heading">
        <div><span className="sc-kicker">Workspace rail</span><h2>Recent activity</h2></div>
        {state === "live" && <Proof tone="live">LIVE READ</Proof>}
        {state === "loading" && <Proof tone="scanning">READING</Proof>}
        {state === "ready" && <Proof tone="empty">NONE YET</Proof>}
        {(state === "forbidden" || state === "unavailable") && <Proof tone="unavailable">UNAVAILABLE</Proof>}
      </div>

      {state === "loading" && (
        <p className="sc-muted" role="status" aria-live="polite">Reading this workspace&rsquo;s recent activity&hellip;</p>
      )}

      {state === "forbidden" && (
        <p className="sc-muted" role="alert">
          This workspace&rsquo;s recent activity is not available to you here, so this is not a record of nothing happening.
        </p>
      )}

      {state === "unavailable" && (
        <p className="sc-muted" role="alert">
          This workspace&rsquo;s recent activity could not be loaded, so this is not a record of nothing happening.
        </p>
      )}

      {state === "ready" && (
        <p className="sc-muted">Nothing has been recorded on this workspace&rsquo;s rail yet.</p>
      )}

      {state === "live" && rows.map((item) => (
        <article className="sc-approval" key={item.id}>
          <span>{departmentLabel(item.departmentSlug)} · {item.byPaige ? "PAIGE" : "Person"} · {elapsedLabel(item.occurredAt)}</span>
          <h3>{item.title}</h3>
          {item.summary && <p>{item.summary}</p>}
        </article>
      ))}
    </section>
  );
}

/**
 * THE CLOSED STATUS SET (owner ruling). Eight words, and never a ninth:
 *   LIVE · PARTIAL · NOT CONNECTED · NEEDS ATTENTION · PENDING PROVIDER · UNAVAILABLE · PROOF OWED · PAUSED
 *
 * Only THREE of them can be produced from a persisted finding, and that is a structural fact
 * rather than an omission: `paige_systems_check_finding.status` is CHECK-constrained to
 * `pass | fail | skip | error`. PENDING PROVIDER and PAUSED in particular can never come from
 * this store — they have to be published by the workstream that owns the provider, through the
 * result contract (docs/product/provider-result-contract.md).
 *
 * So this surface renders what it can actually derive and says so, rather than inferring the
 * other five from evidence shapes. A `fail` is NEEDS ATTENTION whether the thing was never set up
 * or was set up wrongly; the item's own sentence carries which, because guessing "not connected"
 * from a `has_x: false` would be the surface inventing a status the runner never recorded.
 */
type StatusWord = "live" | "attention" | "unavailable";

const STATUS_TEXT: Record<StatusWord, string> = {
  live: "Live",
  attention: "Needs attention",
  unavailable: "Unavailable",
};

function statusOf(finding: SystemsCheckFinding): StatusWord {
  if (isResolved(finding)) return "live";
  if (finding.status === "pass") return "live";
  if (isUnavailable(finding)) return "unavailable";
  return "attention";
}

function StatusPill({ state }: { state: StatusWord }) {
  return <span className={`sc-status sc-status--${state}`}><i />{STATUS_TEXT[state]}</span>;
}

/** The owner-facing title. Falls back to the registry name so an unmapped check stays visible. */
const findingTitle = (finding: SystemsCheckFinding) =>
  destinationForCheck(finding.check_id)?.title
  || finding.check_name
  || label(finding.check_id);

const SEVERITY_RANK: Record<string, number> = { blocking: 0, high: 1, medium: 2, low: 3 };

/**
 * One thing that needs the owner. Carries all four things the brief requires without exception:
 * an owner, a source, a freshness date, and a direct next action into the surface that owns it.
 */
function AttentionItem({
  finding, account, recordedAt, onInspect,
}: {
  finding: SystemsCheckFinding;
  account: string | null;
  recordedAt: string;
  onInspect: (finding: SystemsCheckFinding, origin: HTMLElement) => void;
}) {
  const dest = destinationForCheck(finding.check_id);
  const severity = finding.severity_at_finding || "medium";
  const drafted = draftedFixText(finding.paige_drafted_fix);
  // Paige owns it only when she has actually drafted something AND filed an action for it.
  // A drafted fix with no filed action is still the owner's to act on, so it does not claim her.
  const paigeHasIt = Boolean(drafted && finding.resolution_action_id);

  return (
    <article className={`sc-item sc-item--${severity}`}>
      <div className="sc-item-t">
        <h3>{findingTitle(finding)}</h3>
        <StatusPill state={statusOf(finding)} />
      </div>
      {finding.paige_interpretation && <p className="sc-why" style={{ margin: "3px 0 0" }}>{finding.paige_interpretation}</p>}
      <dl className="sc-meta">
        <div>
          <dt>Owner</dt>
          <dd>{paigeHasIt ? "Paige has drafted a fix for you to approve" : "You"}</dd>
        </div>
        <div>
          <dt>Source</dt>
          <dd className="sc-mono">Setup check &middot; {finding.check_id}</dd>
        </div>
        <div>
          <dt>Verified</dt>
          <dd>{recordedAt}</dd>
        </div>
      </dl>
      <div className="sc-item-a">
        {dest && account && (
          <a className="sc-button" href={dest.path(account)}>{dest.label}<ChevronRight size={14} aria-hidden="true" /></a>
        )}
        <button
          type="button"
          className="sc-button sc-button--quiet"
          onClick={(event) => onInspect(finding, event.currentTarget)}
        >
          What was checked
        </button>
        {dest?.caveat && <span className="sc-caveat">{dest.caveat}</span>}
      </div>
    </article>
  );
}

export function SoloSystemsCheckWorkspace({ accountContext, openPaige, workspaceId }: Props) {
  const command = useCommandCenter();
  const activity = useSoloActivityFeed(workspaceId);
  const systems = useSystemsCheck("tenant");
  const resolvedAccount = resolveTenantAccountContext(accountContext);
  const account = useParams().account ?? "";
  const [openArea, setOpenArea] = useState<string | null>(null);
  const [selected, setSelected] = useState<SystemsCheckFinding | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [proposal, setProposal] = useState(false);
  const [decision, setDecision] = useState<{ item: CommandApproval; action: "approve" | "decline" } | null>(null);
  const [decisionBusy, setDecisionBusy] = useState(false);
  const [decisionMessage, setDecisionMessage] = useState("");
  const returnFocus = useRef<HTMLElement | null>(null);
  const restoreFindingFocus = useRef(false);
  const proposalReturnFocus = useRef<HTMLElement | null>(null);
  const decisionReturnFocus = useRef<HTMLElement | null>(null);
  const scrollOwnerRef = useRef<HTMLDivElement | null>(null);
  const drawerRef = useRef<HTMLDivElement | null>(null);
  const proposalRef = useRef<HTMLElement | null>(null);
  const decisionRef = useRef<HTMLElement | null>(null);
  const decisionBusyRef = useRef(false);

  const currentFindings = useMemo(
    () => systems.findings.filter((finding) => !systems.run || finding.run_id === systems.run.id),
    [systems.findings, systems.run],
  );
  const unavailableFindings = currentFindings.filter((finding) => evidenceFilter(finding) === "unavailable");
  const attentionFindings = currentFindings.filter((finding) => evidenceFilter(finding) === "attention");
  const confirmedFindings = currentFindings.filter((finding) => evidenceFilter(finding) === "confirmed");
  const completedAt = systems.run?.completed_at ? new Date(systems.run.completed_at) : null;
  const hasCompletedRun = !!completedAt && !Number.isNaN(completedAt.getTime());
  const isPartial = !!systems.run && (
    !hasCompletedRun ||
    currentFindings.some((finding) => finding.status === "skip" || finding.status === "error") ||
    (systems.run.check_count ?? currentFindings.length) > currentFindings.length
  );

  const isStale = hasCompletedRun && Date.now() - completedAt.getTime() > 24 * 60 * 60 * 1000;
  const selectedEvidence = projectEvidence(selected?.evidence ?? null);

  useEffect(() => {
    setSelected(null);
    setExpanded(false);
    setProposal(false);
    setDecision(null);
    setDecisionBusy(false);
    decisionBusyRef.current = false;
    setDecisionMessage("");
    restoreFindingFocus.current = false;
    returnFocus.current = null;
  }, [command.accountEpoch]);

  const closeFinding = () => {
    setProposal(false);
    setSelected(null);
    setExpanded(false);
    restoreFindingFocus.current = true;
  };

  const closeProposal = () => {
    setProposal(false);
    proposalReturnFocus.current?.focus();
  };

  const closeDecision = () => {
    if (decisionBusy) return;
    setDecision(null);
    decisionReturnFocus.current?.focus();
  };

  useEffect(() => {
    if (selected) drawerRef.current?.querySelector<HTMLElement>("[data-initial-focus]")?.focus();
  }, [selected]);

  useEffect(() => {
    if (proposal) proposalRef.current?.querySelector<HTMLElement>("[data-initial-focus]")?.focus();
  }, [proposal]);

  useEffect(() => {
    if (decision) decisionRef.current?.querySelector<HTMLElement>("[data-initial-focus]")?.focus();
  }, [decision]);

  useLayoutEffect(() => {
    if (scrollOwnerRef.current) scrollOwnerRef.current.inert = Boolean(selected || proposal || decision);
    if (drawerRef.current) drawerRef.current.inert = proposal;
    if (!selected && !proposal && !decision && restoreFindingFocus.current) {
      restoreFindingFocus.current = false;
      const target = returnFocus.current;
      if (target?.isConnected) target.focus();
    }
  }, [decision, proposal, selected]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        if (proposal) closeProposal();
        else if (decision) closeDecision();
        else if (selected) closeFinding();
        return;
      }
      if (event.key !== "Tab") return;
      const container = proposal ? proposalRef.current : decision ? decisionRef.current : selected ? drawerRef.current : null;
      if (!container) return;
      const focusable = [...container.querySelectorAll<HTMLElement>("button:not([disabled]), [href], [tabindex]:not([tabindex='-1'])")];
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const refresh = () => {
    command.refresh();
    systems.refresh();
    // The Rail panel refreshes with the rest of the screen. Without this line "Refresh current
    // data" leaves it on whatever it last read until its own 15s poll or a window-focus event —
    // so a person who just watched a read fail, or who expects a just-recorded event, presses
    // Refresh and the one panel they were looking at does not move. Found by review on #877.
    activity.refresh();
  };

  const openFinding = (finding: SystemsCheckFinding, trigger: HTMLElement) => {
    returnFocus.current = trigger;
    setSelected(finding);
    setExpanded(false);
  };

  const openDecision = (item: CommandApproval, action: "approve" | "decline", trigger: HTMLElement) => {
    decisionReturnFocus.current = trigger;
    setDecisionMessage("");
    setDecision({ item, action });
  };

  const runDecision = async () => {
    if (!decision || decisionBusyRef.current) return;
    decisionBusyRef.current = true;
    setDecisionBusy(true);
    setDecisionMessage(`${decision.action === "approve" ? "Approving" : "Dismissing"} ${decision.item.title}…`);
    const result = decision.action === "approve"
      ? await command.approve(decision.item.id)
      : await command.decline(decision.item.id);
    decisionBusyRef.current = false;
    setDecisionBusy(false);
    if (!result.ok) {
      setDecisionMessage(result.error || "The decision could not be saved. Try again.");
      return;
    }
    setDecisionMessage(`${decision.item.title} was ${decision.action === "approve" ? "approved" : "dismissed"}.`);
    setDecision(null);
    decisionReturnFocus.current?.focus();
  };

  /**
   * Ordering. Severity first (blocking before high before medium before low), then the registry's
   * own priority. A finding with no recorded severity sorts as medium rather than to the top or the
   * bottom — inventing an order for it would be a claim the runner never made.
   */
  const orderedAttention = useMemo(
    () => [...attentionFindings].sort((a, b) => {
      const sa = SEVERITY_RANK[a.severity_at_finding ?? "medium"] ?? 2;
      const sb = SEVERITY_RANK[b.severity_at_finding ?? "medium"] ?? 2;
      if (sa !== sb) return sa - sb;
      return (a.priority ?? 99) - (b.priority ?? 99);
    }),
    [attentionFindings],
  );

  /** Failing checks with no drafted-and-filed fix behind them: genuinely the owner's move. */
  const ownerTodo = useMemo(
    () => orderedAttention.filter(
      (f) => !(draftedFixText(f.paige_drafted_fix) && f.resolution_action_id),
    ),
    [orderedAttention],
  );

  /**
   * The freshness line. Counts come from the RUN's own summary where it has one — never from a
   * tally this component computed and then presented as the check's result. When the run carries
   * no counts the finding set is counted instead, and the wording says which is being shown.
   */
  const freshHeading = systems.isError
    ? "The last check could not be read"
    : !systems.run
      ? (systems.scanPending ? "Your first check is running" : "No check has finished yet")
      : hasCompletedRun
        ? `Last checked ${completedAt.toLocaleString()}`
        : `A check started ${new Date(systems.run.started_at).toLocaleString()} and has not finished`;

  const freshDetail = !systems.run
    ? "Nothing has been recorded for this workspace."
    : (() => {
        const total = systems.run.check_count ?? currentFindings.length;
        const passed = systems.run.pass_count ?? confirmedFindings.length;
        const failed = systems.run.fail_count ?? attentionFindings.length;
        const unread = unavailableFindings.length;
        return (
          <>
            <strong>{total}</strong> check{total === 1 ? "" : "s"} &middot;{" "}
            <strong>{passed}</strong> passed &middot;{" "}
            <strong>{failed}</strong> need{failed === 1 ? "s" : ""} attention
            {unread > 0 ? <> &middot; <strong>{unread}</strong> could not be evaluated</> : null}
          </>
        );
      })();

  /**
   * Business attention, kept SEPARATE from setup findings on purpose. A failing check says a system
   * cannot do its job; these say the book itself needs the owner. Collapsing them would let a
   * clean setup read imply an empty desk. Only figures that are actually present are shown — a
   * missing count is omitted rather than rendered as zero, because zero is a claim.
   */
  const businessAttention = useMemo<Array<[string, number]>>(() => ([
    ["Clients at risk", command.attention?.at_risk_clients],
    ["Follow-ups due", command.attention?.follow_ups_due],
    ["Tasks due", command.attention?.tasks_due],
  ] as Array<[string, number | undefined | null]>)
    .filter((entry): entry is [string, number] => typeof entry[1] === "number" && entry[1] > 0),
  [command.attention]);

  const isReading = systems.loading || command.loading || systems.scanPending;
  return (
    <main className="sc-workspace" aria-label="Solo Systems Check">
      <div ref={scrollOwnerRef} className="sc-scroll-owner" aria-hidden={Boolean(selected || proposal || decision) || undefined}>
        <header className="sc-heading">
          <div>
            <h1>Systems Check</h1>
            <p>What your business systems can actually do right now, and what is stopping the rest.</p>
            <span className="sc-sr-only"><span data-tenant-account-name>{resolvedAccount.accountName}</span>, <span data-tenant-account-tier>{resolvedAccount.accountTypeLabel}</span>, {command.greeting.dateLabel}. {command.greeting.name}: {command.loading ? "operating sources are still loading." : command.isError ? "some operating sources are unavailable." : command.greeting.summary}</span>
          </div>
          <div className="sc-heading-actions">
            {isStale && <Proof tone="stale">STALE EVIDENCE</Proof>}
            {isPartial && <Proof>PARTIAL COVERAGE</Proof>}
            {command.isError && <Proof tone="attention">OPERATING DATA UNAVAILABLE</Proof>}
          </div>
        </header>

        {command.isError && <div className="sc-source-warning" role="status"><AlertTriangle size={16} /> Some business operating sources could not be read. No empty state is being treated as healthy; refresh current data to retry.</div>}

        <div className="sc-console">
          <div className="sc-strip">
            <div className="sc-strip-l">
              <div className="sc-strip-h">{freshHeading}</div>
              <div className="sc-strip-s">{freshDetail}</div>
              {systems.isError && (
                <div className="sc-strip-err" role="alert">
                  The last read failed. Nothing below is being reported as healthy.
                </div>
              )}
            </div>
            <div className="sc-strip-a">
              <button
                type="button"
                className="sc-button sc-button--quiet"
                onClick={refresh}
                title="Re-reads the last recorded check. It does not run the checks again."
              >
                {isReading ? <span className="sc-spin" aria-hidden="true" /> : <RefreshCw size={14} aria-hidden="true" />}
                Refresh current data
              </button>
            </div>
          </div>

          {/* The owner's brief allows exactly two honest Refresh behaviours: perform the checks, or
              say plainly that it cannot. This button does the second, and says so, rather than
              re-reading a stale run under a label that implies a re-check. */}
          <p className="sc-note">
            <strong>This re-reads the last recorded check.</strong> Running the checks again on demand is
            not wired to this surface yet, so nothing here is newer than the time above.
          </p>

          {/* The run's own summary and the findings we can read are two different numbers, and when
              they disagree neither one describes the whole picture. Saying so here is what stops the
              strip claiming "1 needs attention" while the section below says nothing does — the run
              counted checks whose results are not in this response. Overall health is not inferred
              from the half that came back. */}
          {isPartial && (
            <div className="sc-note" role="status">
              <strong>The picture is incomplete.</strong> The last run recorded{" "}
              {systems.run?.check_count} check{systems.run?.check_count === 1 ? "" : "s"} but only{" "}
              {currentFindings.length} result{currentFindings.length === 1 ? " is" : "s are"} readable
              here. Overall health cannot be inferred from the part that came back, so nothing below
              is being reported as a complete answer.
            </div>
          )}

          {!systems.run && !systems.loading && !systems.isError && (
            <div className="sc-first">
              <h3>{systems.scanPending ? "Your first check is running" : "Nothing has been checked yet"}</h3>
              <p>
                {systems.scanPending
                  ? "It started when this workspace was created. Nothing is shown until it finishes, because a partial answer would read as a whole one."
                  : "Systems Check reads what your business systems actually report. None of them has answered for this workspace yet — and that is not a claim that anything is wrong."}
              </p>
            </div>
          )}

          {/* 1 — what needs you now */}
          {Boolean(systems.run) && (
            <section className="sc-block" aria-labelledby="sc-attention-title">
              <div className="sc-block-head">
                <h2 id="sc-attention-title">What needs you now</h2>
                {attentionFindings.length > 0 && <span className="sc-n">{attentionFindings.length}</span>}
                <span className="sc-aside">Most serious first</span>
              </div>
              {businessAttention.length > 0 && (
                <div className="sc-note" style={{ borderStyle: "solid" }}>
                  <strong>From your book right now:</strong>{" "}
                  {businessAttention.map(([name, value], i) => (
                    <span key={name}>{i > 0 ? " · " : ""}{value} {name.toLowerCase()}</span>
                  ))}
                  {". "}
                  These come from your live client records, not from the setup check.
                </div>
              )}
              {attentionFindings.length === 0 ? (
                <div className="sc-note">
                  Nothing from the last check needs you. That covers the {currentFindings.length} thing
                  {currentFindings.length === 1 ? "" : "s"} it looked at, not your whole business.
                </div>
              ) : (
                <div className="sc-items">
                  {orderedAttention.map((finding) => (
                    <AttentionItem
                      key={finding.id}
                      finding={finding}
                      account={account || null}
                      recordedAt={new Date(finding.created_at).toLocaleString()}
                      onInspect={openFinding}
                    />
                  ))}
                </div>
              )}
            </section>
          )}

          {/* 2 — what is ready to operate */}
          {confirmedFindings.length > 0 && (
            <section className="sc-block" aria-labelledby="sc-ready-title">
              <div className="sc-block-head">
                <h2 id="sc-ready-title">What is ready to operate</h2>
                <span className="sc-n">{confirmedFindings.length}</span>
                <span className="sc-aside">Each one names the check that answered for it</span>
              </div>
              <ul className="sc-ready">
                {confirmedFindings.map((finding) => (
                  <li key={finding.id}>
                    <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
                      <path d="M2.6 7.4l2.8 2.8L11.4 4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                    <div>
                      <p>{findingTitle(finding)}</p>
                      <small>Setup check &middot; {new Date(finding.created_at).toLocaleString()}</small>
                    </div>
                  </li>
                ))}
              </ul>
              {command.metrics.length > 0 && (
                <ul className="sc-ready">
                  {command.metrics.map((metric) => (
                    <li key={metric.k}>
                      <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
                        <path d="M2.6 7.4l2.8 2.8L11.4 4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                      <div>
                        <p>{metric.k}: <strong>{metric.v}</strong></p>
                        <small>
                          {command.isError
                            ? "Last available — the current read failed, so this may not be today's number"
                            : "Live read from your own records"}
                        </small>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          )}

          {/* 3 — the nine operating areas */}
          <section className="sc-block" aria-labelledby="sc-areas-title">
            <div className="sc-block-head">
              <h2 id="sc-areas-title">Your operating areas</h2>
              <span className="sc-n">{SYSTEMS_CHECK_AREAS.length}</span>
              <span className="sc-aside">Each carries its own status. There is deliberately no total.</span>
            </div>
            <div className="sc-areas">
              {SYSTEMS_CHECK_AREAS.map((area) => {
                const inArea = currentFindings.filter((f) => areaForCheck(f.check_id) === area.id);
                const open = openArea === area.id;
                const worst = inArea.some((f) => statusOf(f) === "attention")
                  ? "attention"
                  : inArea.some((f) => statusOf(f) === "unavailable")
                    ? "unavailable"
                    : inArea.length ? "live" : null;
                return (
                  <div className="sc-area" key={area.id} data-open={open}>
                    <button
                      type="button"
                      className="sc-area-b"
                      aria-expanded={open}
                      onClick={() => setOpenArea(open ? null : area.id)}
                    >
                      <ChevronRight className="sc-chev" size={11} aria-hidden="true" />
                      <span className="sc-area-n">{area.name}</span>
                      {worst ? <StatusPill state={worst} /> : <span className="sc-status sc-status--unavailable"><i />Not checked</span>}
                      <span className="sc-area-k">{area.scope}</span>
                    </button>
                    {open && (
                      <div className="sc-area-d">
                        {inArea.length === 0 ? (
                          <p className="sc-why" style={{ margin: "9px 0 0" }}>
                            {area.uncovered
                              || "No check in the current run covers this area, so nothing here is being reported either way."}
                          </p>
                        ) : (
                          <div className="sc-area-checks">
                            {inArea.map((finding) => {
                              const dest = destinationForCheck(finding.check_id);
                              return (
                                <div className="sc-area-check" key={finding.id}>
                                  <StatusPill state={statusOf(finding)} />
                                  <strong>{findingTitle(finding)}</strong>
                                  {dest && account && (
                                    <a className="sc-button sc-button--quiet" href={dest.path(account)}>{dest.label}</a>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </section>

          {/* 4 — what has actually been verified (the Rail) */}
          <RailActivityPanel activity={activity} />

          {/* 5 — who does what next */}
          <section className="sc-block" aria-labelledby="sc-next-title">
            <div className="sc-block-head"><h2 id="sc-next-title">Who does what next</h2></div>
            <div className="sc-buckets">
              <div className="sc-bucket sc-bucket--you">
                <h3>Only you can do these</h3>
                <ul>
                  {ownerTodo.length
                    ? ownerTodo.map((f) => <li key={f.id}>{findingTitle(f)}</li>)
                    : <li className="sc-none">Nothing from the last check is waiting on you</li>}
                </ul>
              </div>
              {/* Approving and dismissing has to stay REACHABLE here. The panel it used to live in
                  went with the radial, and listing the same items without their controls would have
                  quietly removed a capability that already shipped (§58) — the owner could act on
                  these from this page, and still can. Same seams, same modal, same focus return. */}
              <div className="sc-bucket sc-bucket--paige">
                <h3>Paige is holding these for you</h3>
                <ul>
                  {command.approvals.length
                    ? command.approvals.slice(0, 5).map((item) => (
                      <li key={item.id}>
                        {item.title}
                        <span className="sc-bucket-a">
                          <button
                            type="button"
                            className="sc-button sc-button--quiet"
                            onClick={(event) => openDecision(item, "approve", event.currentTarget)}
                          >
                            Review approval
                          </button>
                          <button
                            type="button"
                            className="sc-button sc-button--quiet"
                            onClick={(event) => openDecision(item, "decline", event.currentTarget)}
                          >
                            Review dismissal
                          </button>
                        </span>
                      </li>
                    ))
                    : <li className="sc-none">Nothing she can take on right now</li>}
                </ul>
                <p className="sc-decision-feedback" role="status" aria-live="polite">{decisionMessage}</p>
              </div>
              <div className="sc-bucket sc-bucket--outside">
                <h3>Could not be checked</h3>
                <ul>
                  {unavailableFindings.length
                    ? unavailableFindings.map((f) => <li key={f.id}>{findingTitle(f)}</li>)
                    : <li className="sc-none">Everything the check looked at returned an answer</li>}
                </ul>
              </div>
            </div>
          </section>
        </div>
      </div>

      {selected && (
        <div ref={drawerRef} className={`sc-drawer ${expanded ? "is-expanded" : ""}`} role="dialog" aria-modal={proposal ? undefined : true} aria-hidden={proposal || undefined} aria-label={expanded ? "Expanded finding details" : "Finding details"}>
          <div className="sc-drawer-head"><div><span className="sc-kicker">{label(selected.domain)} · {label(selected.severity_at_finding)}</span><h2>{selected.check_name || label(selected.check_id)}</h2></div><div><button data-initial-focus type="button" className="sc-icon-button" onClick={() => setExpanded((value) => !value)} aria-label={expanded ? "Return to drawer" : "Expand"}><ArrowUpRight size={18} /> <span>{expanded ? "Return" : "Expand"}</span></button><button type="button" className="sc-icon-button" onClick={closeFinding} aria-label="Close finding details"><X size={19} /></button></div></div>
          <div className="sc-drawer-body">
            <div className="sc-evidence-meta"><Proof tone={isResolved(selected) ? "resolved" : selected.status === "pass" ? "live" : "attention"}>{isResolved(selected) ? "Resolved" : label(selected.status)}</Proof><span>Recorded {new Date(selected.created_at).toLocaleString()}</span></div>
            <section><h3>Signal</h3><p>{selected.check_name || label(selected.check_id)} · {evidenceStateLabel(evidenceFilter(selected))}</p></section>
            <section><h3>Evidence and provenance</h3><p>Persisted finding {selected.id} from Systems Check run {selected.run_id}.</p>{selectedEvidence.rows.length ? <dl>{selectedEvidence.rows.map(([key, value]) => <React.Fragment key={key}><dt>{label(key)}</dt><dd>{value}</dd></React.Fragment>)}</dl> : <p>No presentation-safe evidence fields are available.</p>}{selectedEvidence.hasSuppressed && <p>Additional evidence is retained but not displayed here.</p>}</section>
            <section><h3>Impact</h3><p>{selected.paige_interpretation || "No PAIGE interpretation is attached to this persisted finding."}</p></section>
            {isResolved(selected)
              ? <section><h3>Recommended next step</h3><p>No additional work is being recommended from this resolved record.</p></section>
              : <section><h3>Recommended next step</h3><p>{draftedFixText(selected.paige_drafted_fix) || "Review this finding with PAIGE before any work is prepared or executed."}</p><button type="button" className="sc-button sc-button--paige" onClick={(event) => { proposalReturnFocus.current = event.currentTarget; setProposal(true); }}><Bot size={16} /> Put PAIGE to work</button></section>}
            <section><h3>Owner decision</h3><p>{selected.resolved_at ? selected.resolution || "A resolution is recorded without an attached decision summary." : "No owner decision is recorded for this finding."}</p></section>
            <section><h3>Durable outcome</h3><p>{selected.resolved_at ? `Resolved ${new Date(selected.resolved_at).toLocaleString()}${selected.resolution_action_id ? ` · Action ${selected.resolution_action_id}` : ""}.` : "No durable outcome is recorded on the tenant rail."}</p></section>
          </div>
        </div>
      )}

      {decision && (
        <div className="sc-modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) closeDecision(); }}>
          <section ref={decisionRef} className="sc-proposal" role="alertdialog" aria-modal="true" aria-labelledby="decision-title" aria-describedby="decision-description">
            <Proof tone="attention">GOVERNED DECISION</Proof>
            <h2 id="decision-title">{decision.action === "approve" ? "Approve" : "Dismiss"} this item?</h2>
            <p id="decision-description">{decision.item.dept} · {decision.item.title}</p>
            <div className="sc-decision-context">{decision.item.preview}</div>
            <p className="sc-decision-dialog-status" role="status" aria-live="polite">{decisionMessage}</p>
            <div className="sc-proposal-actions">
              <button data-initial-focus type="button" className="sc-button sc-button--quiet" onClick={closeDecision} disabled={decisionBusy}>Cancel</button>
              <button type="button" className="sc-button" onClick={() => void runDecision()} disabled={decisionBusy}>{decisionBusy ? "Saving…" : decision.action === "approve" ? "Confirm approval" : "Confirm dismissal"}</button>
            </div>
          </section>
        </div>
      )}

      {proposal && (
        <div className="sc-modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) closeProposal(); }}>
          <section ref={proposalRef} className="sc-proposal" role="alertdialog" aria-modal="true" aria-labelledby="ask-first-title">
            <Proof>PARTIAL</Proof><h2 id="ask-first-title">Ask First</h2><p>You can open the one existing PAIGE workspace to discuss this finding.</p><div className="sc-proposal-warning"><AlertTriangle size={17} /> Context has not been attached or prepared. No message will be prefilled or sent, and no work has started.</div><div className="sc-proposal-actions"><button data-initial-focus type="button" className="sc-button sc-button--quiet" onClick={closeProposal}>Cancel</button><button type="button" className="sc-button sc-button--paige" onClick={() => { setProposal(false); openPaige?.(); }}>Open PAIGE workspace</button></div>
          </section>
        </div>
      )}
    </main>
  );
}

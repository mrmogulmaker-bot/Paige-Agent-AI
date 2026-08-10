// Systems Check tile (Wave S3 L3) — the ONE shared, scope-aware tile dropped into
// BOTH the operator Command Center (scope="operator") and the tenant Command Center
// (scope="tenant"). It composes the shared premium primitive layer (SectionCard /
// StatePill / EmptyState from @/components/ui/page) — it never forks a raw shadcn Card.
//
// PATTERN (§36 draft-first / §14 team framing): modelled on DraftsAwaitingPanel — Paige
// surfaces ONE highest-severity finding at a time (never a wall), with her plain-English
// read + drafted fix and a single one-click Approve. On approve the next-highest slides in.
//
// GOLD DISCIPLINE (§11): gold is spent ONLY on the per-finding "Approve fix" act. The
// header pill, domain pills, severity chips, and the expander are all neutral/indigo/
// semantic — never gold, never a resting accent.
//
// APPROVE seam (§10/§16): a TENANT finding that filed a `systems.remediate` action carries
// a `resolution_action_id` — we drive it through the EXISTING action-bus seam
// (`advance_action`), a record_only confirm-lane item the owner accepts. An OPERATOR
// finding files no action (the tenant action bus is NOT-NULL by construction), so the
// approval is recorded on the finding itself. Either way the finding is marked resolved
// (resolution='approved') so it leaves the open queue — RLS gates tenant vs operator (§9/§51).
import { useMemo, useState, type ReactNode } from "react";
import { ShieldCheck, Sparkles, ChevronDown, ChevronUp, Loader2, CheckCircle2, AlertTriangle } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { SectionCard, EmptyState, StatePill, type PillState } from "@/components/ui/page";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  useSystemsCheck,
  type SystemsCheckScope,
  type SystemsCheckFinding,
  type CheckSeverity,
} from "@/hooks/useSystemsCheck";

const SEVERITY_RANK: Record<CheckSeverity, number> = { blocking: 0, high: 1, medium: 2, low: 3 };

const SEVERITY_PILL: Record<CheckSeverity, { state: PillState; label: string }> = {
  blocking: { state: "error", label: "Blocking" },
  high: { state: "warning", label: "High" },
  medium: { state: "pending", label: "Medium" },
  low: { state: "pending", label: "Low" },
};

const DOMAIN_LABEL: Record<string, string> = {
  infrastructure: "Infrastructure",
  marketing: "Marketing",
  forms_booking: "Forms & booking",
  comms_deliverability: "Comms",
  payments_ops: "Payments",
  data_product: "Data",
  vertical_custom: "Custom",
};

function domainLabel(domain: string | null): string {
  if (!domain) return "Other";
  return DOMAIN_LABEL[domain] ?? domain.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

/** Rank open fails: worst severity first, then registry priority (#1 highest), then oldest. */
function rankFinding(a: SystemsCheckFinding, b: SystemsCheckFinding): number {
  const sa = SEVERITY_RANK[a.severity_at_finding ?? "low"] ?? 9;
  const sb = SEVERITY_RANK[b.severity_at_finding ?? "low"] ?? 9;
  if (sa !== sb) return sa - sb;
  const pa = a.priority ?? 99;
  const pb = b.priority ?? 99;
  if (pa !== pb) return pa - pb;
  return Date.parse(a.created_at) - Date.parse(b.created_at);
}

/** Pull a human sentence out of the drafted-fix jsonb (or string), defensively (§13). */
function draftedFixText(fix: SystemsCheckFinding["paige_drafted_fix"]): string | null {
  if (!fix) return null;
  if (typeof fix === "string") return fix.trim() || null;
  if (typeof fix === "object") {
    const o = fix as Record<string, unknown>;
    for (const k of ["brief", "summary", "remediation", "plan", "guidance", "text", "body"]) {
      const v = o[k];
      if (typeof v === "string" && v.trim()) return v.trim();
    }
  }
  return null;
}

export function SystemsCheckTile({ scope }: { scope: SystemsCheckScope }) {
  const { run, findings, loading, isError, refresh } = useSystemsCheck(scope);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);

  const isOperator = scope === "operator";

  // Open fails only (a resolved finding leaves the queue), ranked worst-first.
  const openFails = useMemo(
    () => findings.filter((f) => f.status === "fail" && !f.resolved_at).sort(rankFinding),
    [findings],
  );

  // Counts (§13 — real, from the loaded findings, never a fabricated total).
  // error ≠ skip: a skip is "not yet assessable" (benign, deferred); an error is a check that
  // FAILED TO RUN (a real problem) and must read distinctly, never dressed up as "not yet".
  const total = findings.length;
  const passCount = findings.filter((f) => f.status === "pass").length;
  const skipCount = findings.filter((f) => f.status === "skip").length;
  const errorCount = findings.filter((f) => f.status === "error").length;
  // "Assessable" excludes deferred skips, so an operator scan with 2 not-yet-assessable checks
  // never reads as 2 failures (§13). Errors DO count against — a failed-to-run check isn't a pass.
  const assessable = total - skipCount;
  const needAction = openFails.length;

  // Per-domain status pills — worst open status per domain (§36 at-a-glance, gold-free).
  const domainPills = useMemo(() => {
    const byDomain = new Map<string, { hasFail: boolean; hasError: boolean; worst: CheckSeverity | null; allPass: boolean }>();
    for (const f of findings) {
      const key = f.domain ?? "other";
      const cur = byDomain.get(key) ?? { hasFail: false, hasError: false, worst: null, allPass: true };
      if (f.status !== "pass") cur.allPass = false; // a skip/error is NOT a verified pass (§13)
      if (f.status === "error") cur.hasError = true; // a failed-to-run check is a real problem
      if (f.status === "fail" && !f.resolved_at) {
        cur.hasFail = true;
        const sev = f.severity_at_finding ?? "low";
        if (cur.worst === null || SEVERITY_RANK[sev] < SEVERITY_RANK[cur.worst]) cur.worst = sev;
      }
      byDomain.set(key, cur);
    }
    return Array.from(byDomain.entries()).map(([domain, v]) => {
      // fail → error/warning · all verified pass → success · only skip/error (not yet
      // assessable) → neutral pending, never a green "pass" it didn't earn (§13).
      const state: PillState = v.hasFail
        ? v.worst === "blocking"
          ? "error"
          : "warning"
        : v.hasError
          ? "warning" // an errored (failed-to-run) check is a real problem, not a benign neutral (§13)
          : v.allPass
            ? "success"
            : "pending";
      return { domain, label: domainLabel(domain), state };
    });
  }, [findings]);

  const lastScan = run?.completed_at ?? run?.started_at ?? null;
  const lastScanLabel = lastScan ? formatDistanceToNow(new Date(lastScan), { addSuffix: true }) : null;

  const title = "Systems Check";
  const description = run
    ? `Last scan ${lastScanLabel ?? "just now"} · ${passCount} of ${assessable} passed${needAction > 0 ? ` · ${needAction} need${needAction === 1 ? "s" : ""} action` : ""}${errorCount > 0 ? ` · ${errorCount} error${errorCount === 1 ? "" : "s"}` : ""}`
    : isOperator
      ? "Paige monitors the platform's own systems — infrastructure, security, and delivery."
      : "Paige checks that your business is fully set up to run.";

  const headerPill =
    needAction > 0 ? (
      <StatePill state="warning" icon={<AlertTriangle className="h-3 w-3" aria-hidden />}>
        {needAction} need{needAction === 1 ? "s" : ""} action
      </StatePill>
    ) : run ? (
      <StatePill state="success">All clear</StatePill>
    ) : null;

  async function approve(f: SystemsCheckFinding) {
    setBusyId(f.id);
    try {
      // TENANT finding with a filed remediation action → the existing action-bus seam.
      // record_only + confirm lane: advancing it accepts Paige's drafted work item.
      if (f.resolution_action_id) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data, error } = await (supabase as any).rpc("advance_action", {
          p_action_id: f.resolution_action_id,
          p_to_status: "executing",
        });
        if (error || (data && data.ok === false)) {
          toast.error(error?.message ?? data?.error ?? "Couldn't approve that fix.");
          return;
        }
      }
      // Mark the finding resolved so it leaves the open queue (RLS gates tenant vs operator).
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error: fErr } = await (supabase as any)
        .from("paige_systems_check_finding")
        .update({ resolution: "approved", resolved_at: new Date().toISOString() })
        .eq("id", f.id);
      if (fErr) {
        toast.error(fErr.message ?? "Couldn't record that approval.");
        return;
      }
      // Honest per scope (§13): a TENANT finding advanced a real action-bus item (Paige acts on it);
      // an OPERATOR finding has no action bus — approving only records it resolved.
      toast.success(f.resolution_action_id ? "Approved — Paige is on it." : "Marked resolved.");
      refresh();
    } catch (e) {
      toast.error((e as Error)?.message ?? "Something went wrong approving that fix.");
    } finally {
      setBusyId(null);
    }
  }

  // ── Body states (§13 honest, §11 no blank/loading dead-ends) ────────────────────────
  let body: ReactNode;
  if (loading) {
    body = (
      <div className="space-y-2" aria-busy="true">
        {[0, 1, 2].map((i) => (
          <div key={i} className="h-16 rounded-md border border-border bg-muted/40 motion-safe:animate-pulse" />
        ))}
      </div>
    );
  } else if (isError) {
    body = (
      <EmptyState
        icon={AlertTriangle}
        title="Couldn't load the systems check"
        description="The latest scan results didn't load just now. This panel refreshes on its own — nothing else on the page is affected."
      />
    );
  } else if (!run) {
    body = (
      <EmptyState
        icon={ShieldCheck}
        tone="brand"
        title="No systems check yet"
        description={
          isOperator
            ? "Paige runs a platform systems check on a schedule. The first scan's results — infrastructure, security, delivery — land here."
            : "Paige runs a systems check as you get set up. The first scan's results — what's configured and what still needs you — land here."
        }
      />
    );
  } else if (needAction === 0) {
    // No open fail. Only claim "everything passed" when it literally did — a deferred skip
    // (not yet assessable) and an error (failed to run) are honestly noted and kept DISTINCT,
    // never dressed up as a pass (§13).
    const allVerified = skipCount === 0 && errorCount === 0;
    const skipNote =
      skipCount > 0
        ? ` ${skipCount} check${skipCount === 1 ? " isn't" : "s aren't"} assessable yet — Paige will re-check as more comes online.`
        : "";
    const errorNote =
      errorCount > 0
        ? ` ${errorCount} check${errorCount === 1 ? "" : "s"} hit an error on the last scan — Paige flagged ${errorCount === 1 ? "it" : "them"} for a fix.`
        : "";
    const notAssessableNote = skipNote + errorNote;
    body = (
      <EmptyState
        icon={CheckCircle2}
        tone="brand"
        title={
          allVerified
            ? isOperator
              ? "All platform systems healthy"
              : "Everything's configured"
            : "Nothing needs your approval"
        }
        description={
          (allVerified
            ? isOperator
              ? "Every operator check passed on the last scan. When something drifts, Paige surfaces the fix here — highest severity first."
              : "Every check passed on the last scan. When something needs attention, Paige surfaces the fix here — highest severity first."
            : "No check is failing right now.") + notAssessableNote
        }
      />
    );
  } else {
    const current = openFails[0];
    const rest = openFails.slice(1);
    const sev = SEVERITY_PILL[current.severity_at_finding ?? "low"];
    const fixText = draftedFixText(current.paige_drafted_fix);
    body = (
      <div className="space-y-4">
        {/* At-a-glance per-domain status (gold-free). */}
        {domainPills.length > 1 && (
          <div className="flex flex-wrap gap-1.5">
            {domainPills.map((d) => (
              <StatePill key={d.domain} state={d.state}>
                {d.label}
              </StatePill>
            ))}
          </div>
        )}

        {/* THE one highest-severity finding (§36 one at a time, never a wall). */}
        <div className="rounded-lg border border-border bg-card p-4 shadow-card">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 space-y-0.5">
              <p className="text-sm font-semibold text-foreground">
                {current.check_name ?? current.check_id}
              </p>
              <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
                {domainLabel(current.domain)}
              </p>
            </div>
            <StatePill state={sev.state}>{sev.label}</StatePill>
          </div>

          {current.paige_interpretation && (
            <p className="mt-2 text-sm text-foreground/90">{current.paige_interpretation}</p>
          )}

          {fixText && (
            <div className="mt-3 rounded-md border border-border/70 bg-muted/40 p-3">
              <div className="mb-1 flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground">
                <Sparkles className="h-3 w-3 text-[hsl(var(--primary))]" aria-hidden />
                Paige drafted this fix
              </div>
              <p className="text-sm text-foreground/90">{fixText}</p>
            </div>
          )}

          <div className="mt-3 flex items-center justify-end">
            <Button
              variant="gold"
              size="sm"
              onClick={() => approve(current)}
              disabled={busyId !== null}
            >
              {busyId === current.id
                ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
                : current.resolution_action_id ? "Approve fix" : "Mark resolved"}
            </Button>
          </div>
        </div>

        {/* "N more" expander — review-all inline (no dead route; the surface is this tile). */}
        {rest.length > 0 && (
          <div>
            <button
              type="button"
              onClick={() => setShowAll((v) => !v)}
              className="flex w-full items-center justify-center gap-1.5 rounded-md py-2 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))]"
              aria-expanded={showAll}
            >
              {showAll ? (
                <>Hide <ChevronUp className="h-4 w-4" aria-hidden /></>
              ) : (
                <>{rest.length} more finding{rest.length === 1 ? "" : "s"} need action <ChevronDown className="h-4 w-4" aria-hidden /></>
              )}
            </button>
            {/* Review-only (§36): the queue behind the current one — named + ranked, NOT a
                wall of actions. The user approves the top card; the next slides up into it. */}
            {showAll && (
              <ul className="mt-1 divide-y divide-border/60">
                {rest.map((f) => {
                  const s = SEVERITY_PILL[f.severity_at_finding ?? "low"];
                  return (
                    <li key={f.id} className="flex items-center justify-between gap-3 py-2.5">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-foreground">
                          {f.check_name ?? f.check_id}
                        </p>
                        <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
                          {domainLabel(f.domain)}
                        </p>
                      </div>
                      <StatePill state={s.state} className="shrink-0">{s.label}</StatePill>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        )}
      </div>
    );
  }

  return (
    <SectionCard title={title} description={description} icon={ShieldCheck} actions={headerPill}>
      {body}
    </SectionCard>
  );
}

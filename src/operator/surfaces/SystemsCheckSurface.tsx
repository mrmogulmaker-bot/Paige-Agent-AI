import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useSystemsCheck, type SystemsCheckFinding } from "@/hooks/useSystemsCheck";
import { usePlatformTrust } from "@/operator/data/usePlatformTrust";
import { SystemsCheckTile } from "@/components/systems-check/SystemsCheckTile";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

/**
 * Systems Check — RE-PORTED FROM v3 (`PAIGE Super Admin Shell v3.dc.html`), 2026-08-23.
 *
 * ─── WHY A RE-PORT AND NOT A PATCH (§30) ─────────────────────────────────────────────────────
 *
 * Claude Design caught this surface rendering RETIRED-PACK copy: "Is the machine running for
 * everybody" and "Green means a check ran and passed…" are `Super Admin Shell.dc.html` L6781–6783
 * — the pack that was ruled dead. Neither string exists in v3. The dead pack also declares
 * THIRTEEN categories, which is why the deck read oddly against a ten-check sweep.
 *
 * The taxonomy was the deeper defect, and it was ours to catch. The retired thirteen — `infra`,
 * `models`, `integrations`, `functions`, `db`, `cicd`, `crons`, `autos`, `compliance`, `security`,
 * `billing`, `revenue`, `tenants` — is not the vocabulary our registry uses. Queried live:
 * `paige_systems_check_registry.domain` holds `infrastructure` · `marketing` · `payments_ops` ·
 * `data_product` · `comms_deliverability`, which is v3's own domain list. So twelve of the
 * thirteen tiles could only ever read "—": they named categories the platform does not have. v3
 * draws SEVEN domains and five of them are seeded, which is areal reading rather than an artefact.
 *
 * ─── WHAT THIS SURFACE IS, IN v3 ─────────────────────────────────────────────────────────────
 *
 * Four blocks, in order (`systemsOverrides()` L4724–L4816, markup L229–L292, ledger L1168–L1190):
 *
 *  1. THE RUN STRIP — four filterable figures with 45° diamond dots, the run's times, then ONE
 *     CELL PER CHECK in registry-priority order. CD's note: reading it takes a glance and
 *     clicking a cell opens that check; "the four display numbers said less and cost more." A
 *     thicker cap marks a blocking check. Filtering dims the cells that fall out rather than
 *     removing them, so the shape of the run never changes under a filter.
 *  2. THE BRIEF — `briefWhen`, the composed lead, the composed sub, two acts, and the Trust
 *     Compass block beside them.
 *  3. THE DOMAIN TILES — one per v3 domain, each with its worst state.
 *  4. THE FINDINGS LEDGER — worst severity first, then registry priority.
 *
 * ─── RULE 3 REACHES THE PROSE ────────────────────────────────────────────────────────────────
 *
 * CD's own comment at L11023: "The brief used to be authored English beside a derived ladder, so
 * a corrected finding left the two disagreeing on the same screen." So `briefLine` and `briefSub`
 * are COMPUTED from the findings — CD's algorithm, transcribed — and never typed. Same for the
 * ledger's foot, which in v3 names the specific deferrals of ITS sweep; ours names the deferrals
 * of OUR sweep, from the real skips and errors.
 *
 * `briefWhen` is the one authored string that could not port verbatim: v3 opens it "Overnight",
 * and our operator sweep runs HOURLY. Keeping the word would have asserted a schedule we do not
 * run (§13), so the line carries the real times and drops the claim.
 *
 * ─── WHAT IS PRESERVED (§58) ─────────────────────────────────────────────────────────────────
 *
 * The shipped engine underneath is untouched: `useSystemsCheck("operator")` is the read, the
 * one-button both-halves sweep is the owner's ruling B, and `SystemsCheckTile` — the
 * review-and-approve capability — still mounts inside the drawer where the detail lives. Nothing
 * that shipped is removed by this re-port; only the retired chrome around it is.
 */

/**
 * v3's seven domains, `P.SWEEP.domains` (`paige-ia.js` L408–L416). These ARE the registry's own
 * `domain` values, so the label list is a lookup rather than a taxonomy of its own. A domain that
 * appears in the findings and NOT here still gets a tile — a new registry domain must surface on
 * its own, not vanish because this list is a rev behind.
 */
const DOMAIN_LABELS: Record<string, string> = {
  infrastructure: "Infrastructure",
  marketing: "Marketing",
  forms_booking: "Forms and booking",
  comms_deliverability: "Comms deliverability",
  payments_ops: "Payments ops",
  data_product: "Data and product",
  vertical_custom: "Vertical custom",
};
const DOMAIN_ORDER = Object.keys(DOMAIN_LABELS);

/** `LABEL` — L4732. */
const STATUS_LABEL: Record<string, string> = {
  pass: "Passing",
  fail: "Failing",
  skip: "Could not run",
  error: "Errored",
};

/** `TONE` — L4731, on our tokens. Never a hex (§11). */
const STATUS_TONE: Record<string, string> = {
  pass: "hsl(var(--success))",
  fail: "hsl(var(--destructive))",
  skip: "hsl(var(--muted-foreground))",
  error: "hsl(var(--warning))",
};

/** `sev` — L4728. Worst first. */
const SEVERITY_RANK: Record<string, number> = { blocking: 0, high: 1, medium: 2, low: 3 };

type RunFilter = "all" | "pass" | "fail" | "unrun" | "alone";

/** CD's number words, L11026. The brief spells small counts and digits the rest. */
const WORDS = ["no", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten"];
const word = (n: number) => (WORDS[n] === undefined ? String(n) : WORDS[n]);
const capitalise = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);

const severityOf = (f: SystemsCheckFinding) => f.severity_at_finding ?? "low";
const priorityOf = (f: SystemsCheckFinding) => f.priority ?? Number.MAX_SAFE_INTEGER;
const nameOf = (f: SystemsCheckFinding) => f.check_name ?? f.check_id;

/** `ordered` — L4729. Worst severity first, then registry priority. */
function bySeverityThenPriority(a: SystemsCheckFinding, b: SystemsCheckFinding) {
  return (
    (SEVERITY_RANK[severityOf(a)] ?? 9) - (SEVERITY_RANK[severityOf(b)] ?? 9) ||
    priorityOf(a) - priorityOf(b)
  );
}

/** A clock reading for the run strip, from a real timestamp. `—` when the run has not landed. */
function clock(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? "—"
    : d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit", hour12: false });
}

function sinceLabel(iso: string | null | undefined): string {
  if (!iso) return "—";
  const mins = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} minute${mins === 1 ? "" : "s"} ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs} hour${hrs === 1 ? "" : "s"} ago`;
  const days = Math.round(hrs / 24);
  return `${days} day${days === 1 ? "" : "s"} ago`;
}

/** Evidence is free-shape jsonb; flat key/value rows, never a raw JSON dump (§11). */
function evidenceRows(evidence: Record<string, unknown> | null): Array<[string, string]> {
  if (!evidence) return [];
  return Object.entries(evidence)
    .filter(([, v]) => v !== null && typeof v !== "object")
    .map(([k, v]) => [k.replace(/_/g, " "), String(v)] as [string, string]);
}

/** `LV` — `trustVals` L4578–L4584. The rung names, low to high. */
const TRUST_RUNGS = ["Observe", "Draft only", "Ask first", "Act and report", "Autonomous"] as const;

export default function SystemsCheckSurface() {
  const { run, findings, loading, refresh } = useSystemsCheck("operator");
  const trust = usePlatformTrust(true);
  const { toast } = useToast();
  const [openDomain, setOpenDomain] = useState<string | null>(null);
  const [filter, setFilter] = useState<RunFilter>("all");
  const [sweeping, setSweeping] = useState(false);
  const [sweepStarted, setSweepStarted] = useState(false);

  const ordered = useMemo(() => findings.slice().sort(bySeverityThenPriority), [findings]);
  const byPriority = useMemo(
    () => findings.slice().sort((a, b) => priorityOf(a) - priorityOf(b)),
    [findings],
  );

  const counts = useMemo(() => {
    const n = (st: string) => findings.filter((f) => f.status === st).length;
    const pass = n("pass");
    const fail = n("fail");
    const skip = n("skip");
    const error = n("error");
    return { pass, fail, skip, error, unrun: skip + error, total: findings.length };
  }, [findings]);

  const blockingFails = useMemo(
    () => findings.filter((f) => f.status === "fail" && severityOf(f) === "blocking"),
    [findings],
  );

  /**
   * `inFilter` — L4738–L4741. 'alone' is a real axis, not a label: at the current ceiling she
   * acted on nothing, so filtering to it must show an EMPTY run rather than quietly showing
   * everything.
   */
  const inFilter = (f: SystemsCheckFinding) =>
    filter === "all"
      ? true
      : filter === "alone"
        ? false
        : filter === "unrun"
          ? f.status === "skip" || f.status === "error"
          : f.status === filter;

  /**
   * `legend` — L4744–L4762. Four figures, each a filter.
   *
   * `acted alone` is zero and that zero is DERIVED, not typed: the operator sweep has no write
   * path at all — it reads, records findings and stops — so a finding resolved without a human is
   * structurally unrepresentable today. The predicate is written out anyway so that the day a
   * resolution can be applied autonomously, this figure moves on its own rather than staying a
   * comfortable zero nobody re-checks (§13).
   */
  const actedAlone = findings.filter(
    (f) => !!f.resolved_at && f.resolution !== null && f.resolution_action_id === null,
  ).length;

  const legend: Array<{ key: RunFilter; label: string; n: number; tone: string; note: string }> = [
    {
      key: "pass",
      label: "passing",
      n: counts.pass,
      tone: STATUS_TONE.pass,
      note: `Passed, counted against the whole run of ${counts.total}`,
    },
    {
      key: "fail",
      label: "failing",
      n: counts.fail,
      tone: STATUS_TONE.fail,
      note: `${blockingFails.length} blocking`,
    },
    {
      key: "unrun",
      label: "could not run",
      n: counts.unrun,
      tone: STATUS_TONE.skip,
      note: "Skipped or errored — never counted as passes",
    },
    {
      key: "alone",
      label: "acted alone",
      n: actedAlone,
      tone: "hsl(var(--primary))",
      note: "Held at the Trust Compass ceiling — she swept and reported, and changed nothing",
    },
  ];

  /**
   * The brief's prose — CD's algorithm at L11026–L11049, transcribed. Every figure and every
   * word derives from the findings, so a corrected finding cannot leave the sentence and the
   * ladder disagreeing on the same screen.
   */
  const brief = useMemo(() => {
    const { pass, fail, skip, error, unrun, total } = counts;
    const lead = findings
      .filter((f) => f.status !== "pass")
      .sort(bySeverityThenPriority)[0];
    const briefLine =
      (fail
        ? `${capitalise(word(fail))} check${fail === 1 ? "" : "s"} failed` +
          (blockingFails.length ? `, ${word(blockingFails.length)} of them blocking. ` : ". ")
        : "Nothing failed. ") +
      `${capitalise(word(pass))} of ${word(total)} passed` +
      (unrun ? `, and ${word(unrun)} could not run at all.` : ".");
    const briefSub =
      (lead?.paige_interpretation ? `${lead.paige_interpretation} ` : "") +
      (unrun
        ? `Of the ${word(unrun)} that did not run, ` +
          (skip ? `${word(skip)} were skipped` : "") +
          (error ? `${skip ? " and " : ""}${word(error)} errored` : "") +
          " — each reported on its own axis, never as a pass."
        : "");
    return { briefLine, briefSub };
  }, [counts, findings, blockingFails.length]);

  /**
   * `ledgerFoot` — L4793 in v3 names the specific deferrals of CD's own sweep. Ours names OURS,
   * composed from the real skips and errors, because a hardcoded sentence about which checks are
   * deferred goes stale the moment the registry changes.
   */
  const ledgerFoot = useMemo(() => {
    const skips = findings.filter((f) => f.status === "skip");
    const errors = findings.filter((f) => f.status === "error");
    if (!skips.length && !errors.length) {
      return "Every registered check ran. Nothing is deferred and nothing threw.";
    }
    const parts: string[] = [];
    if (skips.length) {
      parts.push(
        `${capitalise(word(skips.length))} check${skips.length === 1 ? "" : "s"} could not run and ` +
          `${skips.length === 1 ? "reads" : "read"} skip — never a pass.`,
      );
    }
    if (errors.length) {
      parts.push(
        `${capitalise(word(errors.length))} runner${errors.length === 1 ? "" : "s"} threw and ` +
          `${errors.length === 1 ? "is" : "are"} reported as errored rather than passing: nothing was checked.`,
      );
    }
    return parts.join(" ");
  }, [findings]);

  /** `tiles` — L4797–L4815, over the domains the registry actually uses. */
  const tiles = useMemo(() => {
    const seen = new Set(findings.map((f) => f.domain ?? "").filter(Boolean));
    const ids = [...DOMAIN_ORDER, ...[...seen].filter((d) => !DOMAIN_LABELS[d])];
    return ids.map((id) => {
      const rows = findings.filter((f) => f.domain === id);
      const blocking = rows.some((f) => f.status === "fail" && severityOf(f) === "blocking");
      const failed = rows.some((f) => f.status === "fail");
      const errored = rows.some((f) => f.status === "error");
      const skipped = rows.some((f) => f.status === "skip");
      const state = !rows.length
        ? "none"
        : blocking || failed
          ? "risk"
          : errored
            ? "warn"
            : skipped
              ? "unknown"
              : "ok";
      const tone = {
        risk: "hsl(var(--destructive))",
        warn: "hsl(var(--warning))",
        unknown: "hsl(var(--muted-foreground))",
        ok: "hsl(var(--success))",
        none: "hsl(var(--border))",
      }[state];
      return {
        id,
        label: DOMAIN_LABELS[id] ?? id.replace(/_/g, " "),
        status: !rows.length
          ? "—"
          : blocking || failed
            ? "Failing"
            : errored
              ? "Errored"
              : skipped
                ? "Could not run"
                : "Passing",
        detail: !rows.length ? "Nothing swept" : `${rows.length} check${rows.length === 1 ? "" : "s"}`,
        count: rows.length,
        state,
        tone,
      };
    });
  }, [findings]);

  /** Owner ruling B — one button, both halves. Unchanged by the re-port. */
  const runFullSweep = async () => {
    if (sweeping) return;
    setSweeping(true);
    // Fleet half FIRST: it only queues, so the tenant sweeps start immediately instead of waiting
    // behind the operator scan.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error: fleetErr } = await (supabase as any).rpc("enqueue_fleet_systems_check");
    const { error: opErr } = await supabase.functions.invoke("systems-check-run-operator", { body: {} });

    await refresh();
    setSweeping(false);

    if (opErr) {
      toast({ title: "The operator sweep did not run", description: opErr.message, variant: "destructive" });
      return;
    }
    setSweepStarted(true);
    toast({
      title: "Operator checks re-run",
      // §13: the fleet half is queued, not finished.
      description: fleetErr
        ? `The fleet sweep could not be queued: ${fleetErr.message}`
        : "The fleet sweep has started — each tenant's result lands as it finishes.",
    });
  };

  const openRows = openDomain ? findings.filter((f) => f.domain === openDomain) : [];
  const openLabel = openDomain ? (DOMAIN_LABELS[openDomain] ?? openDomain.replace(/_/g, " ")) : null;
  const openHasFailure = openRows.some((r) => r.status === "fail" && !r.resolved_at);
  const openFinding = (f: SystemsCheckFinding) => setOpenDomain(f.domain ?? null);
  const shown = ordered.filter(inFilter);

  return (
    /* The shell's <main> owns scroll; every block here is flex-none so the tab sits above the
       fold on a 1366×768 laptop. */
    <div className="flex min-h-0 flex-col">
      {/* ── RUN STRIP · v3 L229–L250 ──────────────────────────────────────────────────────── */}
      <div className="mb-[22px] flex-none">
        <div className="flex flex-wrap items-baseline gap-x-4 gap-y-[5px] pb-2.5">
          {legend.map((l) => {
            const active = filter === l.key;
            return (
              <button
                key={l.key}
                type="button"
                title={l.note}
                onClick={() => setFilter(active ? "all" : l.key)}
                className={cn(
                  "inline-flex min-h-[26px] items-baseline gap-1.5 border-0 bg-transparent px-px text-[12px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  active ? "font-medium text-foreground" : "text-muted-foreground",
                )}
                style={active ? { boxShadow: "inset 0 -1px 0 hsl(var(--gold-dark))" } : undefined}
              >
                <i
                  aria-hidden
                  className="h-[5px] w-[5px] self-center"
                  style={{ rotate: "45deg", background: l.tone }}
                />
                <b className="text-[13px] font-medium tabular-nums tracking-[-0.01em] text-foreground">
                  {loading ? "—" : l.n}
                </b>
                {l.label}
              </button>
            );
          })}
          <span className="flex-1" />
          <span className="font-mono text-[10.5px] text-muted-foreground">
            {run ? `ran ${clock(run.started_at)} · completed ${clock(run.completed_at)}` : "no run on record"}
          </span>
        </div>

        {/* One cell per check, registry-priority order. A thicker cap marks a blocking check;
            a cell that falls out of the filter dims rather than disappearing, so the shape of
            the run never changes under a filter (L4766–L4781). */}
        <div className="flex min-w-0 gap-[2px]">
          {byPriority.map((f) => {
            const dim = !inFilter(f);
            const blocking = severityOf(f) === "blocking";
            const tone = STATUS_TONE[f.status] ?? STATUS_TONE.skip;
            return (
              <button
                key={f.id}
                type="button"
                onClick={() => openFinding(f)}
                title={`${nameOf(f)} · ${STATUS_LABEL[f.status] ?? f.status}${blocking ? " · blocking" : ""}`}
                aria-label={`${nameOf(f)} · ${STATUS_LABEL[f.status] ?? f.status}${blocking ? " · blocking" : ""}`}
                className="grid h-[34px] min-w-0 flex-1 content-end rounded-[3px] border p-0 transition-opacity focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                style={{
                  borderColor: dim ? "hsl(var(--border))" : tone,
                  background: dim
                    ? "transparent"
                    : f.status === "pass"
                      ? "color-mix(in srgb, hsl(var(--success)) 16%, transparent)"
                      : f.status === "fail"
                        ? "color-mix(in srgb, hsl(var(--destructive)) 20%, transparent)"
                        : "color-mix(in srgb, hsl(var(--muted-foreground)) 12%, transparent)",
                  opacity: dim ? 0.35 : 1,
                }}
              >
                <i
                  aria-hidden
                  className="block"
                  style={{ height: blocking ? "3px" : "2px", background: dim ? "hsl(var(--border))" : tone }}
                />
              </button>
            );
          })}
          {!loading && byPriority.length === 0 && (
            <span className="text-[11px] text-muted-foreground">No run has landed yet.</span>
          )}
        </div>

        <p className="mt-[9px] text-[10.5px] leading-[1.5] text-muted-foreground">
          {filter === "alone"
            ? "She acted on nothing during this run. At the current ceiling she sweeps and reports; raising it lets her fix what she finds without waking you."
            : "One cell per check, in registry order. A thicker cap marks a blocking check. Click a cell to open it, or a figure above to narrow the run and the findings below."}
        </p>
      </div>

      {/* ── BRIEF · v3 L252–L276 ──────────────────────────────────────────────────────────── */}
      <div className="mb-[30px] flex-none">
        <div className="grid grid-cols-1 items-start gap-7 border-b border-border pb-5 sm:grid-cols-[minmax(0,1fr)_auto]">
          <div className="min-w-0">
            {/* v3 opens this brief with a gold eyebrow, `briefWhen` (L258 / L11024), reading
                "Overnight \u00b7 ran HH:MM, completed HH:MM". Two of its three parts are already on
                the run tape above (L405, the pack's own `runWhen`), and the third — the word
                "Overnight" — is what makes the pack's version a different sentence rather than a
                repeat. Our sweep is hourly, so we cannot truthfully write it, and without it the
                eyebrow is the tape again in a second voice. Owner-reported, 2026-08-24: the timing
                "renders twice". The timing keeps one home (§18) and that home is the tape. */}
            <p className="max-w-[54ch] text-[19px] leading-[1.5] text-foreground [text-wrap:pretty]">
              {loading ? "Reading the last sweep…" : brief.briefLine}
            </p>
            {brief.briefSub && (
              <p className="mt-[11px] max-w-[58ch] text-[12.5px] leading-[1.6] text-muted-foreground [text-wrap:pretty]">
                {brief.briefSub}
              </p>
            )}
            <div className="mt-4 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={runFullSweep}
                disabled={sweeping}
                className="min-h-[34px] rounded-[9px] border border-border bg-card px-[13px] text-[12px] font-medium shadow-sm transition-opacity hover:opacity-90 disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                {sweeping ? "Sweeping…" : "Run full sweep"}
              </button>
              <Link
                to="/operator/analytics/autonomy"
                className="inline-flex min-h-[34px] items-center rounded-[9px] border border-border bg-card px-[13px] text-[12px] font-medium shadow-sm transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                Trust Compass{trust.level === null ? "" : ` — ${TRUST_RUNGS[trust.level]}`}
              </Link>
            </div>
            {sweepStarted && (
              <p className="mt-[11px] text-[11.5px] leading-[1.5] text-[hsl(var(--primary))]">
                Sweep started — both halves. The operator half runs directly; the fleet half is
                enqueued and reports when it lands.
              </p>
            )}
          </div>

          {/* The Trust Compass block. It renders ONLY on a real stored rung — the ceiling is a
              governance gate, and drawing bars for a ceiling the platform is not holding would
              be a lie about what she may do (§13). */}
          {trust.level !== null && (
            <div className="min-w-[150px]">
              <p className="text-[10.5px] font-medium text-muted-foreground">Trust Compass</p>
              <span className="mt-2.5 flex h-[26px] items-end gap-[3px]">
                {TRUST_RUNGS.map((_, i) => (
                  <i
                    key={i}
                    aria-hidden
                    className="block flex-none rounded-[1px]"
                    style={{
                      width: "9px",
                      height: `${9 + i * 4}px`,
                      background:
                        i <= (trust.level ?? 0)
                          ? i >= 3
                            ? "hsl(var(--accent))"
                            : "hsl(var(--gold-dark))"
                          : "hsl(var(--border))",
                    }}
                  />
                ))}
              </span>
              <p className="mt-[9px] text-[13px] font-medium text-foreground">
                {TRUST_RUNGS[trust.level]}
              </p>
              <p className="mt-[3px] text-[10.5px] text-muted-foreground">
                Ceiling for every capability
              </p>
            </div>
          )}
        </div>

        {/* ── DOMAIN TILES · v3 L279–L290 ─────────────────────────────────────────────────── */}
        {/* v3 draws the hairlines between these tiles by painting the LINE COLOUR on the grid
            container and letting a 1px gap show it through (L281: `gap:1px;background:
            var(--pg-line-soft)`). That reads as one plate wherever a row is short: `auto-fit`
            collapses a wholly empty TRACK, never an empty CELL, so seven tiles across four
            columns leave one cell with no tile in it and the container colour fills it — the
            grey rectangle the owner reported on 2026-08-24.

            Same hairlines, drawn on the cells instead of bled through them: each tile carries
            its own top and left line, and the grid is offset a pixel up and left inside a
            clipping wrapper so the outermost of those lines fall outside it. Lines land only
            between real tiles, and a cell that holds no tile paints nothing at all. */}
        <div className="mt-5 overflow-hidden">
        <div
          className="-ml-px -mt-px grid"
          style={{ gridTemplateColumns: "repeat(auto-fit,minmax(158px,1fr))" }}
        >
          {tiles.map((t) => (
            <button
              key={t.id}
              type="button"
              disabled={t.count === 0}
              onClick={() => setOpenDomain(t.id)}
              className="min-w-0 border-l border-t border-border bg-background px-3.5 pb-[15px] pt-3.5 text-left text-foreground disabled:cursor-default focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
            >
              <span className="flex items-center gap-2">
                <i
                  aria-hidden
                  className="h-[7px] w-[7px] flex-none border"
                  style={{
                    rotate: "45deg",
                    borderColor: t.tone,
                    background: t.state === "ok" || t.state === "risk" ? t.tone : "transparent",
                  }}
                />
                <b className="truncate text-[12px] font-medium">{t.label}</b>
              </span>
              <span
                className="mt-[11px] block text-[13px] font-medium"
                style={{ color: t.state === "none" ? "hsl(var(--muted-foreground))" : t.tone }}
              >
                {t.status}
              </span>
              <span className="mt-1 block text-[10.5px] text-muted-foreground">{t.detail}</span>
            </button>
          ))}
        </div>
        </div>
      </div>

      {/* ── FINDINGS LEDGER · v3 L1168–L1190 ──────────────────────────────────────────────── */}
      <div className="mb-8 flex-none">
        <div className="mb-1 flex flex-wrap items-baseline justify-between gap-x-5 gap-y-1">
          <h2 className="text-[13px] font-semibold tracking-[-0.005em]">Findings</h2>
          <span className="min-w-0 truncate font-mono text-[10px] uppercase tracking-[0.07em] text-muted-foreground">
            Worst severity first, then registry priority
          </span>
        </div>
        <div className="border-t border-border">
          {shown.map((f) => {
            const tone = STATUS_TONE[f.status] ?? STATUS_TONE.skip;
            return (
              <button
                key={f.id}
                type="button"
                onClick={() => openFinding(f)}
                className="grid w-full grid-cols-[10px_minmax(0,1.7fr)_minmax(0,0.7fr)_minmax(0,0.9fr)_auto] items-center gap-3.5 border-0 border-b border-border/60 bg-transparent px-1 py-2.5 text-left text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
              >
                <i aria-hidden className="h-[7px] w-[7px]" style={{ rotate: "45deg", background: tone }} />
                <span className="flex min-w-0 flex-col">
                  <b className="truncate text-[12.5px] font-medium">{nameOf(f)}</b>
                  <small className="mt-[3px] truncate text-[11px] text-muted-foreground">
                    {evidenceRows(f.evidence)
                      .map(([k, v]) => `${k} ${v}`)
                      .join(" · ") || "No evidence recorded"}
                  </small>
                </span>
                <span className="text-right font-mono text-[11px] tabular-nums text-muted-foreground">
                  {severityOf(f)}
                </span>
                <span
                  className="flex items-center gap-1.5 text-[11px] font-medium"
                  style={{ color: tone }}
                >
                  <i aria-hidden className="h-[7px] w-[7px] border border-current" style={{ rotate: "45deg" }} />
                  {STATUS_LABEL[f.status] ?? f.status}
                </span>
                <span className="font-mono text-[11px] text-muted-foreground">Open →</span>
              </button>
            );
          })}
          {!loading && shown.length === 0 && (
            <p className="py-3 text-[11.5px] text-muted-foreground">
              {filter === "alone"
                ? "She acted on nothing during this run."
                : "No finding matches this filter."}
            </p>
          )}
        </div>
        <p className="mt-3 text-[11px] leading-[1.5] text-muted-foreground">{ledgerFoot}</p>
        <p className="mt-2 text-[11px] text-muted-foreground">
          <Link
            to="/operator/fleet/history"
            className="underline-offset-2 hover:text-foreground hover:underline"
          >
            Last scan {loading ? "—" : sinceLabel(run?.started_at)} →
          </Link>
        </p>
      </div>

      {/* ── DETAIL · the drawer, with the shipped review-and-approve engine inside it (§58) ── */}
      <Sheet open={openDomain !== null} onOpenChange={(o) => !o && setOpenDomain(null)}>
        <SheetContent side="right" className="w-full overflow-y-auto p-0 sm:max-w-lg">
          <div className="border-b border-border px-4 py-3">
            <div className="text-[9px] font-semibold tracking-[0.14em] text-muted-foreground">DOMAIN</div>
            <div className="mt-0.5 text-[17px] font-semibold">{openLabel}</div>
            <div className="mt-1 text-[11.5px] text-muted-foreground">
              {openRows.length} check{openRows.length === 1 ? "" : "s"} registered in this domain
            </div>
          </div>
          <div className="divide-y divide-border">
            {openRows.slice().sort(bySeverityThenPriority).map((r) => {
              const ev = evidenceRows(r.evidence);
              const tone = STATUS_TONE[r.status] ?? STATUS_TONE.skip;
              return (
                <div key={r.id} className="px-4 py-3">
                  <div className="flex min-w-0 flex-wrap items-center gap-2">
                    <span aria-hidden className="h-2 w-2 flex-none rounded-full" style={{ background: tone }} />
                    <span className="min-w-0 truncate text-[12.5px] font-semibold">{nameOf(r)}</span>
                    <span
                      className="ml-auto flex-none whitespace-nowrap rounded-full px-2 py-0.5 text-[10px] font-semibold"
                      style={{ color: tone, background: `color-mix(in srgb, ${tone} 12%, transparent)` }}
                    >
                      {STATUS_LABEL[r.status] ?? r.status}
                    </span>
                  </div>
                  {r.paige_interpretation && (
                    <div className="mt-1.5 text-[11.5px] leading-[1.5] text-muted-foreground">
                      {r.paige_interpretation}
                    </div>
                  )}
                  {ev.length > 0 && (
                    <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 rounded-[9px] bg-muted/40 px-2.5 py-2">
                      {ev.map(([k, v]) => (
                        <div key={k} className="flex min-w-0 items-baseline justify-between gap-2">
                          <dt className="min-w-0 truncate text-[10px] text-muted-foreground">{k}</dt>
                          <dd className="flex-none font-mono text-[10px] tabular-nums">{v}</dd>
                        </div>
                      ))}
                    </dl>
                  )}
                </div>
              );
            })}

            {openHasFailure && (
              <div className="border-t border-border px-4 py-3">
                <div className="mb-2 text-[9px] font-semibold tracking-[0.14em] text-muted-foreground">
                  REVIEW AND APPROVE
                </div>
                <SystemsCheckTile scope="operator" />
              </div>
            )}
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}

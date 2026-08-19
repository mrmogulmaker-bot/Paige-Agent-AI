import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useSystemsCheck, type SystemsCheckFinding } from "@/hooks/useSystemsCheck";
import { SystemsCheckTile } from "@/components/systems-check/SystemsCheckTile";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

/**
 * Systems Check — Claude Design's `isFleet` block at `tabKey === "main"` (Super Admin Shell.dc.html
 * 6769-6857), on the real operator scan.
 *
 * §30/§58 — the platform already ships this capability: `useSystemsCheck` + `SystemsCheckTile` are
 * the shipped Wave-S3-L3 read + review-and-approve engine. CD draws its own category grid, KPI strip
 * and a "Run full sweep" button — but those are a picture of a systems check, not the working one.
 * So the pack's chrome renders here and the REAL engine drives it.
 *
 * WHAT CHANGED (owner live-review, 2026-08-19) — seven defects, all from his own read of the
 * deployed page plus a pack cross-check:
 *
 * 1. THE PAGE SCROLLED. The whole tab must sit above the fold on a 1366×768 laptop. Nothing on this
 *    surface scrolls now: the shell's <main> owns scroll, every block here is `flex-none`, and the
 *    detail that used to extend the page has moved into a drawer.
 * 2. THE DUPLICATE STATUS CARD IS GONE — and this was the primary height cost. `SystemsCheckTile`
 *    was mounted directly below the grid, re-drawing its own "Systems Check" header and spelling out
 *    the db-health evidence inline. Per the owner: that detail "belongs INSIDE a clicked category
 *    tile… NOT rendered as a separate card below." §58: the tile is NOT deleted — it MOVES into the
 *    category drawer, so the review-and-approve capability is preserved and is now reachable exactly
 *    where the detail lives. (It also still mounts on the Command Center and on tenant surfaces;
 *    this change touches only where THIS surface renders it.)
 * 3. EVERY CONTROL IS LIVE. "Run full sweep" fires BOTH halves (owner ruling B, below); every
 *    category tile opens its drawer; the red/amber pill and the failing-check banner jump straight
 *    to the failure; "Last scan" links to History. Nothing here is a styled div any more.
 * 4. The ✦ side-chat and the orb removal ship in their own commits — shell chrome, not this surface.
 *
 * OWNER RULING B — "Both. Single button fires operator-scope sweep AND all-tenant sweeps together."
 * The operator half is a direct edge invoke (it accepts an operator JWT and returns a real summary).
 * The fleet half goes through `enqueue_fleet_systems_check()`, the RPC added in this same PR, because
 * `systems-check-run-scheduled` only accepts an internal caller. The fleet half is FIRE-AND-FORGET —
 * a queued request is not a finished sweep — so the toast says "started", never "swept" (§13).
 *
 * OWNER RULING C — the "10 vs 5" the owner spotted is NOT a copy bug, and neither of the two fixes
 * he offered was the real answer. The live registry seeds TEN operator checks and all ten run every
 * hour; the run row reads check_count 10, pass 4, fail 1. 4 + 1 = 5, so FIVE checks are neither
 * passing nor failing — they SKIP, every hour, each for an honest recorded reason:
 *   • operator_cross_tenant_canary — the canary has never run (0 runs ever). BLOCKING severity, and
 *     therefore a real §9 blind spot: cross-tenant leak health is currently unassessed.
 *   • operator_migration_drift and operator_edge_drift — both compare a git tag against HEAD, which a
 *     Deno edge function cannot read; deferred to a CI reader by design.
 *   • operator_llm_failover — no LLM calls in 24h, so there is no activity to judge failover against.
 *   • operator_stripe_webhook_health — no Stripe events have ever been recorded (pre-launch).
 * So the KPI now reads "4 of 10" (pass of TOTAL RUN — the same 10 the subtitle names, which is what
 * removes the contradiction) with "5 could not run" stated underneath, and the drawer names each
 * skip and why. Hiding five skipping checks behind a 4/5 ratio is exactly the kind of flattering
 * arithmetic §13 exists to stop.
 *
 * §13 — THE CATEGORY TAXONOMY IS CD'S; THE COUNTS ARE THE REGISTRY'S. CD draws thirteen categories.
 * Every seeded operator check carries `domain='infrastructure'`, so twelve tiles have no check
 * registered against them and read "—", which means "nothing is swept for this category yet" and
 * never "swept and clean". Counts are now grouped from each finding's real `domain` rather than
 * hardcoded to one tile, so a future operator domain lands on its tile without a code change.
 *
 * §13 — NO INVENTED INCIDENT. CD also draws an incident banner and an incident modal fed by its
 * `SC_INCIDENTS` fixture — an INC-#### id, "running 3 days 4 hours", "Unclaimed", a five-step
 * timeline. None of that has a substrate: our findings carry a check, a status, a severity, evidence
 * and Paige's interpretation, and no incident record exists. So the banner's STRUCTURE ports and is
 * fed by the real blocking failure, and it opens the real detail drawer — rather than a modal of
 * fabricated incident metadata (§18: one detail surface, not two).
 */

const SYSTEMS_CHECK_CATEGORIES = [
  { id: "infra", name: "Infrastructure" },
  { id: "models", name: "Model providers" },
  { id: "integrations", name: "Third-party integrations" },
  { id: "functions", name: "Edge functions" },
  { id: "db", name: "Database" },
  { id: "cicd", name: "CI/CD pipelines" },
  { id: "crons", name: "Scheduled tasks" },
  { id: "autos", name: "Automations state" },
  { id: "compliance", name: "Compliance seams" },
  { id: "security", name: "Security seams" },
  { id: "billing", name: "Billing seams" },
  { id: "revenue", name: "Revenue integrity" },
  { id: "tenants", name: "Fleet-wide tenant health" },
] as const;

/** Registry `domain` → CD category. Only the domain that is actually seeded maps today. */
const DOMAIN_TO_CATEGORY: Record<string, string> = { infrastructure: "infra" };

type Tone = "ok" | "warn" | "risk" | "unknown";

const TONE_PILL: Record<Tone, string> = {
  ok: "bg-[hsl(var(--success)/0.12)] text-[hsl(var(--success))]",
  warn: "bg-[hsl(var(--warning)/0.16)] text-[hsl(var(--gold-dark))]",
  risk: "bg-[hsl(var(--destructive)/0.1)] text-[hsl(var(--destructive))]",
  unknown: "bg-muted text-muted-foreground",
};

const TONE_DOT: Record<Tone, string> = {
  ok: "bg-[hsl(var(--success))]",
  warn: "bg-[hsl(var(--warning))]",
  risk: "bg-[hsl(var(--destructive))]",
  unknown: "bg-muted-foreground/40",
};

const STATUS_LABEL: Record<string, string> = {
  pass: "Passing",
  fail: "Failing",
  skip: "Could not run",
  error: "Errored",
};

function toneOfFindings(rows: SystemsCheckFinding[]): Tone {
  if (rows.length === 0) return "unknown";
  const openFails = rows.filter((r) => r.status === "fail" && !r.resolved_at);
  if (openFails.some((r) => (r.severity_at_finding ?? "low") === "blocking")) return "risk";
  if (openFails.length > 0 || rows.some((r) => r.status === "error")) return "warn";
  if (rows.some((r) => r.status === "pass")) return "ok";
  return "unknown";
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

/** Evidence is a free-shape jsonb; render it as flat key/value rows, never a raw JSON dump (§11). */
function evidenceRows(evidence: Record<string, unknown> | null): Array<[string, string]> {
  if (!evidence) return [];
  return Object.entries(evidence)
    .filter(([, v]) => v !== null && typeof v !== "object")
    .map(([k, v]) => [k.replace(/_/g, " "), String(v)] as [string, string]);
}

export default function SystemsCheckSurface() {
  const { run, findings, loading, refresh } = useSystemsCheck("operator");
  const { toast } = useToast();
  const [openCategory, setOpenCategory] = useState<string | null>(null);
  const [sweeping, setSweeping] = useState(false);

  const byCategory = useMemo(() => {
    const map = new Map<string, SystemsCheckFinding[]>();
    for (const f of findings) {
      const cat = f.domain ? DOMAIN_TO_CATEGORY[f.domain] : undefined;
      if (!cat) continue; // counted in the KPIs below; simply has no tile in CD's thirteen yet
      const list = map.get(cat) ?? [];
      list.push(f);
      map.set(cat, list);
    }
    return map;
  }, [findings]);

  const stats = useMemo(() => {
    const pass = findings.filter((f) => f.status === "pass").length;
    const skip = findings.filter((f) => f.status === "skip").length;
    const openFails = findings.filter((f) => f.status === "fail" && !f.resolved_at);
    const red = openFails.filter((f) => (f.severity_at_finding ?? "low") === "blocking").length;
    const amber = openFails.length - red + findings.filter((f) => f.status === "error").length;
    return { pass, skip, red, amber, total: findings.length };
  }, [findings]);

  /** The real blocking failure CD's banner is shaped for — no invented incident record (§13). */
  const blocking = useMemo(
    () =>
      findings.find(
        (f) => f.status === "fail" && !f.resolved_at && (f.severity_at_finding ?? "low") === "blocking",
      ) ?? null,
    [findings],
  );
  const categoryOf = (f: SystemsCheckFinding) => (f.domain ? DOMAIN_TO_CATEGORY[f.domain] : undefined);

  /** Jump to the failure CD's pill and banner both point at. */
  const openFailure = () => {
    const target = blocking ?? findings.find((f) => f.status === "fail" && !f.resolved_at);
    const cat = target ? categoryOf(target) : undefined;
    if (cat) setOpenCategory(cat);
  };

  /** Owner ruling B — one button, both halves. */
  const runFullSweep = async () => {
    if (sweeping) return;
    setSweeping(true);
    // Fleet half FIRST: it only queues, so it starts the tenant sweeps immediately instead of
    // waiting behind the operator scan. `enqueue_fleet_systems_check` is not in the generated
    // Supabase types yet (migrations are owner-review-gated) — same `as any` the sibling
    // systems-check hooks already use for this family, not a new gap.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error: fleetErr } = await (supabase as any).rpc("enqueue_fleet_systems_check");
    const { error: opErr } = await supabase.functions.invoke("systems-check-run-operator", { body: {} });

    await refresh();
    setSweeping(false);

    if (opErr) {
      toast({
        title: "The operator sweep did not run",
        description: opErr.message,
        variant: "destructive",
      });
      return;
    }
    toast({
      title: "Operator checks re-run",
      // §13: the fleet half is queued, not finished — say exactly that, and say it plainly when
      // it could not even be queued rather than implying a sweep that never started.
      description: fleetErr
        ? `The fleet sweep could not be queued: ${fleetErr.message}`
        : "The fleet sweep has started — each tenant's result lands as it finishes.",
    });
  };

  const openRows = openCategory ? (byCategory.get(openCategory) ?? []) : [];
  const openMeta = SYSTEMS_CHECK_CATEGORIES.find((c) => c.id === openCategory) ?? null;
  const openHasFailure = openRows.some((r) => r.status === "fail" && !r.resolved_at);

  return (
    /* No scroll on this surface — the shell's <main> owns it, and everything here is flex-none so
       the whole tab sits above the fold on a 1366×768 laptop (owner defect 1). */
    <div className="flex min-h-0 flex-col gap-2.5">
      {/* ── the failing check, as CD's banner (333–345) ─────────────────── */}
      {blocking && (
        <button
          type="button"
          onClick={openFailure}
          className="flex flex-none items-start gap-2.5 rounded-[11px] border border-[hsl(var(--destructive)/0.35)] border-l-[3px] border-l-[hsl(var(--destructive))] bg-[hsl(var(--destructive)/0.06)] px-3.5 py-2.5 text-left transition-colors hover:bg-[hsl(var(--destructive)/0.1)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <span
            aria-hidden
            className="mt-1 h-2 w-2 flex-none rounded-full bg-[hsl(var(--destructive))] motion-safe:animate-pulse"
          />
          <span className="min-w-0 flex-1">
            <span className="block text-[9px] font-semibold tracking-[0.14em] text-[hsl(var(--destructive))]">
              NEEDS YOU NOW
            </span>
            <span className="mt-1 block text-[13px] font-semibold leading-[1.4] text-[hsl(var(--destructive))]">
              {blocking.paige_interpretation ?? blocking.check_name ?? blocking.check_id}
            </span>
          </span>
          <span className="flex-none whitespace-nowrap text-[11.5px] font-semibold text-[hsl(var(--destructive))]">
            Open →
          </span>
        </button>
      )}

      {/* ── title row ─────────────────────────────────────────────────── */}
      <div className="flex flex-none flex-wrap items-center gap-2.5">
        <span className="text-[9.5px] font-semibold tracking-[0.15em] text-muted-foreground">PLATFORM</span>
        <span className="text-[19px] font-bold tracking-[-0.02em]">Systems Check</span>
        <span className="text-[12px] text-muted-foreground">
          {loading ? "—" : `${stats.total} checks, one category seeded.`} Is the machine running for
          everybody.
        </span>
        <div className="ml-auto flex flex-none items-center gap-2">
          {!loading && (stats.red > 0 || stats.amber > 0) && (
            <button
              type="button"
              onClick={openFailure}
              title="Jump to the failing check"
              className={cn(
                "whitespace-nowrap rounded-full px-2.5 py-1 text-[11px] font-semibold transition-opacity hover:opacity-80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                stats.red > 0 ? TONE_PILL.risk : TONE_PILL.warn,
              )}
            >
              {stats.red} red · {stats.amber} amber
            </button>
          )}
          <button
            type="button"
            onClick={runFullSweep}
            disabled={sweeping}
            className="whitespace-nowrap rounded-[9px] bg-cd-gold px-3.5 py-2 text-[12.5px] font-semibold text-[hsl(var(--accent-foreground))] transition-opacity hover:opacity-90 disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {sweeping ? "Sweeping…" : "Run full sweep"}
          </button>
        </div>
      </div>

      {/* ── anchor strip (CD's, verbatim) ──────────────────────────────── */}
      <div className="flex min-w-0 flex-none items-center gap-[9px] rounded-[10px] border border-[hsl(var(--primary)/0.28)] bg-[hsl(var(--primary)/0.05)] px-3 py-1.5">
        <span aria-hidden className="flex-none text-[11px] text-[hsl(var(--primary))]">⌖</span>
        <span className="min-w-0 text-[11px] leading-[1.4] text-[hsl(var(--primary))]">
          Green means a check ran and passed. A category that has not been swept says so — it never
          reports green from an unqueried state.
        </span>
      </div>

      {/* ── KPI strip (CD's four labels, condensed) ────────────────────── */}
      <div className="grid flex-none grid-cols-2 gap-2 lg:grid-cols-4">
        {[
          {
            label: "OVERALL",
            value: loading || !run ? "—" : stats.red > 0 || stats.amber > 0 ? "Degraded" : "Healthy",
            unit: loading || !run ? undefined : `${stats.red} red, ${stats.amber} amber`,
          },
          {
            label: "CHECKS PASSING",
            // pass of TOTAL RUN — the same number the subtitle names, so the two agree (ruling C).
            value: loading || !run ? "—" : `${stats.pass} of ${stats.total}`,
            unit: loading || !run ? undefined : stats.skip > 0 ? `${stats.skip} could not run` : undefined,
          },
          // No incident substrate exists (see the §13 note in the header) — honest "—", never a
          // fabricated zero, and never CD's INC-0042.
          { label: "OPEN INCIDENT", value: "—" },
          { label: "AUTO-MITIGATED", value: "—" },
        ].map((k) => (
          <div key={k.label} className="min-w-0 rounded-[11px] border-[1.5px] border-border bg-card px-3 py-2 shadow-sm">
            <div className="truncate text-[8.5px] font-semibold tracking-[0.13em] text-muted-foreground">
              {k.label}
            </div>
            <div className="mt-0.5 truncate text-[19px] font-bold tabular-nums tracking-[-0.02em]">
              {k.value}
            </div>
            {k.unit && <div className="truncate text-[10px] text-muted-foreground">{k.unit}</div>}
          </div>
        ))}
      </div>

      {/* ── category grid ─────────────────────────────────────────────── */}
      <div className="flex-none rounded-[13px] border-[1.5px] border-border bg-card px-3 py-2.5 shadow-sm">
        <div className="flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
          <span className="text-[12.5px] font-semibold">Categories</span>
          <span className="text-[10.5px] text-muted-foreground">
            Click any category for its systems and evidence.
          </span>
          <Link
            to="/operator/fleet/history"
            className="ml-auto whitespace-nowrap text-[10.5px] text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
          >
            Last scan {loading ? "—" : sinceLabel(run?.started_at)} →
          </Link>
        </div>
        <div className="mt-2 grid grid-cols-2 gap-1.5 sm:grid-cols-3 lg:grid-cols-5">
          {SYSTEMS_CHECK_CATEGORIES.map((c) => {
            const rows = byCategory.get(c.id) ?? [];
            const tone = toneOfFindings(rows);
            const assessable = rows.filter((r) => r.status !== "skip").length;
            const passing = rows.filter((r) => r.status === "pass").length;
            const label = rows.length === 0 ? "—" : `${passing}/${assessable || rows.length}`;
            return (
              <button
                key={c.id}
                type="button"
                onClick={() => setOpenCategory(c.id)}
                title={rows.length === 0 ? "Nothing is swept for this category yet" : undefined}
                className="flex min-w-0 items-center justify-between gap-1.5 rounded-[9px] border border-border bg-muted/30 px-2 py-1.5 text-left transition-colors hover:border-[hsl(var(--primary)/0.4)] hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <span className="flex min-w-0 items-center gap-1.5">
                  <span aria-hidden className={cn("h-1.5 w-1.5 flex-none rounded-full", TONE_DOT[tone])} />
                  <span className="min-w-0 truncate text-[11px]">{c.name}</span>
                </span>
                <span
                  className={cn(
                    "flex-none whitespace-nowrap rounded-full px-1.5 py-0.5 text-[9.5px] font-semibold tabular-nums",
                    TONE_PILL[tone],
                  )}
                >
                  {label}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* ── category drawer (CD's scCat, 2466) — where the detail now lives ── */}
      <Sheet open={openCategory !== null} onOpenChange={(o) => !o && setOpenCategory(null)}>
        <SheetContent side="right" className="flex w-[620px] max-w-full flex-col gap-0 p-0">
          <div className="flex-none border-b border-border px-4 py-3">
            <div className="text-[9px] font-semibold tracking-[0.14em] text-muted-foreground">CATEGORY</div>
            <div className="mt-0.5 text-[16px] font-semibold">{openMeta?.name}</div>
            <div className="mt-0.5 text-[11.5px] text-muted-foreground">
              {openRows.length === 0
                ? "No check is registered against this category yet — it has never been swept."
                : `${openRows.length} check${openRows.length === 1 ? "" : "s"}, last swept ${sinceLabel(run?.started_at)}.`}
            </div>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto">
            {openRows.map((r) => {
              const tone: Tone =
                r.status === "pass"
                  ? "ok"
                  : r.status === "fail" && !r.resolved_at
                    ? (r.severity_at_finding ?? "low") === "blocking"
                      ? "risk"
                      : "warn"
                    : r.status === "error"
                      ? "warn"
                      : "unknown";
              const ev = evidenceRows(r.evidence);
              return (
                <div key={r.id} className="border-b border-border/60 px-4 py-3 last:border-b-0">
                  <div className="flex min-w-0 flex-wrap items-center gap-2">
                    <span aria-hidden className={cn("h-2 w-2 flex-none rounded-full", TONE_DOT[tone])} />
                    <span className="min-w-0 truncate text-[12.5px] font-semibold">
                      {r.check_name ?? r.check_id}
                    </span>
                    <span
                      className={cn(
                        "ml-auto flex-none whitespace-nowrap rounded-full px-2 py-0.5 text-[10px] font-semibold",
                        TONE_PILL[tone],
                      )}
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

            {/* §58 — the shipped review-and-approve engine, preserved and moved here rather than
                deleted with the duplicate card. Shown only where there is something open to act on,
                so a clean category is not padded with an empty tile. */}
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

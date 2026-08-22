import { useMemo } from "react";
import { useAlerting } from "@/operator/data/useAlerting";
import { describeChannels, describeCondition } from "@/operator/data/describeCondition";

/**
 * Fleet Console — Alert rules (CD 6769–6857, ported structurally in `fleetSpecs.ts`'s
 * `fleet/alert-rules` entry). "What she tells you about, how, and whether it has ever fired."
 *
 * §30/§58 — same chrome-wraps-engine pattern as Systems Check / History / Team Pulse: the
 * pack's title, subtitle, KPI labels and block copy port verbatim; the VALUES are now real
 * reads off the A1 substrate instead of the honest-absence the spec shipped.
 *
 * Two things this surface deliberately does NOT do:
 *   · "+ New rule" is rendered DISABLED and says why. Authoring is A5. A control that looks
 *     live and silently discards the operator's work is the §13/§36 failure — worse than a
 *     control that isn't there yet, because it teaches them the surface is broken.
 *   · A rule's declared channels are labelled as DECLARED. A3 delivers in-app only; showing
 *     "email" as though mail were going out would be a fire reported as a delivery (§13).
 */

const SEVERITY_CLASS: Record<string, string> = {
  urgent: "bg-destructive/12 text-destructive",
  warning: "bg-warning/15 text-warning-foreground",
  info: "bg-muted text-muted-foreground",
};

/** §16 lanes, in the operator's words rather than the enum's. */
const LANE_LABEL: Record<string, string> = {
  auto: "acts on its own",
  confirm: "drafts for your approval",
  off: "briefs a human only",
};

function num(n: number | null): string {
  return n === null ? "—" : String(n);
}

function relative(iso: string | null): string {
  if (!iso) return "never";
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "never";
  const mins = Math.round((Date.now() - then) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.round(hrs / 24)}d ago`;
}

export default function FleetAlertRulesSurface() {
  const { rules, rulesTruncated, signals, counts, loading, error } = useAlerting(true);

  const signalLabels = useMemo(
    () => Object.fromEntries(signals.map((s) => [s.key, s.label])),
    [signals],
  );

  const activeCount = counts.rules === null || counts.paused === null ? null : counts.rules - counts.paused;

  const kpis = [
    {
      label: "RULES",
      value: loading ? "—" : num(counts.rules),
      unit: loading ? undefined : `${num(counts.paused)} paused`,
    },
    {
      label: "FIRED TODAY",
      value: loading ? "—" : num(counts.firedToday),
      unit: loading ? undefined : `${num(counts.acknowledgedToday)} acknowledged`,
    },
    { label: "UNACKNOWLEDGED", value: loading ? "—" : num(counts.unacknowledged) },
    {
      label: "NEVER FIRED",
      value: loading ? "—" : num(counts.neverFired),
      unit: "worth checking it works",
    },
  ];

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3.5">
      {/* ── title row ─────────────────────────────────────────────── */}
      <div className="flex flex-none flex-wrap items-start gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2.5">
            <span className="text-[9.5px] font-semibold tracking-[0.15em] text-muted-foreground">PLATFORM</span>
            <span className="text-[21px] font-bold tracking-[-0.02em]">Alert rules</span>
            <span className="whitespace-nowrap rounded-full bg-muted px-2 py-0.5 text-[10px] font-semibold text-muted-foreground">
              {loading ? "—" : num(activeCount)} active
            </span>
          </div>
          <div className="mt-1.5 text-[12.5px] text-muted-foreground">
            What she tells you about, how, and whether it has ever fired.
          </div>
        </div>

        {/* Authoring is A5. Disabled and self-explaining, never a live-looking no-op (§13/§36). */}
        <button
          type="button"
          disabled
          title="Rule authoring is not wired yet — the write path lands with the authoring slice."
          className="ml-auto flex-none cursor-not-allowed rounded-lg border-[1.5px] border-border bg-muted/50 px-3 py-1.5 text-[11.5px] font-semibold text-muted-foreground"
        >
          + New rule
        </button>
      </div>

      {/* ── KPI strip ─────────────────────────────────────────────── */}
      <div className="grid flex-none grid-cols-2 gap-2.5 lg:grid-cols-4">
        {kpis.map((k) => (
          <div key={k.label} className="min-w-0 rounded-xl border-[1.5px] border-border bg-card px-3.5 py-3 shadow-sm">
            <div className="truncate text-[9px] font-semibold tracking-[0.13em] text-muted-foreground">
              {k.label}
            </div>
            <div className="mt-1 whitespace-nowrap text-[24px] font-bold tabular-nums tracking-[-0.02em]">
              {k.value}
            </div>
            {k.unit && <div className="mt-0.5 truncate text-[10.5px] text-muted-foreground">{k.unit}</div>}
          </div>
        ))}
      </div>

      {error && (
        <div className="flex-none rounded-xl border-[1.5px] border-destructive/40 bg-destructive/8 px-3.5 py-2.5 text-[11.5px] text-destructive">
          {error}
        </div>
      )}

      {rulesTruncated && (
        <div className="flex-none rounded-xl border-[1.5px] border-warning/40 bg-warning/10 px-3.5 py-2.5 text-[11.5px] text-warning-foreground">
          More rules exist than this surface reads at once — the counts above are shown as “—”
          rather than a figure that would be wrong.
        </div>
      )}

      {/* ── Rules ─────────────────────────────────────────────────── */}
      <div className="min-h-0 flex-1 overflow-y-auto rounded-[13px] border-[1.5px] border-border bg-card shadow-sm">
        <div className="border-b border-border px-3.5 py-3">
          <div className="text-[13.5px] font-semibold">Rules</div>
          <div className="mt-0.5 text-[11px] text-muted-foreground">
            Condition, delivery, and when it last fired.
          </div>
        </div>

        {loading && (
          <div className="space-y-px">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="flex items-center gap-2.5 border-b border-border/60 px-4 py-3.5">
                <div className="h-3 w-64 animate-pulse rounded bg-muted" />
              </div>
            ))}
          </div>
        )}

        {!loading && rules.length === 0 && (
          <div className="px-4 py-10 text-center">
            <div className="text-[13px] font-semibold">No alert rule has been created yet.</div>
            <div className="mx-auto mt-1 max-w-md text-[11.5px] text-muted-foreground">
              The evaluator runs every five minutes and finds nothing to check. It will stay quiet
              until the first rule exists.
            </div>
          </div>
        )}

        {!loading &&
          rules.map((r) => {
            const channels = describeChannels(r.channels);
            return (
              <div key={r.id} className="min-w-0 border-b border-border/60 px-4 py-3.5 last:border-b-0">
                <div className="flex min-w-0 flex-wrap items-center gap-2">
                  <span className="truncate text-[12.5px] font-semibold leading-[1.35]">{r.name}</span>
                  <span
                    className={`flex-none whitespace-nowrap rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                      SEVERITY_CLASS[r.severity] ?? SEVERITY_CLASS.info
                    }`}
                  >
                    {r.severity}
                  </span>
                  {!r.isActive && (
                    <span className="flex-none whitespace-nowrap rounded-full bg-muted px-2 py-0.5 text-[10px] font-semibold text-muted-foreground">
                      paused
                    </span>
                  )}
                  <span className="ml-auto flex-none whitespace-nowrap text-[10.5px] text-muted-foreground">
                    fired {relative(r.lastFiredAt)}
                  </span>
                </div>

                <div className="mt-1 truncate font-mono text-[11px] text-muted-foreground">
                  {describeCondition(r.condition, signalLabels)}
                </div>

                <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[10.5px] text-muted-foreground">
                  <span>{LANE_LABEL[r.autonomyLane] ?? r.autonomyLane}</span>
                  {r.department && <span>· {r.department}</span>}
                  <span>
                    · in-app
                    {channels.filter((c) => c !== "in_app").length > 0 &&
                      ` (declared: ${channels.filter((c) => c !== "in_app").join(", ")} — not sending yet)`}
                  </span>
                  <span>· evaluated {relative(r.lastEvaluatedAt)}</span>
                </div>
              </div>
            );
          })}

        <div className="border-t border-border px-3.5 py-2.5 text-[10.5px] text-muted-foreground">
          A rule that has never fired is not proof of health — it may simply be wrong. Test it.
        </div>
      </div>

      {/* ── What she can watch ────────────────────────────────────── */}
      <div className="flex-none rounded-[13px] border-[1.5px] border-border bg-card px-3.5 py-3 shadow-sm">
        <div className="text-[13.5px] font-semibold">What she can watch</div>
        <div className="mt-0.5 text-[11px] text-muted-foreground">
          The signals a rule can be written against. A signal with no reader reports “never
          evaluated” — it never reports a pass.
        </div>
        <div className="mt-2.5 flex flex-wrap gap-1.5">
          {signals.length === 0 && (
            <span className="text-[11px] text-muted-foreground">No signal catalogue was read.</span>
          )}
          {signals.map((s) => (
            <span
              key={s.key}
              title={s.notes ?? undefined}
              className={`whitespace-nowrap rounded-full px-2 py-0.5 text-[10.5px] font-semibold ${
                s.isReadable
                  ? "bg-muted text-muted-foreground"
                  : "bg-warning/12 text-warning-foreground line-through decoration-1"
              }`}
            >
              {s.label}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

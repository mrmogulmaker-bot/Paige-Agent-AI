import { useMemo, useState } from "react";

import {
  useSystemsCheckHistory,
  type FleetHistoryEvent,
} from "@/operator/data/useSystemsCheckHistory";

/**
 * Fleet · History — authoritative v3 source:
 * `docs/design-references/cd-packs/super-admin-shell-v3/PAIGE Super Admin Shell v3.dc.html`
 * markup 910–954 · builder `runsVals` 7624–7699 (ROUTE-MAP.md 37).
 *
 * Structure is transcribed from v3. Values come only from `paige_systems_check_run` and
 * `paige_alert_firing`; the pack's generated 36-run illustration is never shipped.
 */

type Filter = "Complete" | "Firing" | "In flight" | "Clean";

const FILTERS: ReadonlyArray<{ label: string; value: Filter }> = [
  { label: "Full sweep", value: "Complete" },
  { label: "Firing", value: "Firing" },
  { label: "In flight", value: "In flight" },
  { label: "Clean", value: "Clean" },
];

const TONE: Record<Filter, string> = {
  Complete: "var(--pg-positive)",
  Firing: "var(--pg-warning)",
  "In flight": "var(--pg-violet)",
  Clean: "var(--pg-line-strong)",
};

function timeOf(iso: string): string {
  const value = new Date(iso);
  if (Number.isNaN(value.getTime())) return "—";
  return value.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
}

function matches(event: FleetHistoryEvent, filter: Filter | null): boolean {
  if (!filter) return true;
  if (filter === "Complete") return event.kind === "Full sweep";
  return event.outcome === filter;
}

export function FleetHistoryView({
  events,
  total,
  loading = false,
  error = null,
}: {
  events: FleetHistoryEvent[];
  total: number | null;
  loading?: boolean;
  error?: string | null;
}) {
  const [filter, setFilter] = useState<Filter | null>(null);
  const matching = useMemo(() => events.filter((event) => matches(event, filter)), [events, filter]);
  const rows = matching.slice(0, 9);
  const oldest = events.at(-1);
  const newest = events[0];

  const counts = useMemo(
    () => ({
      Complete: events.filter((event) => event.kind === "Full sweep").length,
      Firing: events.filter((event) => event.outcome === "Firing").length,
      "In flight": events.filter((event) => event.outcome === "In flight").length,
      // The evaluator stores firings, not no-fire cycles. Zero would be a fabricated reading.
      Clean: null,
    }),
    [events],
  );

  return (
    <section className="flex min-h-0 min-w-0 flex-1 flex-col" aria-labelledby="fleet-history-title">
      <div className="flex-none border-b border-[var(--pg-line)] pb-3.5">
        <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1.5">
          <b id="fleet-history-title" className="text-[12px] font-medium">Run history</b>
          <small className="min-w-0 text-[10.5px] text-[var(--pg-faint)]">
            {loading ? "—" : `${total ?? "—"} records · newest first, capped at 100`}
          </small>
        </div>

        <div className="mt-[13px] flex h-[30px] items-end gap-0.5" aria-label="Run cadence">
          {events.length === 0 ? (
            <span className="h-px flex-1 bg-[var(--pg-line-soft)]" />
          ) : (
            events
              .slice()
              .reverse()
              .map((event) => (
                <span
                  key={event.id}
                  className="min-w-[3px] flex-1"
                  title={`${timeOf(event.at)} · ${event.kind} · ${event.outcome}`}
                  style={{
                    height: event.kind === "Full sweep" ? 30 : event.outcome === "Firing" ? 22 : 13,
                    background: TONE[event.outcome],
                    opacity: matches(event, filter) ? 1 : 0.22,
                  }}
                />
              ))
          )}
        </div>

        <div className="mt-1.5 flex items-baseline justify-between gap-3 font-mono text-[10px] text-[var(--pg-faint)]">
          <small>{oldest ? timeOf(oldest.at) : "—"}</small>
          <small>{newest ? timeOf(newest.at) : "—"}</small>
        </div>

        <div className="mt-[9px] flex flex-wrap items-center gap-x-3 gap-y-1.5" aria-label="Filter run history">
          {FILTERS.map(({ label, value }) => {
            const unavailable = value === "Clean";
            const active = filter === value;
            return (
              <button
                key={value}
                type="button"
                disabled={unavailable}
                aria-pressed={active}
                title={unavailable ? "No-fire evaluator cycles are not recorded." : undefined}
                onClick={() => setFilter(active ? null : value)}
                className="inline-flex min-h-[22px] items-center gap-1.5 whitespace-nowrap rounded-full border bg-transparent px-2 text-[10.5px] font-medium disabled:cursor-not-allowed"
                style={{
                  borderColor: active ? "var(--pg-gold)" : "transparent",
                  color: active ? "var(--pg-ink)" : "var(--pg-muted)",
                  opacity: unavailable ? 0.62 : 1,
                }}
              >
                <i className="h-1.5 w-1.5 rotate-45" style={{ background: TONE[value] }} />
                {label}
                <small className="ml-1 font-mono text-[10px] text-[var(--pg-faint)]">
                  {counts[value] ?? "—"}
                </small>
              </button>
            );
          })}
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-auto pt-0.5 [scrollbar-gutter:stable]">
        {loading && (
          <div className="space-y-px" aria-busy="true" aria-label="Reading run history">
            {Array.from({ length: 6 }, (_, index) => (
              <div key={index} className="flex items-center gap-3 border-b border-[var(--pg-line-soft)] py-3">
                <span className="h-1.5 w-1.5 animate-pulse rotate-45 bg-[var(--pg-line-strong)]" />
                <span className="h-3 w-48 animate-pulse rounded bg-[var(--pg-surface)]" />
              </div>
            ))}
          </div>
        )}

        {!loading && error && (
          <div role="alert" className="py-4 text-[12px] text-[var(--pg-negative)]">
            {events.length > 0
              ? "Some run history could not be read; the available records remain below."
              : "The run history could not be read."} {error}
          </div>
        )}

        {!loading && !error && events.length === 0 && (
          <p className="py-8 text-[12px] text-[var(--pg-faint)]">No run has been recorded here yet.</p>
        )}

        {!loading && events.length > 0 && rows.length === 0 && (
          <p className="py-8 text-[12px] text-[var(--pg-faint)]">No matching run is recorded.</p>
        )}

        {!loading &&
          rows.map((event) => (
            <div
              key={event.id}
              className="flex min-w-0 items-center justify-between gap-3.5 border-b border-[var(--pg-line-soft)] py-[9px]"
            >
              <span className="flex min-w-0 items-center gap-2.5">
                <i className="h-1.5 w-1.5 flex-none rotate-45" style={{ background: TONE[event.outcome] }} />
                <b className="flex-none font-mono text-[12px] font-medium tracking-[-0.01em]">{timeOf(event.at)}</b>
                <small className="hidden min-h-[17px] flex-none rounded-full border border-[var(--pg-line)] px-1.5 text-[9px] leading-[17px] text-[var(--pg-faint)] min-[520px]:block">
                  {event.kind}
                </small>
                <small className="min-w-[132px] flex-1 truncate text-[10.5px] text-[var(--pg-faint)]">{event.detail}</small>
              </span>
              <span className="flex flex-none items-center gap-3.5">
                <small className="whitespace-nowrap font-mono text-[10.5px] text-[var(--pg-muted)]">{event.duration}</small>
                <small className="whitespace-nowrap text-[10px] font-medium" style={{ color: TONE[event.outcome] }}>
                  {event.outcome}
                </small>
                <button
                  type="button"
                  disabled
                  title="Systems sweep details are not mounted in this surface."
                  className="whitespace-nowrap border-0 bg-transparent text-[10.5px] text-[var(--pg-faint)] disabled:cursor-not-allowed"
                >
                  Open —
                </button>
              </span>
            </div>
          ))}

        {!loading && (events.length > 0 || !error) && (
          <p className="mt-[15px] max-w-[66ch] text-[10.5px] leading-[1.55] text-[var(--pg-faint)]">
            A run in flight reads still running, never a verdict it has not reached. Full sweeps and alert firings read from the platform record. No-fire evaluator cycles are not stored, so Clean remains —. Showing {rows.length} of {matching.length} matching records.
          </p>
        )}
      </div>
    </section>
  );
}

export default function FleetHistorySurface() {
  const history = useSystemsCheckHistory(true);
  return <FleetHistoryView {...history} />;
}

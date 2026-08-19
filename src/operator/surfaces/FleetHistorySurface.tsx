import { useSystemsCheckHistory } from "@/operator/data/useSystemsCheckHistory";
import { cn } from "@/lib/utils";

/**
 * Fleet Console — History (CD's `SC_HISTORY`, `Super Admin Shell.dc.html` 6769-6857,
 * ported structurally in `fleetSpecs.ts`'s `fleet/history` entry). "Every check that has
 * run, newest first, with what it found."
 *
 * §30/§58 — same chrome-wraps-engine pattern as Systems Check: the pack's title/subtitle/
 * chip/block copy ports verbatim; the feed is real operator-scope run history
 * (`useSystemsCheckHistory`), not CD's mock `SC_HISTORY` fixture rows.
 *
 * §13 — a run with `completed_at = null` is honestly "still running," never rendered as
 * a pass or a fail it hasn't reached yet.
 */

function toneFor(passCount: number, failCount: number, completedAt: string | null): "ok" | "warn" | "risk" | "unknown" {
  if (!completedAt) return "unknown";
  if (failCount > 0) return "risk";
  if (passCount > 0) return "ok";
  return "unknown";
}

const TONE_DOT: Record<"ok" | "warn" | "risk" | "unknown", string> = {
  ok: "bg-[hsl(var(--success))]",
  warn: "bg-[hsl(var(--warning))]",
  risk: "bg-[hsl(var(--destructive))]",
  unknown: "bg-muted-foreground/40",
};

const TONE_PILL: Record<"ok" | "warn" | "risk" | "unknown", string> = {
  ok: "bg-[hsl(var(--success)/0.12)] text-[hsl(var(--success))]",
  warn: "bg-[hsl(var(--warning)/0.16)] text-[hsl(var(--gold-dark))]",
  risk: "bg-[hsl(var(--destructive)/0.1)] text-[hsl(var(--destructive))]",
  unknown: "bg-muted text-muted-foreground",
};

function formatWhen(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export default function FleetHistorySurface() {
  const { runs, loading, error } = useSystemsCheckHistory(true);

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3.5">
      {/* ── title row ─────────────────────────────────────────────── */}
      <div className="flex flex-none flex-wrap items-start gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2.5">
            <span className="text-[9.5px] font-semibold tracking-[0.15em] text-muted-foreground">PLATFORM</span>
            <span className="text-[21px] font-bold tracking-[-0.02em]">History</span>
          </div>
          <div className="mt-1.5 text-[12.5px] text-muted-foreground">
            Every check that has run, newest first, with what it found.
          </div>
        </div>
        <div className="ml-auto flex-none">
          <span className="whitespace-nowrap rounded-full border border-border bg-card px-3 py-1.5 text-[11.5px] font-medium text-muted-foreground">
            {loading ? "—" : runs.length} events
          </span>
        </div>
      </div>

      {/* ── the feed ─────────────────────────────────────────────── */}
      <div className="min-h-0 flex-1 overflow-y-auto rounded-[13px] border-[1.5px] border-border bg-card shadow-sm">
        <div className="border-b border-border px-3.5 py-3">
          <div className="text-[13.5px] font-semibold">Check history</div>
          <div className="mt-0.5 text-[11px] text-muted-foreground">Every sweep, every failure, every recovery.</div>
        </div>

        {loading && (
          <div className="space-y-px">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="flex items-center gap-2.5 border-b border-border/60 px-4 py-3">
                <div className="h-2.5 w-2.5 flex-none animate-pulse rounded-full bg-muted" />
                <div className="h-3 w-64 animate-pulse rounded bg-muted" />
              </div>
            ))}
          </div>
        )}

        {!loading && error && (
          <div className="px-4 py-10 text-center">
            <div className="text-[13px] font-semibold">The history could not be read.</div>
            <div className="mx-auto mt-1 max-w-md text-[11.5px] text-muted-foreground">{error}</div>
          </div>
        )}

        {!loading && !error && runs.length === 0 && (
          <div className="px-4 py-10 text-center text-[13px] font-semibold text-muted-foreground">
            No sweep has been recorded here yet.
          </div>
        )}

        {!loading &&
          !error &&
          runs.map((r) => {
            const tone = toneFor(r.passCount, r.failCount, r.completedAt);
            return (
              <div
                key={r.id}
                className="flex min-w-0 items-start gap-2.5 border-b border-border/60 px-4 py-3 last:border-b-0"
              >
                <span className={cn("mt-1.5 h-2 w-2 flex-none rounded-full", TONE_DOT[tone])} />
                <div className="min-w-0 flex-1">
                  <div className="flex min-w-0 flex-wrap items-center gap-2">
                    <span
                      className={cn(
                        "whitespace-nowrap rounded-full px-2 py-0.5 text-[10px] font-semibold",
                        TONE_PILL[tone],
                      )}
                    >
                      {r.completedAt ? "Sweep" : "Running"}
                    </span>
                    <span className="ml-auto flex-none whitespace-nowrap font-mono text-[10.5px] text-muted-foreground">
                      {formatWhen(r.startedAt)}
                    </span>
                  </div>
                  <div className="mt-1 text-[12.5px] font-semibold leading-[1.35]">
                    {r.completedAt
                      ? `${r.passCount}/${r.checkCount} checks passed`
                      : `Sweeping ${r.checkCount || "—"} checks…`}
                  </div>
                  {r.failCount > 0 && (
                    <div className="mt-[3px] text-[11px] leading-[1.45] text-muted-foreground">
                      {r.failCount} {r.failCount === 1 ? "finding" : "findings"} need a look.
                    </div>
                  )}
                </div>
              </div>
            );
          })}
      </div>
      <div className="flex-none text-[10.5px] text-muted-foreground">
        Retained indefinitely.
      </div>
    </div>
  );
}

import { useSystemsCheckHistory } from "@/operator/data/useSystemsCheckHistory";
import { cn } from "@/lib/utils";

/**
 * RULING F (Claude Design, 2026-08-23) — ELEVATION IS DISTANCE FROM `--pg-env`.
 * `--pg-surface` sits ABOVE canvas in dark and BELOW it in light, so the role inverts between
 * themes and a plate painted on it RECEDES in light. A plate that rises off the canvas — a card,
 * a KPI tile, a control, a popover — paints `--pg-raised` in BOTH themes; `--pg-surface` is kept
 * for regions that genuinely recede (a well, an inset strip, a sunken list).
 *
 * AND FILL ALONE CANNOT CARRY IT (Claude Design, 2026-08-23). In light, `--pg-raised` `#fffdf8`
 * on `--pg-canvas` `#fbf9f5` is three units — correct, and invisible on its own. Separation on a
 * raised plate is `--pg-rim` PLUS `--pg-lift-1`: the rim is a seated inset pair (a top highlight
 * and a bottom shade, L21/L28) and the lift is the outer cast (L22/L29). Carrying the rim alone
 * left only insets, which read as a plain outline against the 1.5px border — the "hairline
 * outline" CD reported. Both tokens ship at the pack's own values; this is where they are spent.
 * The pack pairs them exactly this way at L9420 and L9477: `var(--pg-rim), var(--pg-lift-N)`.
 *
 * AND WHY THE RIM WAS NOT PAINTING AT ALL — measured, not inferred. `shadow-[shadow:var(--pg-rim)]`
 * does NOT compile to a box-shadow. Tailwind 3 cannot type a bare `var()` and resolves the
 * `shadow-` arbitrary value to `--tw-shadow-COLOUR`; the emitted rule is
 * `{--tw-shadow-color: var(--pg-rim)}` (verified in the built CSS), which recolours a shadow
 * that was never declared, so `getComputedStyle(...).boxShadow` came back `none` on every one
 * of these plates in BOTH themes. All the separation on screen was the 1.5px border — which is
 * exactly why it read as "a plain border." The `shadow:` data-type hint
 * (`shadow-[shadow:var(--pg-rim),var(--pg-lift-1)]`) is what makes Tailwind emit `box-shadow`,
 * the same hint `text-[length:var(--pg-t-body)]` already uses throughout this console.
 */

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
  unknown: "bg-[color-mix(in_srgb,var(--pg-muted)_40%,transparent)]",
};

const TONE_PILL: Record<"ok" | "warn" | "risk" | "unknown", string> = {
  ok: "bg-[hsl(var(--success)/0.12)] text-[hsl(var(--success))]",
  warn: "bg-[hsl(var(--warning)/0.16)] text-[hsl(var(--gold-dark))]",
  risk: "bg-[hsl(var(--destructive)/0.1)] text-[hsl(var(--destructive))]",
  unknown: "bg-[var(--pg-workspace)] text-muted-foreground",
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
            <span className="text-[length:var(--pg-t-label)] font-semibold tracking-[0.15em] text-muted-foreground">PLATFORM</span>
            <span className="text-[length:var(--pg-t-title)] font-bold tracking-[-0.02em]">History</span>
          </div>
          <div className="mt-1.5 text-[length:var(--pg-t-body)] text-muted-foreground">
            Every check that has run, newest first, with what it found.
          </div>
        </div>
        <div className="ml-auto flex-none">
          <span className="whitespace-nowrap rounded-full border border-border bg-[var(--pg-raised)] px-3 py-1.5 text-[length:var(--pg-t-label)] font-medium text-muted-foreground">
            {loading ? "—" : runs.length} events
          </span>
        </div>
      </div>

      {/* ── the feed ─────────────────────────────────────────────── */}
      <div className="min-h-0 flex-1 overflow-y-auto rounded-[13px] border-[1.5px] border-border bg-[var(--pg-raised)] shadow-[shadow:var(--pg-rim),var(--pg-lift-1)]">
        <div className="border-b border-border px-3.5 py-3">
          <div className="text-[length:var(--pg-t-body)] font-semibold">Check history</div>
          <div className="mt-0.5 text-[length:var(--pg-t-label)] text-muted-foreground">Every sweep, every failure, every recovery.</div>
        </div>

        {loading && (
          <div className="space-y-px">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="flex items-center gap-2.5 border-b border-border/60 px-4 py-3">
                <div className="h-2.5 w-2.5 flex-none animate-pulse rounded-full bg-[var(--pg-workspace)]" />
                <div className="h-3 w-64 animate-pulse rounded bg-[var(--pg-workspace)]" />
              </div>
            ))}
          </div>
        )}

        {!loading && error && (
          <div className="px-4 py-10 text-center">
            <div className="text-[length:var(--pg-t-body)] font-semibold">The history could not be read.</div>
            <div className="mx-auto mt-1 max-w-md text-[length:var(--pg-t-label)] text-muted-foreground">{error}</div>
          </div>
        )}

        {!loading && !error && runs.length === 0 && (
          <div className="px-4 py-10 text-center text-[length:var(--pg-t-body)] font-semibold text-muted-foreground">
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
                        "whitespace-nowrap rounded-full px-2 py-0.5 text-[length:var(--pg-t-label)] font-semibold",
                        TONE_PILL[tone],
                      )}
                    >
                      {r.completedAt ? "Sweep" : "Running"}
                    </span>
                    <span className="ml-auto flex-none whitespace-nowrap font-mono text-[length:var(--pg-t-label)] text-muted-foreground">
                      {formatWhen(r.startedAt)}
                    </span>
                  </div>
                  <div className="mt-1 text-[length:var(--pg-t-body)] font-semibold leading-[1.35]">
                    {r.completedAt
                      ? `${r.passCount}/${r.checkCount} checks passed`
                      : `Sweeping ${r.checkCount || "—"} checks…`}
                  </div>
                  {r.failCount > 0 && (
                    <div className="mt-[3px] text-[length:var(--pg-t-label)] leading-[1.45] text-muted-foreground">
                      {r.failCount} {r.failCount === 1 ? "finding" : "findings"} need a look.
                    </div>
                  )}
                </div>
              </div>
            );
          })}
      </div>
      <div className="flex-none text-[length:var(--pg-t-label)] text-muted-foreground">
        Retained indefinitely.
      </div>
    </div>
  );
}

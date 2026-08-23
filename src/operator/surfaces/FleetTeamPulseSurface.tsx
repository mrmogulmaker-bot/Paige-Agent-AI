import { useMemo } from "react";
import { useTeamPulse } from "@/operator/data/useTeamPulse";

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
 * AND WHY THE RIM WAS NOT PAINTING AT ALL — measured, not inferred. `shadow-[var(--pg-rim)]`
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
 * Fleet Console — Team Pulse (CD's `P.pulse`, `Super Admin Shell.dc.html` 6593-6621, ported
 * structurally in `fleetSpecs.ts`'s `fleet/team-pulse` entry). "Platform seats only — who is
 * carrying the operator work, and who is idle."
 *
 * §30/§58 — same chrome-wraps-engine pattern as Systems Check/History: the pack's title/
 * subtitle/block copy ports verbatim; SEATS and the roster are real (`list_platform_staff()`,
 * §18 — the existing Platform → Team RPC, not re-derived). Utilisation, hours booked, and
 * "where operator time goes" have no backing capability yet — no activity-tracking substrate
 * exists to measure them — so those render as the honest absence the spec already carries,
 * never a guessed percentage (§13).
 */

const ROLE_LABEL: Record<string, string> = { super_admin: "super_admin", platform_admin: "platform_admin" };

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return (parts[0]![0]! + parts[parts.length - 1]![0]!).toUpperCase();
}

export default function FleetTeamPulseSurface() {
  const { seats, loading, error } = useTeamPulse(true);

  const roleCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const s of seats) counts[s.role] = (counts[s.role] ?? 0) + 1;
    return counts;
  }, [seats]);

  const seatsUnit = loading
    ? "—"
    : Object.entries(roleCounts)
        .map(([role, n]) => `${n} ${ROLE_LABEL[role] ?? role}`)
        .join(", ") || "no seats read";

  const kpis = [
    { label: "SEATS", value: loading ? "—" : String(seats.length), unit: seatsUnit },
    // No activity-tracking capability exists yet to measure booked hours, capacity, or sign-in
    // recency — honest absence, never a fabricated figure (§13).
    { label: "BOOKED", value: "—" },
    { label: "AT CAPACITY", value: "—" },
    { label: "NEVER SIGNED IN", value: "—" },
  ];

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3.5">
      {/* ── title row ─────────────────────────────────────────────── */}
      <div className="flex flex-none flex-wrap items-start gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2.5">
            <span className="text-[length:var(--pg-t-label)] font-semibold tracking-[0.15em] text-muted-foreground">FLEET</span>
            <span className="text-[length:var(--pg-t-title)] font-bold tracking-[-0.02em]">Team Pulse</span>
          </div>
          <div className="mt-1.5 text-[length:var(--pg-t-body)] text-muted-foreground">
            Platform seats only — who is carrying the operator work, and who is idle.
          </div>
        </div>
      </div>

      {/* ── KPI strip ─────────────────────────────────────────────── */}
      <div className="grid flex-none grid-cols-2 gap-2.5 lg:grid-cols-4">
        {kpis.map((k) => (
          <div key={k.label} className="min-w-0 rounded-xl border-[1.5px] border-border bg-[var(--pg-raised)] px-3.5 py-3 shadow-[shadow:var(--pg-rim),var(--pg-lift-1)]">
            <div className="truncate text-[length:var(--pg-t-label)] font-semibold tracking-[0.13em] text-muted-foreground">
              {k.label}
            </div>
            <div className="mt-1 whitespace-nowrap text-[length:var(--pg-t-title)] font-bold tabular-nums tracking-[-0.02em]">
              {k.value}
            </div>
            {k.unit && <div className="mt-0.5 truncate text-[length:var(--pg-t-label)] text-muted-foreground">{k.unit}</div>}
          </div>
        ))}
      </div>

      {/* ── who is carrying the work ─────────────────────────────── */}
      <div className="min-h-0 flex-1 overflow-y-auto rounded-[13px] border-[1.5px] border-border bg-[var(--pg-raised)] shadow-[shadow:var(--pg-rim),var(--pg-lift-1)]">
        <div className="border-b border-border px-3.5 py-3">
          <div className="text-[length:var(--pg-t-body)] font-semibold">Who is carrying the work</div>
          <div className="mt-0.5 text-[length:var(--pg-t-label)] text-muted-foreground">Utilisation against a nominal week.</div>
        </div>

        {loading && (
          <div className="space-y-px">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="flex items-center gap-2.5 border-b border-border/60 px-4 py-3">
                <div className="h-8 w-8 flex-none animate-pulse rounded-full bg-[var(--pg-workspace)]" />
                <div className="h-3 w-56 animate-pulse rounded bg-[var(--pg-workspace)]" />
              </div>
            ))}
          </div>
        )}

        {!loading && error && (
          <div className="px-4 py-10 text-center">
            <div className="text-[length:var(--pg-t-body)] font-semibold">The roster could not be read.</div>
            <div className="mx-auto mt-1 max-w-md text-[length:var(--pg-t-label)] text-muted-foreground">{error}</div>
          </div>
        )}

        {!loading && !error && seats.length === 0 && (
          <div className="px-4 py-10 text-center text-[length:var(--pg-t-body)] font-semibold text-muted-foreground">
            No platform seat is being read on this surface yet.
          </div>
        )}

        {!loading &&
          !error &&
          seats.map((s) => {
            const name = s.fullName || s.email;
            return (
              <div
                key={s.userId}
                className="flex min-w-0 items-center gap-2.5 border-b border-border/60 px-4 py-3 last:border-b-0"
              >
                <div className="flex h-8 w-8 flex-none items-center justify-center rounded-full bg-[var(--pg-workspace)] text-[length:var(--pg-t-label)] font-semibold text-muted-foreground">
                  {initials(name)}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[length:var(--pg-t-body)] font-semibold leading-[1.35]">{name}</div>
                  <div className="truncate text-[length:var(--pg-t-label)] text-muted-foreground">{ROLE_LABEL[s.role] ?? s.role}</div>
                </div>
                <span className="ml-auto flex-none whitespace-nowrap rounded-full bg-[var(--pg-workspace)] px-2 py-0.5 text-[length:var(--pg-t-label)] font-semibold text-muted-foreground">
                  no data
                </span>
              </div>
            );
          })}
      </div>

      {/* ── where operator time goes ─────────────────────────────── */}
      <div className="flex-none rounded-[13px] border-[1.5px] border-border bg-[var(--pg-raised)] px-3.5 py-3 shadow-[shadow:var(--pg-rim),var(--pg-lift-1)]">
        <div className="text-[length:var(--pg-t-body)] font-semibold">Where operator time goes</div>
        <div className="mt-0.5 text-[length:var(--pg-t-label)] text-muted-foreground">This week, by area.</div>
        <div className="mt-2.5 space-y-2">
          {["Provisioning and rulings", "Fleet health", "Platform config", "Support triage", "Governance review"].map(
            (label) => (
              <div key={label} className="flex items-center gap-2.5">
                <span className="w-40 flex-none truncate text-[length:var(--pg-t-label)] text-muted-foreground">{label}</span>
                <div className="h-1.5 flex-1 rounded-full bg-[var(--pg-workspace)]" />
                <span className="w-8 flex-none text-right text-[length:var(--pg-t-label)] font-mono text-muted-foreground">—</span>
              </div>
            ),
          )}
        </div>
        <div className="mt-2.5 text-[length:var(--pg-t-label)] text-muted-foreground">
          No time-tracking capability exists yet to measure this — the roster above is real; this
          breakdown is not.
        </div>
      </div>
    </div>
  );
}

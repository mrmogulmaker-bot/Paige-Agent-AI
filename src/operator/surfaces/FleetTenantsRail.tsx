import { useMemo } from "react";

import { useSystemsCheck, type SystemsCheckFinding } from "@/hooks/useSystemsCheck";
import type { FleetTenant } from "@/operator/data/useFleet";
import { cn } from "@/lib/utils";

/**
 * The Fleet Console → Tenants right rail: what needs you, what Paige reads into it, and the
 * directory with the door into each tenant.
 *
 * ── ONE HOME, BECAUSE THE PACK HAS TWO (§18) ───────────────────────────────────────────────
 * Claude Design paints this surface TWICE. `isFleetConsole` (Super Admin Shell.dc.html L348-475)
 * draws the field + KPIs + a 296px rail carrying "Needs you today"; `P.console` (L6658-6687)
 * draws a generic panel with the tenant rows block, the four mini-KPIs and the audit foot. Both
 * `sc-if` blocks are truthy for `tab==="console"` because the panel guard at L6544 does not
 * exclude it, so the pack as authored stacks two Tenants surfaces on one screen.
 *
 * That is a bug in the pack, not a design. This rail is the resolution: ONE surface, with
 * `isFleetConsole`'s geometry and `P.console`'s better-written strings harvested into it — the
 * chip note, "+ Provision a tenant", the four mini-KPIs, "Click one to open it. Entering is a
 * separate, logged act.", and the §53 audit foot, all verbatim.
 *
 * ── WHAT IS REAL HERE, AND WHAT IS HONESTLY ABSENT (§13) ───────────────────────────────────
 * "Needs you today" reads REAL operator findings — `paige_systems_check_finding` at
 * `tenant_id IS NULL`, through the same `systems_check_snapshot` RPC the rail badge already
 * uses (§18: one read, not a second one). Each card's prose is Paige's OWN stored
 * `paige_interpretation` for that check; none of it is written here.
 *
 * The "Her read" panels are TEMPLATED over real values — which is exactly what CD does. Its own
 * `read` is `atRisk.length + " tenants are at risk. " + atRisk[0].name + …`, a sentence frame
 * around live figures, not authored prose. Every number and name below comes from the fleet
 * read; only the frame is fixed. There is no operator-scope narrative endpoint on the platform
 * (all 248 edge functions enumerated; `owner-context.ts` is a system-prompt composer consumed
 * only inside `paige-ai-chat`'s streaming path, not a callable), so the gold CTA hands the
 * question to Paige in the chat — where she actually lives (§20/§21) — rather than inventing a
 * synthesis here.
 */

export type RailTenant = {
  tenant: FleetTenant;
  tier: string;
  health: { label: string; tone: "ok" | "warn" | "risk" };
  beneath: number;
  isInternal: boolean;
};

const SEVERITY_EDGE: Record<string, string> = {
  blocking: "border-l-[hsl(var(--destructive))]",
  high: "border-l-[hsl(var(--destructive))]",
  medium: "border-l-[hsl(var(--warning))]",
  low: "border-l-[hsl(var(--border-strong))]",
};

/** CD renders a coloured initials plate per tenant; derive it rather than store it. */
function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "—";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

/**
 * The read, composed from real figures.
 *
 * Returns null when there is genuinely nothing to say yet — the panel then renders its honest
 * empty state rather than a sentence padded out to look substantial.
 */
function composeFleetRead(rows: readonly RailTenant[], openFindings: number): string | null {
  if (!rows.length) return null;
  const atRisk = rows.filter((r) => r.health.tone === "risk");
  const watch = rows.filter((r) => r.health.tone === "warn");
  const subs = rows.filter((r) => r.beneath > 0);

  const parts: string[] = [];
  if (atRisk.length) {
    const first = atRisk[0];
    parts.push(
      `${atRisk.length} ${atRisk.length === 1 ? "tenant is" : "tenants are"} at risk. ` +
        `${first.tenant.name} is the one I'd open first — ${first.health.label.toLowerCase()}.`,
    );
  } else if (watch.length) {
    parts.push(`Nothing is at risk. ${watch.length} on watch — ${watch[0].tenant.name} has no clients yet.`);
  } else {
    parts.push("Nothing on the fleet is at risk right now.");
  }
  if (subs.length) {
    const top = subs.reduce((a, b) => (b.beneath > a.beneath ? b : a));
    parts.push(`${top.tenant.name} carries the most beneath it, at ${top.beneath}.`);
  }
  if (openFindings > 0) {
    parts.push(`${openFindings} platform ${openFindings === 1 ? "check is" : "checks are"} still open.`);
  }
  return parts.join(" ");
}

function RailCard({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={cn("flex-none rounded-[13px] border-[1.5px] border-border bg-card shadow-sm", className)}>
      {children}
    </div>
  );
}

function HerRead({
  body,
  onTakeToWorkspace,
}: {
  body: string | null;
  onTakeToWorkspace: () => void;
}) {
  return (
    <RailCard className="px-3.5 py-3">
      <div className="text-[11px] font-semibold tracking-[0.04em] text-[hsl(var(--primary))]">Her read</div>
      {body ? (
        <p className="mt-1.5 text-[11.5px] leading-relaxed text-muted-foreground">{body}</p>
      ) : (
        <p className="mt-1.5 text-[11.5px] leading-relaxed text-muted-foreground">
          Nothing to read yet — no tenants are in view.
        </p>
      )}
      <button
        type="button"
        onClick={onTakeToWorkspace}
        className="mt-2.5 rounded-lg px-0 text-[11.5px] font-semibold text-[hsl(var(--gold-dark))] underline-offset-2 transition-colors hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        Take it to the workspace →
      </button>
    </RailCard>
  );
}

export function FleetTenantsRail({
  rows,
  subCount,
  atRiskCount,
  loading,
  onOpenTenant,
  onProvision,
  onAskPaige,
  onOpenCheck,
}: {
  rows: readonly RailTenant[];
  subCount: number;
  atRiskCount: number;
  loading: boolean;
  onOpenTenant: (id: string) => void;
  onProvision: () => void;
  onAskPaige: () => void;
  onOpenCheck: () => void;
}) {
  // The SAME operator read the chrome's rail badge uses — one home, not a second query (§18).
  const { findings, loading: checkLoading } = useSystemsCheck("operator");

  /** Open work = a failing check nobody has resolved. Skips are NOT failures (§13). */
  const attention: SystemsCheckFinding[] = useMemo(
    () =>
      findings
        .filter((f) => f.status === "fail" && !f.resolved_at)
        .sort((a, b) => (a.priority ?? 999) - (b.priority ?? 999))
        .slice(0, 3),
    [findings],
  );

  const unresolvedCount = useMemo(
    () => findings.filter((f) => f.status === "fail" && !f.resolved_at).length,
    [findings],
  );

  const read = useMemo(() => composeFleetRead(rows, unresolvedCount), [rows, unresolvedCount]);

  return (
    <aside className="hidden w-[312px] flex-none flex-col gap-2.5 overflow-y-auto xl:flex">
      {/* ── Needs you today (CD flAttnTitle) ──────────────────────────────── */}
      <RailCard className="px-3.5 py-3">
        <div className="text-[13.5px] font-semibold">Needs you today</div>
        <div className="mt-2.5 flex flex-col gap-2">
          {checkLoading && <div className="h-16 animate-pulse rounded-[10px] bg-muted" />}

          {!checkLoading && attention.length === 0 && (
            <p className="text-[11.5px] leading-relaxed text-muted-foreground">
              Nothing is failing on the platform right now. Findings from the hourly sweep appear here.
            </p>
          )}

          {!checkLoading &&
            attention.map((f) => (
              <div
                key={f.id}
                className={cn(
                  "rounded-[10px] border border-l-[3px] border-border bg-muted/40 px-3 py-2.5",
                  SEVERITY_EDGE[f.severity_at_finding ?? "low"] ?? SEVERITY_EDGE.low,
                )}
              >
                <div className="text-[11.5px] font-semibold leading-snug">{f.check_name ?? f.check_id}</div>
                {/* Paige's OWN stored interpretation — not prose written in this file (§13). */}
                {f.paige_interpretation && (
                  <p className="mt-1 text-[11.5px] leading-relaxed text-muted-foreground">
                    {f.paige_interpretation}
                  </p>
                )}
                <button
                  type="button"
                  onClick={onOpenCheck}
                  className="mt-2 rounded-lg bg-cd-gold px-2.5 py-1 text-[11px] font-semibold text-[hsl(var(--accent-foreground))] transition-[filter] hover:brightness-[1.06] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  Open the check
                </button>
              </div>
            ))}
        </div>
      </RailCard>

      <HerRead body={read} onTakeToWorkspace={onAskPaige} />

      {/* ── Tenants directory (CD P.console) ──────────────────────────────── */}
      <RailCard className="overflow-hidden">
        <div className="border-b border-border px-3.5 py-3">
          <div className="flex items-center gap-2">
            <span className="text-[9px] font-semibold tracking-[0.15em] text-muted-foreground">FLEET</span>
            <span className="text-[13.5px] font-semibold">Tenants</span>
            <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-semibold text-muted-foreground">
              {loading ? "—" : `${rows.length} tenants`}
            </span>
          </div>
          {/* CD chipNote, verbatim. */}
          <div className="mt-1 text-[11px] text-muted-foreground">
            {loading ? "—" : `${subCount} sub-accounts beneath them.`}
          </div>
          <button
            type="button"
            onClick={onProvision}
            className="mt-2.5 rounded-lg border border-[hsl(var(--gold-dark)/0.4)] px-2.5 py-1 text-[11.5px] font-semibold text-[hsl(var(--gold-dark))] transition-colors hover:bg-[hsl(var(--accent)/0.1)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            + Provision a tenant
          </button>
        </div>

        {/* CD's four mini-KPIs. MRR and PROVISIONING have no live read — honest "—" (§13). */}
        <div className="grid grid-cols-2 gap-px border-b border-border bg-border">
          {[
            { label: "TENANTS", value: loading ? "—" : String(rows.length) },
            { label: "MRR", value: "—" },
            { label: "AT RISK", value: loading ? "—" : String(atRiskCount) },
            { label: "PROVISIONING", value: "—" },
          ].map((k) => (
            <div key={k.label} className="bg-card px-3 py-2">
              <div className="truncate text-[8.5px] font-semibold tracking-[0.12em] text-muted-foreground">
                {k.label}
              </div>
              <div className="mt-0.5 text-[15px] font-bold tabular-nums tracking-[-0.02em]">{k.value}</div>
            </div>
          ))}
        </div>

        {/* CD's rows() descriptor, verbatim. */}
        <div className="px-3.5 py-2 text-[11px] text-muted-foreground">
          Click one to open it. Entering is a separate, logged act.
        </div>

        <div className="max-h-[320px] overflow-y-auto">
          {loading &&
            Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="flex items-center gap-2 border-t border-border/60 px-3.5 py-2">
                <div className="h-6 w-6 flex-none animate-pulse rounded-[8px] bg-muted" />
                <div className="h-3 w-32 animate-pulse rounded bg-muted" />
              </div>
            ))}

          {!loading && rows.length === 0 && (
            <div className="px-3.5 py-6 text-center text-[11.5px] text-muted-foreground">
              Nothing matches that.
            </div>
          )}

          {!loading &&
            rows.map((r) => (
              <div
                key={r.tenant.id}
                className="flex min-w-0 items-center gap-2 border-t border-border/60 px-3.5 py-2 transition-colors hover:bg-muted/40"
              >
                <span className="grid h-6 w-6 flex-none place-items-center rounded-[8px] bg-muted text-[9px] font-bold text-foreground/70">
                  {initials(r.tenant.name)}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[11.5px] font-semibold">{r.tenant.name}</div>
                  <div className="truncate text-[10px] text-muted-foreground">
                    {r.tier}
                    {r.beneath ? ` · ${r.beneath} beneath` : ""} · {r.health.label.toLowerCase()}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => onOpenTenant(r.tenant.id)}
                  className="flex-none rounded-lg border border-border bg-card px-2 py-1 text-[10.5px] font-semibold text-[hsl(var(--gold-dark))] transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  Enter
                </button>
              </div>
            ))}
        </div>

        {/* §53 — load-bearing, not decoration. CD's foot, verbatim. */}
        <div className="border-t border-border bg-muted/30 px-3.5 py-2.5 text-[10.5px] leading-relaxed text-muted-foreground">
          Entering a tenant puts you in their shell with their data. Every session is recorded in
          Governance.
        </div>
      </RailCard>

      <HerRead body={read} onTakeToWorkspace={onAskPaige} />
    </aside>
  );
}

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
 * The "Her read" panel is TEMPLATED over real values — which is exactly what CD does. Its own
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
export function composeFleetRead(rows: readonly RailTenant[], openFindings: number): string | null {
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
    <div className={cn("flex-none rounded-[13px] border-[1.5px] border-border bg-[var(--pg-surface)] shadow-[var(--pg-rim)]", className)}>
      {children}
    </div>
  );
}

/**
 * RULING E (Claude Design, 2026-08-23) — PAIGE IS NOT A DESTINATION.
 * "She's the spine. A reference to her is not a route, it's an action that opens the spine and
 * focuses the command bar… The pack has no address for her because there isn't one."
 *
 * The "Take it to the workspace →" control that used to sit under this read navigated to
 * `/operator/paige`, which is not a slot: `operatorAddress.ts` resolved it `{kind:"unknown"}` and
 * the shell rendered its 404. CD ruled it REMOVED rather than repointed — "a control that opens
 * an empty spine asserts a capability that isn't there", the same reasoning that collapses the
 * empty spine to 0 (Ruling C), applied to the control instead of the track.
 *
 * WHEN PAIGE IS WIRED INTO THE SPINE this comes back as a CONTROL that expands the spine and
 * focuses the command bar — NEVER as a URL. Do not "restore" it as a route: a later session
 * reaching for `/operator/paige` is the signal she has been modelled as a place again.
 */
function HerRead({ body }: { body: string | null }) {
  return (
    <RailCard className="px-3.5 py-3">
      <div className="text-[length:var(--pg-t-label)] font-semibold tracking-[0.04em] text-[hsl(var(--primary))]">Her read</div>
      {body ? (
        <p className="mt-1.5 text-[length:var(--pg-t-label)] leading-relaxed text-muted-foreground">{body}</p>
      ) : (
        <p className="mt-1.5 text-[length:var(--pg-t-label)] leading-relaxed text-muted-foreground">
          Nothing to read yet — no tenants are in view.
        </p>
      )}
    </RailCard>
  );
}

export function FleetTenantsRail({
  rows,
  filtered,
  loading,
  onOpenTenant,
  onEnterTenant,
  onProvision,
  onOpenCheck,
}: {
  rows: readonly RailTenant[];
  /** True when a search or tier chip is narrowing `rows` — the rail then speaks only for the view. */
  filtered: boolean;
  loading: boolean;
  /** Select a tenant in the console — a read, nothing switches. */
  onOpenTenant: (id: string) => void;
  /**
   * ACT AS the tenant: switch platform scope into their shell, audited. CD's own descriptor
   * separates these two — "Click one to open it. Entering is a separate, logged act." — so
   * selecting and entering are deliberately different affordances, not the same click twice.
   */
  onEnterTenant: (id: string) => void;
  onProvision: () => void;
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

  /**
   * Every figure in this rail is derived from the rows the rail is SHOWING.
   *
   * §39 peer-gate: these two counts used to arrive as props computed over the whole fleet while the
   * list, the chip and the read were computed over the filtered rows. Filter to "At risk" and the
   * rail said "3 tenants · 7 sub-accounts beneath them" above a list of three tenants with no
   * sub-accounts in sight — three different scopes in one card, each individually true and the
   * card as a whole false. The fleet-wide totals still live in the header KPI strip, which is where
   * a fleet-wide number belongs; a panel describes what is in it.
   */
  // SUM the children, don't COUNT the parents. `filter(r => r.beneath > 0).length` answers "how
  // many tenants HAVE sub-accounts" while the label says "n sub-accounts beneath them" — so one
  // agency with six children rendered "1 sub-accounts beneath them." directly under a header KPI
  // reading "6 sub-accounts beneath", with no filter applied. Two numbers, one wording, one screen.
  const subCount = useMemo(() => rows.reduce((a, r) => a + r.beneath, 0), [rows]);
  const atRiskCount = useMemo(() => rows.filter((r) => r.health.tone === "risk").length, [rows]);

  /**
   * At-risk tenants, kept in "Needs you today" (§58).
   *
   * The rail that shipped before this one filled "Needs you today" with at-risk TENANTS — each a
   * one-click door into that tenant. Replacing the card's feed with operator systems-check findings
   * would have quietly deleted that: an owner-approved, shipped capability disappearing inside a
   * PR nominally about porting the pack. So the card carries BOTH, which is also the more honest
   * reading of its own label — a failing platform check and a tenant with nobody in it are both
   * things that need the operator today, and neither is a subset of the other.
   */
  const atRiskRows = useMemo(() => rows.filter((r) => r.health.tone === "risk").slice(0, 4), [rows]);
  /**
   * Whether the all-clear may be spoken at all. `atRiskRows` is empty in three very different
   * situations and only ONE of them is good news: nothing is wrong, the fleet has not loaded, or a
   * filter is hiding everything. The card used to treat all three as "all clear" and print a
   * platform-wide reassurance under a directory saying "Nothing matches that."
   */
  const speakingForWholeFleet = rows.length > 0 && !filtered;

  const read = useMemo(() => composeFleetRead(rows, unresolvedCount), [rows, unresolvedCount]);

  return (
    // `min-h-0` is what makes `overflow-y-auto` actually bite. Without it a flex item's min-height
    // is `auto` (its content), so the rail refused to shrink, stretched the row, and scrolled the
    // whole pane instead of itself.
    <aside className="hidden w-[312px] min-h-0 flex-none flex-col gap-2.5 overflow-y-auto xl:flex">
      {/* ── Needs you today (CD flAttnTitle) ──────────────────────────────── */}
      <RailCard className="px-3.5 py-3">
        <div className="text-[length:var(--pg-t-body)] font-semibold">Needs you today</div>
        <div className="mt-2.5 flex flex-col gap-2">
          {(checkLoading || loading) && <div className="h-16 animate-pulse rounded-[10px] bg-[var(--pg-workspace)]" />}

          {/* Both feeds must have ANSWERED before this claims all-clear. Gating on `checkLoading`
              alone asserted "every tenant has members and at least one client" while the fleet read
              was still in flight and `atRiskRows` was empty only because nothing had arrived yet —
              a reassurance printed about data we had not seen (§13). */}
          {!checkLoading && !loading && attention.length === 0 && atRiskRows.length === 0 && (
            <p className="text-[length:var(--pg-t-label)] leading-relaxed text-muted-foreground">
              {/* Say only what was actually observed. "every tenant has at least one client" was
                  false by construction: health() grades a client-less tenant `warn`, which never
                  reaches atRiskRows, so the card asserted the one thing its own filter excluded.
                  And a filtered view speaks for what is in view, never for the platform. */}
              {speakingForWholeFleet
                ? "Nothing is failing on the platform, and no tenant is at risk. Findings from the hourly sweep appear here."
                : "Nothing is failing on the platform, and nothing in view is at risk. Findings from the hourly sweep appear here."}
            </p>
          )}

          {!checkLoading &&
            attention.map((f) => (
              <div
                key={f.id}
                className={cn(
                  "rounded-[10px] border border-l-[3px] border-border bg-[color-mix(in_srgb,var(--pg-workspace)_40%,transparent)] px-3 py-2.5",
                  SEVERITY_EDGE[f.severity_at_finding ?? "low"] ?? SEVERITY_EDGE.low,
                )}
              >
                <div className="text-[length:var(--pg-t-label)] font-semibold leading-snug">{f.check_name ?? f.check_id}</div>
                {/* Paige's OWN stored interpretation — not prose written in this file (§13). */}
                {f.paige_interpretation && (
                  <p className="mt-1 text-[length:var(--pg-t-label)] leading-relaxed text-muted-foreground">
                    {f.paige_interpretation}
                  </p>
                )}
                <button
                  type="button"
                  onClick={onOpenCheck}
                  className="mt-2 rounded-lg bg-cd-gold px-2.5 py-1 text-[length:var(--pg-t-label)] font-semibold text-[hsl(var(--accent-foreground))] transition-[filter] hover:brightness-[1.06] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  Open the check
                </button>
              </div>
            ))}

          {atRiskRows.map((r) => (
            <button
              key={r.tenant.id}
              type="button"
              onClick={() => onOpenTenant(r.tenant.id)}
              className="rounded-[10px] border border-l-[3px] border-border border-l-[hsl(var(--warning))] bg-[color-mix(in_srgb,var(--pg-workspace)_40%,transparent)] px-3 py-2.5 text-left transition-colors hover:bg-[var(--pg-workspace)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring active:shadow-[var(--pg-inset)]"
            >
              <div className="text-[length:var(--pg-t-label)] leading-relaxed">
                <span className="font-semibold">{r.tenant.name}</span> —{" "}
                {r.health.label.toLowerCase()}.
              </div>
            </button>
          ))}
        </div>
      </RailCard>

      <HerRead body={read} />

      {/* ── Tenants directory (CD P.console) ──────────────────────────────── */}
      <RailCard className="overflow-hidden">
        <div className="border-b border-border px-3.5 py-3">
          <div className="flex items-center gap-2">
            <span className="text-[length:var(--pg-t-label)] font-semibold tracking-[0.15em] text-muted-foreground">FLEET</span>
            <span className="text-[length:var(--pg-t-body)] font-semibold">Tenants</span>
            <span className="rounded-full bg-[var(--pg-workspace)] px-2 py-0.5 text-[length:var(--pg-t-label)] font-semibold text-muted-foreground">
              {loading ? "—" : `${rows.length} tenants`}
            </span>
          </div>
          {/* CD chipNote, verbatim. */}
          <div className="mt-1 text-[length:var(--pg-t-label)] text-muted-foreground">
            {loading ? "—" : `${subCount} sub-accounts beneath them.`}
          </div>
          <button
            type="button"
            onClick={onProvision}
            className="mt-2.5 rounded-lg border border-border bg-[var(--pg-surface)] px-2.5 py-1 text-[length:var(--pg-t-label)] font-semibold transition-colors hover:bg-[var(--pg-workspace)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring active:shadow-[var(--pg-inset)]"
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
            <div key={k.label} className="bg-[var(--pg-surface)] px-3 py-2">
              <div className="truncate text-[length:var(--pg-t-label)] font-semibold tracking-[0.12em] text-muted-foreground">
                {k.label}
              </div>
              <div className="mt-0.5 text-[length:var(--pg-t-lead)] font-bold tabular-nums tracking-[-0.02em]">{k.value}</div>
            </div>
          ))}
        </div>

        {/* CD's rows() descriptor, verbatim. */}
        <div className="px-3.5 py-2 text-[length:var(--pg-t-label)] text-muted-foreground">
          Click one to open it. Entering is a separate, logged act.
        </div>

        <div className="max-h-[320px] overflow-y-auto">
          {loading &&
            Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="flex items-center gap-2 border-t border-border/60 px-3.5 py-2">
                <div className="h-6 w-6 flex-none animate-pulse rounded-[8px] bg-[var(--pg-workspace)]" />
                <div className="h-3 w-32 animate-pulse rounded bg-[var(--pg-workspace)]" />
              </div>
            ))}

          {!loading && rows.length === 0 && (
            <div className="px-3.5 py-6 text-center text-[length:var(--pg-t-label)] text-muted-foreground">
              Nothing matches that.
            </div>
          )}

          {!loading &&
            rows.map((r) => (
              <div
                key={r.tenant.id}
                className="flex min-w-0 items-center gap-2 border-t border-border/60 px-3.5 py-2 transition-colors hover:bg-[color-mix(in_srgb,var(--pg-workspace)_40%,transparent)]"
              >
                {/* The row body SELECTS — CD's "click one to open it". */}
                <button
                  type="button"
                  onClick={() => onOpenTenant(r.tenant.id)}
                  className="flex min-w-0 flex-1 items-center gap-2 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <span className="grid h-6 w-6 flex-none place-items-center rounded-[8px] bg-[var(--pg-workspace)] text-[length:var(--pg-t-label)] font-bold text-foreground/70">
                    {initials(r.tenant.name)}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[length:var(--pg-t-label)] font-semibold">{r.tenant.name}</div>
                    <div className="truncate text-[length:var(--pg-t-label)] text-muted-foreground">
                      {r.tier}
                      {r.beneath ? ` · ${r.beneath} beneath` : ""} · {r.health.label.toLowerCase()}
                    </div>
                  </div>
                </button>
                {/* Enter is the LOGGED ACT — scope actually switches and a row lands in the audit. */}
                <button
                  type="button"
                  onClick={() => onEnterTenant(r.tenant.id)}
                  className="flex-none rounded-lg border border-border bg-[var(--pg-surface)] px-2 py-1 text-[length:var(--pg-t-label)] font-semibold transition-colors hover:bg-[var(--pg-workspace)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring active:shadow-[var(--pg-inset)]"
                >
                  Enter
                </button>
              </div>
            ))}
        </div>

        {/* §53 — load-bearing, not decoration. CD's foot, verbatim. */}
        <div className="border-t border-border bg-[color-mix(in_srgb,var(--pg-workspace)_30%,transparent)] px-3.5 py-2.5 text-[length:var(--pg-t-label)] leading-relaxed text-muted-foreground">
          Entering a tenant puts you in their shell with their data. Every session is recorded in
          Governance.
        </div>
      </RailCard>

    </aside>
  );
}

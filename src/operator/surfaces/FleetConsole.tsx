import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useFleet, isInternal, type FleetTenant } from "@/operator/data/useFleet";
import { cn } from "@/lib/utils";

/**
 * Fleet Console — Claude Design's surface, on the real fleet.
 *
 * Ported from the CD pack's `isFleetConsole` block: the FLEET eyebrow + title row with its
 * view toggle and gold primary CTA, the KPI strip, the filter-chip + search row, the tenant
 * table (initials plate · name/owner · tier pill · figures · health dot · Enter), and the
 * 296px right rail carrying "needs attention" and Paige's read.
 *
 * §13 — WHAT IT SHOWS IS WHAT THE PLATFORM KNOWS. The pack ships mock rows with dollar MRR on
 * every tenant. We do not. The §57 anchor case was exactly that: a Fleet surface showing
 * $397/$149 against tenants with no paid subscription. So the money column renders the
 * revenue CLASS the platform actually records, and anything unsubstantiated is "—". Counts,
 * status and trial dates are real columns from real tables.
 */

const CLASS_LABEL: Record<string, string> = {
  paid: "Paid",
  promotional: "Promotional",
  internal_test: "Internal",
};

/** CD renders a coloured initials plate per tenant; derive it rather than store it. */
function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "—";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

/**
 * Health is DERIVED from facts on the row — an active tenant with people and clients is
 * healthy, one with nobody in it is not. It is deliberately NOT a score we invent: every
 * input is a real column, and a tenant we cannot judge reads "unknown" rather than green.
 */
function health(t: FleetTenant): { label: string; tone: "ok" | "warn" | "risk" | "unknown" } {
  if (t.status && t.status !== "active") return { label: t.status, tone: "risk" };
  if (t.seats === 0) return { label: "No members", tone: "risk" };
  if (t.customers === 0) return { label: "No clients yet", tone: "warn" };
  return { label: "Active", tone: "ok" };
}

const TONE_DOT: Record<string, string> = {
  ok: "bg-[hsl(var(--success))]",
  warn: "bg-[hsl(var(--warning))]",
  risk: "bg-[hsl(var(--destructive))]",
  unknown: "bg-muted-foreground/40",
};

type Filter = "all" | "agency" | "attention" | "trial";

/**
 * The fleet is ordered by TOPOLOGY, not by creation date: each top-level tenant, then its own
 * sub-accounts directly beneath it. That is how the platform actually is (§51) and how the
 * operator thinks about it — an agency is not a peer of the accounts it owns, and a
 * sub-account read out of context next to unrelated tenants is exactly the seam confusion §51
 * exists to end. A child whose parent is filtered out still appears, at top level, so a search
 * can never silently swallow a tenant.
 */
function byTopology(rows: readonly FleetTenant[]): FleetTenant[] {
  const present = new Set(rows.map((t) => t.id));
  const roots = rows.filter((t) => !t.parentTenantId || !present.has(t.parentTenantId));
  const childrenOf = new Map<string, FleetTenant[]>();
  rows.forEach((t) => {
    if (!t.parentTenantId || !present.has(t.parentTenantId)) return;
    const kids = childrenOf.get(t.parentTenantId) ?? [];
    kids.push(t);
    childrenOf.set(t.parentTenantId, kids);
  });
  return roots.flatMap((r) => [r, ...(childrenOf.get(r.id) ?? [])]);
}

/** Manager tiers, per §51. Never a substring of the plan name — that is a label, not the tier. */
function isAgency(t: FleetTenant): boolean {
  return t.accountType === "agency" || t.accountType === "enterprise";
}

export default function FleetConsole({ canSeeRevenue }: { canSeeRevenue: boolean }) {
  const navigate = useNavigate();
  const { tenants, loading, error } = useFleet(true);
  const [filter, setFilter] = useState<Filter>("all");
  const [q, setQ] = useState("");
  /**
   * Platform fixtures and test accounts are hidden by default and revealed by a chip — never
   * dropped. Hiding them keeps the console reporting the real fleet; keeping the chip means no
   * shipped row is silently removed and the operator can always see everything (§58).
   */
  const [showInternal, setShowInternal] = useState(false);

  /** The fleet as the platform actually runs it: customers, not our own fixtures. */
  const fleet = useMemo(
    () => (showInternal ? tenants : tenants.filter((t) => !isInternal(t))),
    [tenants, showInternal],
  );
  const internalCount = useMemo(() => tenants.filter(isInternal).length, [tenants]);

  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return byTopology(
      fleet.filter((t) => {
        if (needle && !`${t.name} ${t.slug ?? ""}`.toLowerCase().includes(needle)) return false;
        if (filter === "attention") return health(t).tone !== "ok";
        if (filter === "trial") return !!t.trialEndsAt;
        if (filter === "agency") return isAgency(t);
        return true;
      }),
    );
  }, [fleet, filter, q]);

  /** Which tenants are actually on screen — decides whether a child may be drawn as nested. */
  const rowIds = useMemo(() => new Set(rows.map((t) => t.id)), [rows]);

  // Every KPI is a count of real rows. Nothing here is a projection or an estimate.
  const kpis = useMemo(() => {
    const attention = fleet.filter((t) => health(t).tone !== "ok").length;
    const paid = fleet.filter((t) => t.revenueClass === "paid").length;
    const people = fleet.reduce((n, t) => n + t.seats, 0);
    const clients = fleet.reduce((n, t) => n + t.customers, 0);
    return [
      { label: "TENANTS", value: String(fleet.length), unit: "on the platform" },
      { label: "NEEDS ATTENTION", value: String(attention), unit: attention === 1 ? "tenant" : "tenants" },
      ...(canSeeRevenue
        ? [{ label: "PAID", value: String(paid), unit: `of ${fleet.length}` }]
        : []),
      { label: "PEOPLE", value: String(people), unit: `${clients} clients` },
    ];
  }, [fleet, canSeeRevenue]);

  const attention = useMemo(
    () => fleet.filter((t) => health(t).tone !== "ok").slice(0, 4),
    [fleet],
  );

  const FILTERS: ReadonlyArray<{ key: Filter; label: string }> = [
    { key: "all", label: `All (${fleet.length})` },
    { key: "attention", label: "Needs attention" },
    { key: "trial", label: "On trial" },
    { key: "agency", label: "Agencies" },
  ];

  return (
    <div className="flex min-h-0 flex-1 gap-3">
      <div className="flex min-w-0 flex-1 flex-col gap-3">
        {/* ── title row ─────────────────────────────────────────────── */}
        <div className="flex flex-none flex-wrap items-start gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2.5">
              <span className="text-[9.5px] font-semibold tracking-[0.15em] text-muted-foreground">
                FLEET
              </span>
              <span className="text-[21px] font-bold tracking-[-0.02em]">Fleet Console</span>
            </div>
            <div className="mt-1.5 text-[12.5px] text-muted-foreground">
              {loading
                ? "Reading the fleet…"
                : error
                  ? "The fleet could not be read."
                  : `${tenants.length} ${tenants.length === 1 ? "tenant" : "tenants"} on the platform.`}
            </div>
          </div>
          <div className="ml-auto flex min-w-0 flex-none items-center gap-2.5">
            <button
              type="button"
              onClick={() => navigate("/operator/provisioning")}
              className="whitespace-nowrap rounded-[9px] bg-cd-gold px-3.5 py-2 text-[12.5px] font-semibold text-[hsl(var(--accent-foreground))] transition-[filter] hover:brightness-[1.06] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              Provision a tenant
            </button>
          </div>
        </div>

        {/* ── KPI strip ─────────────────────────────────────────────── */}
        <div className="grid flex-none grid-cols-2 gap-2.5 lg:grid-cols-4">
          {kpis.map((k) => (
            <div
              key={k.label}
              className="min-w-0 rounded-xl border-[1.5px] border-border bg-card px-3.5 py-3 shadow-sm"
            >
              <div className="truncate text-[9px] font-semibold tracking-[0.13em] text-muted-foreground">
                {k.label}
              </div>
              <div className="mt-1 flex min-w-0 items-baseline gap-2">
                <span className="whitespace-nowrap text-[24px] font-bold tabular-nums tracking-[-0.02em]">
                  {loading ? "—" : k.value}
                </span>
                <span className="truncate text-[10.5px] text-muted-foreground">{k.unit}</span>
              </div>
            </div>
          ))}
        </div>

        {/* ── filters + search ──────────────────────────────────────── */}
        <div className="flex flex-none flex-wrap items-center gap-2">
          {FILTERS.map((f) => {
            const on = filter === f.key;
            return (
              <button
                key={f.key}
                type="button"
                onClick={() => setFilter(f.key)}
                aria-pressed={on}
                className={cn(
                  "whitespace-nowrap rounded-full border px-3 py-1.5 text-[11.5px] font-medium transition-colors",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  on
                    ? "border-border-strong bg-muted text-foreground"
                    : "border-border bg-card text-muted-foreground hover:text-foreground",
                )}
              >
                {f.label}
              </button>
            );
          })}
          {internalCount > 0 && (
            /* The escape hatch for the rows above: our own fixtures and test accounts are out
               of the fleet count by default, and one click puts them back (§58). */
            <button
              type="button"
              onClick={() => setShowInternal((v) => !v)}
              aria-pressed={showInternal}
              className={cn(
                "whitespace-nowrap rounded-full border px-3 py-1.5 text-[11.5px] font-medium transition-colors",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                showInternal
                  ? "border-border-strong bg-muted text-foreground"
                  : "border-dashed border-border bg-card text-muted-foreground hover:text-foreground",
              )}
              title="Platform fixtures and test accounts. Hidden from the fleet count so the console reports real tenants."
            >
              {showInternal ? "Hide" : "Show"} internal ({internalCount})
            </button>
          )}
          <div className="ml-auto flex min-w-0 flex-none items-center gap-2 rounded-full border border-border bg-card px-3 py-1.5">
            <span aria-hidden className="flex-none text-[11px] text-muted-foreground">⌕</span>
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search tenants"
              aria-label="Search tenants"
              className="w-36 bg-transparent text-[11.5px] outline-none placeholder:text-muted-foreground"
            />
          </div>
        </div>

        {/* ── the fleet ─────────────────────────────────────────────── */}
        <div className="min-h-0 flex-1 overflow-y-auto rounded-[13px] border-[1.5px] border-border bg-card shadow-sm">
          <div className="sticky top-0 z-[2] flex items-center gap-2.5 border-b border-border bg-muted/40 px-3.5 py-2">
            <div className="min-w-0 flex-[2.1] text-[9px] font-semibold tracking-[0.12em] text-muted-foreground">
              TENANT
            </div>
            <div className="min-w-0 flex-[0.9] text-[9px] font-semibold tracking-[0.12em] text-muted-foreground">
              PLAN
            </div>
            {canSeeRevenue && (
              <div className="min-w-0 flex-[0.9] text-right text-[9px] font-semibold tracking-[0.12em] text-muted-foreground">
                REVENUE
              </div>
            )}
            <div className="min-w-0 flex-[0.7] text-right text-[9px] font-semibold tracking-[0.12em] text-muted-foreground">
              PEOPLE
            </div>
            <div className="min-w-0 flex-[0.7] text-right text-[9px] font-semibold tracking-[0.12em] text-muted-foreground">
              CLIENTS
            </div>
            <div className="min-w-0 flex-1 text-right text-[9px] font-semibold tracking-[0.12em] text-muted-foreground">
              HEALTH
            </div>
            <div className="w-[76px] flex-none" />
          </div>

          {loading && (
            <div className="space-y-px">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="flex items-center gap-2.5 border-b border-border/60 px-3.5 py-2.5">
                  <div className="h-7 w-7 flex-none animate-pulse rounded-[9px] bg-muted" />
                  <div className="h-3 w-40 animate-pulse rounded bg-muted" />
                </div>
              ))}
            </div>
          )}

          {!loading && error && (
            <div className="px-4 py-10 text-center">
              <div className="text-[13px] font-semibold">The fleet could not be read.</div>
              <div className="mx-auto mt-1 max-w-md text-[11.5px] text-muted-foreground">{error}</div>
            </div>
          )}

          {!loading && !error && rows.length === 0 && (
            <div className="px-4 py-10 text-center">
              <div className="text-[13px] font-semibold">
                {tenants.length === 0 ? "No tenants yet." : "Nothing matches that."}
              </div>
              <div className="mx-auto mt-1 max-w-md text-[11.5px] text-muted-foreground">
                {tenants.length === 0
                  ? "Provisioned tenants appear here as soon as they exist."
                  : "Clear the filter or search to see the whole fleet."}
              </div>
            </div>
          )}

          {!loading &&
            !error &&
            rows.map((t) => {
              const h = health(t);
              // A row sits under its parent only when that parent is actually on screen —
              // otherwise the indent would imply a hierarchy the operator cannot see.
              const nested = !!t.parentTenantId && rowIds.has(t.parentTenantId);
              return (
                <div
                  key={t.id}
                  className="flex min-w-0 items-center gap-2.5 border-b border-border/60 px-3.5 py-2.5 transition-colors last:border-b-0 hover:bg-muted/40"
                >
                  <div className="flex min-w-0 flex-[2.1] items-center gap-2.5">
                    {nested && (
                      /* CD's ownership tick: a hairline elbow, so a sub-account reads as
                         BELONGING to the agency above it rather than sitting beside it (§51). */
                      <span
                        aria-hidden
                        className="ml-1 h-4 w-3 flex-none rounded-bl-[4px] border-b border-l border-border"
                      />
                    )}
                    <span className="grid h-7 w-7 flex-none place-items-center rounded-[9px] bg-muted text-[10px] font-bold text-foreground/70">
                      {initials(t.name)}
                    </span>
                    <div className="min-w-0">
                      <div className="flex min-w-0 items-center gap-1.5">
                        <span className="truncate text-[12.5px] font-semibold">{t.name}</span>
                        {isInternal(t) && (
                          <span className="flex-none whitespace-nowrap rounded-full border border-dashed border-border px-1.5 py-px text-[9.5px] font-semibold uppercase tracking-wide text-muted-foreground">
                            Internal
                          </span>
                        )}
                      </div>
                      <div className="mt-0.5 truncate font-mono text-[10.5px] text-muted-foreground">
                        {t.slug ?? "—"}
                        {nested ? " · sub-account" : isAgency(t) ? " · agency" : ""}
                      </div>
                    </div>
                  </div>
                  <div className="min-w-0 flex-[0.9]">
                    <span className="whitespace-nowrap rounded-full bg-muted px-2 py-0.5 text-[10px] font-semibold text-muted-foreground">
                      {t.planOffer ?? "—"}
                    </span>
                  </div>
                  {canSeeRevenue && (
                    <div className="min-w-0 flex-[0.9] whitespace-nowrap text-right text-[11.5px]">
                      {t.revenueClass ? (
                        <span
                          className={cn(
                            t.revenueClass === "paid"
                              ? "font-semibold text-foreground"
                              : "text-muted-foreground",
                          )}
                        >
                          {CLASS_LABEL[t.revenueClass] ?? t.revenueClass}
                        </span>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </div>
                  )}
                  <div className="min-w-0 flex-[0.7] text-right font-mono text-[11.5px] tabular-nums">
                    {t.seats}
                  </div>
                  <div className="min-w-0 flex-[0.7] text-right font-mono text-[11.5px] tabular-nums">
                    {t.customers}
                  </div>
                  <div className="flex min-w-0 flex-1 items-center justify-end gap-2">
                    <span aria-hidden className={cn("h-[7px] w-[7px] flex-none rounded-full", TONE_DOT[h.tone])} />
                    <span className="whitespace-nowrap text-[11px] text-muted-foreground">{h.label}</span>
                  </div>
                  <div className="w-[76px] flex-none text-right">
                    <button
                      type="button"
                      onClick={() => navigate(`/operator/fleet/tenants?tenant=${t.id}`)}
                      className="rounded-lg border border-border bg-card px-2.5 py-1 text-[11px] font-semibold transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      Open
                    </button>
                  </div>
                </div>
              );
            })}
        </div>
      </div>

      {/* ── right rail ───────────────────────────────────────────────── */}
      <aside className="hidden w-[296px] flex-none flex-col gap-2.5 overflow-y-auto xl:flex">
        <div className="flex-none rounded-[13px] border-[1.5px] border-border bg-card px-3.5 py-3 shadow-sm">
          <div className="text-[13.5px] font-semibold">Needs attention</div>
          <div className="mt-2.5 flex flex-col gap-2">
            {loading && <div className="h-12 animate-pulse rounded-[10px] bg-muted" />}
            {!loading && attention.length === 0 && (
              <div className="text-[11.5px] leading-relaxed text-muted-foreground">
                Nothing is flagged. Every tenant has members and at least one client.
              </div>
            )}
            {!loading &&
              attention.map((t) => {
                const h = health(t);
                return (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => navigate(`/operator/fleet/tenants?tenant=${t.id}`)}
                    className="rounded-[10px] border border-border border-l-[3px] border-l-[hsl(var(--warning))] bg-muted/40 px-3 py-2.5 text-left transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <div className="text-[11.5px] leading-relaxed">
                      <span className="font-semibold">{t.name}</span> — {h.label.toLowerCase()}.
                    </div>
                  </button>
                );
              })}
          </div>
        </div>
      </aside>
    </div>
  );
}

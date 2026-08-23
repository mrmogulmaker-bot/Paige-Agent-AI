import { useCallback, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { toast } from "sonner";

import { useTenantContext } from "@/hooks/useTenantContext";
import { useFleet, isInternal, type FleetTenant } from "@/operator/data/useFleet";
import { FleetOrbit, type OrbitNode } from "@/operator/surfaces/FleetOrbit";
import { FleetTenantsRail, type RailTenant } from "@/operator/surfaces/FleetTenantsRail";
import { cn } from "@/lib/utils";

/**
 * Fleet Console — Claude Design's `isFleet` block (Super Admin Shell.dc.html ~7826-7877), on
 * the real fleet: the FLEET eyebrow + title row with the Field/Table view toggle and gold
 * primary CTA, the four-tile KPI strip, the filter-chip + search row, the Field view's orbit
 * visualization (`FleetOrbit`) or the Table view's tenant list, and the 296px right rail
 * carrying "Needs you today".
 *
 * §13 — WHAT IT SHOWS IS WHAT THE PLATFORM KNOWS. CD's pack ships mock rows with dollar MRR on
 * every tenant, a "FLEET MRR" KPI, a per-row MRR column, and a synthesized "Her read" paragraph.
 * None of that ships here. The §57 anchor case was exactly this class of defect — a Fleet
 * surface showing $397/$149 against tenants with no paid subscription. Money Spine is a
 * separately-scoped, deferred effort (owner ruling 2026-08-19: "I don't care about the money
 * spine right now") — so every dollar figure below is an honest "—", not a stand-in, and CD's
 * invented "Her read" narrative and named "Needs you today" scenarios (Ashford Wellness, Verde
 * Landscaping, Ridgeline Collective) are dropped rather than ported — those are mock findings
 * about tenants that do not exist here, and shipping them would put fabricated words in Paige's
 * mouth (§13/§14). The label, the geometry and the interaction are CD's; the figures are ours.
 */

const TIER_LABEL_ORDER = ["Agency", "Solo", "Enterprise", "Sub-account"] as const;
type TierLabel = (typeof TIER_LABEL_ORDER)[number];

const TIER_PILL: Record<TierLabel, string> = {
  Agency: "bg-[hsl(var(--primary)/0.12)] text-[hsl(var(--primary))]",
  Solo: "bg-[hsl(var(--success)/0.12)] text-[hsl(var(--success))]",
  Enterprise: "bg-[hsl(var(--gold-dark)/0.14)] text-[hsl(var(--gold-dark))]",
  "Sub-account": "bg-muted text-muted-foreground",
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
 * input is a real column, and CD's three-way pill (Healthy/Watch/At risk) is what this maps
 * to — "risk" is CD's `t.risk` flag, "watch" is CD's amber middle state.
 */
function health(t: FleetTenant): { label: string; tone: "ok" | "warn" | "risk" } {
  if (t.status && t.status !== "active") return { label: "At risk", tone: "risk" };
  if (t.seats === 0) return { label: "At risk", tone: "risk" };
  if (t.customers === 0) return { label: "Watch", tone: "warn" };
  return { label: "Healthy", tone: "ok" };
}

const HEALTH_PILL: Record<"ok" | "warn" | "risk", string> = {
  ok: "bg-[hsl(var(--success)/0.12)] text-[hsl(var(--success))]",
  warn: "bg-[hsl(var(--warning)/0.16)] text-[hsl(var(--gold-dark))]",
  risk: "bg-[hsl(var(--destructive)/0.1)] text-[hsl(var(--destructive))]",
};

type Filter = "All" | "Agency" | "Solo" | "Enterprise" | "At risk";
const FILTERS: readonly Filter[] = ["All", "Agency", "Solo", "Enterprise", "At risk"];

/**
 * The fleet is ordered by TOPOLOGY, not by creation date: each top-level tenant, then its own
 * sub-accounts directly beneath it (§51). A child whose parent is filtered out still appears,
 * at top level, so a search can never silently swallow a tenant.
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

/** CD's tier label (TIER_INK's four keys), derived from the real record — never a plan name. */
function tierLabel(t: FleetTenant, isNested: boolean): TierLabel {
  if (isNested) return "Sub-account";
  if (t.accountType === "agency") return "Agency";
  if (t.accountType === "enterprise") return "Enterprise";
  return "Solo";
}

export default function FleetConsole({ canSeeRevenue: _canSeeRevenue }: { canSeeRevenue: boolean }) {
  const navigate = useNavigate();
  /**
   * Which tenant is open, read back off the URL rather than held in a second piece of state. The
   * field's click and the directory's "Enter" both write `?tenant=`, so the URL is already the one
   * home for this (§18) — mirroring it into local state would let the two disagree on a back/forward.
   */
  const [searchParams] = useSearchParams();
  const selectedTenantId = searchParams.get("tenant");

  const { tenants, classificationVisible, loading, error } = useFleet(true);
  const { switchTenant } = useTenantContext();

  /**
   * ACT AS a tenant — the "logged act" CD's directory copy promises, and the thing the rail's
   * own foot ("Entering a tenant puts you in their shell with their data. Every session is
   * recorded in Governance.") has been claiming since this surface shipped.
   *
   * It goes through `switchTenant`, the SAME control the header TenantSwitcher already drives,
   * which for platform staff now routes to the audited `operator_enter_tenant` RPC. Deliberately
   * NOT a second act-as path of its own: a Fleet-only route beside the existing switcher would
   * mean two ways to enter a tenant with only one of them audited — an audit trail that looks
   * complete while a quiet route stays open (§18).
   *
   * NOTHING NAVIGATES. Act-as is a SCOPE CHANGE, not a journey — `switchTenant` already runs the
   * audited RPC, commits `activeTenantId` to the one shared provider, and invalidates every query,
   * so all consumers re-read under the new scope synchronously. The old code followed that with
   * `window.location.assign("/admin")`, which was the one-way door: no exit control existed on the
   * far side, and the operator had left the console entirely.
   *
   * The comment that justified the hard navigate ("every PER-INSTANCE `useTenantContext` has to
   * re-read") described the architecture as it was BEFORE 2026-07-28. `useTenantContext` became a
   * real provider mounted once at the app root that day; the reload has been redundant since, and
   * the stale comment is why nobody noticed. Verified against the provider, not assumed.
   *
   * The deeper correction: admin is not a URL, so act-as was never a navigation. The pack models
   * it as three scope states on the band above the shell (`P.SCOPES` — rest / read / act), where
   * scope is BROADCAST rather than routed, which is also why detach works across windows.
   *
   * INTERIM, Round 0 → Round 1: the band that reports "Acting as …" and carries the Exit control
   * is drawn in the pack and built with the shell in Round 1. Until it lands, this toast is the
   * only signal that scope moved — deliberately the same transient class as the failure toast
   * below, NOT a stand-in for the band. Round 1 replaces it with the persistent band; do not grow
   * it into a bespoke exit affordance in the meantime (§30 — the exit gets drawn once, from the
   * pack, rather than invented here and discarded there).
   */
  const enterTenant = useCallback(
    async (id: string) => {
      const name = tenants.find((t) => t.id === id)?.name ?? "that tenant";
      const ok = await switchTenant(id);
      if (!ok) {
        // Never pretend. A refused switch leaves scope exactly where it was.
        toast.error(`Couldn't enter ${name}.`);
        return;
      }
      toast.success(`Acting as ${name}. Everything you do here is recorded.`);
    },
    [switchTenant, tenants],
  );
  const [view, setView] = useState<"field" | "table">("field");
  const [filter, setFilter] = useState<Filter>("All");
  const [q, setQ] = useState("");
  /**
   * Platform fixtures and test accounts are hidden by default and revealed by a chip — never
   * dropped. Hiding them keeps the console reporting the real fleet; keeping the chip means no
   * shipped row is silently removed and the operator can always see everything (§58).
   */
  const [showInternal, setShowInternal] = useState(false);

  /**
   * The fleet as the platform actually runs it: customers, not our own fixtures.
   *
   * When the classification is not readable at this tier, NOTHING is filtered — filtering on an
   * answer we never received would silently drop or keep the wrong rows. The header says so
   * instead, so a scoped operator knows the count includes fixtures rather than believing it is
   * the customer fleet.
   */
  const fleet = useMemo(
    () =>
      showInternal || !classificationVisible ? tenants : tenants.filter((t) => !isInternal(t)),
    [tenants, showInternal, classificationVisible],
  );
  const internalCount = useMemo(
    () => (classificationVisible ? tenants.filter(isInternal).length : 0),
    [tenants, classificationVisible],
  );

  /** Which fleet rows are nested (a sub-account whose parent is also in the fleet). */
  const nestedIds = useMemo(() => {
    const present = new Set(fleet.map((t) => t.id));
    return new Set(fleet.filter((t) => t.parentTenantId && present.has(t.parentTenantId)).map((t) => t.id));
  }, [fleet]);

  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return byTopology(
      fleet.filter((t) => {
        if (needle && !`${t.name} ${t.slug ?? ""}`.toLowerCase().includes(needle)) return false;
        if (filter === "At risk") return health(t).tone === "risk";
        if (filter === "All") return true;
        return tierLabel(t, nestedIds.has(t.id)) === filter;
      }),
    );
  }, [fleet, filter, q, nestedIds]);

  // CD: subCount = TENANTS.reduce((a,t) => a + t.subs, 0) — real, the count of rows with a
  // parent present in the fleet.
  const subCount = useMemo(() => fleet.filter((t) => nestedIds.has(t.id)).length, [fleet, nestedIds]);
  const atRiskTenants = useMemo(() => fleet.filter((t) => health(t).tone === "risk"), [fleet]);

  /** The directory's rows — the same derivation the table uses, computed once (§18). */
  const railRows: RailTenant[] = useMemo(
    () =>
      rows.map((t) => ({
        tenant: t,
        tier: tierLabel(t, nestedIds.has(t.id)),
        health: health(t),
        beneath: fleet.filter((x) => x.parentTenantId === t.id).length,
      })),
    [rows, nestedIds, fleet],
  );

  const orbitNodes: OrbitNode[] = useMemo(
    () =>
      rows.map((t) => ({
        id: t.id,
        name: t.name,
        tier: tierLabel(t, nestedIds.has(t.id)),
        // Real, non-financial weight — team + clients. Never a stand-in for revenue (§13).
        weight: t.seats + t.customers,
        needsYou: health(t).tone === "risk",
      })),
    [rows, nestedIds],
  );

  return (
    // `overflow-hidden` keeps the two columns from growing the row: whichever is taller scrolls
    // inside itself rather than stretching the console past the pane (the scrollbar the owner
    // reported came from the rail doing exactly that).
    <div className="flex min-h-0 flex-1 gap-3 overflow-hidden">
      <div className="flex min-w-0 flex-1 flex-col gap-3">
        {/* ── title row ─────────────────────────────────────────────── */}
        <div className="flex flex-none flex-wrap items-start gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2.5">
              <span className="text-[length:var(--pg-t-label)] font-semibold tracking-[0.15em] text-muted-foreground">
                FLEET
              </span>
              <span className="text-[length:var(--pg-t-title)] font-bold tracking-[-0.02em]">Fleet Console</span>
            </div>
            <div className="mt-1.5 text-[length:var(--pg-t-body)] text-muted-foreground">
              {loading
                ? "Reading the fleet…"
                : error
                  ? "The fleet could not be read."
                  : "Every tenant on the platform, and the door into each one." +
                    (classificationVisible
                      ? ""
                      : " Platform fixtures cannot be told apart at your access level, so any are counted here.")}
            </div>
          </div>
          <div className="ml-auto flex min-w-0 flex-none items-center gap-2.5">
            {/* CD's Field/Table view toggle. */}
            <div className="flex flex-none items-center gap-0.5 rounded-[9px] border border-border bg-muted/50 p-0.5">
              {(["field", "table"] as const).map((v) => (
                <button
                  key={v}
                  type="button"
                  onClick={() => setView(v)}
                  aria-pressed={view === v}
                  className={cn(
                    "rounded-[7px] px-2.5 py-1 text-[length:var(--pg-t-label)] font-medium capitalize transition-colors",
                    view === v ? "bg-card text-foreground shadow-sm" : "text-muted-foreground",
                  )}
                >
                  {v}
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={() => navigate("/operator/provisioning")}
              className="whitespace-nowrap rounded-[9px] bg-cd-gold px-3.5 py-2 text-[length:var(--pg-t-body)] font-semibold text-[hsl(var(--accent-foreground))] transition-[filter] hover:brightness-[1.06] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              Provision a tenant
            </button>
          </div>
        </div>

        {/* ── KPI strip (CD's flKpis) ───────────────────────────────── */}
        <div className="grid flex-none grid-cols-2 gap-2.5 lg:grid-cols-4">
          {[
            { label: "TENANTS", value: loading ? "—" : String(fleet.length), unit: `${loading ? "—" : subCount} sub-accounts beneath` },
            // Money Spine deferred (owner ruling 2026-08-19) — no billing table read here.
            // CD's unit asserts a growth rate ("up 6.2% on last month") we have not measured,
            // so it is dropped rather than shown against an em dash (§13).
            { label: "FLEET MRR", value: "—", unit: "not tracked yet" },
            { label: "AT RISK", value: loading ? "—" : String(atRiskTenants.length), unit: atRiskTenants.length ? "needs a look" : "none flagged" },
            // CD's provisioning-decision queue has no live writer (§18 — same honest gap
            // `useOperatorChrome` already states for the rail badge), so this stays absent.
            { label: "WAITING ON YOU", value: "—", unit: "not connected yet" },
          ].map((k) => (
            <div
              key={k.label}
              className="min-w-0 rounded-xl border-[1.5px] border-border bg-card px-3.5 py-3 shadow-sm"
            >
              <div className="truncate text-[length:var(--pg-t-label)] font-semibold tracking-[0.13em] text-muted-foreground">
                {k.label}
              </div>
              <div className="mt-1 flex min-w-0 items-baseline gap-2">
                <span className="whitespace-nowrap text-[length:var(--pg-t-title)] font-bold tabular-nums tracking-[-0.02em]">
                  {k.value}
                </span>
                <span className="truncate text-[length:var(--pg-t-label)] text-muted-foreground">{k.unit}</span>
              </div>
            </div>
          ))}
        </div>

        {/* ── filters + search ──────────────────────────────────────── */}
        <div className="flex flex-none flex-wrap items-center gap-2">
          {FILTERS.map((f) => {
            const on = filter === f;
            return (
              <button
                key={f}
                type="button"
                onClick={() => setFilter(f)}
                aria-pressed={on}
                className={cn(
                  "whitespace-nowrap rounded-full border px-3 py-1.5 text-[length:var(--pg-t-label)] font-medium transition-colors",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  on
                    ? "border-border-strong bg-muted text-foreground"
                    : "border-border bg-card text-muted-foreground hover:text-foreground",
                )}
              >
                {f}
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
                "whitespace-nowrap rounded-full border px-3 py-1.5 text-[length:var(--pg-t-label)] font-medium transition-colors",
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
            <span aria-hidden className="flex-none text-[length:var(--pg-t-label)] text-muted-foreground">⌕</span>
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search tenants, owners, domains"
              aria-label="Search tenants, owners, domains"
              className="w-44 bg-transparent text-[length:var(--pg-t-label)] outline-none placeholder:text-muted-foreground"
            />
          </div>
        </div>

        {/* ── field view: the orbit ─────────────────────────────────── */}
        {view === "field" && (
          <div className="flex min-h-0 flex-1 flex-col">
            {/* CD's field container is dark regardless of page theme — a canvas host, not a
                themed panel — so it renders on the platform's own `--rail` token (the exact
                dark indigo the pack hardcodes as #191231), never a raw hex. */}
            <div className="relative flex min-h-0 flex-1 overflow-hidden rounded-[15px] bg-[hsl(var(--rail))] shadow-[0_18px_40px_rgba(10,14,26,0.3)]">
              {loading ? (
                <div className="flex flex-1 items-center justify-center">
                  <div className="h-40 w-40 animate-pulse rounded-full bg-white/10" />
                </div>
              ) : error ? (
                <div className="flex flex-1 items-center justify-center px-4 py-10 text-center">
                  <div>
                    <div className="text-[length:var(--pg-t-body)] font-semibold text-[hsl(var(--rail-foreground))]">
                      The fleet could not be read.
                    </div>
                    <div className="mx-auto mt-1 max-w-md text-[length:var(--pg-t-label)] text-[hsl(var(--rail-muted))]">
                      {error}
                    </div>
                  </div>
                </div>
              ) : rows.length === 0 ? (
                <div className="flex flex-1 items-center justify-center px-4 py-10 text-center">
                  <div className="text-[length:var(--pg-t-body)] font-semibold text-[hsl(var(--rail-muted))]">
                    {tenants.length === 0 ? "No tenants yet." : "Nothing matches that."}
                  </div>
                </div>
              ) : (
                <FleetOrbit
                  nodes={orbitNodes}
                  selectedId={selectedTenantId}
                  onSelect={(id) => navigate(`/operator/fleet/tenants?tenant=${id}`)}
                />
              )}
              {/* CD's top scrim overlay: eyebrow/title/meta on the left, tier legend on the right. */}
              <div
                className="pointer-events-none absolute inset-x-0 top-0 flex items-start gap-3 px-4 pb-6 pt-3.5"
                style={{
                  background:
                    "linear-gradient(180deg, hsl(var(--rail)/0.94) 0%, hsl(var(--rail)/0.94) 74%, hsl(var(--rail)/0.6) 88%, hsl(var(--rail)/0) 100%)",
                }}
              >
                <div className="min-w-0">
                  <div className="text-[length:var(--pg-t-label)] font-semibold tracking-[0.16em] text-[hsl(var(--rail-foreground))]/70">
                    EVERY TENANT ON THE PLATFORM
                  </div>
                  <div className="mt-1 text-[length:var(--pg-t-lead)] font-semibold text-[hsl(var(--rail-foreground))]">
                    The fleet, by weight
                  </div>
                  <div className="mt-1 font-mono text-[length:var(--pg-t-label)] text-[hsl(var(--rail-foreground))]/70">
                    {loading ? "—" : rows.length} tenants · node size is team + clients · ringed
                    nodes need you
                  </div>
                </div>
                <div className="ml-auto flex flex-none flex-col items-end gap-1">
                  {(
                    [
                      ["Agency", "hsl(var(--primary))"],
                      ["Solo", "hsl(var(--success))"],
                      ["Enterprise", "hsl(var(--gold-dark))"],
                      ["Sub-account", "hsl(var(--rail-muted))"],
                      ["Needs you", "hsl(var(--warning))"],
                    ] as const
                  ).map(([label, color]) => (
                    <div key={label} className="flex items-center gap-1.5">
                      <span className="whitespace-nowrap text-[length:var(--pg-t-label)] text-[hsl(var(--rail-foreground))]/60">
                        {label}
                      </span>
                      <span
                        aria-hidden
                        className="h-2 w-2 flex-none rounded-full"
                        style={{ backgroundColor: color }}
                      />
                    </div>
                  ))}
                </div>
              </div>
            </div>
            <div className="flex-none pb-1 pt-2 text-center text-[length:var(--pg-t-label)] text-muted-foreground">
              Drag to orbit · hover a node to name it · click to open the tenant
            </div>
          </div>
        )}

        {/* ── table view ─────────────────────────────────────────────── */}
        {view === "table" && (
          <div className="min-h-0 flex-1 overflow-y-auto rounded-[13px] border-[1.5px] border-border bg-card shadow-sm">
            <div className="sticky top-0 z-[2] flex items-center gap-2.5 border-b border-border bg-muted/40 px-3.5 py-2">
              <div className="min-w-0 flex-[2.1] text-[length:var(--pg-t-label)] font-semibold tracking-[0.12em] text-muted-foreground">TENANT</div>
              <div className="min-w-0 flex-[0.9] text-[length:var(--pg-t-label)] font-semibold tracking-[0.12em] text-muted-foreground">TIER</div>
              <div className="min-w-0 flex-[0.9] text-right text-[length:var(--pg-t-label)] font-semibold tracking-[0.12em] text-muted-foreground">MRR</div>
              <div className="min-w-0 flex-[0.8] text-right text-[length:var(--pg-t-label)] font-semibold tracking-[0.12em] text-muted-foreground">BENEATH</div>
              <div className="min-w-0 flex-1 text-right text-[length:var(--pg-t-label)] font-semibold tracking-[0.12em] text-muted-foreground">HEALTH</div>
              <div className="min-w-0 flex-[0.9] text-right text-[length:var(--pg-t-label)] font-semibold tracking-[0.12em] text-muted-foreground">LAST ACTIVE</div>
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
                <div className="text-[length:var(--pg-t-body)] font-semibold">The fleet could not be read.</div>
                <div className="mx-auto mt-1 max-w-md text-[length:var(--pg-t-label)] text-muted-foreground">{error}</div>
              </div>
            )}

            {!loading && !error && rows.length === 0 && (
              <div className="px-4 py-10 text-center">
                <div className="text-[length:var(--pg-t-body)] font-semibold">
                  {tenants.length === 0 ? "No tenants yet." : "Nothing matches that."}
                </div>
                <div className="mx-auto mt-1 max-w-md text-[length:var(--pg-t-label)] text-muted-foreground">
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
                const nested = nestedIds.has(t.id);
                const tier = tierLabel(t, nested);
                const beneath = fleet.filter((x) => x.parentTenantId === t.id).length;
                return (
                  <div
                    key={t.id}
                    className="flex min-w-0 items-center gap-2.5 border-b border-border/60 px-3.5 py-2.5 transition-colors last:border-b-0 hover:bg-muted/40"
                  >
                    <div className="flex min-w-0 flex-[2.1] items-center gap-2.5">
                      {nested && (
                        <span
                          aria-hidden
                          className="ml-1 h-4 w-3 flex-none rounded-bl-[4px] border-b border-l border-border"
                        />
                      )}
                      <span className="grid h-7 w-7 flex-none place-items-center rounded-[9px] bg-muted text-[length:var(--pg-t-label)] font-bold text-foreground/70">
                        {initials(t.name)}
                      </span>
                      <div className="min-w-0">
                        <div className="flex min-w-0 items-center gap-1.5">
                          <span className="truncate text-[length:var(--pg-t-body)] font-semibold">{t.name}</span>
                          {isInternal(t) && (
                            <span className="flex-none whitespace-nowrap rounded-full border border-dashed border-border px-1.5 py-px text-[length:var(--pg-t-label)] font-semibold uppercase tracking-wide text-muted-foreground">
                              Internal
                            </span>
                          )}
                        </div>
                        <div className="mt-0.5 truncate font-mono text-[length:var(--pg-t-label)] text-muted-foreground">
                          {t.slug ?? "—"}
                        </div>
                      </div>
                    </div>
                    <div className="min-w-0 flex-[0.9]">
                      <span className={cn("whitespace-nowrap rounded-full px-2 py-0.5 text-[length:var(--pg-t-label)] font-semibold", TIER_PILL[tier])}>
                        {tier}
                      </span>
                    </div>
                    {/* Money Spine deferred — no MRR read (§13). */}
                    <div className="min-w-0 flex-[0.9] text-right font-mono text-[length:var(--pg-t-label)] text-muted-foreground">—</div>
                    <div className="min-w-0 flex-[0.8] text-right font-mono text-[length:var(--pg-t-label)] tabular-nums">
                      {beneath || "—"}
                    </div>
                    <div className="flex min-w-0 flex-1 items-center justify-end">
                      <span className={cn("whitespace-nowrap rounded-full px-2 py-0.5 text-[length:var(--pg-t-label)] font-semibold", HEALTH_PILL[h.tone])}>
                        {h.label}
                      </span>
                    </div>
                    {/* No last-activity read wired yet — honest absence, never "today" (§13). */}
                    <div className="min-w-0 flex-[0.9] text-right font-mono text-[length:var(--pg-t-label)] text-muted-foreground">—</div>
                    <div className="w-[76px] flex-none text-right">
                      <button
                        type="button"
                        onClick={() => void enterTenant(t.id)}
                        className="rounded-lg border border-border bg-card px-2.5 py-1 text-[length:var(--pg-t-label)] font-semibold text-[hsl(var(--gold-dark))] transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      >
                        Enter →
                      </button>
                    </div>
                  </div>
                );
              })}
          </div>
        )}
      </div>

      {/* ── right rail: what needs you, her read, and the directory ──── */}
      <FleetTenantsRail
        rows={railRows}
        filtered={filter !== "All" || q.trim().length > 0}
        loading={loading}
        onOpenTenant={(id) => navigate(`/operator/fleet/tenants?tenant=${id}`)}
        onEnterTenant={(id) => void enterTenant(id)}
        onProvision={() => navigate("/operator/provisioning")}
        onAskPaige={() => navigate("/operator/paige")}
        onOpenCheck={() => navigate("/operator/fleet/systems-check")}
      />

    </div>
  );
}

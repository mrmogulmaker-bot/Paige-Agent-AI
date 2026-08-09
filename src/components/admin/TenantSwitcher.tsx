/**
 * Header dropdown that IS the operator/tenant mode switch (Option B, Super Admin
 * restructure). For platform staff it is the single control that flips the whole
 * shell between OPERATOR mode (no tenant selected = the "Platform" pinned entry)
 * and TENANT mode (any tenant selected = the real Slice 1c tenant IA). The gate
 * itself lives in AdminLayout (`godMode = isPlatformStaff && activeTenantId === null`);
 * this component just drives `activeTenantId` via `switchTenant`.
 *
 * ORGANIZATION (#29 Part 5) — for platform staff the tenant list is grouped by
 * REVENUE class (the operator-internal #29 axis), not a flat list, so the operator's
 * real customers don't visually compete with comped/internal/test accounts:
 *   Paying → Promotional → Internal → System, archived (canceled/suspended)
 *   collapsed under a toggle. Within a group: topology (agency/enterprise first) →
 *   lifecycle (active first) → name. Filter chips (All/Paying/Promo/Test/System)
 *   reuse the shared `FilterChip` primitive (§18 one home for the filter concept)
 *   and the selection persists per operator (localStorage). Search is code-ready and
 *   renders once the fleet exceeds 20 (progressive disclosure). The taxonomy matrix
 *   (`docs/product/customer-portal-owner-trilogy-taxonomy-matrix.md`) governs
 *   client-portal PILLAR ownership, not tenant-switcher grouping — so this grouping
 *   follows the #29 revenue axis + §51 topology, aligned with (not dictated by) that
 *   matrix's God/Agency/Tenant/Sub-account stakeholder taxonomy.
 *
 * A non-staff multi-tenant member keeps the simple flat list (no revenue_class, few
 * tenants — grouping would be noise). Hidden entirely for a single-tenant non-staff user.
 */
import { useMemo, useState } from "react";
import { Building2, Check, ChevronDown, Globe2, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FilterChip } from "@/components/ui/page";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useTenantContext, type TenantSummary } from "@/hooks/useTenantContext";
import { PLATFORM } from "@/lib/platform/identity";

/** Per-operator persisted filter selection. */
type SwitcherFilter = "all" | "paid" | "promotional" | "internal_test" | "system";
const FILTER_KEY = "paige.operator.tenantSwitcher.filter";
const SEARCH_THRESHOLD = 20; // progressive disclosure — show search once the fleet is large

function readFilter(): SwitcherFilter {
  try {
    const v = localStorage.getItem(FILTER_KEY);
    if (v === "paid" || v === "promotional" || v === "internal_test" || v === "system") return v;
  } catch {
    /* unreadable store — fall back to "all" */
  }
  return "all";
}
function persistFilter(v: SwitcherFilter): void {
  try {
    localStorage.setItem(FILTER_KEY, v);
  } catch {
    /* unwritable store — the in-memory selection still applies this session */
  }
}

/** A tenant's bucket, in DISPLAY order. Archived + System take precedence over class. */
type Bucket = "paid" | "promotional" | "internal_test" | "system" | "archived";

function bucketOf(t: TenantSummary): Bucket {
  if (t.status === "canceled" || t.status === "suspended") return "archived";
  if (t.slug === PLATFORM.defaultsTenantSlug) return "system";
  if (t.revenue_class === "paid") return "paid";
  if (t.revenue_class === "internal_test") return "internal_test";
  // promotional is the honest default for an unclassified tenant (#29 baseline).
  return "promotional";
}

const GROUPS: { bucket: Exclude<Bucket, "archived">; label: string }[] = [
  { bucket: "paid", label: "Paying" },
  { bucket: "promotional", label: "Promotional" },
  { bucket: "internal_test", label: "Internal" },
  { bucket: "system", label: "System" },
];

const TOPOLOGY_RANK: Record<string, number> = { agency: 0, enterprise: 1, standalone: 2, sub_account: 3 };
const STATUS_RANK: Record<string, number> = { active: 0, trial: 1, past_due: 2, suspended: 3, canceled: 4 };

function sortTenants(a: TenantSummary, b: TenantSummary): number {
  const topo = (TOPOLOGY_RANK[a.account_type] ?? 9) - (TOPOLOGY_RANK[b.account_type] ?? 9);
  if (topo !== 0) return topo;
  const life = (STATUS_RANK[a.status] ?? 9) - (STATUS_RANK[b.status] ?? 9);
  if (life !== 0) return life;
  return a.name.localeCompare(b.name);
}

export function TenantSwitcher() {
  const { loading, isPlatformStaff, tenants, activeTenant, activeTenantId, switchTenant } =
    useTenantContext();
  const [filter, setFilter] = useState<SwitcherFilter>(readFilter);
  const [showArchived, setShowArchived] = useState(false);
  const [query, setQuery] = useState("");

  const inPlatformView = activeTenantId === null;
  const label = activeTenant?.name ?? (isPlatformStaff ? "Platform" : "Tenant");
  const TriggerIcon = inPlatformView && isPlatformStaff ? Globe2 : Building2;

  // Bucket + filter + search, computed once per render (before any early return so
  // hook order is stable regardless of the staff/loading branch below).
  const q = query.trim().toLowerCase();
  const byBucket = useMemo(() => {
    const map = new Map<Bucket, TenantSummary[]>();
    for (const t of tenants) {
      if (q && !`${t.name} ${t.slug} ${t.id}`.toLowerCase().includes(q)) continue;
      const b = bucketOf(t);
      if (filter !== "all" && b !== filter) continue;
      (map.get(b) ?? map.set(b, []).get(b)!).push(t);
    }
    for (const list of map.values()) list.sort(sortTenants);
    return map;
  }, [tenants, filter, q]);

  if (loading) return null;
  if (!isPlatformStaff && tenants.length <= 1) return null;

  const archived = byBucket.get("archived") ?? [];
  const showSearch = tenants.length > SEARCH_THRESHOLD;

  const renderRow = (t: TenantSummary, dim: boolean) => (
    <DropdownMenuItem
      key={t.id}
      onClick={() => switchTenant(t.id)}
      className="flex items-center justify-between"
    >
      <div className={`flex items-center gap-2 min-w-0 ${dim ? "opacity-60" : ""}`}>
        <Building2 className="w-4 h-4 text-muted-foreground flex-shrink-0" />
        <div className="min-w-0">
          <div className="truncate text-sm">{t.name}</div>
          <div className="truncate text-[10px] uppercase tracking-wide text-muted-foreground">
            {t.slug === PLATFORM.defaultsTenantSlug
              ? "System · Platform defaults"
              : `${t.account_type} · ${t.status}`}
          </div>
        </div>
      </div>
      {activeTenantId === t.id && <Check className="w-4 h-4 ml-auto text-accent flex-shrink-0" />}
    </DropdownMenuItem>
  );

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="text-primary-foreground/80 hover:text-primary-foreground hover:bg-sidebar-accent/50 max-w-[180px]"
        >
          <TriggerIcon className="w-4 h-4 mr-1.5 flex-shrink-0" />
          <span className="truncate text-xs">{label}</span>
          <ChevronDown className="w-3.5 h-3.5 ml-1 opacity-70 flex-shrink-0" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-72 max-h-[70vh] overflow-y-auto">
        {/* PINNED operator entry — switchTenant(null) = operator mode. Gold Check marks
            the on-state (§11: gold only on the on/selected moment). */}
        {isPlatformStaff && (
          <>
            <DropdownMenuLabel>Mode</DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => switchTenant(null)} className="flex items-center gap-2">
              <Globe2 className="w-4 h-4 text-foreground flex-shrink-0" />
              <div className="min-w-0">
                <div className="truncate text-sm font-medium">Platform</div>
                <div className="truncate text-[10px] uppercase tracking-wide text-muted-foreground">
                  {PLATFORM.platformScopeLabel}
                </div>
              </div>
              {inPlatformView && <Check className="w-4 h-4 ml-auto text-accent flex-shrink-0" />}
            </DropdownMenuItem>
          </>
        )}

        {/* Non-staff multi-tenant member — simple flat list, no operator grouping. */}
        {!isPlatformStaff && (
          <>
            <DropdownMenuLabel>Active tenant</DropdownMenuLabel>
            <DropdownMenuSeparator />
            {tenants.map((t) => renderRow(t, false))}
          </>
        )}

        {/* Operator — grouped by revenue class with filter chips + optional search. */}
        {isPlatformStaff && (
          <>
            <div
              className="flex flex-wrap gap-1 px-2 py-2"
              // Chips are plain buttons (not menu items), so a click toggles the filter
              // WITHOUT closing the menu; stop propagation defensively so Radix never
              // treats it as an outside/dismiss interaction.
              onPointerDown={(e) => e.stopPropagation()}
            >
              {([
                ["all", "All"],
                ["paid", "Paying"],
                ["promotional", "Promo"],
                ["internal_test", "Test"],
                ["system", "System"],
              ] as [SwitcherFilter, string][]).map(([value, chipLabel]) => (
                <FilterChip
                  key={value}
                  active={filter === value}
                  aria-pressed={filter === value}
                  onClick={() => {
                    setFilter(value);
                    persistFilter(value);
                  }}
                >
                  {chipLabel}
                </FilterChip>
              ))}
            </div>

            {showSearch && (
              <div className="px-2 pb-2" onPointerDown={(e) => e.stopPropagation()}>
                <div className="relative">
                  <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                  <Input
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    onKeyDown={(e) => e.stopPropagation()}
                    placeholder="Search tenants…"
                    className="h-8 pl-7 text-xs"
                  />
                </div>
              </div>
            )}

            {GROUPS.map(({ bucket, label: groupLabel }) => {
              const rows = byBucket.get(bucket) ?? [];
              if (rows.length === 0) return null;
              const dim = bucket === "internal_test" || bucket === "system";
              return (
                <div key={bucket}>
                  <DropdownMenuLabel className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                    {groupLabel} · {rows.length}
                  </DropdownMenuLabel>
                  {rows.map((t) => renderRow(t, dim))}
                </div>
              );
            })}

            {/* Archived (canceled/suspended) collapsed by default — present, not hidden. */}
            {archived.length > 0 && (
              <>
                <DropdownMenuSeparator />
                <button
                  type="button"
                  onClick={() => setShowArchived((s) => !s)}
                  onPointerDown={(e) => e.stopPropagation()}
                  className="flex w-full items-center gap-1.5 px-2 py-1.5 text-[11px] font-medium text-muted-foreground hover:text-foreground"
                >
                  <ChevronDown
                    className={`w-3.5 h-3.5 transition-transform ${showArchived ? "" : "-rotate-90"}`}
                  />
                  {showArchived ? "Hide" : "Show"} archived · {archived.length}
                </button>
                {showArchived &&
                  archived.map((t) => (
                    <DropdownMenuItem
                      key={t.id}
                      onClick={() => switchTenant(t.id)}
                      className="flex items-center justify-between"
                    >
                      <div className="flex items-center gap-2 min-w-0 opacity-50">
                        <Building2 className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                        <div className="min-w-0">
                          <div className="truncate text-sm line-through">{t.name}</div>
                          <div className="truncate text-[10px] uppercase tracking-wide text-muted-foreground">
                            {t.account_type} · {t.status}
                          </div>
                        </div>
                      </div>
                      {activeTenantId === t.id && (
                        <Check className="w-4 h-4 ml-auto text-accent flex-shrink-0" />
                      )}
                    </DropdownMenuItem>
                  ))}
              </>
            )}

            {/* Empty state — a filter/search that matches nothing still reads as designed. */}
            {tenants.length > 0 &&
              GROUPS.every(({ bucket }) => (byBucket.get(bucket) ?? []).length === 0) &&
              archived.length === 0 && (
                <div className="px-3 py-4 text-center text-xs text-muted-foreground">
                  No tenants match this filter.
                </div>
              )}
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

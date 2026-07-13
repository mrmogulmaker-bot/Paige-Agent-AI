/**
 * Agency Board — the Agency-tier control room (§9).
 *
 * A tenant whose account_type is 'agency' or 'enterprise' runs its OWN book of
 * child workspaces here, and RESELLS the platform's God-owned catalog (the
 * MARKETPLACE_SKILLS inventory) DOWN onto those children. The catalog is owned
 * at the Paige Agent platform level — the agency provisions items onto its own
 * sub-accounts, it does not author the catalog.
 *
 * Ownership & isolation (§9): every read/write here is scoped to THIS agency's
 * own children by the authenticated, parentage-gated RPCs:
 *   - agency_list_my_subaccounts()            → this agency's children only
 *   - agency_subaccount_metrics(_child)       → per-child KPIs (parentage-gated)
 *   - agency_child_provisioned(_child)        → what's live on that child
 *   - agency_provision_catalog_item(_child,…) → resell / retract an item
 *   - create_subaccount(4-arg)                → spin up a new child
 * The UI is one caller of that seam; Paige is another (§10). An agency can never
 * read or provision another agency's tenant — the RPC enforces it server-side.
 *
 * §2: funding is a God-owned catalog item resold ONLY as an explicit per-child
 * opt-in — it is never forced, defaulted, or auto-on.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Building2, Users, Workflow as WorkflowIcon, UserCog, Plus, RefreshCw,
  ArrowRightLeft, Store, Loader2, PackageCheck, Layers,
  TrendingUp, Palette, Mic, Sparkles,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useTenantContext } from "@/hooks/useTenantContext";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { TableCell, TableRow } from "@/components/ui/table";
import {
  PageShell, PageHeader, SectionCard, StatTile, StatRow,
  DataTableShell, EmptyState, StatePill, GlyphPlate, type Column,
} from "@/components/ui/page";
import {
  MARKETPLACE_SKILLS, SKILL_CATEGORIES, type MarketplaceSkill,
} from "@/lib/marketplace/skills";
import { stashSwitchNotice } from "@/lib/agency/switchNotice";

// Catalog icons resolve here (the catalog stores a lucide name, §platform-owned).
const ICONS: Record<string, LucideIcon> = { TrendingUp, Palette, Mic, Workflow: WorkflowIcon };

interface SubAccount {
  id: string;
  slug: string;
  name: string;
  account_type: string;
  status: string;
  created_at: string;
}

interface ChildMetrics {
  clients: number;
  active_workflows: number;
  members: number;
}

const asNum = (v: unknown): number => (typeof v === "number" && Number.isFinite(v) ? v : 0);
const asSlugs = (v: unknown): string[] =>
  Array.isArray(v) ? v.filter((s): s is string => typeof s === "string") : [];

export default function AgencyBoard() {
  const { activeTenant, activeTenantId } = useTenantContext();

  const [subs, setSubs] = useState<SubAccount[]>([]);
  // Which child we're entering (drives the row's Open-button spinner).
  const [switchingId, setSwitchingId] = useState<string | null>(null);
  const [metrics, setMetrics] = useState<Record<string, ChildMetrics>>({});
  const [loading, setLoading] = useState(true);
  const [metricsLoading, setMetricsLoading] = useState(false);

  // Create-a-child form (mirrors SubAccountsPanel's proven pattern).
  const [name, setName] = useState("");
  const [industry, setIndustry] = useState("");
  const [creating, setCreating] = useState(false);

  // The resell surface targets one selected child at a time.
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [provisioned, setProvisioned] = useState<string[]>([]);
  const [provLoading, setProvLoading] = useState(false);
  const [savingSlug, setSavingSlug] = useState<string | null>(null);

  const selected = useMemo(() => subs.find((s) => s.id === selectedId) ?? null, [subs, selectedId]);

  // --- Roster + per-child metrics (this agency's children only, RPC-scoped) ---
  const loadRoster = useCallback(async () => {
    if (!activeTenantId) return;
    setLoading(true);
    try {
      const { data, error } = await supabase.rpc("agency_list_my_subaccounts");
      if (error) throw error;
      const rows = (Array.isArray(data) ? data : []) as SubAccount[];
      setSubs(rows);

      // Fan out metrics in parallel — one gated call per child.
      setMetricsLoading(true);
      const results = await Promise.all(
        rows.map(async (r) => {
          const { data: m, error: mErr } = await supabase.rpc("agency_subaccount_metrics", { _child: r.id });
          if (mErr) return [r.id, { clients: 0, active_workflows: 0, members: 0 }] as const;
          const obj = (m ?? {}) as Record<string, unknown>;
          return [
            r.id,
            {
              clients: asNum(obj.clients),
              active_workflows: asNum(obj.active_workflows),
              members: asNum(obj.members),
            },
          ] as const;
        }),
      );
      setMetrics(Object.fromEntries(results));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't load your sub-accounts");
    } finally {
      setLoading(false);
      setMetricsLoading(false);
    }
  }, [activeTenantId]);

  useEffect(() => { loadRoster(); }, [loadRoster]);

  // --- Provisioned state for the selected child ---
  const loadProvisioned = useCallback(async (childId: string) => {
    setProvLoading(true);
    try {
      const { data, error } = await supabase.rpc("agency_child_provisioned", { _child: childId });
      if (error) throw error;
      setProvisioned(asSlugs(data));
    } catch (e) {
      setProvisioned([]);
      toast.error(e instanceof Error ? e.message : "Couldn't read what's live on this account");
    } finally {
      setProvLoading(false);
    }
  }, []);

  const selectChild = (childId: string) => {
    setSelectedId(childId);
    setProvisioned([]);
    loadProvisioned(childId);
  };

  const create = async () => {
    if (name.trim().length < 2) { toast.error("Give the sub-account a name"); return; }
    setCreating(true);
    try {
      const { error } = await supabase.rpc("create_subaccount", {
        _name: name.trim(),
        _industry: industry.trim() || null,
        _description: null,
        _parent_tenant_id: activeTenantId,
      });
      if (error) throw error;
      toast.success(`${name.trim()} is live under your agency.`);
      setName(""); setIndustry("");
      await loadRoster();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't create the sub-account");
    } finally {
      setCreating(false);
    }
  };

  const openChild = async (child: SubAccount) => {
    // Enter the sub-account through the parentage-gated RPC (§9/§10): it grants
    // the agency admin a membership row on the child (so child-scoped RLS lets
    // them work) AND sets active_tenant_id = child in one authenticated call —
    // strictly more correct than a bare active_tenant_id write, which would
    // leave the admin unable to read the child under RLS. Then hard-navigate so
    // every per-instance tenant context re-reads the new scope (switchNotice.ts).
    if (switchingId) return;
    setSwitchingId(child.id);
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await supabase.rpc("agency_enter_subaccount" as any, { _child: child.id });
      if (error) throw error;
      stashSwitchNotice(`Now managing ${child.name}.`);
      window.location.assign("/admin");
    } catch (e) {
      const code = (e as { code?: string } | null)?.code;
      toast.error(
        code === "42501"
          ? "You can't manage that account."
          : e instanceof Error ? e.message : "Couldn't open that sub-account",
      );
      setSwitchingId(null);
    }
  };

  const toggleItem = async (item: MarketplaceSkill, on: boolean) => {
    if (!selectedId || savingSlug) return;
    setSavingSlug(item.slug);
    const prev = provisioned;
    setProvisioned(on ? [...prev, item.slug] : prev.filter((s) => s !== item.slug)); // optimistic
    try {
      const { data, error } = await supabase.rpc("agency_provision_catalog_item", {
        _child: selectedId,
        _slug: item.slug,
        _enabled: on,
      });
      if (error) throw error;
      setProvisioned(asSlugs(data));
      toast.success(
        on
          ? `${item.name} is now live on ${selected?.name ?? "this account"}.`
          : `${item.name} retracted from ${selected?.name ?? "this account"}.`,
      );
    } catch (e) {
      setProvisioned(prev); // revert
      toast.error(e instanceof Error ? e.message : "Couldn't update this item");
    } finally {
      setSavingSlug(null);
    }
  };

  // --- Aggregate KPIs across the book (real data only, never hardcoded) ---
  const totals = useMemo(() => {
    const vals = Object.values(metrics);
    return {
      children: subs.length,
      clients: vals.reduce((s, m) => s + m.clients, 0),
      workflows: vals.reduce((s, m) => s + m.active_workflows, 0),
      members: vals.reduce((s, m) => s + m.members, 0),
    };
  }, [subs, metrics]);

  const availableCount = MARKETPLACE_SKILLS.filter((s) => s.status === "available").length;

  const columns: Column[] = [
    { key: "name", header: "Sub-account" },
    { key: "status", header: "Status" },
    { key: "clients", header: "Clients", numeric: true },
    { key: "workflows", header: "Workflows", numeric: true },
    { key: "members", header: "Members", numeric: true },
    { key: "live", header: "Reselling", numeric: true },
    { key: "actions", header: "", className: "text-right" },
  ];

  return (
    <PageShell width="wide">
      <PageHeader
        variant="hero"
        eyebrow="Paige · Agency Control"
        title="Run your book of businesses."
        description={
          `Spin up sub-accounts under ${activeTenant?.name ?? "your agency"}, watch each one at a glance, ` +
          "and resell platform capabilities down onto them — one continuous system, your brand on top."
        }
        actions={
          <Button
            variant="secondary"
            onClick={loadRoster}
            disabled={loading}
            className="bg-white/10 text-white hover:bg-white/20 border-0"
          >
            <RefreshCw className={`mr-2 h-4 w-4 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        }
      />

      <StatRow cols={4}>
        <StatTile label="Sub-accounts" value={totals.children} icon={Building2} loading={loading} />
        <StatTile label="Clients (book)" value={totals.clients} icon={Users} loading={loading || metricsLoading} />
        <StatTile label="Active workflows" value={totals.workflows} icon={WorkflowIcon} loading={loading || metricsLoading} />
        <StatTile label="Team members" value={totals.members} icon={UserCog} loading={loading || metricsLoading} />
      </StatRow>

      {/* Create a sub-account */}
      <SectionCard
        icon={Plus}
        title="Add a sub-account"
        description="A child workspace under your agency — its own clients, brand, and pipeline. You own it and can open it any time."
      >
        <div className="grid items-end gap-3 sm:grid-cols-[1fr_1fr_auto]">
          <div className="space-y-1.5">
            <Label htmlFor="sub-name">Name</Label>
            <Input
              id="sub-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Northwind Advisory"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="sub-industry">What they do (optional)</Label>
            <Input
              id="sub-industry"
              value={industry}
              onChange={(e) => setIndustry(e.target.value)}
              placeholder="Consulting, agency, advisory…"
            />
          </div>
          <Button variant="gold" onClick={create} disabled={creating || name.trim().length < 2}>
            {creating ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Plus className="mr-2 h-4 w-4" />}
            Create
          </Button>
        </div>
      </SectionCard>

      {/* Roster */}
      <div className="space-y-3">
        <div className="flex items-center gap-3">
          <GlyphPlate icon={Layers} size="sm" />
          <div className="min-w-0">
            <h2 className="font-display text-lg font-semibold leading-tight text-foreground">Your sub-accounts</h2>
            <p className="text-sm text-muted-foreground">
              Select an account to manage what it resells. Metrics are live per workspace.
            </p>
          </div>
        </div>

        <DataTableShell
          columns={columns}
          loading={loading}
          isEmpty={!loading && subs.length === 0}
          empty={
            <EmptyState
              icon={Building2}
              tone="brand"
              title="No sub-accounts yet"
              description="Add your first child workspace above — then resell platform capabilities onto it in a click."
            />
          }
        >
          {subs.map((s) => {
            const m = metrics[s.id];
            const isSelected = s.id === selectedId;
            return (
              <TableRow
                key={s.id}
                onClick={() => selectChild(s.id)}
                aria-selected={isSelected}
                className={`cursor-pointer ${isSelected ? "bg-muted/60" : ""}`}
              >
                <TableCell>
                  <div className="min-w-0">
                    <div className="truncate font-medium text-foreground">{s.name}</div>
                    <div className="text-xs text-muted-foreground">
                      /{s.slug}
                      {s.account_type !== "standalone" && (
                        <span className="capitalize"> · {s.account_type}</span>
                      )}
                    </div>
                  </div>
                </TableCell>
                <TableCell>
                  <StatePill state={s.status === "active" ? "success" : "pending"}>
                    {s.status}
                  </StatePill>
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {m ? m.clients : <span className="text-muted-foreground">—</span>}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {m ? m.active_workflows : <span className="text-muted-foreground">—</span>}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {m ? m.members : <span className="text-muted-foreground">—</span>}
                </TableCell>
                <TableCell className="text-right">
                  {isSelected ? (
                    <StatePill state="success">Managing</StatePill>
                  ) : (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={(e) => { e.stopPropagation(); selectChild(s.id); }}
                    >
                      <Store className="mr-1.5 h-3.5 w-3.5" /> Manage
                    </Button>
                  )}
                </TableCell>
                <TableCell className="text-right">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={switchingId === s.id}
                    onClick={(e) => { e.stopPropagation(); openChild(s); }}
                  >
                    {switchingId === s.id ? (
                      <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <ArrowRightLeft className="mr-1.5 h-3.5 w-3.5" />
                    )}
                    Open
                  </Button>
                </TableCell>
              </TableRow>
            );
          })}
        </DataTableShell>
      </div>

      {/* Resell panel — the God-owned catalog, provisioned onto the selected child */}
      {selected && (
        <SectionCard
          icon={Store}
          title={`Resell to ${selected.name}`}
          description="These are platform capabilities, owned by Paige Agent. Switch one on to provision it onto this sub-account; switch it off to retract."
          actions={
            <Button variant="outline" size="sm" onClick={() => setSelectedId(null)}>
              Close
            </Button>
          }
        >
          <div className="space-y-8">
            {SKILL_CATEGORIES.map((cat) => {
              const items = MARKETPLACE_SKILLS.filter((s) => s.category === cat.key);
              if (items.length === 0) return null;
              return (
                <div key={cat.key} className="space-y-3">
                  <div className="flex items-center gap-2">
                    <h3 className="text-sm font-semibold text-foreground">{cat.label}</h3>
                    <div className="hidden h-px flex-1 bg-border/60 sm:block" />
                  </div>
                  <div className="grid gap-3 md:grid-cols-2">
                    {items.map((item) => {
                      const Icon = ICONS[item.icon] ?? Sparkles;
                      const available = item.status === "available";
                      const on = provisioned.includes(item.slug);
                      const busy = savingSlug === item.slug;
                      const armed = on && available;
                      return (
                        <div
                          key={item.slug}
                          className="flex items-start justify-between gap-3 rounded-[var(--radius)] border border-border bg-card p-4"
                        >
                          <div className="flex min-w-0 items-start gap-3">
                            <GlyphPlate icon={Icon} size="sm" armed={armed} />
                            <div className="min-w-0">
                              <div className="flex flex-wrap items-center gap-2">
                                <span className="font-medium text-foreground">{item.name}</span>
                                {available
                                  ? on
                                    ? <StatePill state="on">Live</StatePill>
                                    : <StatePill state="off">Off</StatePill>
                                  : <StatePill state="roadmap" />}
                              </div>
                              <p className="mt-0.5 text-sm text-muted-foreground">{item.tagline}</p>
                              {item.slug === "funding" && (
                                <p className="mt-1 text-xs text-muted-foreground">
                                  Opt-in per account — only turns on when you switch it on here.
                                </p>
                              )}
                            </div>
                          </div>
                          <div className="shrink-0 pt-0.5">
                            {available ? (
                              <div className="flex items-center gap-2">
                                {busy && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
                                <Switch
                                  checked={on}
                                  disabled={busy || provLoading}
                                  onCheckedChange={(v) => toggleItem(item, v)}
                                  aria-label={`${on ? "Retract" : "Provision"} ${item.name} ${on ? "from" : "to"} ${selected.name}`}
                                />
                              </div>
                            ) : (
                              <span className="text-xs font-medium text-muted-foreground">Coming soon</span>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </SectionCard>
      )}

      {/* Footnote: what's resellable, real count */}
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <PackageCheck className="h-3.5 w-3.5" />
        {availableCount} of {MARKETPLACE_SKILLS.length} catalog capabilities are live and resellable today; the rest are on the roadmap.
      </div>
    </PageShell>
  );
}

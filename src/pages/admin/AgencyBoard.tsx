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
 *   - agency_portfolio_metrics()              → ONE rollup across this agency's
 *                                               book (replaces the per-child N+1)
 *   - agency_list_my_subaccounts()            → this agency's children only
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
  Building2, Users, Workflow as WorkflowIcon, Plus, RefreshCw,
  ArrowRightLeft, Store, Loader2, PackageCheck, Layers,
  TrendingUp, Palette, Mic, Sparkles, UserPlus,
  DollarSign, AlertTriangle, Activity, Trophy, ArrowUpRight,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useTenantContext } from "@/hooks/useTenantContext";
import { useAgencyPortfolio, type PortfolioHealthKey } from "@/hooks/useAgencyPortfolio";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { TableCell, TableRow } from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogHeader, DialogFooter, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
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

const asSlugs = (v: unknown): string[] =>
  Array.isArray(v) ? v.filter((s): s is string => typeof s === "string") : [];

const usd = (cents: number) =>
  new Intl.NumberFormat(undefined, {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(Math.round(cents / 100));

const num = (n: number) => n.toLocaleString();
const signed = (n: number) => (n > 0 ? `+${num(n)}` : num(n));

// Health buckets → the shared word-pill vocabulary (legible by LABEL, not color).
const HEALTH_PILL: Record<PortfolioHealthKey, { state: "success" | "warning" | "error"; label: string }> = {
  healthy: { state: "success", label: "Healthy" },
  watch: { state: "warning", label: "Watch" },
  at_risk: { state: "error", label: "At risk" },
};

export default function AgencyBoard() {
  const { activeTenant, activeTenantId } = useTenantContext();

  // ONE parentage-gated rollup across the whole book — replaces the old
  // per-child N+1. Polls every 45s and on window focus (live/dynamic doctrine).
  const { portfolio, loading: portfolioLoading, refetch: refetchPortfolio } = useAgencyPortfolio();

  const [subs, setSubs] = useState<SubAccount[]>([]);
  // Which child we're entering (drives the row's Open/Reach-out spinner).
  const [switchingId, setSwitchingId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // Create-a-child form (mirrors SubAccountsPanel's proven pattern).
  const [name, setName] = useState("");
  const [industry, setIndustry] = useState("");
  const [creating, setCreating] = useState(false);

  // "Invite owner" flow — hand a sub-account to its principal as the child's ADMIN.
  // Moved here (with the sub-accounts surface) from the tenant Settings panel: it's
  // part of the agency operator's job, so it lives on the agency side (§9/§12).
  const [inviteFor, setInviteFor] = useState<SubAccount | null>(null);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteBusy, setInviteBusy] = useState(false);

  // The resell surface targets one selected child at a time.
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [provisioned, setProvisioned] = useState<string[]>([]);
  const [provLoading, setProvLoading] = useState(false);
  const [savingSlug, setSavingSlug] = useState<string | null>(null);

  const selected = useMemo(() => subs.find((s) => s.id === selectedId) ?? null, [subs, selectedId]);

  // --- Roster (this agency's children only, RPC-scoped) — drives the management
  // surface below. The at-a-glance KPIs come from agency_portfolio_metrics, so
  // this no longer fans out a metrics call per child. ---
  const loadRoster = useCallback(async () => {
    if (!activeTenantId) return;
    setLoading(true);
    try {
      const { data, error } = await supabase.rpc("agency_list_my_subaccounts");
      if (error) throw error;
      setSubs((Array.isArray(data) ? data : []) as SubAccount[]);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't load your sub-accounts");
    } finally {
      setLoading(false);
    }
  }, [activeTenantId]);

  useEffect(() => { loadRoster(); }, [loadRoster]);

  // One refresh gesture re-pulls both the live rollup and the roster.
  const refreshAll = useCallback(() => {
    refetchPortfolio();
    loadRoster();
  }, [refetchPortfolio, loadRoster]);

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

  const openChild = async (childId: string, childName: string) => {
    // Enter the sub-account through the parentage-gated RPC (§9/§10): it grants
    // the agency admin a membership row on the child (so child-scoped RLS lets
    // them work) AND sets active_tenant_id = child in one authenticated call —
    // strictly more correct than a bare active_tenant_id write, which would
    // leave the admin unable to read the child under RLS. Then hard-navigate so
    // every per-instance tenant context re-reads the new scope (switchNotice.ts).
    if (switchingId) return;
    setSwitchingId(childId);
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await supabase.rpc("agency_enter_subaccount" as any, { _child: childId });
      if (error) throw error;
      stashSwitchNotice(`Now managing ${childName}.`);
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

  // Invite the sub-account's owner. Mints a `subaccount_owner` invite ON THE CHILD
  // (auth passes: the agency owner is the child's owner + a member → is_tenant_admin
  // is true), bound to the owner's email, then emails the child/agency-branded /join
  // link via send-portal-invite. On accept they become the child's ADMIN — the
  // agency stays owner_user_id and keeps white-label control. No clients row.
  const sendOwnerInvite = async () => {
    if (!inviteFor) return;
    const email = inviteEmail.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { toast.error("Enter a valid email address"); return; }
    setInviteBusy(true);
    try {
      const { data: tokRes, error: mintErr } = await supabase.rpc("create_tenant_invite_token", {
        _tenant_id: inviteFor.id,
        _kind: "subaccount_owner",
        _default_role: "admin",
        _expires_in_days: 30,
        _max_uses: 1,
        _contact_id: null,
        _email: email,
      });
      if (mintErr) throw mintErr;
      const row = Array.isArray(tokRes) ? tokRes[0] : tokRes;
      const token = (row as { token?: string } | null)?.token;
      if (!token) throw new Error("Could not create the invite");

      const joinUrl = `${window.location.origin}/join/${token}`;
      const { data: sent } = await supabase.functions.invoke("send-portal-invite", {
        body: { token, email },
      });
      try { await navigator.clipboard.writeText(joinUrl); } catch { /* clipboard optional */ }
      const emailed = (sent as { emailed?: boolean } | null)?.emailed;
      toast.success(emailed ? `Owner invite emailed to ${email} — link also copied` : `Invite link copied — send it to ${email}`);
      setInviteFor(null);
      setInviteEmail("");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not send the owner invite");
    } finally {
      setInviteBusy(false);
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

  // --- Hero KPIs across the book — one real rollup, rendered defensively so a
  // tile appears ONLY when its key is present (§13: no fabricated numbers). ---
  const kpis = useMemo(() => {
    const p = portfolio;
    const tiles: Array<{ key: string; node: JSX.Element }> = [];
    if (portfolioLoading || p?.active_subaccounts !== undefined) {
      tiles.push({
        key: "active_subaccounts",
        node: (
          <StatTile
            label="Sub-accounts"
            value={num(p?.active_subaccounts ?? 0)}
            icon={Building2}
            loading={portfolioLoading}
          />
        ),
      });
    }
    if (portfolioLoading || p?.portfolio_mrr_cents !== undefined) {
      tiles.push({
        key: "portfolio_mrr_cents",
        node: (
          <StatTile
            label="Portfolio revenue"
            value={usd(p?.portfolio_mrr_cents ?? 0)}
            icon={DollarSign}
            hint="monthly recurring"
            loading={portfolioLoading}
          />
        ),
      });
    }
    if (portfolioLoading || p?.net_growth !== undefined) {
      const g = p?.net_growth ?? 0;
      tiles.push({
        key: "net_growth",
        node: (
          <StatTile
            label="Net growth"
            value={signed(g)}
            icon={TrendingUp}
            intent={g > 0 ? "positive" : g < 0 ? "negative" : "neutral"}
            hint={
              p?.subaccounts_added !== undefined && p?.subaccounts_churned !== undefined
                ? `${num(p.subaccounts_added)} added · ${num(p.subaccounts_churned)} churned`
                : undefined
            }
            loading={portfolioLoading}
          />
        ),
      });
    }
    if (portfolioLoading || p?.at_risk_subaccounts !== undefined) {
      const r = p?.at_risk_subaccounts ?? 0;
      tiles.push({
        key: "at_risk_subaccounts",
        node: (
          <StatTile
            label="Sub-accounts at risk"
            value={num(r)}
            icon={AlertTriangle}
            intent={r > 0 ? "negative" : "neutral"}
            loading={portfolioLoading}
          />
        ),
      });
    }
    if (portfolioLoading || p?.clients_under_mgmt !== undefined) {
      tiles.push({
        key: "clients_under_mgmt",
        node: (
          <StatTile
            label="Clients under management"
            value={num(p?.clients_under_mgmt ?? 0)}
            icon={Users}
            loading={portfolioLoading}
          />
        ),
      });
    }
    return tiles;
  }, [portfolio, portfolioLoading]);

  const health = portfolio?.health;
  const leaderboard = portfolio?.leaderboard;

  const availableCount = MARKETPLACE_SKILLS.filter((s) => s.status === "available").length;

  const columns: Column[] = [
    { key: "name", header: "Sub-account" },
    { key: "status", header: "Status" },
    { key: "manage", header: "" },
    { key: "actions", header: "", className: "text-right" },
  ];

  const leaderboardColumns: Column[] = [
    { key: "name", header: "Sub-account" },
    { key: "clients", header: "Clients", numeric: true },
    { key: "mrr", header: "MRR", numeric: true },
    { key: "health", header: "Health" },
    { key: "act", header: "", className: "text-right" },
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
            onClick={refreshAll}
            disabled={loading || portfolioLoading}
            className="bg-white/10 text-white hover:bg-white/20 border-0"
          >
            <RefreshCw className={`mr-2 h-4 w-4 ${loading || portfolioLoading ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        }
      />

      {kpis.length > 0 && (
        <StatRow cols={4}>{kpis.map((k) => <div key={k.key}>{k.node}</div>)}</StatRow>
      )}

      {/* Portfolio health — how the book splits across healthy / watch / at-risk. */}
      {health && (
        <SectionCard
          icon={Activity}
          title="Portfolio health"
          description="Where your book stands right now, at a glance — so you know who needs you before they churn."
        >
          <div className="grid gap-3 sm:grid-cols-3">
            {([
              { key: "healthy" as const, value: health.healthy },
              { key: "watch" as const, value: health.watch },
              { key: "at_risk" as const, value: health.at_risk },
            ]).map(({ key, value }) => {
              const meta = HEALTH_PILL[key];
              return (
                <div
                  key={key}
                  className="flex items-center justify-between gap-3 rounded-[var(--radius)] border border-border bg-card p-4"
                >
                  <div className="font-display text-2xl font-semibold tabular-nums text-foreground">
                    {num(value)}
                  </div>
                  <StatePill state={meta.state}>{meta.label}</StatePill>
                </div>
              );
            })}
          </div>
        </SectionCard>
      )}

      {/* Leaderboard / at-risk board — per-child clients + MRR + health, straight
          from the single rollup. Gold is spent ONLY on the Reach-out act moment. */}
      {leaderboard !== undefined && (
        <SectionCard
          icon={Trophy}
          title="Sub-account leaderboard"
          description="Your book ranked by traction — reach out to the ones losing steam before they slip."
        >
          <DataTableShell
            columns={leaderboardColumns}
            loading={portfolioLoading}
            isEmpty={!portfolioLoading && leaderboard.length === 0}
            empty={
              <EmptyState
                icon={Trophy}
                tone="brand"
                title="No sub-accounts to rank yet"
                description="Spin up your first child workspace below and it'll show up here with live clients, revenue, and health."
              />
            }
          >
            {leaderboard.map((row) => {
              const meta = HEALTH_PILL[row.health] ?? HEALTH_PILL.watch;
              const busy = switchingId === row.tenant_id;
              return (
                <TableRow key={row.tenant_id}>
                  <TableCell>
                    <div className="truncate font-medium text-foreground">{row.name}</div>
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{num(row.client_count)}</TableCell>
                  <TableCell className="text-right tabular-nums">{usd(row.mrr_cents)}</TableCell>
                  <TableCell>
                    <StatePill state={meta.state}>{meta.label}</StatePill>
                  </TableCell>
                  <TableCell className="text-right">
                    <Button
                      variant="gold"
                      size="sm"
                      disabled={busy}
                      onClick={() => openChild(row.tenant_id, row.name)}
                      aria-label={`Open ${row.name} to check in`}
                    >
                      {busy ? (
                        <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <ArrowUpRight className="mr-1.5 h-3.5 w-3.5" />
                      )}
                      Open
                    </Button>
                  </TableCell>
                </TableRow>
              );
            })}
          </DataTableShell>
        </SectionCard>
      )}

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
              Select an account to manage what it resells, hand it to its owner, or open it to work inside.
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
                  <div className="flex items-center justify-end gap-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={(e) => { e.stopPropagation(); setInviteFor(s); setInviteEmail(""); }}
                    >
                      <UserPlus className="mr-1.5 h-3.5 w-3.5" /> Invite owner
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={switchingId === s.id}
                      onClick={(e) => { e.stopPropagation(); openChild(s.id, s.name); }}
                    >
                      {switchingId === s.id ? (
                        <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <ArrowRightLeft className="mr-1.5 h-3.5 w-3.5" />
                      )}
                      Open
                    </Button>
                  </div>
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

      {/* Invite the owner of a sub-account — hand off the day-to-day, keep the keys. */}
      <Dialog open={!!inviteFor} onOpenChange={(o) => { if (!o && !inviteBusy) { setInviteFor(null); setInviteEmail(""); } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Invite the owner of {inviteFor?.name ?? "this sub-account"}</DialogTitle>
            <DialogDescription>
              They'll get a branded link to set up their account and take the reins as this
              workspace's admin. You stay the owner and keep full control — hand off the day-to-day,
              not the keys.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label htmlFor="owner-invite-email">Owner's email</Label>
            <Input
              id="owner-invite-email"
              type="email"
              value={inviteEmail}
              onChange={(e) => setInviteEmail(e.target.value)}
              placeholder="owner@business.com"
              disabled={inviteBusy}
              autoFocus
              onKeyDown={(e) => { if (e.key === "Enter") void sendOwnerInvite(); }}
            />
          </div>
          <DialogFooter>
            <Button
              variant="ghost"
              onClick={() => { setInviteFor(null); setInviteEmail(""); }}
              disabled={inviteBusy}
            >
              Cancel
            </Button>
            <Button variant="gold" onClick={sendOwnerInvite} disabled={inviteBusy || inviteEmail.trim().length === 0}>
              {inviteBusy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Send invite
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PageShell>
  );
}

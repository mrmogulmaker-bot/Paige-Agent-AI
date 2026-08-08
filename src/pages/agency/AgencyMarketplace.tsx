/**
 * Agency Marketplace — the AGENCY-side curation surface (#277, Wave 3.9 Slice 1).
 *
 * WHO IS THIS FOR (§9): the AGENCY OPERATOR (a parent tenant that owns
 * sub-accounts) deciding which approved Marketplace items their SUB-ACCOUNTS may
 * see and install. This is DISTINCT from the tenant's own install view
 * (/admin/marketplace): there, a coach switches a capability ON for THEIR Paige;
 * here, the agency owner curates what flows DOWN to their book. Same visual
 * grammar (the ONE SkillCard, in curationMode — not a fork; §18/§11) + the shared
 * @/components/ui/page primitives, in an agency-scope context.
 *
 * CALLABLE SEAM (§10): every curation write goes through the RPC
 * set_agency_item_allowlist — this toggle is one caller, Paige is another. No
 * curation logic lives only in this component.
 *
 * PROACTIVE SURFACING (§36): items the agency hasn't decided on yet surface in a
 * "Pending your review" queue at the top — the operator doesn't hunt for them.
 *
 * §11: compact plain PageHeader (content leads, no hero banner). Gold is spent
 * ONLY on the act — a switch flipped ON to share an item down. Token-only, AA
 * both themes, motion-safe (the card owns its reduced-motion fallback).
 */
import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Store, Search, Sparkles, TrendingUp, Palette, Mic, Workflow, BookOpen,
  Dumbbell, Briefcase, Building2, LineChart, ClipboardCheck,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { PageShell, PageHeader, Toolbar, FilterChip, EmptyState, SectionCard } from "@/components/ui/page";
import { SkillCard } from "@/components/marketplace/SkillCard";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { MarketplaceSkill } from "@/lib/marketplace/skills";

const ICONS: Record<string, LucideIcon> = {
  TrendingUp, Palette, Mic, Workflow, BookOpen, Dumbbell, Briefcase, Building2, LineChart, Sparkles,
};

// One approved catalog item as read (RLS-gated) from the registry, joined with
// this agency's curation decision.
type CurationRow = {
  id: string;
  slug: string;
  name: string;
  tagline: string | null;
  description: string | null;
  category: string;
  icon: string | null;
  item_type: string;
  /** enabled_for_subaccounts (false when no allowlist row exists yet). */
  shared: boolean;
  /** true when the agency has NOT yet reviewed this item (reviewed_at IS NULL / no row). */
  pending: boolean;
  /** PER-CHILD scope only: the agency-wide default flag this child inherits. */
  defaultShared?: boolean;
  /** PER-CHILD scope only: true when this child carries its OWN override row. */
  isOverride?: boolean;
};

const prettyCategory = (key: string) =>
  key.replace(/[_-]/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

export default function AgencyMarketplace() {
  const qc = useQueryClient();
  const [saving, setSaving] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [cat, setCat] = useState<string>("all");
  const [status, setStatus] = useState<"all" | "shared" | "pending">("all");
  // Curation scope (§18: a filter over WHO the decision applies to — NOT a new
  // management surface, §55). "agency" = the agency-wide default every sub-account
  // inherits; a tenant id = that one child's effective/override view.
  const [scope, setScope] = useState<string>("agency");

  // The agency's own tenant id — server-resolved (§13), never trusted from a prop.
  const agencyQ = useQuery({
    queryKey: ["agency_context_for_marketplace"],
    queryFn: async (): Promise<string | null> => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await supabase.rpc("agency_switch_context" as any);
      if (error) throw error;
      const ctx = (data as { agency_id?: string | null } | null) ?? null;
      return ctx?.agency_id ?? null;
    },
  });
  const agencyId = agencyQ.data ?? null;

  // The agency's OWN children — the canonical §9/§51-gated list (auth.uid()-keyed,
  // returns only sub-accounts under agencies this caller manages). Reused as-is; no
  // new sub-account-management surface (§55/§18). Cast `as never` because the RPC
  // isn't in the regenerated types on this branch — same convention as above.
  const subaccountsQ = useQuery({
    queryKey: ["agency_marketplace_subaccounts", agencyId],
    enabled: !!agencyId,
    retry: false,
    queryFn: async (): Promise<Array<{ id: string; name: string }>> => {
      type Kid = { id: string; name: string | null; slug: string | null };
      const { data, error } = await supabase.rpc("agency_list_my_subaccounts" as never);
      if (error) throw error;
      return ((data ?? []) as Kid[]).map((k) => ({ id: k.id, name: k.name ?? k.slug ?? "Sub-account" }));
    },
  });
  const subaccounts = useMemo(() => subaccountsQ.data ?? [], [subaccountsQ.data]);
  // A child selection is honored only while it's still in the caller's book (§9).
  const selectedChild =
    scope !== "agency" && subaccounts.some((s) => s.id === scope) ? scope : null;
  const selectedChildName = subaccounts.find((s) => s.id === selectedChild)?.name ?? "";

  // The approved catalog visible at the agency's tier (RLS-gated) + this agency's
  // per-item curation decision. Two reads, merged on the client so we keep the
  // real marketplace_items.id the RPC needs (the catalog RPC returns slug only).
  const rowsQ = useQuery({
    queryKey: ["agency_curation_rows", agencyId],
    enabled: !!agencyId,
    // A 42501 (caller isn't this agency's owner/admin) is a terminal auth state, not a
    // transient failure — don't retry it into a spinner.
    retry: false,
    queryFn: async (): Promise<CurationRow[]> => {
      // ONE agency-scoped read (§10/§51): agency_curation_catalog resolves tier + scope
      // against the AGENCY id SERVER-SIDE, never the caller's active tenant — so an agency
      // owner working inside a sub-account still curates the AGENCY's catalog, and can't
      // accidentally allowlist a child-scoped item for the parent. It returns the real
      // marketplace_items.id (the toggle RPC needs it) + this agency's decision in one shot.
      // Cast through `as never` because the RPC is Slice-1 net-new (types regenerate from
      // prod only after this migration deploys) — the same escape hatch the tenant
      // Marketplace uses for its not-yet-typed RPCs.
      type CatalogRow = {
        item_id: string; slug: string; name: string | null; tagline: string | null;
        description: string | null; category: string | null; icon: string | null;
        item_type: string | null; enabled_for_subaccounts: boolean; reviewed: boolean;
      };
      const { data, error } = await supabase.rpc(
        "agency_curation_catalog" as never,
        { _agency_tenant_id: agencyId } as never,
      );
      if (error) throw error;
      return ((data ?? []) as CatalogRow[]).map((r): CurationRow => ({
        id: r.item_id,
        slug: r.slug,
        name: r.name ?? r.slug,
        tagline: r.tagline ?? null,
        description: r.description ?? null,
        category: r.category ?? "other",
        icon: r.icon ?? null,
        item_type: r.item_type ?? "skill",
        shared: r.enabled_for_subaccounts === true,
        pending: !r.reviewed,
      }));
    },
  });

  // A 42501 from the catalog RPC = the caller is a member of the agency (the shell let them
  // in) but NOT an owner/admin, so they can't curate (§9). Render an explicit read-only state
  // rather than a broken all-pending shelf whose every toggle would 42501.
  const forbidden =
    rowsQ.isError &&
    (((rowsQ.error as { code?: string } | null)?.code === "42501") ||
      /owner or admin/i.test(rowsQ.error instanceof Error ? rowsQ.error.message : ""));

  const rows = useMemo(() => rowsQ.data ?? [], [rowsQ.data]);
  const loading = agencyQ.isLoading || rowsQ.isLoading;

  // PER-CHILD view (§18: the SAME catalog, one child's effective decision). Loads the
  // agency default + this child's override in one shot; the effective flag =
  // COALESCE(override, default, false) is resolved SERVER-SIDE. Enabled only when a
  // child is selected, so the agency-wide default view is byte-unchanged.
  const childRowsQ = useQuery({
    queryKey: ["agency_curation_child_rows", agencyId, selectedChild],
    enabled: !!agencyId && !!selectedChild,
    retry: false,
    queryFn: async (): Promise<CurationRow[]> => {
      type ChildCatalogRow = {
        item_id: string; slug: string; name: string | null; tagline: string | null;
        description: string | null; category: string | null; icon: string | null;
        item_type: string | null;
        effective_enabled: boolean; default_enabled: boolean; is_override: boolean;
      };
      const { data, error } = await supabase.rpc(
        "agency_curation_catalog_for_subaccount" as never,
        { _agency_tenant_id: agencyId, _sub_account_tenant_id: selectedChild } as never,
      );
      if (error) throw error;
      return ((data ?? []) as ChildCatalogRow[]).map((r): CurationRow => ({
        id: r.item_id,
        slug: r.slug,
        name: r.name ?? r.slug,
        tagline: r.tagline ?? null,
        description: r.description ?? null,
        category: r.category ?? "other",
        icon: r.icon ?? null,
        item_type: r.item_type ?? "skill",
        shared: r.effective_enabled === true,
        pending: false,
        defaultShared: r.default_enabled === true,
        isOverride: r.is_override === true,
      }));
    },
  });

  const childRows = useMemo(() => childRowsQ.data ?? [], [childRowsQ.data]);
  const inChild = !!selectedChild;
  // ONE grid/toolbar path drives both scopes (§18): the agency default set, or the
  // selected child's effective set.
  const activeRows = inChild ? childRows : rows;
  const activeLoading = inChild ? loading || childRowsQ.isLoading : loading;

  const sharedCount = activeRows.filter((r) => r.shared).length;
  const pendingCount = rows.filter((r) => r.pending).length;
  // The "Pending your review" queue is an agency-DEFAULT concept only — a child's
  // effective view is never "unreviewed" (it always inherits a default).
  const pendingRows = inChild ? [] : rows.filter((r) => r.pending);

  const categories = useMemo(() => {
    const seen = new Set<string>();
    for (const r of activeRows) seen.add(r.category);
    return [...seen].sort();
  }, [activeRows]);

  const q = query.trim().toLowerCase();
  const filtered = activeRows.filter((r) => {
    const matchKeyword =
      !q ||
      r.name.toLowerCase().includes(q) ||
      (r.tagline ?? "").toLowerCase().includes(q) ||
      (r.description ?? "").toLowerCase().includes(q);
    const matchCat = cat === "all" || r.category === cat;
    const matchStatus =
      status === "all" ? true : status === "shared" ? r.shared : r.pending;
    return matchKeyword && matchCat && matchStatus;
  });

  const resetFilters = () => {
    setQuery("");
    setCat("all");
    setStatus("all");
  };

  const curate = async (r: CurationRow, on: boolean) => {
    if (!agencyId || saving) return;
    setSaving(r.id);
    try {
      const { error } = await supabase.rpc(
        "set_agency_item_allowlist" as never,
        { _agency_tenant_id: agencyId, _marketplace_item_id: r.id, _enabled: on } as never,
      );
      if (error) throw error;
      toast.success(
        on ? `${r.name} is now available to your sub-accounts.` : `${r.name} is hidden from your sub-accounts.`,
      );
      await qc.invalidateQueries({ queryKey: ["agency_curation_rows", agencyId] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't update that — please try again.");
    } finally {
      setSaving(null);
    }
  };

  // PER-CHILD write (§10 callable seam — this switch is one caller, Paige is another).
  // The 4th arg scopes the allowlist row to THIS child; the RPC re-checks
  // _agency_owns_child before it upserts the override.
  const curateChild = async (r: CurationRow, on: boolean) => {
    if (!agencyId || !selectedChild || saving) return;
    setSaving(r.id);
    try {
      const { error } = await supabase.rpc(
        "set_agency_item_allowlist" as never,
        {
          _agency_tenant_id: agencyId,
          _marketplace_item_id: r.id,
          _enabled: on,
          _sub_account_tenant_id: selectedChild,
        } as never,
      );
      if (error) throw error;
      toast.success(
        on
          ? `${r.name} is on for ${selectedChildName}.`
          : `${r.name} is off for ${selectedChildName}.`,
      );
      await qc.invalidateQueries({
        queryKey: ["agency_curation_child_rows", agencyId, selectedChild],
      });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't update that — please try again.");
    } finally {
      setSaving(null);
    }
  };

  const toSkill = (r: CurationRow): MarketplaceSkill => ({
    slug: r.slug,
    name: r.name,
    tagline: r.tagline ?? "",
    description: r.description ?? "",
    category: r.category,
    status: "available",
    icon: r.icon ?? "Sparkles",
  });

  const renderCard = (r: CurationRow) => {
    if (inChild) {
      // PER-CHILD: the SAME SkillCard in curationMode (§18, no fork) — its switch
      // now writes THIS child's override. A caption beside the card states whether
      // the effective state is inherited from the agency default or set as a
      // child-specific override (§13 — the state is legible, never implicit).
      const overridden = r.isOverride === true;
      return (
        <div key={r.id} className="flex flex-col gap-1.5">
          <SkillCard
            skill={toSkill(r)}
            Icon={ICONS[r.icon ?? ""] ?? Sparkles}
            isOn={r.shared}
            available
            lockedOn={false}
            saving={saving === r.id}
            loading={activeLoading}
            justArmed={false}
            curationMode
            curationPending={false}
            onToggle={(v) => curateChild(r, v)}
          />
          <span className="px-1 text-[11px] font-medium text-muted-foreground tabular-nums">
            {overridden ? (
              <span className="inline-flex items-center gap-1.5">
                <span className="h-1.5 w-1.5 rounded-full bg-[hsl(var(--primary))]" aria-hidden />
                Overridden for this sub-account
              </span>
            ) : (
              <>Inherits agency default ({r.defaultShared ? "On" : "Off"})</>
            )}
          </span>
        </div>
      );
    }
    return (
      <SkillCard
        key={r.id}
        skill={toSkill(r)}
        Icon={ICONS[r.icon ?? ""] ?? Sparkles}
        isOn={r.shared}
        available
        lockedOn={false}
        saving={saving === r.id}
        loading={loading}
        justArmed={false}
        curationMode
        curationPending={r.pending}
        onToggle={(v) => curate(r, v)}
      />
    );
  };

  if (!agencyQ.isLoading && !agencyId) {
    return (
      <PageShell width="wide">
        <PageHeader variant="plain" icon={Store} eyebrow="Agency Curation" title="Marketplace" />
        <Card><CardContent className="p-6 text-sm text-muted-foreground">
          This surface is for agency operators. We couldn&apos;t find an agency you manage.
        </CardContent></Card>
      </PageShell>
    );
  }

  return (
    <PageShell width="wide">
      <PageHeader
        variant="plain"
        icon={Store}
        eyebrow="Agency Curation"
        title="Marketplace"
        description="Decide which capabilities your sub-accounts can see and switch on. Share a capability down, and it appears in every sub-account's store."
      />

      {/* Read-only provenance/inventory line — never an action (§11 gold budget). */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground tabular-nums">
        <span className="inline-flex items-center gap-1.5">
          <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground/40" aria-hidden />
          {inChild ? `Availability for ${selectedChildName}` : "Sub-account availability"}
        </span>
        {!activeLoading && activeRows.length > 0 && (
          <>
            <span aria-hidden className="text-border">·</span>
            <span>{activeRows.length} available</span>
            <span aria-hidden className="text-border">·</span>
            <span className="inline-flex items-center gap-1.5">
              <span className="h-1.5 w-1.5 rounded-full bg-[hsl(var(--gold))]" aria-hidden />
              {sharedCount} {inChild ? "on" : "shared"}
            </span>
            {!inChild && pendingCount > 0 && (
              <>
                <span aria-hidden className="text-border">·</span>
                <span>{pendingCount} pending review</span>
              </>
            )}
          </>
        )}
      </div>

      {forbidden ? (
        <EmptyState
          icon={Store}
          title="Curation is owner-only"
          description="Only your agency's owner or admin can decide which capabilities your sub-accounts can use. Ask them to share the ones your team needs."
        />
      ) : rowsQ.isError ? (
        <Card><CardContent className="p-6 text-sm text-muted-foreground">
          Couldn&apos;t load the Marketplace. Refresh to try again.
        </CardContent></Card>
      ) : activeLoading ? (
        <MarketplaceGridSkeleton />
      ) : rows.length === 0 ? (
        <EmptyState
          icon={Sparkles}
          title="No capabilities to curate yet"
          description="Approved Marketplace items will appear here for you to share down to your sub-accounts as they ship."
        />
      ) : (
        <>
          {/* Proactive review queue (§36): items the agency hasn't decided on yet,
              surfaced first so nothing sits unreviewed. Only renders when there IS
              something pending. */}
          {pendingRows.length > 0 && (
            <SectionCard
              title="Pending your review"
              description="New capabilities waiting on your call — share them down to your sub-accounts, or leave them hidden."
              icon={ClipboardCheck}
            >
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {pendingRows.map(renderCard)}
              </div>
            </SectionCard>
          )}

          <Toolbar className="gap-y-3">
            {subaccounts.length > 0 && (
              <Select value={scope} onValueChange={setScope}>
                <SelectTrigger className="w-full max-w-[16rem]" aria-label="Choose whose availability to curate">
                  <span className="flex items-center gap-2">
                    <Building2 className="h-4 w-4 text-muted-foreground" aria-hidden />
                    <SelectValue />
                  </span>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="agency">All sub-accounts (agency default)</SelectItem>
                  {subaccounts.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            <div className="relative w-full max-w-sm">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search capabilities…"
                className="pl-9"
                aria-label="Search capabilities"
              />
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
              <FilterChip active={cat === "all"} onClick={() => setCat("all")}>All</FilterChip>
              {categories.map((c) => (
                <FilterChip key={c} active={cat === c} onClick={() => setCat(c)}>
                  {prettyCategory(c)}
                </FilterChip>
              ))}
              <span className="mx-1 hidden h-4 w-px bg-border sm:block" aria-hidden />
              <FilterChip active={status === "shared"} onClick={() => setStatus((s) => (s === "shared" ? "all" : "shared"))}>
                Shared
              </FilterChip>
              <FilterChip active={status === "pending"} onClick={() => setStatus((s) => (s === "pending" ? "all" : "pending"))}>
                Pending
              </FilterChip>
            </div>
          </Toolbar>

          {filtered.length === 0 ? (
            <EmptyState
              icon={Search}
              title="Nothing matches that yet"
              description="No capability fits your search and filters. Clear them to see the full shelf."
              action={
                <Button variant="outline" size="sm" onClick={resetFilters}>
                  Clear filters
                </Button>
              }
            />
          ) : (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {filtered.map(renderCard)}
            </div>
          )}
        </>
      )}
    </PageShell>
  );
}

/** Shimmer grid so the body is never a bare blank (§11). */
function MarketplaceGridSkeleton() {
  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="min-h-[15rem] rounded-[var(--radius)] border border-border bg-card p-5">
          <div className="flex items-start justify-between">
            <div className="h-14 w-14 animate-pulse rounded-xl bg-muted motion-reduce:animate-none" />
            <div className="h-5 w-16 animate-pulse rounded-full bg-muted motion-reduce:animate-none" />
          </div>
          <div className="mt-4 h-4 w-2/3 animate-pulse rounded bg-muted motion-reduce:animate-none" />
          <div className="mt-2 h-3 w-1/2 animate-pulse rounded bg-muted motion-reduce:animate-none" />
          <div className="mt-4 h-3 w-full animate-pulse rounded bg-muted motion-reduce:animate-none" />
        </div>
      ))}
    </div>
  );
}

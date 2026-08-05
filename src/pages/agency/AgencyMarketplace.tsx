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
};

const prettyCategory = (key: string) =>
  key.replace(/[_-]/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

export default function AgencyMarketplace() {
  const qc = useQueryClient();
  const [saving, setSaving] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [cat, setCat] = useState<string>("all");
  const [status, setStatus] = useState<"all" | "shared" | "pending">("all");

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

  // The approved catalog visible at the agency's tier (RLS-gated) + this agency's
  // per-item curation decision. Two reads, merged on the client so we keep the
  // real marketplace_items.id the RPC needs (the catalog RPC returns slug only).
  const rowsQ = useQuery({
    queryKey: ["agency_curation_rows", agencyId],
    enabled: !!agencyId,
    queryFn: async (): Promise<CurationRow[]> => {
      // agency_item_allowlist is Slice-1 net-new: the generated Supabase types are
      // regenerated from prod only AFTER this migration deploys, so the read is cast
      // through `as any` here (the same escape hatch the tenant Marketplace uses for
      // its not-yet-typed RPCs). It re-types to AllowRow immediately below.
      type AllowRow = { marketplace_item_id: string; enabled_for_subaccounts: boolean; reviewed_at: string | null };
      const [itemsRes, allowRes] = await Promise.all([
        supabase
          .from("marketplace_items")
          .select("id, slug, name, tagline, description, category, icon, item_type")
          .order("category", { ascending: true })
          .order("name", { ascending: true }),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (supabase as any)
          .from("agency_item_allowlist")
          .select("marketplace_item_id, enabled_for_subaccounts, reviewed_at")
          .eq("agency_tenant_id", agencyId as string),
      ]);
      if (itemsRes.error) throw itemsRes.error;
      if (allowRes.error) throw allowRes.error;
      const allow = new Map<string, { enabled: boolean; reviewed: boolean }>();
      for (const a of (allowRes.data ?? []) as AllowRow[]) {
        allow.set(a.marketplace_item_id, {
          enabled: a.enabled_for_subaccounts === true,
          reviewed: a.reviewed_at != null,
        });
      }
      return (itemsRes.data ?? []).map((i): CurationRow => {
        const decision = allow.get(i.id as string);
        return {
          id: i.id as string,
          slug: i.slug as string,
          name: (i.name as string) ?? (i.slug as string),
          tagline: (i.tagline as string | null) ?? null,
          description: (i.description as string | null) ?? null,
          category: (i.category as string) ?? "other",
          icon: (i.icon as string | null) ?? null,
          item_type: (i.item_type as string) ?? "skill",
          shared: decision?.enabled ?? false,
          // no allowlist row (never seeded) OR row with reviewed_at NULL ⇒ undecided
          pending: decision ? !decision.reviewed : true,
        };
      });
    },
  });

  const rows = useMemo(() => rowsQ.data ?? [], [rowsQ.data]);
  const loading = agencyQ.isLoading || rowsQ.isLoading;

  const sharedCount = rows.filter((r) => r.shared).length;
  const pendingCount = rows.filter((r) => r.pending).length;
  const pendingRows = rows.filter((r) => r.pending);

  const categories = useMemo(() => {
    const seen = new Set<string>();
    for (const r of rows) seen.add(r.category);
    return [...seen].sort();
  }, [rows]);

  const q = query.trim().toLowerCase();
  const filtered = rows.filter((r) => {
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

  const toSkill = (r: CurationRow): MarketplaceSkill => ({
    slug: r.slug,
    name: r.name,
    tagline: r.tagline ?? "",
    description: r.description ?? "",
    category: r.category,
    status: "available",
    icon: r.icon ?? "Sparkles",
  });

  const renderCard = (r: CurationRow) => (
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
          Sub-account availability
        </span>
        {!loading && rows.length > 0 && (
          <>
            <span aria-hidden className="text-border">·</span>
            <span>{rows.length} available</span>
            <span aria-hidden className="text-border">·</span>
            <span className="inline-flex items-center gap-1.5">
              <span className="h-1.5 w-1.5 rounded-full bg-[hsl(var(--gold))]" aria-hidden />
              {sharedCount} shared
            </span>
            {pendingCount > 0 && (
              <>
                <span aria-hidden className="text-border">·</span>
                <span>{pendingCount} pending review</span>
              </>
            )}
          </>
        )}
      </div>

      {rowsQ.isError ? (
        <Card><CardContent className="p-6 text-sm text-muted-foreground">
          Couldn&apos;t load the Marketplace. Refresh to try again.
        </CardContent></Card>
      ) : loading ? (
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

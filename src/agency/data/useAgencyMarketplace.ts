/**
 * useAgencyMarketplace — the Agency CURATION adapter (Slice C, adapter 5).
 *
 * Mirrors the Solo `src/solo/data` pattern and the shipped `AgencyMarketplace.tsx`
 * page (§18: same RPCs, same casts — never a new query family). Reshapes the
 * agency curation surface into typed rows + the two callable write seams the
 * chrome flips.
 *
 * §51 SCOPE SPINE (session-derived ONLY — never a client-supplied tenant_id):
 *   • AGENCY AGGREGATE (isAgency && !acting) → the agency curates its catalog:
 *       - agency_switch_context()                       → the agency id (SERVER-resolved)
 *       - agency_curation_catalog(_agency_tenant_id)    → approved items + this agency's decision
 *       - agency_list_my_subaccounts()                  → the sub-account picker (Args:never firewall)
 *       - agency_curation_catalog_for_subaccount(...)   → one child's effective/override view
 *       - set_agency_item_allowlist(...)                → the curate + per-child override writes
 *   • OWN-BOOK / ACTING (!isAgency || acting != null) → NOT available: curation is
 *     agency-only chrome. Every parentage/curation RPC is gated OFF (belt over the
 *     server RAISE 42501 — the #86-leak firewall). Returns available:false.
 *
 * §38 MONEY BOUNDARY: this adapter NEVER moves money. Install counts, reseller
 * earnings, and reseller markup have NO backend + would be a money surface — they
 * are surfaced as explicit PREVIEW flags, never fabricated (§13). The only writes
 * are curation allowlist toggles (which capability a sub-account may SEE) — never a
 * charge, a payout, or a price.
 */
import { useCallback, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { isAgencyAggregate, type AgencyShellCtx } from "./useAgencyRoster";

/** One curatable catalog item — REAL registry fields + this agency's decision. */
export interface AgencyCatalogItem {
  /** real marketplace_items.id — the toggle RPC needs it. REAL */
  id: string;
  /** item slug. REAL */
  slug: string;
  /** item display name. REAL */
  name: string;
  /** short tagline. REAL | null */
  tagline: string | null;
  /** long description. REAL | null */
  description: string | null;
  /** category key. REAL */
  category: string;
  /** icon key (lucide name). REAL | null */
  icon: string | null;
  /** item_type (skill / add-on / …). REAL */
  itemType: string;
  /**
   * Agency-default scope: enabled_for_subaccounts. Per-child scope: the effective
   * flag (COALESCE(override, default, false), resolved SERVER-SIDE). REAL
   */
  shared: boolean;
  /** Agency-default scope only: agency has NOT reviewed this item yet. REAL */
  pending: boolean;
  /** Per-child scope only: the agency-wide default this child inherits. REAL | undefined */
  defaultShared?: boolean;
  /** Per-child scope only: this child carries its OWN override row. REAL | undefined */
  isOverride?: boolean;
}

/** A sub-account in the curation picker (agency_list_my_subaccounts). REAL. */
export interface AgencyMarketplaceSub {
  id: string;
  name: string;
}

/** §38 — cross-book money aggregates with NO backend: honest Preview, never faked. */
export interface AgencyMarketplacePreview {
  /** Per-item install counts across sub-accounts — no RPC; keep Preview. */
  installCounts: true;
  /** Reseller earnings — a money surface (§38); no ledger; keep Preview. */
  earnings: true;
  /** Reseller markup — a money surface (§38); no pricing seam; keep Preview. */
  resellerMarkup: true;
}

export interface AgencyMarketplaceData {
  /** Server-resolved agency id (agency_switch_context). REAL | null */
  agencyId: string | null;
  /** TRUE only in agency-aggregate mode (curation is agency-only). */
  available: boolean;
  /**
   * TRUE when the caller is an agency MEMBER but not owner/admin (a 42501 from the
   * catalog RPC) — the surface renders read-only rather than an all-pending shelf.
   */
  forbidden: boolean;
  /** Agency-default catalog rows (every sub-account inherits these). REAL */
  rows: AgencyCatalogItem[];
  /** Sub-account picker (Args:never firewall RPC). REAL */
  subaccounts: AgencyMarketplaceSub[];
  /** The selected child's effective/override rows — [] until a child is selected. REAL */
  childRows: AgencyCatalogItem[];
  /** The currently-selected child id (echoed back), or null. */
  selectedChildId: string | null;
  /** Item id currently mid-write (for the SkillCard `saving` state), or null. */
  saving: string | null;
  loading: boolean;
  isError: boolean;
  /** §38 — money/adoption aggregates that stay Preview (never fabricated). */
  preview: AgencyMarketplacePreview;
  /** Agency-default allowlist write (§10 callable seam — Paige is another caller). */
  curate: (item: AgencyCatalogItem, on: boolean) => Promise<{ ok: boolean; error?: string }>;
  /** Per-child override write (§10) — scopes the allowlist row to one sub-account. */
  curateChild: (
    item: AgencyCatalogItem,
    on: boolean,
    childId: string,
  ) => Promise<{ ok: boolean; error?: string }>;
  refresh: () => void;
}

/** Raw shape of agency_switch_context() (Json). Present-guarded. */
interface SwitchContext {
  agency_id?: string | null;
}

/** Raw catalog row from agency_curation_catalog. */
interface CatalogRow {
  item_id: string;
  slug: string;
  name: string | null;
  tagline: string | null;
  description: string | null;
  category: string | null;
  icon: string | null;
  item_type: string | null;
  enabled_for_subaccounts: boolean;
  reviewed: boolean;
}

/** Raw per-child row from agency_curation_catalog_for_subaccount. */
interface ChildCatalogRow {
  item_id: string;
  slug: string;
  name: string | null;
  tagline: string | null;
  description: string | null;
  category: string | null;
  icon: string | null;
  item_type: string | null;
  effective_enabled: boolean;
  default_enabled: boolean;
  is_override: boolean;
}

/** Roster row from agency_list_my_subaccounts (only id/name consumed here). */
interface SubRow {
  id: string;
  name: string | null;
  slug: string | null;
}

const PREVIEW: AgencyMarketplacePreview = {
  installCounts: true,
  earnings: true,
  resellerMarkup: true,
};

function mapCatalog(r: CatalogRow): AgencyCatalogItem {
  return {
    id: r.item_id,
    slug: r.slug,
    name: r.name ?? r.slug,
    tagline: r.tagline ?? null,
    description: r.description ?? null,
    category: r.category ?? "other",
    icon: r.icon ?? null,
    itemType: r.item_type ?? "skill",
    shared: r.enabled_for_subaccounts === true,
    pending: r.reviewed !== true,
  };
}

function mapChild(r: ChildCatalogRow): AgencyCatalogItem {
  return {
    id: r.item_id,
    slug: r.slug,
    name: r.name ?? r.slug,
    tagline: r.tagline ?? null,
    description: r.description ?? null,
    category: r.category ?? "other",
    icon: r.icon ?? null,
    itemType: r.item_type ?? "skill",
    shared: r.effective_enabled === true,
    pending: false,
    defaultShared: r.default_enabled === true,
    isOverride: r.is_override === true,
  };
}

/** A 42501 (or "owner or admin" message) means: member, but not curation-authorized. */
function isForbidden(err: unknown): boolean {
  const code = (err as { code?: string } | null)?.code;
  const msg = err instanceof Error ? err.message : "";
  return code === "42501" || /owner or admin/i.test(msg);
}

export function useAgencyMarketplace(
  ctx: AgencyShellCtx,
  options?: { selectedChildId?: string | null },
): AgencyMarketplaceData {
  const qc = useQueryClient();
  const aggregate = isAgencyAggregate(ctx);
  const [saving, setSaving] = useState<string | null>(null);

  // Server-resolves the agency id; gated to aggregate mode (the parentage firewall).
  const agencyQ = useQuery({
    queryKey: ["agency-marketplace-context"],
    enabled: aggregate,
    queryFn: async (): Promise<string | null> => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await supabase.rpc("agency_switch_context" as any);
      if (error) throw error;
      return ((data as SwitchContext | null) ?? {}).agency_id ?? null;
    },
    staleTime: 60_000,
  });
  const agencyId = agencyQ.data ?? null;

  const rowsQ = useQuery({
    queryKey: ["agency-marketplace-catalog", agencyId],
    enabled: aggregate && !!agencyId,
    // A 42501 is a terminal auth state, not a transient failure — don't spin on it.
    retry: false,
    queryFn: async (): Promise<AgencyCatalogItem[]> => {
      const { data, error } = await supabase.rpc(
        "agency_curation_catalog" as never,
        { _agency_tenant_id: agencyId } as never,
      );
      if (error) throw error;
      return ((data ?? []) as CatalogRow[]).map(mapCatalog);
    },
  });

  const subsQ = useQuery({
    queryKey: ["agency-marketplace-subs", agencyId],
    enabled: aggregate && !!agencyId,
    retry: false,
    queryFn: async (): Promise<AgencyMarketplaceSub[]> => {
      const { data, error } = await supabase.rpc("agency_list_my_subaccounts" as never);
      if (error) throw error;
      return ((data ?? []) as SubRow[]).map((k) => ({
        id: k.id,
        name: k.name ?? k.slug ?? "Sub-account",
      }));
    },
  });
  const subaccounts = useMemo(() => subsQ.data ?? [], [subsQ.data]);

  // Honor a child selection only while it is still in the caller's book (§9).
  const requestedChild = options?.selectedChildId ?? null;
  const selectedChildId =
    requestedChild && subaccounts.some((s) => s.id === requestedChild) ? requestedChild : null;

  const childRowsQ = useQuery({
    queryKey: ["agency-marketplace-child-catalog", agencyId, selectedChildId],
    enabled: aggregate && !!agencyId && !!selectedChildId,
    retry: false,
    queryFn: async (): Promise<AgencyCatalogItem[]> => {
      const { data, error } = await supabase.rpc(
        "agency_curation_catalog_for_subaccount" as never,
        { _agency_tenant_id: agencyId, _sub_account_tenant_id: selectedChildId } as never,
      );
      if (error) throw error;
      return ((data ?? []) as ChildCatalogRow[]).map(mapChild);
    },
  });

  const refresh = useCallback(() => {
    void agencyQ.refetch();
    void rowsQ.refetch();
    void subsQ.refetch();
    if (selectedChildId) void childRowsQ.refetch();
  }, [agencyQ, rowsQ, subsQ, childRowsQ, selectedChildId]);

  const curate = useCallback(
    async (item: AgencyCatalogItem, on: boolean): Promise<{ ok: boolean; error?: string }> => {
      if (!agencyId) return { ok: false, error: "No agency in context." };
      setSaving(item.id);
      try {
        const { error } = await supabase.rpc(
          "set_agency_item_allowlist" as never,
          { _agency_tenant_id: agencyId, _marketplace_item_id: item.id, _enabled: on } as never,
        );
        if (error) throw error;
        await qc.invalidateQueries({ queryKey: ["agency-marketplace-catalog", agencyId] });
        return { ok: true };
      } catch (e) {
        return { ok: false, error: e instanceof Error ? e.message : "Couldn't update that." };
      } finally {
        setSaving(null);
      }
    },
    [agencyId, qc],
  );

  const curateChild = useCallback(
    async (
      item: AgencyCatalogItem,
      on: boolean,
      childId: string,
    ): Promise<{ ok: boolean; error?: string }> => {
      if (!agencyId) return { ok: false, error: "No agency in context." };
      // Only act on a child still in the caller's book (§9) — the RPC re-checks too.
      if (!subaccounts.some((s) => s.id === childId))
        return { ok: false, error: "That sub-account isn't in your book." };
      setSaving(item.id);
      try {
        const { error } = await supabase.rpc(
          "set_agency_item_allowlist" as never,
          {
            _agency_tenant_id: agencyId,
            _marketplace_item_id: item.id,
            _enabled: on,
            _sub_account_tenant_id: childId,
          } as never,
        );
        if (error) throw error;
        await qc.invalidateQueries({
          queryKey: ["agency-marketplace-child-catalog", agencyId, childId],
        });
        return { ok: true };
      } catch (e) {
        return { ok: false, error: e instanceof Error ? e.message : "Couldn't update that." };
      } finally {
        setSaving(null);
      }
    },
    [agencyId, qc, subaccounts],
  );

  // Own-book / acting: curation is agency-only chrome — never touch the RPCs.
  if (!aggregate) {
    return {
      agencyId: null,
      available: false,
      forbidden: false,
      rows: [],
      subaccounts: [],
      childRows: [],
      selectedChildId: null,
      saving: null,
      loading: false,
      isError: false,
      preview: PREVIEW,
      curate,
      curateChild,
      refresh,
    };
  }

  return {
    agencyId,
    available: true,
    forbidden: rowsQ.isError && isForbidden(rowsQ.error),
    rows: rowsQ.data ?? [],
    subaccounts,
    childRows: selectedChildId ? childRowsQ.data ?? [] : [],
    selectedChildId,
    saving,
    loading: agencyQ.isLoading || rowsQ.isLoading || (!!selectedChildId && childRowsQ.isLoading),
    // A forbidden (42501) is a legible read-only state, not an error banner.
    isError:
      (rowsQ.isError && !isForbidden(rowsQ.error)) ||
      subsQ.isError ||
      (!!selectedChildId && childRowsQ.isError),
    preview: PREVIEW,
    curate,
    curateChild,
    refresh,
  };
}

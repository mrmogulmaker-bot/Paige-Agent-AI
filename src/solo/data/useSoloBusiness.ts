/**
 * useSoloBusiness — the Solo Setup › Business adapter (§18: composes the EXISTING
 * production seam, never a new query family).
 *
 * READS the tenant's real business identity from the ONLY storage that exists in
 * this schema (scout diagnosis, §31/§13): `tenants.name` (the workspace/business
 * name) + `tenants.brand` JSONB (the keys the app already reads/writes:
 * logo_url, primary_color, from_name, support_email, website, business_phone,
 * industry, about). There is NO business-profile/legal/entity/tax table — every
 * other field the fixture shows stays Preview and is NOT sourced here.
 *
 * WRITES via the EXACT WorkspaceSettingsPanel.saveBrand seam:
 *   supabase.from("tenants").update({ name, brand }).eq("id", activeTenant.id)
 * then useTenantContext().refresh() so the new name propagates app-wide. The only
 * deliberate difference (§13/§31 — a data-loss fix, NOT a deviation): we MERGE the
 * patch onto the existing brand JSONB instead of overwriting it, so editing the
 * reachability card can never clobber logo_url/primary_color (and vice-versa).
 *
 * §9 TENANT ISOLATION: NO client-supplied tenant_id — the id comes from the
 * caller's OWN resolved active tenant (useTenantContext), and the UPDATE keys on
 * `.eq("id", …)` which RLS already gates. The Edit/Save is admin-gated on the SAME
 * authority the write enforces (`is_current_user_tenant_admin`), fail-closed to
 * read-only when the check errors or is false.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { Json, TablesUpdate } from "@/integrations/supabase/types";
import { useTenantContext } from "@/hooks/useTenantContext";

/** The brand keys the app already reads/writes. Null when the tenant hasn't set one. */
export interface SoloBrand {
  logo_url: string | null;
  primary_color: string | null;
  from_name: string | null;
  support_email: string | null;
  website: string | null;
  business_phone: string | null;
  industry: string | null;
  about: string | null;
}

/** A patch the Save action applies — any of the workspace name or the brand keys. */
export type SoloBusinessPatch = Partial<{ name: string } & SoloBrand>;

export interface SoloBusinessData {
  loading: boolean;
  error: string | null;
  /** True when the current user may edit this workspace (tenant admin); fail-closed. */
  isAdmin: boolean;
  saving: boolean;
  /** Real workspace/business name (tenants.name); em-dash-able empty is "" here. */
  name: string;
  brand: SoloBrand;
  /** Whether this tenant is a sub-account (parent-owned) — surfaced for honest copy. */
  isSubAccount: boolean;
  saveBusiness: (patch: SoloBusinessPatch) => Promise<{ ok: boolean; error?: string }>;
  refresh: () => void;
}

const BRAND_KEYS = [
  "logo_url",
  "primary_color",
  "from_name",
  "support_email",
  "website",
  "business_phone",
  "industry",
  "about",
] as const;

/** Present-guard a JSONB value to a trimmed string, else null (§13 — never "undefined"). */
function str(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v : null;
}

/** Coerce a `tenants.brand` Json value into a plain record we can read/merge. */
function asRecord(v: unknown): Record<string, unknown> {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
}

const EMPTY_BRAND: SoloBrand = {
  logo_url: null,
  primary_color: null,
  from_name: null,
  support_email: null,
  website: null,
  business_phone: null,
  industry: null,
  about: null,
};

export function useSoloBusiness(): SoloBusinessData {
  const { activeTenant, activeTenantId, refresh: refreshTenant } = useTenantContext();
  const tenantId = activeTenantId;

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [saving, setSaving] = useState(false);
  const [name, setName] = useState("");
  const [brand, setBrand] = useState<SoloBrand>(EMPTY_BRAND);
  // The raw brand JSONB exactly as stored, so a Save MERGES (never clobbers keys
  // this slice doesn't render). Held in a ref — it is write-path state, not render.
  const rawBrandRef = useRef<Record<string, unknown>>({});

  const load = useCallback(async () => {
    if (!tenantId) {
      setLoading(false);
      setName("");
      setBrand(EMPTY_BRAND);
      setIsAdmin(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const [rowRes, adminRes] = await Promise.all([
        supabase.from("tenants").select("name, brand").eq("id", tenantId).maybeSingle(),
        // Same authority the tenants UPDATE RLS enforces (SetupBilling seam). A
        // failing check is not fatal — fail CLOSED to read-only, never open (§9).
        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- RPC not in generated types (repo-wide pattern)
        supabase.rpc("is_current_user_tenant_admin" as any),
      ]);
      if (rowRes.error) throw rowRes.error;
      setIsAdmin(adminRes.data === true);
      const rawBrand = asRecord(rowRes.data?.brand);
      rawBrandRef.current = rawBrand;
      setName(rowRes.data?.name ?? "");
      setBrand({
        logo_url: str(rawBrand.logo_url),
        primary_color: str(rawBrand.primary_color),
        from_name: str(rawBrand.from_name),
        support_email: str(rawBrand.support_email),
        website: str(rawBrand.website),
        business_phone: str(rawBrand.business_phone),
        industry: str(rawBrand.industry),
        about: str(rawBrand.about),
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't load your business details.");
    } finally {
      setLoading(false);
    }
  }, [tenantId]);

  useEffect(() => {
    void load();
  }, [load]);

  const saveBusiness = useCallback(
    async (patch: SoloBusinessPatch): Promise<{ ok: boolean; error?: string }> => {
      if (!tenantId) return { ok: false, error: "No active workspace." };
      if (!isAdmin) return { ok: false, error: "You don't have permission to edit this." };
      setSaving(true);
      try {
        // MERGE the brand patch onto the stored JSONB (§13/§31 — never drop keys
        // this slice doesn't render). An empty string clears the key to null,
        // mirroring WorkspaceSettingsPanel's `value || null`.
        const nextBrand: Record<string, unknown> = { ...rawBrandRef.current };
        for (const key of BRAND_KEYS) {
          if (key in patch) {
            const v = patch[key];
            nextBrand[key] = typeof v === "string" && v.trim() ? v.trim() : null;
          }
        }
        const update: TablesUpdate<"tenants"> = { brand: nextBrand as Json };
        if (patch.name !== undefined) {
          update.name = patch.name.trim() || name || "Untitled Workspace";
        }
        const { error: upErr } = await supabase.from("tenants").update(update).eq("id", tenantId);
        if (upErr) throw upErr;
        // Reflect locally, propagate app-wide (activeTenant.name), then re-read.
        rawBrandRef.current = nextBrand;
        await refreshTenant();
        await load();
        return { ok: true };
      } catch (e) {
        return { ok: false, error: e instanceof Error ? e.message : "Couldn't save your changes." };
      } finally {
        setSaving(false);
      }
    },
    [tenantId, isAdmin, name, refreshTenant, load],
  );

  const isSubAccount = useMemo(
    () => activeTenant?.parent_tenant_id != null,
    [activeTenant?.parent_tenant_id],
  );

  const refresh = useCallback(() => {
    void load();
  }, [load]);

  return {
    loading,
    error,
    isAdmin,
    saving,
    name,
    brand,
    isSubAccount,
    saveBusiness,
    refresh,
  };
}

import { useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { BrandKit, EffectiveBrand } from "@/lib/brand/resolveBrand";

// Untyped shims — the generated types don't yet carry brand RPCs / the bucket.
const db = supabase as unknown as {
  from: (t: string) => any;
  rpc: (fn: string, args: Record<string, unknown>) => Promise<{ data: any; error: any }>;
  storage: { from: (b: string) => any };
};

export interface BrandKitState {
  /** What THIS tenant has explicitly set (drives the form + Custom badges). */
  own: BrandKit;
  /** The cascaded, effective brand (drives the preview + inherited/placeholder). */
  effective: EffectiveBrand | null;
  tenantName: string;
  tenantSlug: string | null;
}

export type LogoKind = "logo" | "logo-dark" | "favicon";
const KIND_KEY: Record<LogoKind, keyof BrandKit> = {
  logo: "logo_url",
  "logo-dark": "logo_dark_url",
  favicon: "favicon_url",
};

export function useBrandKit(tenantId: string | null) {
  const qc = useQueryClient();
  const key = ["brand-kit", tenantId];

  const query = useQuery({
    queryKey: key,
    enabled: !!tenantId,
    queryFn: async (): Promise<BrandKitState> => {
      const [{ data: row, error: rowErr }, { data: eff, error: effErr }] = await Promise.all([
        db.from("tenants").select("name,slug,brand").eq("id", tenantId).maybeSingle(),
        db.rpc("resolve_tenant_brand", { _tenant_id: tenantId }),
      ]);
      if (rowErr) throw rowErr;
      if (effErr) throw effErr;
      const effective = (Array.isArray(eff) ? eff[0] : eff) ?? null;
      return {
        own: (row?.brand ?? {}) as BrandKit,
        effective: effective as EffectiveBrand | null,
        tenantName: row?.name ?? "",
        tenantSlug: row?.slug ?? null,
      };
    },
  });

  const save = useMutation({
    mutationFn: async (patch: Partial<BrandKit>) => {
      const { data, error } = await db.rpc("set_tenant_brand", { _tenant_id: tenantId, _patch: patch });
      if (error) throw error;
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: key }),
  });

  /** Upload a brand asset to the tenant-brand bucket and return its public URL. */
  const uploadAsset = useCallback(
    async (kind: LogoKind, file: File): Promise<string> => {
      if (!tenantId) throw new Error("No active tenant");
      const ext = (file.name.split(".").pop() || "png").toLowerCase().replace(/[^a-z0-9]/g, "");
      const path = `${tenantId}/${kind}-${Date.now()}.${ext}`;
      const { error: upErr } = await db.storage
        .from("tenant-brand")
        .upload(path, file, { upsert: true, cacheControl: "3600", contentType: file.type });
      if (upErr) throw upErr;
      const { data } = db.storage.from("tenant-brand").getPublicUrl(path);
      return data.publicUrl as string;
    },
    [tenantId],
  );

  /** Upload then persist the URL under the right brand key. */
  const setLogo = useCallback(
    async (kind: LogoKind, file: File) => {
      const url = await uploadAsset(kind, file);
      await save.mutateAsync({ [KIND_KEY[kind]]: url } as Partial<BrandKit>);
    },
    [uploadAsset, save],
  );

  const clearLogo = useCallback(
    async (kind: LogoKind) => {
      await save.mutateAsync({ [KIND_KEY[kind]]: "" } as Partial<BrandKit>);
    },
    [save],
  );

  return {
    ...query,
    state: query.data,
    save: (patch: Partial<BrandKit>) => save.mutateAsync(patch),
    saving: save.isPending,
    setLogo,
    clearLogo,
    uploadAsset,
  };
}

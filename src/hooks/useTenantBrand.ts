import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

// Sprint C.1.6 — Loud-fail tenant branding hook.
// Reads tenant name + brand jsonb; throws (as returned error) when unconfigured.
// No hardcoded academy fallback anywhere. Callers should surface the error to
// admins so branding gets configured before any tenant-owned surface renders it.

type TenantBrand = {
  tenant_id: string;
  brand_name: string;
  sender_name: string;
  from_email?: string | null;
};

export function useTenantBrand(tenantId: string | null | undefined) {
  const [brand, setBrand] = useState<TenantBrand | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    if (!tenantId) {
      setBrand(null);
      setError(null);
      setLoading(false);
      return;
    }
    (async () => {
      setLoading(true);
      const { data: tenant, error: tErr } = await supabase
        .from("tenants")
        .select("id,name,brand")
        .eq("id", tenantId)
        .maybeSingle();
      if (cancelled) return;
      if (tErr || !tenant) {
        setError("TENANT_SENDER_IDENTITY_NOT_CONFIGURED");
        setLoading(false);
        return;
      }
      const brandJson = (tenant.brand as { name?: string; sender_name?: string } | null) ?? {};
      const brandName = (brandJson.name ?? tenant.name ?? "").trim();
      const senderName = (brandJson.sender_name ?? brandName).trim();
      if (!brandName || !senderName) {
        setError("TENANT_SENDER_IDENTITY_NOT_CONFIGURED");
        setBrand(null);
      } else {
        setBrand({
          tenant_id: tenant.id,
          brand_name: brandName,
          sender_name: senderName,
          from_email: null,
        });
        setError(null);
      }
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [tenantId]);

  return { brand, error, loading };
}

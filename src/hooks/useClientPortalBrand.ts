import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

/**
 * The tenant brand for the signed-in customer's client portal (§6). Resolves the
 * caller's own tenant via get_client_portal_brand() (SECURITY DEFINER, keyed on
 * clients.linked_user_id = auth.uid()). Returns null until loaded / for non-clients.
 */
export interface ClientPortalBrand {
  tenant_id: string | null;
  tenant_name: string | null;
  tenant_slug?: string | null;
  logo_url: string | null;
  primary_color: string | null;
}

export function useClientPortalBrand(): ClientPortalBrand | null {
  const [brand, setBrand] = useState<ClientPortalBrand | null>(null);

  useEffect(() => {
    let cancelled = false;
    supabase.rpc("get_client_portal_brand").then(({ data }) => {
      if (cancelled) return;
      const row = Array.isArray(data) ? data[0] : data;
      setBrand((row as ClientPortalBrand) ?? null);
    }).catch(() => { if (!cancelled) setBrand(null); });
    return () => { cancelled = true; };
  }, []);

  return brand;
}

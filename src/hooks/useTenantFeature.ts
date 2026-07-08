/**
 * useTenantFeature — read a feature flag for the active tenant.
 *
 * Features are stored on `tenants.features` as a JSONB object, e.g.
 *   { "btf_enabled": true, "products_enabled": true }
 *
 * Feature flags are per-tenant: a flag defaults to `false` and is enabled only
 * for the tenants whose plan/config turns it on, so the gated UI surfaces stay
 * hidden for every other tenant. No feature is hardcoded to a specific tenant.
 */
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export function useTenantFeature(feature: string): {
  enabled: boolean;
  loading: boolean;
} {
  const [enabled, setEnabled] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const { data, error } = await supabase.rpc("tenant_has_feature", {
        _feature: feature,
      });
      if (cancelled) return;
      setEnabled(!error && data === true);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [feature]);

  return { enabled, loading };
}

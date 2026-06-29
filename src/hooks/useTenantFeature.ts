/**
 * useTenantFeature — read a feature flag for the active tenant.
 *
 * Features are stored on `tenants.features` as a JSONB object, e.g.
 *   { "btf_enabled": true, "products_enabled": true }
 *
 * BTF is intentionally locked to the Mogul Maker Academy tenant only;
 * every other tenant has `btf_enabled = false` by default and the UI
 * surfaces (Resend BTF Invite, Start Onboarding, etc.) are hidden.
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

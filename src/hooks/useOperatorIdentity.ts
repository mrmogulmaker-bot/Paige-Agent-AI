import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

// The client face of the §45 de-brand SEAM. Wraps resolve_operator_identity — the
// CASCADE composition RPC — so a sub-account with no brand of its own inherits its
// agency's white-label CHROME, while its LEGAL identity (signer/entity) stays its
// OWN (the RPC's B3). D6: this deliberately does NOT use the raw non-cascade readers
// (readBrandTokens / useTenantBrand read tenants.brand directly and MISS agency
// inheritance) — a sub-account must resolve through the cascade, or it would render
// its own null brand instead of its parent agency's (a §51 sub-account seam bug).
//
// Extends the existing hook family (useTenantBrand, useClientPortalBrand) rather than
// forking. PRESENT-ONLY (§15): a field the tenant has not set is ABSENT — consumers
// omit the affected phrase, never interpolate an absent value, never fall through to
// the operator's own identity.
//
// §9 gate: the RPC returns the sensitive legal/signer fields to a JWT caller ONLY when
// authorized for the tenant. On the client this hook resolves the CALLER'S OWN active
// tenant (no arbitrary tenant_id is passed), so an authorized read is the norm.

export interface OperatorIdentity {
  tenant_id?: string;
  product_name?: string;
  from_name?: string;
  support_email?: string;
  logo_url?: string;
  booking_url?: string;
  sender?: Record<string, unknown>;
  tradeline_partners?: Array<Record<string, unknown>>;
  legal_entity_name?: string;
  signer_name?: string;
  signer_title?: string;
}

export interface OperatorIdentityState {
  /** The resolved identity, or null while loading. Present-only: absent keys are omitted. */
  identity: OperatorIdentity | null;
  /** True until the resolver round-trips (lets chrome render a neutral placeholder, §6/§11). */
  loading: boolean;
}

/**
 * Resolve the operator identity for a tenant via the cascade RPC. Pass the tenant id
 * (e.g. from persona context / the active tenant); omit to resolve for no tenant
 * (returns an empty identity). Fail-soft: any error resolves to an empty identity,
 * never throws.
 */
export function useOperatorIdentity(tenantId: string | null | undefined): OperatorIdentityState {
  const [state, setState] = useState<OperatorIdentityState>({ identity: null, loading: true });

  useEffect(() => {
    let cancelled = false;
    const id = (tenantId ?? "").trim();
    if (!id) {
      setState({ identity: {}, loading: false });
      return;
    }
    setState({ identity: null, loading: true });
    supabase
      .rpc("resolve_operator_identity", { _tenant_id: id })
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error || !data || typeof data !== "object") {
          setState({ identity: {}, loading: false });
          return;
        }
        setState({ identity: data as OperatorIdentity, loading: false });
      })
      .catch(() => {
        if (!cancelled) setState({ identity: {}, loading: false });
      });
    return () => {
      cancelled = true;
    };
  }, [tenantId]);

  return state;
}

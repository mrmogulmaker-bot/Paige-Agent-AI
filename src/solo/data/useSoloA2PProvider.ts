import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useTenantContext } from "@/hooks/useTenantContext";
import { resolveFunctionError } from "@/lib/integrations/connectError";

export type A2PPhase = "prepared" | "brand_draft" | "brand_submitted" | "brand_approved" |
  "campaign_draft" | "campaign_submitted" | "approved" | "action_needed" | "failed" | "canceled";

export interface A2PProviderState {
  registration: null | {
    brand_status: string; campaign_status: string; status: string; submission_phase: A2PPhase;
    number_association_status: string; number_registration_status: string; provider_synced_at?: string | null;
    failure_code?: string | null; failure_reason?: string | null;
    has_brand: boolean; has_campaign: boolean; has_messaging_service: boolean;
  };
  eligible_number: null | { id: string; phone_number: string; label?: string | null; is_primary: boolean };
  profile: {
    legal_business_name?: string | null; website_url?: string | null; registration_number_saved: boolean;
    registered_address_complete: boolean; business_identity_saved: boolean; business_industry_saved: boolean;
    regions_saved: boolean; authorized_representative_complete: boolean;
  };
  missing_profile_fields: string[];
}

export interface A2PEmbedSession { kind: "brand" | "campaign"; inquiryId: string; token: string }

const EMPTY: A2PProviderState = {
  registration: null, eligible_number: null,
  profile: { registration_number_saved:false,registered_address_complete:false,business_identity_saved:false,business_industry_saved:false,regions_saved:false,authorized_representative_complete:false },
  missing_profile_fields: [],
};

const asRecord = (value: unknown): Record<string, unknown> => value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};

export function useSoloA2PProvider() {
  const { activeTenantId, loading: tenantLoading } = useTenantContext();
  const [state, setState] = useState<A2PProviderState>(EMPTY);
  const [session, setSession] = useState<A2PEmbedSession | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const epoch = useRef(0);

  const call = useCallback(async (action: string, extra: Record<string, unknown> = {}) => {
    const tenant = activeTenantId;
    const requestEpoch = epoch.current;
    if (!tenant || tenantLoading) return { ok:false, data:null, error:"No active workspace is ready." };
    try {
      const { data, error: fnError } = await supabase.functions.invoke("comms-a2p-register", {
        body: { action, expected_tenant_id: tenant, ...extra },
      });
      if (epoch.current !== requestEpoch || activeTenantId !== tenant) return { ok:false, data:null, error:"Your workspace changed. Reopen registration and try again." };
      const response = asRecord(data);
      if (fnError || response.error) {
        const resolved = await resolveFunctionError({ error:fnError,data,action:"update carrier registration" });
        return { ok:false, data:null, error:resolved.message };
      }
      return { ok:true, data:response, error:null };
    } catch (cause) {
      return { ok:false, data:null, error:cause instanceof Error ? cause.message : "The registration request failed." };
    }
  }, [activeTenantId, tenantLoading]);

  const refresh = useCallback(async () => {
    const requestEpoch = epoch.current;
    setLoading(true); setError(null);
    const result = await call("status");
    if (epoch.current !== requestEpoch) return false;
    if (result.ok && result.data) {
      const raw = result.data;
      setState({
        registration: raw.registration && typeof raw.registration === "object" ? raw.registration as A2PProviderState["registration"] : null,
        eligible_number: raw.eligible_number && typeof raw.eligible_number === "object" ? raw.eligible_number as A2PProviderState["eligible_number"] : null,
        profile: { ...EMPTY.profile, ...asRecord(raw.profile) },
        missing_profile_fields: Array.isArray(raw.missing_profile_fields) ? raw.missing_profile_fields.map(String) : [],
      });
    }
    else if (result.error) setError(result.error);
    setLoading(false);
    return result.ok;
  }, [call]);

  useEffect(() => {
    epoch.current += 1; setSession(null); setState(EMPTY); setError(null); setBusy(false);
    if (!tenantLoading && activeTenantId) void refresh(); else setLoading(tenantLoading);
  }, [activeTenantId, tenantLoading, refresh]);

  const begin = useCallback(async (action: "start_brand" | "resume_brand" | "start_campaign" | "resume_campaign") => {
    const requestEpoch = epoch.current;
    setBusy(true); setError(null); setSession(null);
    const result = await call(action, state.eligible_number ? { phone_number_id:state.eligible_number.id } : {});
    if (epoch.current !== requestEpoch) return;
    if (result.ok && result.data) {
      const kind = result.data.kind === "campaign" ? "campaign" : "brand";
      const inquiryId = String(result.data.inquiry_id ?? "");
      const token = String(result.data.inquiry_session_token ?? "");
      if (inquiryId && token) setSession({ kind, inquiryId, token });
      else setError("Twilio did not return a registration session.");
    } else if (result.error) setError(result.error);
    setBusy(false);
  }, [call, state.eligible_number]);

  const embeddedSubmitted = useCallback(async (kind: "brand" | "campaign") => {
    const requestEpoch = epoch.current;
    setBusy(true); setError(null);
    const result = await call("embedded_submitted", { kind });
    if (epoch.current !== requestEpoch) return;
    setSession(null);
    await refresh();
    if (epoch.current !== requestEpoch) return;
    if (!result.ok && result.error) setError(result.error);
    setBusy(false);
  }, [call, refresh]);

  const cancel = useCallback(async () => {
    const requestEpoch = epoch.current;
    setBusy(true); setError(null); setSession(null);
    const result = await call("cancel");
    if (epoch.current !== requestEpoch) return;
    await refresh();
    if (!result.ok && result.error) setError(result.error);
    setBusy(false);
  }, [call, refresh]);

  return useMemo(() => ({ state, session, loading:loading||tenantLoading, busy, error, refresh, begin, embeddedSubmitted, cancel,
    closeSession:() => setSession(null) }), [state,session,loading,tenantLoading,busy,error,refresh,begin,embeddedSubmitted,cancel]);
}

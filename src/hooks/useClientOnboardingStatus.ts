import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";

export type ClientOnboardingStatus = {
  contact_id: string;
  linked_user_id: string | null;
  invite_accepted_at: string | null;
  password_set_at: string | null;
  agreement_signed_at: string | null;
  intake_submitted_at: string | null;
  stage: string | null;
  ready: boolean;
};

/**
 * Live onboarding status for a contact. Drives the staff status panel and
 * gates the "View as Client" impersonation button. Subscribes to realtime
 * `clients` updates so the checklist + button enable instantly.
 */
export function useClientOnboardingStatus(contactId: string | null | undefined) {
  const [data, setData] = useState<ClientOnboardingStatus | null>(null);
  const [loading, setLoading] = useState<boolean>(!!contactId);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!contactId) return;
    setLoading(true);
    const { data: rows, error: err } = await supabase.rpc("client_onboarding_status", {
      p_contact_id: contactId,
    });
    if (err) {
      setError(err.message);
      setData(null);
    } else {
      const row = Array.isArray(rows) ? rows[0] : rows;
      setData((row as ClientOnboardingStatus) ?? null);
      setError(null);
    }
    setLoading(false);
  }, [contactId]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!contactId) return;
    const ch = supabase
      .channel(`client-onboarding-${contactId}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "clients", filter: `id=eq.${contactId}` },
        () => { void load(); },
      )
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [contactId, load]);

  return { status: data, loading, error, refresh: load };
}

export function describeBlockedReason(s: ClientOnboardingStatus | null): string | null {
  if (!s) return "Loading…";
  if (s.ready) return null;
  if (!s.linked_user_id) return "Client hasn't accepted their invite yet";
  if (!s.agreement_signed_at) return "Client hasn't signed the agreement yet";
  if (s.stage !== "completed") return "Client hasn't completed intake yet";
  return "Client hasn't completed onboarding yet";
}

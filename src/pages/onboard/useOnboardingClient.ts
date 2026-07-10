import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface OnboardClient {
  id: string;
  tenant_id: string | null;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  entity_name: string | null;
  linked_user_id: string | null;
  onboarding_stage: string | null;
  lifecycle_stage: string | null;
}

interface State {
  loading: boolean;
  error: string | null;
  client: OnboardClient | null;
  userEmail: string | null;
}

export function useOnboardingClient() {
  const [state, setState] = useState<State>({ loading: true, error: null, client: null, userEmail: null });

  const refresh = async () => {
    setState((s) => ({ ...s, loading: true }));
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      setState({ loading: false, error: "not_authenticated", client: null, userEmail: null });
      return;
    }
    // Match by linked_user_id first, then by email (so we can claim the row).
    let { data: client } = await supabase
      .from("clients")
      .select("id, tenant_id, first_name, last_name, email, entity_name, linked_user_id, onboarding_stage, lifecycle_stage")
      .eq("linked_user_id", user.id)
      .maybeSingle();

    if (!client && user.email) {
      const { data: byEmail } = await supabase
        .from("clients")
        .select("id, tenant_id, first_name, last_name, email, entity_name, linked_user_id, onboarding_stage, lifecycle_stage")
        .ilike("email", user.email.replace(/([%_\\])/g, "\\$1"))
        .maybeSingle();
      if (byEmail) {
        // Bind it.
        if (!byEmail.linked_user_id) {
          await supabase.from("clients").update({ linked_user_id: user.id }).eq("id", byEmail.id);
          byEmail.linked_user_id = user.id;
        }
        client = byEmail;
      }
    }

    if (!client) {
      setState({
        loading: false,
        error: "no_client_record",
        client: null,
        userEmail: user.email ?? null,
      });
      return;
    }

    setState({ loading: false, error: null, client: client as OnboardClient, userEmail: user.email ?? null });
  };

  useEffect(() => { refresh(); }, []);

  return { ...state, refresh };
}

export async function advanceOnboardingStage(
  _clientId: string,
  toStage: string,
  extraPatch: Record<string, unknown> = {},
) {
  // Direct UPDATE on public.clients is blocked for linked clients by RLS, so
  // we go through the SECURITY DEFINER RPC which validates ownership, enforces
  // forward-only transitions, and writes an audit row admins can watch live.
  return supabase.rpc("client_advance_onboarding_stage", {
    p_to_stage: toStage,
    p_payload: extraPatch as never,
  });
}

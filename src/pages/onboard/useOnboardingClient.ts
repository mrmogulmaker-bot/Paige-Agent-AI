import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface OnboardClient {
  id: string;
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
      .select("id, first_name, last_name, email, entity_name, linked_user_id, onboarding_stage, lifecycle_stage")
      .eq("linked_user_id", user.id)
      .maybeSingle();

    if (!client && user.email) {
      const { data: byEmail } = await supabase
        .from("clients")
        .select("id, first_name, last_name, email, entity_name, linked_user_id, onboarding_stage, lifecycle_stage")
        .ilike("email", user.email)
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
  clientId: string,
  toStage: string,
  extraPatch: Record<string, unknown> = {},
) {
  return supabase
    .from("clients")
    .update({ onboarding_stage: toStage, updated_at: new Date().toISOString(), ...extraPatch })
    .eq("id", clientId);
}

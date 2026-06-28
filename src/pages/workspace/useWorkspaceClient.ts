/** Resolve the authenticated user → their clients row (BTF workspace context). */
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface WorkspaceClient {
  id: string;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  assigned_coach_user_id: string | null;
}

export function useWorkspaceClient() {
  const [client, setClient] = useState<WorkspaceClient | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { data: auth } = await supabase.auth.getUser();
        const uid = auth.user?.id;
        if (!uid) {
          setError("Not signed in.");
          setLoading(false);
          return;
        }
        const { data, error: qErr } = await supabase
          .from("clients")
          .select("id, first_name, last_name, email, assigned_coach_user_id")
          .eq("linked_user_id", uid)
          .maybeSingle();
        if (cancelled) return;
        if (qErr) {
          setError(qErr.message);
        } else if (!data) {
          setError("No workspace found for this account. Please contact your coach.");
        } else {
          setClient(data as WorkspaceClient);
        }
      } catch (e) {
        if (!cancelled) setError((e as Error).message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return { client, loading, error };
}

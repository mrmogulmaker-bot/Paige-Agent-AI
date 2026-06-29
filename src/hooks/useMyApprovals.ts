import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface MyApprovalRow {
  id: string;
  category: string | null;
  type: string | null;
  status: string;
  summary: string | null;
  priority: number | null;
  risk_level: string | null;
  source: string | null;
  contact_id: string | null;
  sla_due_at: string | null;
  created_at: string;
  reviewed_at: string | null;
  sent_at: string | null;
  decision_rationale: string | null;
  metadata: any;
}

/**
 * Fetches approvals tied to the currently signed-in client.
 * RLS policy "Clients can read approvals on their own record" restricts the
 * server-side result set to rows where clients.linked_user_id = auth.uid().
 */
export function useMyApprovals() {
  const [items, setItems] = useState<MyApprovalRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [clientId, setClientId] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setItems([]); setLoading(false); return; }

    const { data: client } = await supabase
      .from("clients")
      .select("id")
      .eq("linked_user_id", user.id)
      .maybeSingle();
    setClientId(client?.id ?? null);

    const { data } = await supabase
      .from("paige_pending_approvals")
      .select(
        "id, category, type, status, summary, priority, risk_level, source, contact_id, sla_due_at, created_at, reviewed_at, sent_at, decision_rationale, metadata",
      )
      .order("created_at", { ascending: false })
      .limit(100);

    setItems((data as MyApprovalRow[] | null) ?? []);
    setLoading(false);
  }, []);

  useEffect(() => {
    refresh();
    const ch = supabase
      .channel("my_approvals_stream")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "paige_pending_approvals" },
        () => refresh(),
      )
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [refresh]);

  const pending = items.filter((i) => i.status === "pending");
  const resolved = items.filter((i) => i.status !== "pending");

  return { items, pending, resolved, loading, clientId, refresh };
}
